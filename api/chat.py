"""
Backend API FastAPI (api/chat.py)
Expone endpoints para autenticación (usuario/password), gestión de conversaciones privadas por analista,
auditoría de mensajes y orquestación del agente RAG regulatorio con FastMCP.
"""

import time
import datetime
import logging
import os
import json
import secrets
from typing import List, Optional

from fastapi import FastAPI, HTTPException, status, Depends, UploadFile, File, Form
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter

from config import settings
from auth import get_current_user
from api.auth import router as auth_router, get_db
from schemas import (
    ChatRequest,
    ChatResponse,
    SystemStatusResponse,
    ConversacionItem,
    MensajeItem,
    ConversacionDetalle,
    ShareResponse,
    ActualizarConversacionRequest,
    CrearConversacionRequest,
    ActualizarDocumentoRequest
)
from agent import consultar_asistente

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("api_chat")

app = FastAPI(
    title="ComplianceAI · Asistente de Regulación y Riesgos",
    description="API para analistas de cumplimiento normativo y riesgos en banca digital con sesiones privadas.",
    version="1.1.0"
)

# Configuración de CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrar router de autenticación (/api/auth/register, /api/auth/login, /api/auth/me)
app.include_router(auth_router)


# ---------------------------------------------------------------------------
# Endpoints de Gestión de Conversaciones Privadas
# ---------------------------------------------------------------------------

@app.get("/api/conversaciones", response_model=List[ConversacionItem], summary="Listar conversaciones del analista")
def listar_conversaciones(
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db)
) -> List[ConversacionItem]:
    """Retorna las conversaciones activas del analista ordenadas por última actualización."""
    try:
        res = db.table("conversaciones").select("*").eq("usuario_id", current_user["id"]).order("actualizado_en", desc=True).execute()
        items: List[ConversacionItem] = []
        for row in (res.data or []):
            items.append(ConversacionItem(
                id=str(row["id"]),
                titulo=row.get("titulo", "Consulta Regulatoria"),
                area_normativa=row.get("area_normativa", "prevencion_lavado_activos"),
                creado_en=str(row.get("creado_en", "")),
                actualizado_en=str(row.get("actualizado_en", "")),
                total_mensajes=0
            ))
        return items
    except Exception as e:
        logger.error(f"Error al listar conversaciones: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al consultar el historial de conversaciones."
        )


@app.post("/api/conversaciones", response_model=ConversacionItem, status_code=status.HTTP_201_CREATED, summary="Crear nueva conversación")
def crear_conversacion(
    solicitud: CrearConversacionRequest,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db)
) -> ConversacionItem:
    """Crea una conversación de forma inmediata y opcionalmente persiste el primer mensaje del usuario."""
    try:
        ahora_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        titulo = (solicitud.titulo or "").strip()
        if not titulo and solicitud.primer_mensaje:
            titulo = solicitud.primer_mensaje.strip()[:150]
        if not titulo:
            titulo = "Nueva Consulta Regulatoria"
        elif len(titulo) > 150:
            titulo = titulo[:147] + "..."

        area = solicitud.area_normativa or "prevencion_lavado_activos"

        res_conv = db.table("conversaciones").insert({
            "usuario_id": current_user["id"],
            "titulo": titulo,
            "area_normativa": area,
            "creado_en": ahora_iso,
            "actualizado_en": ahora_iso
        }).execute()

        if not res_conv.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="No se pudo registrar la conversación en la base de datos."
            )

        conv_row = res_conv.data[0]
        conv_id = str(conv_row["id"])

        # Si se incluye el primer mensaje, persistirlo inmediatamente en la tabla mensajes
        if solicitud.primer_mensaje and solicitud.primer_mensaje.strip():
            db.table("mensajes").insert({
                "conversacion_id": conv_id,
                "rol": "user",
                "contenido": solicitud.primer_mensaje.strip(),
                "creado_en": ahora_iso
            }).execute()

        return ConversacionItem(
            id=conv_id,
            titulo=conv_row.get("titulo", titulo),
            area_normativa=conv_row.get("area_normativa", area),
            creado_en=str(conv_row.get("creado_en", ahora_iso)),
            actualizado_en=str(conv_row.get("actualizado_en", ahora_iso)),
            total_mensajes=1 if solicitud.primer_mensaje else 0
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al crear conversación: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al inicializar la conversación."
        )


