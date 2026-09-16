-- ==============================================================================
-- DDL para Supabase (PostgreSQL + pgvector)
-- Proyecto: ComplianceAI (Asistente de Regulación y Riesgos)
-- ==============================================================================

-- 1. Habilitar la extensión de vectores (pgvector)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tabla de almacenamiento documental y embeddings
CREATE TABLE IF NOT EXISTS documentos_normativos (
    id BIGSERIAL PRIMARY KEY,
    documento VARCHAR(255) NOT NULL,
    resolucion_articulo VARCHAR(255) NOT NULL,
    pagina INTEGER NOT NULL,
    area_normativa VARCHAR(100) NOT NULL DEFAULT 'prevencion_lavado_activos',
    vigente BOOLEAN NOT NULL DEFAULT true,
    origen VARCHAR(50) NOT NULL, -- 'sbs' o 'politica_interna'
    contenido TEXT NOT NULL,
    embedding vector(384) NOT NULL, -- Modelo: all-MiniLM-L6-v2 (384 dimensiones)
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Índice HNSW para búsqueda por similitud de cosenos rápida y escalable
CREATE INDEX IF NOT EXISTS idx_documentos_normativos_hnsw 
ON documentos_normativos 
USING hnsw (embedding vector_cosine_ops);

-- 4. Índices para filtros relacionales rápidos
CREATE INDEX IF NOT EXISTS idx_documentos_origen ON documentos_normativos(origen);
CREATE INDEX IF NOT EXISTS idx_documentos_vigente ON documentos_normativos(vigente);
CREATE INDEX IF NOT EXISTS idx_documentos_codigo ON documentos_normativos(documento);

-- 5. Función RPC de búsqueda por similitud semántica con filtrado de origen y umbral
CREATE OR REPLACE FUNCTION match_documentos_normativos (
  query_embedding vector(384),
  match_threshold float DEFAULT 0.20,
  match_count int DEFAULT 2,
  filter_origen text DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  documento varchar,
  resolucion_articulo varchar,
  pagina int,
  area_normativa varchar,
  vigente boolean,
  origen varchar,
  contenido text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dn.id,
    dn.documento,
    dn.resolucion_articulo,
    dn.pagina,
    dn.area_normativa,
    dn.vigente,
    dn.origen,
    dn.contenido,
    1 - (dn.embedding <=> query_embedding) AS similarity
  FROM documentos_normativos dn
  WHERE (filter_origen IS NULL OR dn.origen = filter_origen)
    AND 1 - (dn.embedding <=> query_embedding) > match_threshold
  ORDER BY dn.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 6. Habilitar políticas de acceso (opcional para acceso público de lectura)
ALTER TABLE documentos_normativos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura publica para consultas documentales" 
ON documentos_normativos FOR SELECT 
USING (true);

-- Otorgar permisos de ejecución para la función RPC
GRANT EXECUTE ON FUNCTION match_documentos_normativos TO anon, authenticated, service_role;
