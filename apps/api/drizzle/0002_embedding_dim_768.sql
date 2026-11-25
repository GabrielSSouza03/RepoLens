-- Embedding dim 768 (nomic-embed-text / Ollama default).
-- Trocar de provedor ou dimensão de embeddings exige reindexar os repositórios.
DROP INDEX IF EXISTS code_chunks_embedding_hnsw_idx;

DELETE FROM code_chunks;

ALTER TABLE code_chunks
  ALTER COLUMN embedding TYPE vector(768);

CREATE INDEX code_chunks_embedding_hnsw_idx
  ON code_chunks USING hnsw (embedding vector_cosine_ops);