@app.get("/api/conversaciones/{conversacion_id}", response_model=ConversacionDetalle, summary="Obtener historial de una conversación")
def obtener_conversacion(
    conversacion_id: str,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db)
) -> ConversacionDetalle:
    """Retorna los mensajes y metadatos de una conversación verificando la pertenencia al analista."""
    try:
        res_conv = db.table("conversaciones").select("*").eq("id", conversacion_id).eq("usuario_id", current_user["id"]).execute()
        if not res_conv.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversación no encontrada o no pertenece al analista."
            )
        conv = res_conv.data[0]

        res_msg = db.table("mensajes").select("*").eq("conversacion_id", conversacion_id).order("creado_en", desc=False).execute()
        mensajes: List[MensajeItem] = []
        for m in (res_msg.data or []):
            mensajes.append(MensajeItem(
                id=m["id"],
                conversacion_id=str(m["conversacion_id"]),
                rol=m["rol"],
                contenido=m["contenido"],
                fuentes_citadas=m.get("fuentes_citadas") or [],
                nivel_confianza=m.get("nivel_confianza"),
                outdated_alert=m.get("outdated_alert", False),
                traza_mcp=m.get("traza_mcp") or [],
                tiempo_ms=m.get("tiempo_ms", 0),
                creado_en=str(m.get("creado_en", ""))
            ))

        return ConversacionDetalle(
            conversacion=ConversacionItem(
                id=str(conv["id"]),
                titulo=conv.get("titulo", "Consulta"),
                area_normativa=conv.get("area_normativa", "prevencion_lavado_activos"),
                creado_en=str(conv.get("creado_en", "")),
                actualizado_en=str(conv.get("actualizado_en", "")),
                total_mensajes=len(mensajes)
            ),
            mensajes=mensajes
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al obtener detalle de conversación {conversacion_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al recuperar los mensajes de la conversación."
        )


@app.delete("/api/conversaciones/{conversacion_id}", summary="Eliminar conversación del analista")
def eliminar_conversacion(
    conversacion_id: str,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db)
) -> dict:
    """Elimina permanentemente una conversación y sus mensajes asociados si pertenece al analista."""
    try:
        res_conv = db.table("conversaciones").select("id").eq("id", conversacion_id).eq("usuario_id", current_user["id"]).execute()
        if not res_conv.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversación no encontrada o no pertenece al analista."
            )

        db.table("conversaciones").delete().eq("id", conversacion_id).eq("usuario_id", current_user["id"]).execute()
        return {"ok": True, "mensaje": "Conversación eliminada exitosamente."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al eliminar conversación {conversacion_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al eliminar la conversación."
        )


@app.patch("/api/conversaciones/{conversacion_id}", response_model=ConversacionItem, summary="Renombrar conversación del analista")
def renombrar_conversacion(
    conversacion_id: str,
    solicitud: ActualizarConversacionRequest,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db)
) -> ConversacionItem:
    """Actualiza el título de una conversación verificando la pertenencia al analista."""
    try:
        res_conv = db.table("conversaciones").select("*").eq("id", conversacion_id).eq("usuario_id", current_user["id"]).execute()
        if not res_conv.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversación no encontrada o no pertenece al analista."
            )

        ahora_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        nuevo_titulo = solicitud.titulo.strip()

        res_up = db.table("conversaciones").update({
            "titulo": nuevo_titulo,
            "actualizado_en": ahora_iso
        }).eq("id", conversacion_id).execute()

        if not res_up.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="No se pudo actualizar el título de la conversación."
            )

        row = res_up.data[0]
        return ConversacionItem(
            id=str(row["id"]),
            titulo=row.get("titulo", nuevo_titulo),
            area_normativa=row.get("area_normativa", "prevencion_lavado_activos"),
            token_compartido=row.get("token_compartido"),
            creado_en=str(row.get("creado_en", "")),
            actualizado_en=str(row.get("actualizado_en", ahora_iso)),
            total_mensajes=0
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al renombrar conversación {conversacion_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al renombrar la conversación."
        )


# ---------------------------------------------------------------------------
# Gestión de Conversaciones Compartidas Públicas (Solo Lectura Cifrada)
# ---------------------------------------------------------------------------

SHARED_TOKENS_FILE = os.path.join(os.path.dirname(__file__), "..", "data_shared_tokens.json")


def _guardar_token_compartido(db: Client, conversacion_id: str, token: str) -> None:
    """Persiste el token criptográfico tanto en Supabase como en respaldo local."""
    try:
        db.table("conversaciones").update({"token_compartido": token}).eq("id", conversacion_id).execute()
    except Exception as e:
        logger.warning(f"No se pudo guardar token_compartido en Supabase (posible columna pendiente de migración): {e}")

    try:
        tokens_map = {}
        if os.path.exists(SHARED_TOKENS_FILE):
            with open(SHARED_TOKENS_FILE, "r", encoding="utf-8") as f:
                tokens_map = json.load(f)
        tokens_map[token] = conversacion_id
        with open(SHARED_TOKENS_FILE, "w", encoding="utf-8") as f:
            json.dump(tokens_map, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Error al guardar token compartido en archivo local: {e}")


def _obtener_conversacion_id_por_token(db: Client, token: str) -> Optional[str]:
    """Resuelve el ID de conversación a partir del token seguro de solo lectura."""
    # 1. Intentar en Supabase
    try:
        res = db.table("conversaciones").select("id").eq("token_compartido", token).execute()
        if res.data and len(res.data) > 0:
            return str(res.data[0]["id"])
    except Exception:
        pass

    # 2. Respaldo local
    try:
        if os.path.exists(SHARED_TOKENS_FILE):
            with open(SHARED_TOKENS_FILE, "r", encoding="utf-8") as f:
                tokens_map = json.load(f)
                return tokens_map.get(token)
    except Exception as e:
        logger.error(f"Error al leer token compartido de respaldo local: {e}")

    return None


@app.post(
    "/api/conversaciones/{conversacion_id}/compartir",
    response_model=ShareResponse,
    summary="Generar o recuperar enlace público seguro de solo lectura"
)
def compartir_conversacion(
    conversacion_id: str,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db)
) -> ShareResponse:
    """
    Genera un token criptográfico URL-safe de alta entropía (32 bytes = 43 caracteres)
    para permitir que terceras personas lean la conversación sin permisos de escritura ni login.
    """
    try:
        # Validar que la conversación pertenece al analista autenticado
        res_conv = db.table("conversaciones").select("id").eq("id", conversacion_id).eq("usuario_id", current_user["id"]).execute()
        if not res_conv.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversación no encontrada o no pertenece al analista autenticado."
            )

        token = secrets.token_urlsafe(32)
        _guardar_token_compartido(db, conversacion_id, token)

        return ShareResponse(
            ok=True,
            conversacion_id=conversacion_id,
            token_compartido=token,
            share_url=f"/?share={token}"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al compartir conversación {conversacion_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al generar el enlace seguro de compartición."
        )


@app.get(
    "/api/compartido/{token_compartido}",
    response_model=ConversacionDetalle,
    summary="Obtener conversación compartida en modo de solo lectura (público)"
)
def obtener_conversacion_compartida(
    token_compartido: str,
    db: Client = Depends(get_db)
) -> ConversacionDetalle:
    """
    Recupera una conversación y sus citas para cualquier usuario con el enlace seguro.
    Es de solo lectura; no permite agregar turnos ni alterar el historial.
    """
    try:
        conv_id = _obtener_conversacion_id_por_token(db, token_compartido)
        if not conv_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="El enlace de la conversación compartida no es válido o ha expirado."
            )

        res_conv = db.table("conversaciones").select("*").eq("id", conv_id).execute()
        if not res_conv.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="La conversación compartida ya no existe."
            )
        conv = res_conv.data[0]

        res_msg = db.table("mensajes").select("*").eq("conversacion_id", conv_id).order("creado_en", desc=False).execute()
        mensajes: List[MensajeItem] = []
        for m in (res_msg.data or []):
            mensajes.append(MensajeItem(
                id=m["id"],
                conversacion_id=str(m["conversacion_id"]),
                rol=m["rol"],
                contenido=m["contenido"],
                fuentes_citadas=m.get("fuentes_citadas") or [],
                nivel_confianza=m.get("nivel_confianza"),
                outdated_alert=m.get("outdated_alert", False),
                traza_mcp=m.get("traza_mcp") or [],
                tiempo_ms=m.get("tiempo_ms", 0),
                creado_en=str(m.get("creado_en", ""))
            ))

        return ConversacionDetalle(
            conversacion=ConversacionItem(
                id=str(conv["id"]),
                titulo=conv.get("titulo", "Consulta Compartida"),
                area_normativa=conv.get("area_normativa", "prevencion_lavado_activos"),
                token_compartido=token_compartido,
                creado_en=str(conv.get("creado_en", "")),
                actualizado_en=str(conv.get("actualizado_en", "")),
                total_mensajes=len(mensajes)
            ),
            mensajes=mensajes
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error al recuperar conversación compartida {token_compartido}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al recuperar la conversación compartida."
        )


