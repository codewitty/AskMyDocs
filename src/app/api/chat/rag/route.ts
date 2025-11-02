import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase-server";
import OpenAI from "openai";
import { fetchVectorMatches } from "@/lib/vector-search";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `
You are an AI assistant answering user questions only from the provided context.
- If the answer is not in the context, say exactly: "I'm sorry, I don't have information about that."
- Do not invent names, amounts, or dates.
- Always cite which document chunk you used if possible.
`;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { message, topK = 5 } = await request.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 },
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("openai_api_key")
      .eq("id", user.id)
      .single();

    const openaiKey = profile?.openai_api_key;
    if (!openaiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 400 },
      );
    }

    const openai = new OpenAI({ apiKey: openaiKey });

    const embRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: message,
    });
    const queryEmbedding = embRes.data[0].embedding as number[];

    const matches = await fetchVectorMatches(
      user.id,
      queryEmbedding,
      Number(topK) || 5,
    );

    const contextText = (matches || [])
      .map(
        (m: any, idx: number) =>
          `CHUNK ${idx + 1} (doc: ${m.document_id}):\n${m.content}`,
      )
      .join("\n\n");

    const userPrompt = `
Context:
${contextText}

Question: ${message}

Answer:
`;

    const chatRes = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0,
    });

    const answer =
      chatRes.choices[0]?.message?.content ||
      "I'm sorry, I don't have information about that.";

    return NextResponse.json({
      answer,
      sources: (matches || []).map((m: any) => ({
        document_id: m.document_id,
        chunk_id: m.id,
      })),
    });
  } catch (error) {
    console.error("RAG chat error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
