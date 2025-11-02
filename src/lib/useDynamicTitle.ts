import { useEffect } from "react";
import { Conversation } from "@/types/chat";

const DEFAULT_TITLE = "AskMyDocs Chat";

export function useDynamicTitle(activeConversation: Conversation | null) {
  useEffect(() => {
    if (activeConversation?.title) {
      document.title = `${activeConversation.title} - AskMyDocs Chat`;
    } else {
      document.title = DEFAULT_TITLE;
    }
  }, [activeConversation]);
}
