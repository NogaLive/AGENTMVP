"""
Orquestador del Agente Regulatorio LangChain (agent.py)
Conecta con OpenRouter (NVIDIA Nemotron 3 Ultra) y descubre las herramientas
vía protocolo FastMCP para responder con citas auditables y control de vigencia.
"""

import json
import re
import time
import logging
from typing import List, Dict, Any, Tuple, Optional

from langchain_openai import ChatOpenAI
from langchain.agents import create_agent
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, trim_messages
from langchain_core.tools import tool

from config import settings
from prompts import SYSTEM_PROMPT
from schemas import (
    ChatRequest,
    ChatResponse,
    RespuestaRegulatoria,
    FuenteCitada,
    MCPToolTrace
)
import mcp_server

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("agent")


def obtener_llm() -> ChatOpenAI:
    """Instancia el modelo de lenguaje configurado con OpenRouter de forma determinista."""
    if not settings.openrouter_api_key:
        raise ValueError(
            "OPENROUTER_API_KEY no configurada. Agrega tu clave en el archivo .env"
        )

    return ChatOpenAI(
        model=settings.model_id,
        api_key=settings.openrouter_api_key,
        base_url=settings.openrouter_base_url,
        temperature=0,
        max_tokens=4096,
        timeout=60,
        max_retries=3,
        default_headers={
            "HTTP-Referer": "https://agente-sbs-plaft.local",
            "X-Title": "Asistente SBS PLAFT LangChain",
        },
        extra_body={
            "models": [
                "nvidia/nemotron-3.5-lightning:free",
                "meta-llama/llama-3.3-70b-instruct:free",
                "google/gemini-2.0-flash-exp:free"
            ]
        }
    )


# ---------------------------------------------------------------------------
# Envoltorio de Herramientas con Registro de Trazas
# ---------------------------------------------------------------------------

class TraceCollector:
    """Acumulador en memoria de las herramientas ejecutadas durante una consulta."""
    def __init__(self):
        self.trazas: List[MCPToolTrace] = []
        self.evidencias: List[Dict[str, Any]] = []

    def registrar(self, nombre_tool: str, params: dict, tiempo_ms: int, cant_reg: int):
        self.trazas.append(
            MCPToolTrace(
                tool=nombre_tool,
                parametros=params,
                tiempo_ms=tiempo_ms,
                registros_devueltos=cant_reg
            )
        )

    def agregar_evidencias(self, registros: List[Dict[str, Any]]):
        if registros and isinstance(registros, list):
            self.evidencias.extend(registros)


def crear_tools_con_trazabilidad(colector: TraceCollector) -> list:
    """Envuelve las tools de mcp_server capturando la traza de ejecución y latencia."""

    @tool
    def rag_normativa_sbs(query: str, limite: int = 2) -> str:
        """Busca y recupera fragmentos relevantes del marco regulatorio oficial y resoluciones SBS."""
        t0 = time.time()
        res_raw = mcp_server.rag_normativa_sbs(query=query, limite=limite)
        dt = int((time.time() - t0) * 1000)

        cant = 0
        try:
            d = json.loads(res_raw)
            cant = d.get("cantidad_registros", 0)
            if d.get("resultados"):
                colector.agregar_evidencias(d["resultados"])
        except Exception:
            pass

        colector.registrar("rag_normativa_sbs", {"query": query, "limite": limite}, dt, cant)
        return res_raw

    @tool
    def rag_politicas_internas(query: str, limite: int = 2) -> str:
        """Busca y recupera fragmentos de manuales internos, directivas y procedimientos del banco (ej. DIR-PLA-04)."""
        t0 = time.time()
        res_raw = mcp_server.rag_politicas_internas(query=query, limite=limite)
        dt = int((time.time() - t0) * 1000)

        cant = 0
        try:
            d = json.loads(res_raw)
            cant = d.get("cantidad_registros", 0)
            if d.get("resultados"):
                colector.agregar_evidencias(d["resultados"])
        except Exception:
            pass

        colector.registrar("rag_politicas_internas", {"query": query, "limite": limite}, dt, cant)
        return res_raw

    @tool
    def validar_vigencia_documento(codigo_documento: str) -> str:
        """Consulta directamente los metadatos para verificar si una norma o directiva está VIGENTE o DEROGADA / OBSOLETA."""
        t0 = time.time()
        res_raw = mcp_server.validar_vigencia_documento(codigo_documento=codigo_documento)
        dt = int((time.time() - t0) * 1000)

        cant = 0
        try:
            d = json.loads(res_raw)
            cant = d.get("cantidad_registros", 0)
        except Exception:
            pass

        colector.registrar("validar_vigencia_documento", {"codigo_documento": codigo_documento}, dt, cant)
        return res_raw

    return [rag_normativa_sbs, rag_politicas_internas, validar_vigencia_documento]


# ---------------------------------------------------------------------------
# Parser y Sanitizador del Contrato de Salida
# ---------------------------------------------------------------------------

