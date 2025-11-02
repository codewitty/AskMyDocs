"use client";

import React from "react";
import { motion } from "framer-motion";
import { UploadCloud, FileText } from "lucide-react";

interface DocsUploadButtonProps {
  className?: string;
}

export function DocsUploadButton({ className }: DocsUploadButtonProps) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [status, setStatus] = React.useState<string>("");

  const onPickFile = () => fileInputRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      setStatus("Uploading...");

      const form = new FormData();
      form.append("file", file);
      form.append("title", file.name);

      const res = await fetch("/api/docs/upload", {
        method: "POST",
        body: form,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Upload failed");
      }

      setStatus(`Uploaded: ${data.title} (${data.chunks} chunks)`);
    } catch (err: any) {
      setStatus(`Error: ${err?.message || "Upload failed"}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.csv"
        className="hidden"
        onChange={onFileChange}
      />

      <motion.button
        onClick={onPickFile}
        disabled={isUploading}
        className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-lg glass hover:bg-white/10 text-white/80 disabled:opacity-50 border border-white/10"
        whileHover={!isUploading ? { scale: 1.02 } : {}}
        whileTap={!isUploading ? { scale: 0.98 } : {}}
        title="Upload document for RAG (PDF, DOCX, CSV)"
      >
        {isUploading ? (
          <motion.div
            className="w-4 h-4 border-2 border-white/70 border-t-transparent rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
        ) : (
          <UploadCloud size={16} />
        )}
        <span className="text-sm">Upload Docs</span>
      </motion.button>

      {status && (
        <div className="mt-2 text-xs text-white/60 flex items-center gap-2">
          <FileText size={12} className="text-white/40" />
          <span>{status}</span>
        </div>
      )}
    </div>
  );
}
