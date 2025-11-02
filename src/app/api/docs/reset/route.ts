import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Delete chunks first (cascade also applied if FK ON DELETE CASCADE)
    const { error: delErr1 } = await supabase
      .from("document_chunks")
      .delete()
      .eq("user_id", user.id);
    if (delErr1) console.error(delErr1);

    const { data: docs, error: listErr } = await supabase
      .from("documents")
      .select("id, source_path")
      .eq("user_id", user.id);

    if (listErr) console.error(listErr);

    const { error: delErr2 } = await supabase
      .from("documents")
      .delete()
      .eq("user_id", user.id);
    if (delErr2) console.error(delErr2);

    // Attempt to clean storage files under docs/{userId}
    const prefix = `docs/${user.id}`;
    const { data: files } = await supabase.storage
      .from("docs")
      .list(prefix, { limit: 1000, offset: 0, search: "" });
    if (files && files.length) {
      const paths = files.map((f: { name: string }) => `${prefix}/${f.name}`);
      await supabase.storage.from("docs").remove(paths);
    }

    return NextResponse.json({
      ok: true,
      deleted: { documents: docs?.length || 0 },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
