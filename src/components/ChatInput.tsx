"use client";

import React, { useState, useRef, useEffect } from "react";
import { useChat } from "@/contexts/ChatContext";
import { Attachment } from "@/types/chat";
import { AttachmentList } from "./AttachmentList";
import { ModelSelector } from "./ModelSelector";
import { FileUploadButton } from "./FileUploadButton";
import { SendButton } from "./SendButton";
import {
  getModelCapabilities,
  canModelProcessFileType,
  getMaxFileSizeForModel,
} from "@/lib/model-capabilities";
import { formatModelName } from "@/lib/model-utils";

interface ChatInputProps {
  quickActionPrompt?: string;
}

export function ChatInput({ quickActionPrompt }: ChatInputProps = {}) {
  const {
    activeConversation,
    setActiveConversation,
    updateConversationTitle,
    addNewConversation,
    addOptimisticMessage,
    updateStreamingMessage,
    finalizeMessage,
    removeOptimisticMessage,
  } = useChat();

  const [message, setMessage] = useState("");
  const [selectedModel, setSelectedModel] = useState(() => {
    // Initialize with last used model from localStorage, fallback to 'openai/o3'
    if (typeof window !== "undefined") {
      const lastUsedModel = localStorage.getItem("lastUsedModel");
      return lastUsedModel || "openai/o3-mini";
    }
    return "openai/o3-mini";
  });
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState("");
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [useDocs, setUseDocs] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle quick action prompt changes
  useEffect(() => {
    if (quickActionPrompt) {
      setMessage(quickActionPrompt + " ");
      // Focus the textarea after setting the message
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          // Place cursor at the end
          textareaRef.current.setSelectionRange(
            textareaRef.current.value.length,
            textareaRef.current.value.length,
          );
        }
      }, 100);
    }
  }, [quickActionPrompt]);

  useEffect(() => {
    if (activeConversation && activeConversation.model) {
      setSelectedModel(activeConversation.model);
    } else {
      const lastUsedModel = localStorage.getItem("lastUsedModel");
      setSelectedModel(lastUsedModel || "openai/o3-mini");
    }
  }, [activeConversation]);

  // Clear incompatible attachments when model changes
  useEffect(() => {
    if (attachments.length > 0) {
      const compatibleAttachments = attachments.filter((attachment) =>
        canModelProcessFileType(selectedModel, attachment.file_type),
      );

      if (compatibleAttachments.length !== attachments.length) {
        setAttachments(compatibleAttachments);
        if (compatibleAttachments.length === 0) {
          alert(
            `Attachments removed: ${selectedModel} doesn't support the uploaded file types.`,
          );
        } else {
          alert(
            `Some attachments removed: ${selectedModel} doesn't support all uploaded file types.`,
          );
        }
      }
    }
  }, [selectedModel, attachments]);

  // Save selected model to localStorage when it changes
  useEffect(() => {
    if (selectedModel && !activeConversation) {
      localStorage.setItem("lastUsedModel", selectedModel);
    }
  }, [selectedModel, activeConversation]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!message.trim() && attachments.length === 0) || isLoading) return;

    const userMessage = message;
    const messageAttachments = [...attachments];
    setMessage("");
    setIsLoading(true);
    setStreamingMessage("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    let conversationId: string | null = null;
    let userMessageId: string | undefined;
    let assistantMessageId: string | undefined;
    let isNewConversation = false;

    try {
      if (activeConversation) {
        conversationId = activeConversation.id;
      } else {
        isNewConversation = true;
        const createConversationResponse = await fetch("/api/conversations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: "New Chat",
            model: selectedModel,
          }),
        });

        if (!createConversationResponse.ok) {
          throw new Error("Failed to create conversation");
        }

        const conversationData = await createConversationResponse.json();
        conversationId = conversationData.conversation.id;

        // FIRST: Add the new conversation to the list
        addNewConversation(conversationData.conversation);

        // SECOND: Set active conversation and update URL BEFORE adding messages
        setActiveConversation(conversationData.conversation);
        window.history.pushState(null, "", `/chat/${conversationId}`);

        // Small delay to ensure state is properly updated
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // Add optimistic messages only after conversation is properly set
      userMessageId = addOptimisticMessage({
        conversation_id: conversationId!,
        role: "user",
        content: userMessage,
        attachments: messageAttachments,
      });

      assistantMessageId = addOptimisticMessage({
        conversation_id: conversationId!,
        role: "assistant",
        content: "",
        isLoading: true,
      });

      // If using RAG over user's documents, call the RAG endpoint (non-streaming)
      if (useDocs) {
        try {
          if (conversationId) {
            await fetch(`/api/conversations/${conversationId}/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ role: "user", content: userMessage }),
            });
          }
        } catch {}
        const res = await fetch("/api/chat/rag", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: userMessage, topK: 5 }),
        });

        if (!res.ok) {
          if (userMessageId) removeOptimisticMessage(userMessageId);
          if (assistantMessageId) removeOptimisticMessage(assistantMessageId);
          throw new Error("Failed to get RAG answer");
        }

        let data: any = {};
        try {
          data = await res.json();
        } catch (e) {
          data = {};
        }

        const rawAnswer = (data?.answer ?? "").toString();
        const safeAnswer = rawAnswer.trim().length
          ? rawAnswer
          : "I'm sorry, I don't have information about that.";

        const sources = (Array.isArray(data?.sources) ? data.sources : []) as {
          document_id: string;
          chunk_id: string;
        }[];
        const citationBlock = sources.length
          ? `\n\nSources:\n${sources
              .map(
                (s, i) =>
                  `- [${i + 1}] doc: ${s.document_id}, chunk: ${s.chunk_id}`,
              )
              .join("\n")}`
          : "";

        const finalContent = `${safeAnswer}${citationBlock}`;
        if (assistantMessageId)
          finalizeMessage(assistantMessageId, finalContent);
        try {
          if (conversationId) {
            await fetch(`/api/conversations/${conversationId}/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                role: "assistant",
                content: finalContent,
              }),
            });
          }
        } catch {}

        try {
          if (isNewConversation && conversationId) {
            const titleRes = await fetch("/api/generate-title", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userMessage,
                assistantResponse: finalContent,
                conversationId,
              }),
            });

            if (titleRes.ok) {
              const titleData = await titleRes.json();
              updateConversationTitle(conversationId, titleData.title);
            }
          }
        } catch (e) {
          console.error("Failed to generate title for RAG chat:", e);
        }
        return; // Skip normal chat flow
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessage,
          model: selectedModel,
          conversationId: conversationId,
          attachments: messageAttachments,
        }),
      });

      if (!response.ok) {
        if (userMessageId) removeOptimisticMessage(userMessageId);
        if (assistantMessageId) removeOptimisticMessage(assistantMessageId);
        throw new Error("Failed to send message");
      }

      if (!response.body) {
        if (userMessageId) removeOptimisticMessage(userMessageId);
        if (assistantMessageId) removeOptimisticMessage(assistantMessageId);
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";
      let hasStartedStreaming = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.chunk && assistantMessageId) {
                assistantContent += parsed.chunk;
                hasStartedStreaming = true;
                updateStreamingMessage(assistantMessageId, assistantContent);
              } else if (parsed.error && assistantMessageId) {
                // Handle error from API - show error message in chat
                const errorContent =
                  parsed.errorContent || `❌ **Error**: ${parsed.error}`;
                finalizeMessage(assistantMessageId, errorContent);
              } else if (
                parsed.titleUpdate &&
                parsed.conversationId &&
                parsed.title
              ) {
                // Handle title update - update conversation title without switching chats
                updateConversationTitle(parsed.conversationId, parsed.title);
              } else if (parsed.done && assistantMessageId) {
                // Ensure we have content before finalizing
                const finalContent = assistantContent || parsed.content || "";
                finalizeMessage(assistantMessageId, finalContent);
              }
            } catch (e) {
              console.error("Error parsing streaming data:", e, "Data:", data);
            }
          }
        }
      }

      // Fallback: if streaming never started and we have an assistant message, finalize it
      if (!hasStartedStreaming && assistantMessageId) {
        finalizeMessage(
          assistantMessageId,
          assistantContent || "No response received",
        );
      }
    } catch (error) {
      console.error("Error sending message:", error);

      // Show error message in chat if we have an assistant message to update
      if (assistantMessageId) {
        let errorMessage = "An unexpected error occurred";
        if (error instanceof Error) {
          errorMessage = error.message;
        }

        finalizeMessage(assistantMessageId, `❌ **Error**: ${errorMessage}`);

        // Try to save error to database for new conversations
        if (conversationId && isNewConversation) {
          try {
            await fetch(`/api/conversations/${conversationId}/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                role: "assistant",
                content: `❌ **Error**: ${errorMessage}`,
              }),
            });
          } catch (dbError) {
            console.error("Failed to save error message to database:", dbError);
          }
        }
      } else {
        // If no assistant message, remove user message and show alert
        if (userMessageId) {
          removeOptimisticMessage(userMessageId);
        }

        let errorMessage = "Failed to send message";
        if (error instanceof Error) {
          errorMessage = error.message;
        }
        alert(`Error: ${errorMessage}`);
      }
    } finally {
      setIsLoading(false);
      setStreamingMessage("");
      setAttachments([]);

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
        }
      }, 100);
    }
  };

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const modelCapabilities = getModelCapabilities(selectedModel);
    const maxFileSize = getMaxFileSizeForModel(selectedModel) * 1024 * 1024; // Convert MB to bytes

    // Validate files before uploading
    const validFiles: File[] = [];
    const errors: string[] = [];

    Array.from(files).forEach((file) => {
      // Check if model supports this file type
      if (!canModelProcessFileType(selectedModel, file.type)) {
        errors.push(
          `${file.name}: File type not supported by ${selectedModel}`,
        );
        return;
      }

      // Check file size
      if (file.size > maxFileSize) {
        errors.push(
          `${file.name}: File too large (max ${getMaxFileSizeForModel(
            selectedModel,
          )}MB)`,
        );
        return;
      }

      validFiles.push(file);
    });

    if (errors.length > 0) {
      alert(`Upload errors:\n${errors.join("\n")}`);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    if (validFiles.length === 0) return;

    setIsUploading(true);

    try {
      const uploadPromises = validFiles.map(async (file) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("model", selectedModel);

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to upload file");
        }

        return await response.json();
      });

      const uploadedFiles = await Promise.all(uploadPromises);
      setAttachments((prev) => [...prev, ...uploadedFiles]);
    } catch (error) {
      console.error("Error uploading files:", error);
      alert("Error uploading files. Please try again.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <>
      <ModelSelector
        selectedModel={selectedModel}
        onModelSelect={setSelectedModel}
        isOpen={isModelModalOpen}
        onClose={() => setIsModelModalOpen(false)}
      />

      <div className="px-4 pb-4 flex justify-center">
        <div className="w-full max-w-4xl glass-strong backdrop-blur-xl rounded-2xl border border-white/10 p-4 shadow-xl">
          <form onSubmit={handleSubmit} className="w-full">
            <AttachmentList
              attachments={attachments}
              onRemoveAttachment={removeAttachment}
            />

            <div className="relative group/send">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message..."
                disabled={isLoading}
                className="w-full min-h-[40px] max-h-32 resize-none bg-transparent border-none outline-none focus:outline-none disabled:opacity-50 pr-24 text-white placeholder-white/60 p-3"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
              />

              <div className="absolute right-3 top-1/2 translate-y-1 flex items-center gap-1">
                <FileUploadButton
                  selectedModel={selectedModel}
                  isLoading={isLoading}
                  isUploading={isUploading}
                  fileInputRef={fileInputRef}
                  onFileSelect={handleFileSelect}
                />

                <SendButton
                  isLoading={isLoading}
                  isDisabled={
                    (!message.trim() && attachments.length === 0) || isLoading
                  }
                />
              </div>
            </div>
          </form>

          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-white/80 text-sm">
                <input
                  type="checkbox"
                  checked={useDocs}
                  onChange={(e) => setUseDocs(e.target.checked)}
                />
                Use my documents
              </label>
            </div>

            <button
              type="button"
              onClick={() => setIsModelModalOpen(true)}
              disabled={isLoading || activeConversation !== null}
              className={`inline-flex items-center gap-2 px-3 py-2 border border-white/10 rounded-xl text-sm transition-all ${
                activeConversation !== null
                  ? "cursor-not-allowed opacity-50 text-white/40"
                  : "cursor-pointer glass-hover text-white/80 hover:text-white hover:scale-[1.02]"
              } ${isLoading || activeConversation !== null ? "opacity-50" : ""}`}
              title={
                activeConversation !== null
                  ? "Model locked for existing conversation"
                  : "Change model"
              }
            >
              <span>{formatModelName(selectedModel).name}</span>
            </button>
          </div>
        </div>
      </div>

      {/* MultiModelSelector removed */}
    </>
  );
}
