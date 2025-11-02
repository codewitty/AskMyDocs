import { createClient as createServerSupabase } from "@/lib/supabase-server";

export async function fetchVectorMatches(
  userId: string,
  embedding: number[],
  topK: number,
) {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("match_document_chunks", {
    p_user_id: userId,
    p_query_embedding: embedding as unknown as number[],
    p_match_count: topK,
  });

  if (error) {
    console.error("Vector search error:", error);
    return [] as any[];
  }
  return data as any[];
}