# ---------------------------------------------------------------------------
# Endpoint de Chat Principal Orquestado
# ---------------------------------------------------------------------------

@app.post("/api/chat", response_model=ChatResponse, summary="Procesar consulta regulatoria con el agente")
def chat_endpoint(
    solicitud: ChatRequest,
    current_user: dict = Depends(get_current_user),
    db: Client = Depends(get_db)
) -> ChatResponse:
    """
    Recibe la consulta del analista autenticado, administra la sesión privada en Supabase,
    orquesta el agente LangChain contra FastMCP con memoria multi-turno y persiste la evidencia.
    """
    t_inicio = time.time()
    conversacion_id = solicitud.conversacion_id

    try:
        # 1. Resolver o inicializar la conversación en Supabase
        if conversacion_id:
            res_c = db.table("conversaciones").select("id").eq("id", conversacion_id).eq("usuario_id", current_user["id"]).execute()
            if not res_c.data:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="La conversación especificada no existe o no pertenece al usuario autenticado."
                )
        else:
            q_clean = solicitud.query.strip()
            titulo = q_clean[:150]
            if len(q_clean) > 150:
                titulo += "..."
            area = (solicitud.filters.area_normativa if solicitud.filters and solicitud.filters.area_normativa else "prevencion_lavado_activos")
            res_nueva = db.table("conversaciones").insert({
                "usuario_id": current_user["id"],
                "titulo": titulo,
                "area_normativa": area
            }).execute()
            if not res_nueva.data:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="No se pudo inicializar la conversación en base de datos."
                )
            conversacion_id = str(res_nueva.data[0]["id"])

        # 2. Persistir mensaje de usuario inmediatamente (si no ha sido guardado ya)
        # y preparar el historial previo para el agente
        res_hist = db.table("mensajes").select("id, rol, contenido, creado_en").eq("conversacion_id", conversacion_id).order("creado_en", desc=False).execute()
        mensajes_existentes = res_hist.data or []

        ya_insertado = False
        if mensajes_existentes:
            ultimo = mensajes_existentes[-1]
            if ultimo.get("rol") == "user" and ultimo.get("contenido", "").strip() == solicitud.query.strip():
                ya_insertado = True

        if not ya_insertado:
            ahora_user_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            try:
                db.table("mensajes").insert({
                    "conversacion_id": conversacion_id,
                    "rol": "user",
                    "contenido": solicitud.query,
                    "creado_en": ahora_user_iso
                }).execute()
            except Exception as e_user_msg:
                logger.error(f"Error al insertar mensaje de usuario previo a agente: {e_user_msg}")

            mensajes_previos = [{"rol": m["rol"], "contenido": m["contenido"]} for m in mensajes_existentes]
        else:
            # Si ya estaba insertado como el último mensaje, los previos son los anteriores a este
            mensajes_previos = [{"rol": m["rol"], "contenido": m["contenido"]} for m in mensajes_existentes[:-1]]

        # 3. Invocar al agente LangChain
        resultado = consultar_asistente(solicitud, mensajes_previos=mensajes_previos)
        t_total_ms = int((time.time() - t_inicio) * 1000)

        # 4. Guardar turno del asistente en Supabase de forma defensiva
        try:
            db.table("mensajes").insert({
                "conversacion_id": conversacion_id,
                "rol": "assistant",
                "contenido": resultado.data.respuesta,
                "fuentes_citadas": [f.model_dump() for f in resultado.data.fuentes_citadas],
                "nivel_confianza": resultado.data.nivel_confianza,
                "outdated_alert": resultado.data.outdated_alert,
                "traza_mcp": [t.model_dump() for t in resultado.traza_mcp],
                "tiempo_ms": t_total_ms
            }).execute()

            # Actualizar timestamp de la conversación
            ahora_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            db.table("conversaciones").update({
                "actualizado_en": ahora_iso
            }).eq("id", conversacion_id).execute()
        except Exception as err_db:
            logger.error(f"Error al persistir mensaje del asistente en Supabase: {err_db}")

        resultado.conversacion_id = conversacion_id
        return resultado

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error inesperado en endpoint /api/chat")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al procesar la consulta regulatoria."
        )


