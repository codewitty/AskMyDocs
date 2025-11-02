-- Enable required extensions
create extension if not exists vector;
create extension if not exists pgcrypto;

-- Documents table
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  source_path text,
  mime_type text,
  created_at timestamptz default now()
);

-- Chunks table
create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null,
  chunk_index int not null,
  content text not null,
  embedding vector(1536),
  created_at timestamptz default now()
);

-- ANN index
create index if not exists document_chunks_embedding_ivfflat on public.document_chunks
using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- RLS
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;

-- Policies (assumes auth.uid())
create policy if not exists documents_select on public.documents for select using (user_id = auth.uid());
create policy if not exists documents_insert on public.documents for insert with check (user_id = auth.uid());
create policy if not exists documents_delete on public.documents for delete using (user_id = auth.uid());

create policy if not exists chunks_select on public.document_chunks for select using (user_id = auth.uid());
create policy if not exists chunks_insert on public.document_chunks for insert with check (user_id = auth.uid());
create policy if not exists chunks_delete on public.document_chunks for delete using (user_id = auth.uid());

-- RPC for vector search; accepts real[] for compatibility with PostgREST
create or replace function public.match_document_chunks(
  p_user_id uuid,
  p_query_embedding real[],
  p_match_count int
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  similarity double precision
) language plpgsql as $$
begin
  return query
  select
    dc.id,
    dc.document_id,
    dc.content,
    1 - (dc.embedding <=> (p_query_embedding::vector(1536))) as similarity
  from public.document_chunks dc
  where dc.user_id = p_user_id
  order by dc.embedding <=> (p_query_embedding::vector(1536))
  limit p_match_count;
end;
$$;
