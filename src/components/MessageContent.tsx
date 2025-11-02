"use client";

import React from "react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { LoadingIndicator } from "./LoadingIndicator";
import { TypeWriter } from "./TypeWriter";

interface MessageContentProps {
  content: string;
  isLoading?: boolean;
  isStreaming?: boolean;
  isUserMessage?: boolean;
}

export function MessageContent({
  content,
  isLoading = false,
  isStreaming = false,
  isUserMessage = false,
}: MessageContentProps) {
  if (isUserMessage) {
    return content ? (
      <MarkdownRenderer
        content={content}
        isUserMessage={true}
        className="text-right"
      />
    ) : null;
  }

  if (isLoading) {
    return <LoadingIndicator />;
  }

  if (isStreaming) {
    return (
      <TypeWriter
        text={content}
        isComplete={false}
        speed={15}
        typingMode="character"
      />
    );
  }

  return <MarkdownRenderer content={content} />;
}