# ---------------------------------------------------------------------------
# Endpoint de Diagnóstico de Salud
# ---------------------------------------------------------------------------

@app.get("/api/estado", response_model=SystemStatusResponse, summary="Diagnóstico de salud del sistema")
def estado_endpoint() -> SystemStatusResponse:
    """Retorna el estado de configuración de los servicios sin exponer secretos técnicos."""
    supabase_ok = False
    try:
        if settings.supabase_url and settings.active_supabase_key:
            client = create_client(settings.supabase_url, settings.active_supabase_key)
            res = client.table("documentos_normativos").select("id").limit(1).execute()
            supabase_ok = res.data is not None
    except Exception as e:
        logger.warning(f"Healthcheck de Supabase fallido: {e}")
        supabase_ok = False

    clave_llm_ok = bool(settings.openrouter_api_key and settings.openrouter_api_key.startswith("sk-or-"))
    estado_general = "listo" if (supabase_ok and clave_llm_ok) else "degradado"

    return SystemStatusResponse(
        proveedor="openrouter",
        modelo=settings.model_id,
        clave_configurada=clave_llm_ok,
        supabase_conectado=supabase_ok,
        mcp_url=settings.mcp_url,
        estado_general=estado_general
    )


# ---------------------------------------------------------------------------
# Endpoints de Visualización y Descarga de Documentos Normativos
# ---------------------------------------------------------------------------

