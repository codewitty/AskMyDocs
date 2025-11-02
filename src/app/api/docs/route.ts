import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("documents")
      .select("id, title, created_at, source_path, mime_type")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error)
      return NextResponse.json(
        { error: "Failed to fetch docs" },
        { status: 500 },
      );

    return NextResponse.json({ documents: data || [] });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
