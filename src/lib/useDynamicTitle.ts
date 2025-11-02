import { useEffect } from "react";
import { Conversation } from "@/types/chat";

const DEFAULT_TITLE = "RAG Chat";

export function useDynamicTitle(activeConversation: Conversation | null) {
  useEffect(() => {
    if (activeConversation?.title) {
      document.title = `${activeConversation.title} - RAG Chat`;
    } else {
      document.title = DEFAULT_TITLE;
    }
  }, [activeConversation]);
}