@app.get("/api/documentos/{nombre_archivo}", summary="Servir archivo PDF normativo oficial")
def obtener_documento_pdf(nombre_archivo: str):
    """
    Entrega el archivo PDF oficial para visualización directa o inspección en visor institucional.
    Busca en los directorios de documentos_sbs y documentos_politicas de forma segura.
    """
    # Sanitizar nombre para evitar path traversal
    archivo_seguro = os.path.basename(nombre_archivo)
    posibles_rutas = [
        os.path.join("documentos_sbs", archivo_seguro),
        os.path.join("documentos_politicas", archivo_seguro)
    ]

    for ruta in posibles_rutas:
        if os.path.isfile(ruta):
            return FileResponse(
                path=ruta,
                media_type="application/pdf",
                filename=archivo_seguro,
                headers={"Content-Disposition": f"inline; filename=\"{archivo_seguro}\""}
            )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Documento normativo '{archivo_seguro}' no encontrado en el repositorio."
    )


@app.get("/api/documentos/extracto/detalle", summary="Recuperar extracto normativo de la base de datos")
def obtener_extracto_normativo(documento: str, resolucion: Optional[str] = None):
    """
    Recupera el fragmento textual oficial (contenido) de la tabla documentos_normativos en Supabase
    para sustentar la vista de folio legal cuando la cita histórica no lo tenía precargado.
    """
    try:
        if not settings.supabase_url or not settings.active_supabase_key:
            return {"ok": False, "error": "Supabase no configurado"}

        client = create_client(settings.supabase_url, settings.active_supabase_key)
        query = client.table("documentos_normativos").select("documento, resolucion_articulo, pagina, vigente, origen, contenido")
        
        # Filtro flexible
        if documento:
            query = query.ilike("documento", f"%{documento.strip()}%")
        if resolucion:
            query = query.ilike("resolucion_articulo", f"%{resolucion.strip()}%")

        res = query.limit(1).execute()
        if res.data and len(res.data) > 0:
            fila = res.data[0]
            return {
                "ok": True,
                "documento": fila.get("documento"),
                "resolucion_articulo": fila.get("resolucion_articulo"),
                "pagina": fila.get("pagina"),
                "vigente": fila.get("vigente"),
                "contenido": fila.get("contenido")
            }

        return {"ok": False, "error": "Extracto no encontrado"}
    except Exception as e:
        logger.error(f"Error al obtener extracto normativo: {e}")
        return {"ok": False, "error": str(e)}


