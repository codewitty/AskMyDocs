import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import OpenAI from "openai";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userMessage, assistantResponse, conversationId } =
      await request.json();

    if (!userMessage || !conversationId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Get user's OpenAI API key
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

    // Generate the title using OpenAI
    const openai = new OpenAI({ apiKey: profile.openai_api_key });

    const prompt = `Generate a very short, concise title (max 6 words) for this conversation. Do not use quotes or punctuation.\n\nUser: ${userMessage}\n\nAssistant: ${(assistantResponse || "").substring(0, 200)}...\n\nTitle:`;

    let generatedTitle = "";
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 20,
      });
      generatedTitle = completion.choices?.[0]?.message?.content?.trim() || "";
      generatedTitle = generatedTitle
        .replace(/^\s*["']?|["']?\s*$/g, "")
        .slice(0, 60)
        .trim();
      if (!generatedTitle) generatedTitle = userMessage.substring(0, 50);
    } catch (e) {
      generatedTitle = userMessage.substring(0, 50);
    }

    // Update the conversation with the new title
    const { data: updatedConversation, error: updateError } = await supabase
      .from("conversations")
      .update({ title: generatedTitle })
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError) {
      console.error("Failed to update conversation title:", updateError);
      return NextResponse.json(
        { error: "Failed to update title" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      title: generatedTitle,
      conversation: updatedConversation,
    });
  } catch (error) {
    console.error("Error generating title:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