def parsear_respuesta_agente(contenido: str) -> RespuestaRegulatoria:
    """Extrae el JSON estructurado del modelo, validando contra el esquema Pydantic."""
    # 1. Intentar limpiar bloques ```json ... ```
    texto_limpio = contenido.strip()
    match_bloque = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", texto_limpio, re.DOTALL)
    if match_bloque:
        texto_limpio = match_bloque.group(1).strip()
    else:
        # Buscar el primer y último corchete
        inicio = texto_limpio.find("{")
        fin = texto_limpio.rfind("}")
        if inicio != -1 and fin != -1 and fin > inicio:
            texto_limpio = texto_limpio[inicio:fin + 1]

    try:
        data_json = json.loads(texto_limpio)
        return RespuestaRegulatoria.model_validate(data_json)
    except Exception as err:
        logger.warning(f"No se pudo parsear JSON puro del LLM ({err}). Generando respuesta de contingencia.")
        # Fallback estructurado si el LLM devolvió texto plano
        es_derogada = any(k in contenido.lower() for k in ["derogada", "obsoleta", "sin vigencia", "no vigente"])
        return RespuestaRegulatoria(
            respuesta=contenido.strip(),
            fuentes_citadas=[],
            nivel_confianza="MEDIO" if not es_derogada else "BAJO",
            outdated_alert=es_derogada
        )


# ---------------------------------------------------------------------------
# Invocación de Alto Nivel
# ---------------------------------------------------------------------------

def consultar_asistente(
    solicitud: ChatRequest,
    mensajes_previos: Optional[List[Dict[str, Any]]] = None
) -> ChatResponse:
    """
    Ejecuta el ciclo de razonamiento del agente LangChain contra las tools FastMCP
    incorporando memoria conversacional multi-turno con recorte inteligente de tokens.
    """
    colector = TraceCollector()
    tools_rastreadas = crear_tools_con_trazabilidad(colector)

    try:
        llm = obtener_llm()
        agente = create_agent(
            model=llm,
            tools=tools_rastreadas,
            system_prompt=SYSTEM_PROMPT
        )

        # 1. Preparar mensaje actual del usuario con filtros
        msg_usuario = solicitud.query
        if solicitud.filters and solicitud.filters.tipo_producto:
            msg_usuario += f"\n[Contexto Producto: {solicitud.filters.tipo_producto} | Área: {solicitud.filters.area_normativa}]"

        # 2. Reconstruir historial conversacional
        mensajes_historial = []
        if mensajes_previos:
            for m in mensajes_previos:
                rol = m.get("rol", "").lower()
                txt = m.get("contenido", "").strip()
                if not txt:
                    continue
                if rol == "user":
                    mensajes_historial.append(HumanMessage(content=txt))
                elif rol == "assistant":
                    mensajes_historial.append(AIMessage(content=txt))

        # Añadir turno actual
        mensajes_historial.append(HumanMessage(content=msg_usuario))

        # 3. Aplicar poda inteligente (trim_messages) para optimizar consumo de tokens
        def contar_tokens(msgs: list) -> int:
            return sum(max(1, len(str(getattr(m, "content", ""))) // 4) for m in msgs)

        try:
            mensajes_podados = trim_messages(
                mensajes_historial,
                max_tokens=2000,
                strategy="last",
                token_counter=contar_tokens,
                allow_partial=False,
                start_on="human"
            )
        except Exception as e:
            logger.warning(f"Aviso en trim_messages ({e}), usando últimos 6 mensajes.")
            mensajes_podados = mensajes_historial[-6:]

        logger.info(f"Ejecutando agente para consulta: '{solicitud.query[:80]}...' con {len(mensajes_podados)} mensajes en contexto.")
        resultado = agente.invoke({
            "messages": mensajes_podados
        })

        # Extraer el último mensaje generado por el agente
        mensajes = resultado.get("messages", [])
        contenido_final = ""
        for m in reversed(mensajes):
            if hasattr(m, "content") and m.content and not getattr(m, "tool_calls", None):
                contenido_final = m.content
                break

        if not contenido_final and mensajes:
            contenido_final = mensajes[-1].content if hasattr(mensajes[-1], "content") else str(mensajes[-1])

        respuesta_estructurada = parsear_respuesta_agente(contenido_final)

        # Enriquecer fuentes citadas con el extracto textual exacto recuperado por las tools
        if colector.evidencias and respuesta_estructurada.fuentes_citadas:
            for fuente in respuesta_estructurada.fuentes_citadas:
                if not getattr(fuente, "extracto", None):
                    for ev in colector.evidencias:
                        doc_ev = (ev.get("documento") or "").lower()
                        doc_f = (fuente.documento or "").lower()
                        res_ev = (ev.get("resolucion_articulo") or "").lower()
                        res_f = (fuente.resolucion_articulo or "").lower()
                        if (doc_ev in doc_f or doc_f in doc_ev or res_ev in res_f or res_f in res_ev) and ev.get("contenido"):
                            fuente.extracto = ev.get("contenido")
                            break

        return ChatResponse(
            ok=True,
            data=respuesta_estructurada,
            traza_mcp=colector.trazas
        )

    except Exception as e:
        logger.exception("Fallo en la ejecución del agente regulatorio")
        # Respuesta defensiva sin filtrar secretos
        return ChatResponse(
            ok=False,
            data=RespuestaRegulatoria(
                respuesta="No fue posible procesar la consulta regulatoria debido a un error temporal del servicio.",
                fuentes_citadas=[],
                nivel_confianza="NO_CONCLUYENTE",
                outdated_alert=False
            ),
            traza_mcp=colector.trazas,
            error=f"Error en orquestación: {type(e).__name__}"
        )