# ---------------------------------------------------------------------------
# Endpoints de Gestión de Repositorio Documental (Slots en Grid)
# ---------------------------------------------------------------------------

def _formatear_tamano(tamano_bytes: int) -> str:
    if tamano_bytes < 1024:
        return f"{tamano_bytes} B"
    elif tamano_bytes < 1024 * 1024:
        return f"{tamano_bytes / 1024:.1f} KB"
    else:
        return f"{tamano_bytes / (1024 * 1024):.1f} MB"


def _obtener_info_pdf(ruta_archivo: str, origen: str, carpeta: str, meta_db: Optional[dict] = None) -> dict:
    nombre = os.path.basename(ruta_archivo)
    stat = os.stat(ruta_archivo)
    size_bytes = stat.st_size
    mod_time = datetime.datetime.fromtimestamp(stat.st_mtime, tz=datetime.timezone.utc).isoformat()

    paginas = 1
    try:
        reader = PdfReader(ruta_archivo)
        paginas = len(reader.pages)
    except Exception:
        pass

    es_derogada = any(k in nombre.lower() for k in ["derogada", "obsoleta"])

    if "2660" in nombre:
        res_art = "Res. SBS N° 2660-2015"
    elif "2180" in nombre:
        res_art = "Circular SBS N° B-2180-2008"
    elif "DIR_PLA_04" in nombre or "DIR-PLA-04" in nombre:
        res_art = "Directiva DIR-PLA-04"
    else:
        res_art = nombre.replace(".pdf", "").replace("_", " ")

    vigente = not es_derogada
    area_normativa = "prevencion_lavado_activos"

    # Si hay metadatos guardados explícitamente en Supabase, prevalecen sobre la inferencia
    if meta_db and nombre in meta_db:
        row = meta_db[nombre]
        if row.get("resolucion_articulo"):
            res_art = row["resolucion_articulo"]
        if row.get("vigente") is not None:
            vigente = bool(row["vigente"])
        if row.get("area_normativa"):
            area_normativa = row["area_normativa"]

    return {
        "nombre": nombre,
        "resolucion_articulo": res_art,
        "tamano_bytes": size_bytes,
        "tamano_formateado": _formatear_tamano(size_bytes),
        "paginas": paginas,
        "fecha_modificacion": mod_time,
        "vigente": vigente,
        "area_normativa": area_normativa,
        "carpeta": carpeta,
        "origen": origen
    }


