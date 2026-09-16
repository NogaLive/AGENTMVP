-- ==============================================================================
-- DDL para Supabase: Autenticación, Conversaciones y Mensajes Auditables
-- Proyecto: ComplianceAI (Asistente de Regulación y Riesgos)
-- ==============================================================================

-- 1. Tabla de Usuarios
CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario VARCHAR(50) UNIQUE NOT NULL, -- Identificador único del analista
    nombre VARCHAR(100) NOT NULL,
    password_hash VARCHAR(64) NOT NULL, -- SHA-256 produce 64 caracteres hexadecimales
    activo BOOLEAN NOT NULL DEFAULT true,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de Conversaciones Privadas por Usuario
CREATE TABLE IF NOT EXISTS conversaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    titulo VARCHAR(255) NOT NULL DEFAULT 'Nueva Consulta Regulatoria',
    area_normativa VARCHAR(100) DEFAULT 'prevencion_lavado_activos',
    token_compartido VARCHAR(64) UNIQUE, -- Token criptográfico no deducible para compartir solo lectura
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla de Mensajes con Trazas y Citas Documentales Auditables
CREATE TABLE IF NOT EXISTS mensajes (
    id BIGSERIAL PRIMARY KEY,
    conversacion_id UUID NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
    rol VARCHAR(20) NOT NULL CHECK (rol IN ('user', 'assistant', 'system')),
    contenido TEXT NOT NULL,
    fuentes_citadas JSONB DEFAULT '[]'::jsonb,
    nivel_confianza VARCHAR(20),
    outdated_alert BOOLEAN DEFAULT false,
    traza_mcp JSONB DEFAULT '[]'::jsonb,
    tiempo_ms INTEGER DEFAULT 0,
    creado_en TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Índices para acelerar el listado de chats y la lectura del historial
CREATE INDEX IF NOT EXISTS idx_usuarios_usuario ON usuarios(usuario);
CREATE INDEX IF NOT EXISTS idx_conversaciones_usuario ON conversaciones(usuario_id, actualizado_en DESC);
CREATE INDEX IF NOT EXISTS idx_conversaciones_token_compartido ON conversaciones(token_compartido);
CREATE INDEX IF NOT EXISTS idx_mensajes_conversacion ON mensajes(conversacion_id, creado_en ASC);

-- 5. Habilitar RLS y otorgar permisos para backend (service_role y anon)
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensajes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso total para backend en usuarios" ON usuarios;
CREATE POLICY "Acceso total para backend en usuarios" ON usuarios FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso total para backend en conversaciones" ON conversaciones;
CREATE POLICY "Acceso total para backend en conversaciones" ON conversaciones FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso total para backend en mensajes" ON mensajes;
CREATE POLICY "Acceso total para backend en mensajes" ON mensajes FOR ALL TO public USING (true) WITH CHECK (true);
