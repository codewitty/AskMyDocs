import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { parse as parseCsv } from "csv-parse/sync";

export async function extractPdf(bytes: Buffer): Promise<string> {
  const data = await pdfParse(bytes);
  return data.text || "";
}

export async function extractDocx(bytes: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer: bytes });
  return value || "";
}

export async function extractCsv(bytes: Buffer): Promise<string> {
  const content = bytes.toString("utf-8");
  const records = parseCsv(content, {
    columns: false,
    skip_empty_lines: true,
  }) as string[][];
  return records.map((row) => row.join(", ")).join("\n");
}

export function splitIntoChunks(
  text: string,
  chunkSize = 900,
  overlap = 150,
): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const sentences = normalized.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = "";

  for (const s of sentences) {
    if ((current + " " + s).trim().length <= chunkSize) {
      current = (current ? current + " " : "") + s;
    } else {
      if (current) chunks.push(current);
      // start new with overlap from previous chunk's tail
      if (overlap > 0 && chunks.length > 0) {
        const prev = chunks[chunks.length - 1];
        const tail = prev.slice(Math.max(0, prev.length - overlap));
        current = (tail + " " + s).slice(0, chunkSize);
      } else {
        current = s.slice(0, chunkSize);
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