@app.get("/api/documentos/repositorio/listar", summary="Listar documentos oficiales de SBS y Políticas")
def listar_documentos_repositorio():
    """
    Escanea las carpetas documentos_sbs y documentos_politicas,
    devolviendo los metadatos completos y actualizados desde Supabase.
    """
    meta_db = {}
    try:
        if settings.supabase_url and settings.active_supabase_key:
            client = create_client(settings.supabase_url, settings.active_supabase_key)
            res = client.table("documentos_normativos").select("documento, resolucion_articulo, vigente, area_normativa").execute()
            if res.data:
                for fila in res.data:
                    doc_nombre = fila.get("documento")
                    if doc_nombre and doc_nombre not in meta_db:
                        meta_db[doc_nombre] = fila
    except Exception as err:
        logger.warning(f"Error al consultar metadatos de documentos en Supabase: {err}")

    sbs_docs = []
    politicas_docs = []

    dir_sbs = "documentos_sbs"
    dir_pol = "documentos_politicas"

    if os.path.isdir(dir_sbs):
        for f in os.listdir(dir_sbs):
            if f.lower().endswith(".pdf"):
                ruta = os.path.join(dir_sbs, f)
                sbs_docs.append(_obtener_info_pdf(ruta, origen="sbs", carpeta="sbs", meta_db=meta_db))

    if os.path.isdir(dir_pol):
        for f in os.listdir(dir_pol):
            if f.lower().endswith(".pdf"):
                ruta = os.path.join(dir_pol, f)
                politicas_docs.append(_obtener_info_pdf(ruta, origen="politica_interna", carpeta="politicas", meta_db=meta_db))

    # Ordenar por nombre
    sbs_docs.sort(key=lambda x: x["nombre"])
    politicas_docs.sort(key=lambda x: x["nombre"])

    return {
        "ok": True,
        "sbs": sbs_docs,
        "politicas": politicas_docs,
        "total": len(sbs_docs) + len(politicas_docs)
    }


@app.patch("/api/documentos/{carpeta}/{nombre_archivo}", summary="Actualizar atributos oficiales de un documento")
def actualizar_documento_repositorio(
    carpeta: str,
    nombre_archivo: str,
    datos: ActualizarDocumentoRequest
):
    """
    Permite modificar los atributos de vigencia, resolución/código oficial y área normativa
    en todos los fragmentos asociados al archivo en la tabla documentos_normativos de Supabase.
    """
    archivo_seguro = os.path.basename(nombre_archivo)
    update_fields = {}
    if datos.vigente is not None:
        update_fields["vigente"] = datos.vigente
    if datos.resolucion_articulo is not None and datos.resolucion_articulo.strip():
        update_fields["resolucion_articulo"] = datos.resolucion_articulo.strip()
    if datos.area_normativa is not None and datos.area_normativa.strip():
        update_fields["area_normativa"] = datos.area_normativa.strip()

    if not update_fields:
        return {"ok": True, "mensaje": "Sin cambios que actualizar."}

    try:
        if settings.supabase_url and settings.active_supabase_key:
            client = create_client(settings.supabase_url, settings.active_supabase_key)
            res = client.table("documentos_normativos").update(update_fields).eq("documento", archivo_seguro).execute()
            filas_actualizadas = len(res.data) if res.data else 0
            return {
                "ok": True,
                "mensaje": f"Atributos actualizados en {filas_actualizadas} registros de Supabase.",
                "documento": archivo_seguro,
                "cambios": update_fields
            }
        return {"ok": False, "error": "Supabase no configurado"}
    except Exception as e:
        logger.error(f"Error al actualizar atributos de {archivo_seguro}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al actualizar atributos en la base de datos: {str(e)}"
        )



