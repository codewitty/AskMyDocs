# 🧠 GenAI-Powered Document Chatbot

A full-stack web application that allows users to upload documents (PDF, Word, and CSV), process and chunk their contents, store embeddings in a vector database, and ask natural-language questions about the uploaded materials through a chat interface.

---

## 🧭 Approach Summary

I designed this system to demonstrate a practical **Retrieval-Augmented Generation (RAG)** workflow implemented with **modern full-stack tooling**.
The focus was on **simplicity, determinism, and local deployability** — using **Supabase (Auth + Storage + pgvector)** as a unified backend and **Next.js 15** for both the frontend and API routes.
The embedding and retrieval pipeline was deliberately kept transparent to highlight prompt engineering and hallucination control techniques rather than model complexity.

---

## 🚀 Overview

Users can:

- Upload `.pdf`, `.docx`, and `.csv` files
- View and reset their uploaded document list
- Interact with a chatbot that answers questions strictly based on document context
- Receive graceful “out-of-scope” responses when answers are unavailable

---

## 🧩 Architecture

**Frontend**

- React interface built with **Next.js 15 (App Router)**
- Responsive design using **TailwindCSS** and **ShadCN UI**
- File upload modal, chat window, and document list panel
- Authentication handled via **Supabase Auth**

**Backend**

- Server routes implemented in **Next.js API routes (Node.js)**
- Document parsing with `pdf-parse`, `mammoth`, and `csv-parse`
- Embeddings generated via **OpenAI’s `text-embedding-3-small`**
- Vector search via **Supabase pgvector**
- Response generation using **OpenAI’s `gpt-4o-mini`**

---

## ⚙️ Data Flow

1. **Upload** → User uploads PDF/DOCX/CSV
2. **Extract** → Text is parsed and normalized
3. **Chunk** → Text split into ~900-token segments (150-token overlap)
4. **Embed** → Each chunk converted into a 1536-dimensional vector
5. **Store** → Chunks and vectors stored in vector table
6. **Query** → User question embedded → top-K chunks retrieved
7. **Answer** → LLM composes grounded response from retrieved context

---

## RAG Workflow Details

- **[Document ingestion]** User uploads enter `src/app/api/docs/upload/route.ts`, which authenticates via Supabase, normalizes files with `extractPdf()`, `extractDocx()`, or `extractCsv()`, then calls `splitIntoChunks()` to prepare 900-token windows before persisting raw chunks in the `documents` table.
- **[Embedding & storage]** The same handler batches OpenAI `text-embedding-3-small` calls and inserts rows into `document_chunks` with a 1536-d vector. Schema and IVFFlat index definitions live in `supabase/schema.sql`, including the `vector` extension and `document_chunks_embedding_ivfflat` index tuned for cosine distance.
- **[Query embedding]** During chat, `src/app/api/chat/rag/route.ts` embeds the user's prompt with the identical OpenAI model, keeping query vectors aligned with stored chunk vectors.
- **[Vector retrieval]** `fetchVectorMatches()` in `src/lib/vector-search.ts` invokes the `match_document_chunks` RPC (defined in `supabase/schema.sql`) to search pgvector using `<=>` cosine distance and returns the top-K chunks scoped to the authenticated user.
- **[Answer synthesis]** The RAG route assembles a labeled context block, feeds it to `gpt-4o-mini` with the strict system prompt, and returns both the grounded answer and the document/chunk identifiers so the UI can render citations.

### Component Map

- **[API endpoints]**
  - `/api/docs/upload` → ingestion, chunking, embedding, storage.
  - `/api/chat/rag` → query-time retrieval, answer generation, metadata response.
- **[Client orchestration]** `ChatInput` toggles between standard LLM streaming (`/api/chat`) and RAG (`/api/chat/rag`), storing optimistic messages and triggering title generation for the first response.
- **[Storage & policies]** Supabase tables `documents` and `document_chunks` (see `supabase/schema.sql`) enforce row-level security so each user only sees their own embeddings.

---

## Database Schema

**documents**

| column      | type        | description        |
| ----------- | ----------- | ------------------ |
| id          | uuid        | primary key        |
| user_id     | uuid        | owner reference    |
| title       | text        | original file name |
| source_path | text        | storage URI        |
| mime_type   | text        | file type          |
| created_at  | timestamptz | timestamp          |

**document_chunks**

| column      | type         | description           |
| ----------- | ------------ | --------------------- |
| id          | uuid         | primary key           |
| document_id | uuid         | foreign key           |
| user_id     | uuid         | owner reference       |
| chunk_index | int          | order within document |
| content     | text         | chunk text            |
| embedding   | vector(1536) | embedding vector      |
| created_at  | timestamptz  | timestamp             |

---

## 💬 Prompt Engineering Strategy

**System Prompt**

```
You are an AI assistant answering user questions only from the provided context.
If the answer is not in the context, respond exactly with:
"I'm sorry, I don't have information about that."
Do not invent or assume any details.
```

**Techniques Used**

| Technique                 | Description                                        |
| ------------------------- | -------------------------------------------------- |
| Deterministic decoding    | Temperature set to 0 for consistent outputs        |
| Context isolation         | Only top-K retrieved chunks passed to model        |
| Explicit fallback         | Clear out-of-scope phrase when answer not found    |
| Chunk labeling            | Each context snippet includes document identifiers |
| Minimal context injection | No prior conversation memory or external data      |

---

## 🧠 Hallucination Control

- Strict context-bounded responses
- Structured prompt separation (`system` / `user`)
- No external memory or global knowledge leakage
- Explicit fallback phrasing for out-of-scope queries
- Zero-temperature decoding for reproducibility

---

## 🔐 Bonus Features

- User authentication and per-user document isolation
- Document uploads with automatic storage-safe filenames
- Conversation persistence per document
- One-click reset for documents and conversations

---

## Local Development

- **[Clone & install]**
  - `git clone https://github.com/codewitty/AskMyDocs.git`
  - `cd AskMyDocs`
  - `npm install`
- **[Configure environment]**
  - Copy `.env.example` to `.env.local`
  - Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from your Supabase project
  - Set `OPENAI_API_KEY` for embeddings and chat completions
- **[Database schema]**
  - In Supabase SQL editor, run the statements in `supabase/schema.sql`
- **[Run locally]**
  - `npm run dev`
  - Open `http://localhost:3000`
- **[Login]**
  - Use Supabase email/password or OAuth auth flows configured for your project
- **[Uploading docs]**
  - Upload one file at a time (PDF, DOCX, or CSV); filenames are sanitized before storage

---

## Example Interaction

**User:**

> What were the payment terms in the service agreement?

**Context Retrieved (2 chunks):**

```
CHUNK 1: "Invoices will be issued monthly with payment due in 30 days."
CHUNK 2: "All payments must be made via ACH in USD."
```

**Assistant:**

> The agreement specifies monthly invoicing with payment due within 30 days, payable via ACH in USD.

---

## ⚠️ Limitations

- Embeddings generated synchronously (no background worker).
- Long or image-heavy documents increase processing time.
- Accuracy depends on chunk size and vector similarity.
- Currently limited to `.pdf`, `.docx`, and `.csv`.

---

## 🔮 Future Enhancements

- Add background job queue for asynchronous embedding
- Integrate semantic reranking (e.g., cross-encoder models)
- Support additional formats (TXT, XLSX, HTML)
- Improve chunking for tables and figures
- Add conversation summarization and semantic search

---
## 🎬 Code Walkthrough
[ Code Walkthrough Video (YouTube)]([https://youtu.be/abcd1234](https://youtu.be/eOuLlEjO4wM))
