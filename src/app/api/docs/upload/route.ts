import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase-server";
import {
  extractPdf,
  extractDocx,
  extractCsv,
  splitIntoChunks,
} from "@/lib/extract";
import OpenAI from "openai";

export const runtime = "nodejs";

function sanitizeFilename(filename: string) {
  const trimmed = filename.trim();
  const withoutPath = trimmed.split("/").pop()?.split("\\").pop() || trimmed;
  const parts = withoutPath.split(".");
  const extension = parts.length > 1 ? parts.pop() : "";
  const baseName = parts.join(".") || "document";

  const normalizedBase = baseName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  const safeBase = normalizedBase
    .replace(/[^a-zA-Z0-9\-_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);

  const finalBase = safeBase || "document";
  const safeExtension = extension
    ? extension
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 16)
    : "";

  return safeExtension
    ? `${finalBase}.${safeExtension.toLowerCase()}`
    : finalBase;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const form = await request.formData();
    const file = form.get("file") as File | null;
    const title = (form.get("title") as string | null) ?? undefined;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const sanitizedName = sanitizeFilename(file.name);
    const path = `docs/${user.id}/${crypto.randomUUID()}-${sanitizedName}`;
    const { error: uploadErr } = await supabase.storage
      .from("docs")
      .upload(path, file, { upsert: false });

    if (uploadErr) {
      console.error(uploadErr);
      return NextResponse.json(
        { error: "Failed to store file" },
        { status: 500 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);
    const ext = file.name.split(".").pop()?.toLowerCase();

    let text = "";
    if (ext === "pdf") {
      text = await extractPdf(bytes);
    } else if (ext === "docx") {
      text = await extractDocx(bytes);
    } else if (ext === "csv") {
      text = await extractCsv(bytes);
    } else {
      return NextResponse.json({ error: "Unsupported file" }, { status: 400 });
    }

    const chunks = splitIntoChunks(text, 900, 150);

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .insert({
        user_id: user.id,
        title: title || file.name,
        source_path: path,
        mime_type: file.type,
      })
      .select()
      .single();

    if (docErr || !doc) {
      console.error(docErr);
      return NextResponse.json(
        { error: "Failed to create document" },
        { status: 500 },
      );
    }

    // Use per-user OpenAI key for embeddings
    const { data: profile } = await supabase
      .from("profiles")
      .select("openai_api_key")
      .eq("id", user.id)
      .single();

    if (!profile?.openai_api_key) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 400 },
      );
    }

    const openai = new OpenAI({ apiKey: profile.openai_api_key });

    const embedded = await Promise.all(
      chunks.map(async (c, i) => {
        const emb = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: c,
        });
        const vector = emb.data[0].embedding as number[];
        return {
          document_id: doc.id,
          user_id: user.id,
          chunk_index: i,
          content: c,
          embedding: vector,
        } as const;
      }),
    );

    const { error: insertErr } = await supabase
      .from("document_chunks")
      .insert(embedded as any);

    if (insertErr) {
      console.error(insertErr);
      return NextResponse.json(
        { error: "Failed to store chunks" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      id: doc.id,
      title: doc.title,
      chunks: embedded.length,
    });
  } catch (error) {
    console.error("Upload error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