@app.post("/api/documentos/upload", summary="Cargar y vectorizar documento PDF en el repositorio")
async def subir_documento_repositorio(
    file: UploadFile = File(...),
    carpeta: str = Form(...)
):
    """
    Recibe un archivo PDF, lo almacena en la carpeta correspondiente ('sbs' o 'politicas'),
    extrae sus páginas y texto con pypdf, divide en fragmentos y genera embeddings vectoriales
    en Supabase pgvector para que el agente RAG lo consulte de inmediato.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se admiten documentos en formato PDF (.pdf)."
        )

    carpeta_norm = carpeta.strip().lower()
    if carpeta_norm not in ["sbs", "politicas"]:
        carpeta_norm = "sbs"

    dir_destino = "documentos_sbs" if carpeta_norm == "sbs" else "documentos_politicas"
    os.makedirs(dir_destino, exist_ok=True)

    nombre_seguro = os.path.basename(file.filename)
    ruta_guardado = os.path.join(dir_destino, nombre_seguro)

    # Guardar archivo físico en disco
    contenido_bytes = await file.read()
    with open(ruta_guardado, "wb") as f_out:
        f_out.write(contenido_bytes)

    # Procesamiento y Vectorización ETL automática
    from mcp_server import get_encoder
    es_derogada = any(k in nombre_seguro.lower() for k in ["derogada", "obsoleta"])
    origen_val = "sbs" if carpeta_norm == "sbs" else "politica_interna"

    if "2660" in nombre_seguro:
        res_art = "Res. SBS N° 2660-2015"
    elif "2180" in nombre_seguro:
        res_art = "Circular SBS N° B-2180-2008"
    elif "DIR_PLA_04" in nombre_seguro or "DIR-PLA-04" in nombre_seguro:
        res_art = "Directiva DIR-PLA-04"
    else:
        res_art = nombre_seguro.replace(".pdf", "").replace("_", " ")

    chunks_extraidos = []
    try:
        reader = PdfReader(ruta_guardado)
        splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=120)

        for num_pag, page in enumerate(reader.pages, start=1):
            texto = page.extract_text() or ""
            if not texto.strip():
                continue

            partes = splitter.split_text(texto)
            for parte in partes:
                chunks_extraidos.append({
                    "documento": nombre_seguro,
                    "resolucion_articulo": res_art,
                    "pagina": num_pag,
                    "area_normativa": "prevencion_lavado_activos",
                    "vigente": not es_derogada,
                    "origen": origen_val,
                    "contenido": parte.strip()
                })

        # Generar embeddings e insertar en Supabase si hay credenciales
        if chunks_extraidos:
            encoder = get_encoder()
            textos = [c["contenido"] for c in chunks_extraidos]
            vectores = list(encoder.embed(textos))

            for c, vec in zip(chunks_extraidos, vectores):
                c["embedding"] = vec.tolist()

            if settings.supabase_url and settings.active_supabase_key:
                client = create_client(settings.supabase_url, settings.active_supabase_key)
                # Limpiar versiones previas de este documento para evitar duplicados
                client.table("documentos_normativos").delete().eq("documento", nombre_seguro).execute()
                client.table("documentos_normativos").insert(chunks_extraidos).execute()

    except Exception as err_etl:
        logger.error(f"Aviso en ETL de documento cargado {nombre_seguro}: {err_etl}")

    info_pdf = _obtener_info_pdf(ruta_guardado, origen=origen_val, carpeta=carpeta_norm)
    info_pdf["chunks_indexados"] = len(chunks_extraidos)

    return {
        "ok": True,
        "mensaje": f"Documento '{nombre_seguro}' cargado y vectorizado con éxito.",
        "documento": info_pdf
    }


@app.delete("/api/documentos/{carpeta}/{nombre_archivo}", summary="Eliminar documento del repositorio")
def eliminar_documento_repositorio(carpeta: str, nombre_archivo: str):
    """
    Elimina el archivo PDF físico del servidor y desindexa sus fragmentos en Supabase pgvector.
    """
    archivo_seguro = os.path.basename(nombre_archivo)
    dir_target = "documentos_sbs" if carpeta.lower() == "sbs" else "documentos_politicas"
    ruta_archivo = os.path.join(dir_target, archivo_seguro)

    if os.path.isfile(ruta_archivo):
        try:
            os.remove(ruta_archivo)
        except Exception as e:
            logger.error(f"Error al eliminar archivo físico {ruta_archivo}: {e}")

    # Eliminar fragmentos de Supabase
    try:
        if settings.supabase_url and settings.active_supabase_key:
            client = create_client(settings.supabase_url, settings.active_supabase_key)
            client.table("documentos_normativos").delete().eq("documento", archivo_seguro).execute()
    except Exception as e:
        logger.error(f"Error al eliminar registros en Supabase para {archivo_seguro}: {e}")

    return {
        "ok": True,
        "mensaje": f"Documento '{archivo_seguro}' eliminado exitosamente del repositorio."
    }
