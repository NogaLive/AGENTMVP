"""
Servidor de Herramientas FastMCP (mcp_server.py)
Expone las 3 herramientas de dominio para Cumplimiento Normativo ComplianceAI.
"""

import re
import json
import logging
from typing import Optional, List, Dict, Any
from fastmcp import FastMCP
from fastembed import TextEmbedding
from supabase import create_client, Client

from config import settings
from schemas import MCPToolResultWrapper

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("mcp_server")

# Instancia oficial de FastMCP
mcp = FastMCP("ComplianceAI Regulatory MCP")

# Cache perezoso para el modelo de embeddings y el cliente Supabase
_encoder: Optional[TextEmbedding] = None
_supabase_client: Optional[Client] = None


def get_encoder() -> TextEmbedding:
    global _encoder
    if _encoder is None:
        logger.info("Cargando modelo de embeddings all-MiniLM-L6-v2 en servidor MCP...")
        _encoder = TextEmbedding("sentence-transformers/all-MiniLM-L6-v2")
    return _encoder


def get_supabase() -> Client:
    global _supabase_client
    if _supabase_client is None:
        if not settings.supabase_url or not settings.active_supabase_key:
            raise ValueError(
                "Credenciales de Supabase no configuradas. "
                "Verifica SUPABASE_URL y SUPABASE_SECRET_KEY en el archivo .env"
            )
        _supabase_client = create_client(settings.supabase_url, settings.active_supabase_key)
    return _supabase_client


def _envolver_respuesta(
    capacidad: str,
    parametros: Dict[str, Any],
    resultados: List[Dict[str, Any]],
    fuente: str,
    advertencia: Optional[str] = None
) -> str:
    """Genera la respuesta formateada en JSON con el contrato de evidencia formal."""
    wrapper = MCPToolResultWrapper(
        ok=True,
        capacidad=capacidad,
        parametros=parametros,
        cantidad_registros=len(resultados),
        resultados=resultados,
        fuente=fuente,
        advertencia=advertencia
    )
    return wrapper.model_dump_json(indent=2)


# ---------------------------------------------------------------------------
# Herramienta 1: Búsqueda en Normativa Oficial SBS
# ---------------------------------------------------------------------------

@mcp.tool()
def rag_normativa_sbs(query: str, limite: int = 2) -> str:
    """Busca y recupera fragmentos relevantes del marco regulatorio oficial y resoluciones emitidas por la SBS.
    Úsala exclusivamente cuando la consulta requiera sustento legal, normativas externas o disposiciones oficiales
    de la SBS (ej. régimen PEP, debida diligencia reforzada, causales de reporte). No usar para manuales internos del banco."""
    q_clean = query.strip()
    if len(q_clean) < 3:
        return _envolver_respuesta(
            capacidad="rag_normativa_sbs",
            parametros={"query": query, "limite": limite},
            resultados=[],
            fuente="Supabase pgvector · tabla documentos_normativos",
            advertencia="La consulta debe contener al menos 3 caracteres válidos."
        )

    # Acotar límites defensivos
    limite_acotado = max(1, min(limite, 5))

    try:
        encoder = get_encoder()
        vector = list(encoder.embed([q_clean]))[0].tolist()

        supabase = get_supabase()
        res = supabase.rpc(
            "match_documentos_normativos",
            {
                "query_embedding": vector,
                "match_threshold": 0.20,
                "match_count": limite_acotado,
                "filter_origen": "sbs"
            }
        ).execute()

        filas = res.data or []
        advertencia = None
        if not filas:
            advertencia = (
                "No se encontró evidencia normativa en los registros oficiales de la SBS para esta consulta. "
                "No inventar información ni extrapolar disposiciones ausentes."
            )

        return _envolver_respuesta(
            capacidad="rag_normativa_sbs",
            parametros={"query": q_clean, "limite": limite_acotado},
            resultados=filas,
            fuente="Supabase pgvector · tabla documentos_normativos (origen=sbs)",
            advertencia=advertencia
        )
    except Exception as e:
        logger.exception("Error al consultar rag_normativa_sbs")
        return json.dumps({
            "ok": False,
            "capacidad": "rag_normativa_sbs",
            "error": "Error al consultar el repositorio normativo de la SBS.",
            "cantidad_registros": 0,
            "resultados": []
        })


# ---------------------------------------------------------------------------
# Herramienta 2: Búsqueda en Políticas Internas del Banco
# ---------------------------------------------------------------------------

@mcp.tool()
def rag_politicas_internas(query: str, limite: int = 2) -> str:
    """Busca y recupera fragmentos de manuales internos, directivas y procedimientos del banco (ej. DIR-PLA-04).
    Úsala cuando la consulta requiera conocer requisitos operativos internos, listas cautelares (OFAC/ONU),
    declaraciones juradas patrimoniales o aprobaciones internas del banco. No usar para leyes ni resoluciones del Estado."""
    q_clean = query.strip()
    if len(q_clean) < 3:
        return _envolver_respuesta(
            capacidad="rag_politicas_internas",
            parametros={"query": query, "limite": limite},
            resultados=[],
            fuente="Supabase pgvector · tabla documentos_normativos",
            advertencia="La consulta debe contener al menos 3 caracteres válidos."
        )

    limite_acotado = max(1, min(limite, 5))

    try:
        encoder = get_encoder()
        vector = list(encoder.embed([q_clean]))[0].tolist()

        supabase = get_supabase()
        res = supabase.rpc(
            "match_documentos_normativos",
            {
                "query_embedding": vector,
                "match_threshold": 0.20,
                "match_count": limite_acotado,
                "filter_origen": "politica_interna"
            }
        ).execute()

        filas = res.data or []
        advertencia = None
        if not filas:
            advertencia = (
                "No se encontraron directivas ni manuales internos del banco para esta consulta. "
                "No inventar procedimientos ni aprobaciones operativas."
            )

        return _envolver_respuesta(
            capacidad="rag_politicas_internas",
            parametros={"query": q_clean, "limite": limite_acotado},
            resultados=filas,
            fuente="Supabase pgvector · tabla documentos_normativos (origen=politica_interna)",
            advertencia=advertencia
        )
    except Exception as e:
        logger.exception("Error al consultar rag_politicas_internas")
        return json.dumps({
            "ok": False,
            "capacidad": "rag_politicas_internas",
            "error": "Error al consultar las políticas internas del banco.",
            "cantidad_registros": 0,
            "resultados": []
        })


# ---------------------------------------------------------------------------
# Herramienta 3: Verificación Determinista de Vigencia
# ---------------------------------------------------------------------------

@mcp.tool()
def validar_vigencia_documento(codigo_documento: str) -> str:
    """Consulta directamente los metadatos oficiales en la base de datos para verificar si un archivo,
    norma o directiva específica se encuentra VIGENTE o DEROGADA / OBSOLETA.
    Úsala siempre que se mencione una norma específica (ej. Circular B-2180-2008, DIR-PLA-04) o surja duda sobre su vigencia."""
    # Sanitización de comodines e inyección básica
    limpio = re.sub(r"[^a-zA-Z0-9_\-\.\s]", "", codigo_documento).strip()
    if not limpio:
        return _envolver_respuesta(
            capacidad="validar_vigencia_documento",
            parametros={"codigo_documento": codigo_documento},
            resultados=[],
            fuente="Supabase pgvector · metadatos documentos_normativos",
            advertencia="El código de documento no contiene caracteres válidos para búsqueda."
        )

    try:
        supabase = get_supabase()
        # Buscar por coincidencia parcial en nombre de documento o resolución
        res = supabase.table("documentos_normativos") \
            .select("documento, resolucion_articulo, vigente, origen") \
            .or_(f"documento.ilike.%{limpio}%,resolucion_articulo.ilike.%{limpio}%") \
            .limit(1) \
            .execute()

        filas = res.data or []
        if not filas:
            return _envolver_respuesta(
                capacidad="validar_vigencia_documento",
                parametros={"codigo_documento": limpio},
                resultados=[],
                fuente="Supabase pgvector · metadatos documentos_normativos",
                advertencia=(
                    f"ESTADO: NO_REGISTRADO. El documento '{limpio}' no figura indexado en los metadatos normativos. "
                    "No asumir vigencia ni inventar estatus."
                )
            )

        match = filas[0]
        es_vigente = match.get("vigente", True)
        doc = match.get("documento", limpio)
        res_art = match.get("resolucion_articulo", doc)

        estado_txt = "VIGENTE" if es_vigente else "DEROGADA / OBSOLETA"
        advertencia = None if es_vigente else f"[ATENCION]: El documento '{doc}' figura oficialmente como DEROGADO / OBSOLETO."

        resultado_formateado = [{
            "documento": doc,
            "resolucion_articulo": res_art,
            "estado": estado_txt,
            "vigente": es_vigente,
            "origen": match.get("origen")
        }]

        return _envolver_respuesta(
            capacidad="validar_vigencia_documento",
            parametros={"codigo_documento": limpio},
            resultados=resultado_formateado,
            fuente="Supabase pgvector · metadatos documentos_normativos",
            advertencia=advertencia
        )
    except Exception as e:
        logger.exception("Error al validar vigencia de documento")
        return json.dumps({
            "ok": False,
            "capacidad": "validar_vigencia_documento",
            "error": "Error al consultar los metadatos de vigencia.",
            "cantidad_registros": 0,
            "resultados": []
        })
