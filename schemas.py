"""
Modelos de Datos y Esquemas Pydantic (schemas.py)
Contratos tipados para ComplianceAI (Asistente de Regulación y Riesgos).
"""

from typing import List, Literal, Optional, Any, Dict
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Contratos de Citas y Respuesta del Asistente
# ---------------------------------------------------------------------------

class FuenteCitada(BaseModel):
    documento: str = Field(description="Nombre exacto del archivo PDF o norma oficial recuperada")
    resolucion_articulo: str = Field(description="Resolución SBS o Directiva Interna + Artículo o Numeral específico")
    pagina: int = Field(default=1, description="Número de página de la evidencia documental")
    score_relevancia: float = Field(default=0.0, description="Score de relevancia o similitud cosenos (0.0 a 1.0)")
    extracto: Optional[str] = Field(default=None, description="Fragmento textual o extracto relevante de la norma o política")


class RespuestaRegulatoria(BaseModel):
    respuesta: str = Field(
        description="Fundamentación técnica concisa estructurada en Hallazgos, Evidencia y Recomendación."
    )
    fuentes_citadas: List[FuenteCitada] = Field(
        default_factory=list,
        description="Lista de fuentes documentales citadas con metadatos exactos."
    )
    nivel_confianza: Literal["ALTO", "MEDIO", "BAJO", "NO_CONCLUYENTE"] = Field(
        default="NO_CONCLUYENTE",
        description="Nivel de confianza de la respuesta según la evidencia recuperada."
    )
    outdated_alert: bool = Field(
        default=False,
        description="True si alguna norma o directiva involucrada está derogada o desactualizada."
    )


# ---------------------------------------------------------------------------
# Contratos de API REST (FastAPI /api/chat y /api/estado)
# ---------------------------------------------------------------------------

class ChatFilters(BaseModel):
    area_normativa: Optional[str] = Field(default="prevencion_lavado_activos", description="Área normativa de la consulta")
    tipo_producto: Optional[str] = Field(default=None, description="Producto bancario relacionado (ej. cuenta_ahorros)")
    vigente: Optional[bool] = Field(default=True, description="Filtrar preferentemente normas vigentes")


class ChatRequest(BaseModel):
    query: str = Field(min_length=3, max_length=2000, description="Consulta operativa o regulatoria del analista")
    session_id: Optional[str] = Field(default=None, description="Identificador de sesión (compatibilidad)")
    conversacion_id: Optional[str] = Field(default=None, description="UUID de la conversación privada en Supabase")
    filters: Optional[ChatFilters] = Field(default_factory=ChatFilters, description="Filtros opcionales")


class MCPToolTrace(BaseModel):
    tool: str = Field(description="Nombre de la herramienta MCP invocada")
    parametros: Dict[str, Any] = Field(default_factory=dict, description="Argumentos pasados a la herramienta")
    tiempo_ms: int = Field(default=0, description="Tiempo de ejecución en milisegundos")
    registros_devueltos: int = Field(default=0, description="Cantidad de registros devueltos por la herramienta")


class ChatResponse(BaseModel):
    ok: bool = Field(default=True, description="Indica si la solicitud se procesó exitosamente")
    conversacion_id: Optional[str] = Field(default=None, description="UUID de la conversación asociada")
    data: RespuestaRegulatoria = Field(description="Cuerpo de respuesta estructurada del asistente")
    traza_mcp: List[MCPToolTrace] = Field(default_factory=list, description="Trazas auditables de herramientas MCP ejecutadas")
    error: Optional[str] = Field(default=None, description="Mensaje de error amigable en caso de falla")


# ---------------------------------------------------------------------------
# Contratos de Autenticación de Usuarios
# ---------------------------------------------------------------------------

class UserRegisterRequest(BaseModel):
    usuario: str = Field(min_length=3, max_length=50, description="Identificador único de acceso del analista")
    nombre: str = Field(min_length=2, max_length=100, description="Nombre completo del analista")
    password: str = Field(min_length=6, max_length=16, description="Contraseña (máx 16 chars, mín 1 número, mín 1 símbolo)")


class UserLoginRequest(BaseModel):
    usuario: str = Field(description="Identificador del analista")
    password: str = Field(description="Contraseña del analista")


class UserResponse(BaseModel):
    id: str = Field(description="UUID del usuario")
    usuario: str = Field(description="Identificador del analista")
    nombre: str = Field(description="Nombre completo")
    activo: bool = Field(default=True, description="Estado de la cuenta")


class TokenResponse(BaseModel):
    access_token: str = Field(description="Token de sesión JWT")
    token_type: str = Field(default="bearer", description="Tipo de token")
    usuario: UserResponse = Field(description="Datos del usuario autenticado")


# ---------------------------------------------------------------------------
# Contratos de Conversaciones y Mensajes Privados
# ---------------------------------------------------------------------------

class ShareResponse(BaseModel):
    ok: bool = Field(default=True, description="Indica si se generó el enlace")
    conversacion_id: str = Field(description="UUID de la conversación compartida")
    token_compartido: str = Field(description="Token criptográfico de acceso público")
    share_url: str = Field(description="Ruta relativa o enlace para compartir")


class ActualizarConversacionRequest(BaseModel):
    titulo: str = Field(min_length=1, max_length=255, description="Nuevo título descriptivo de la conversación")


class ConversacionItem(BaseModel):
    id: str = Field(description="UUID de la conversación")
    titulo: str = Field(description="Título descriptivo del tema consultado")
    area_normativa: Optional[str] = Field(default="prevencion_lavado_activos")
    token_compartido: Optional[str] = Field(default=None, description="Token público si ha sido compartida")
    creado_en: str = Field(description="Fecha de creación ISO")
    actualizado_en: str = Field(description="Fecha de última actualización ISO")
    total_mensajes: int = Field(default=0, description="Cantidad de turnos en la conversación")


class MensajeItem(BaseModel):
    id: int = Field(description="ID secuencial del mensaje")
    conversacion_id: str = Field(description="UUID de la conversación")
    rol: str = Field(description="user | assistant | system")
    contenido: str = Field(description="Texto del mensaje")
    fuentes_citadas: List[FuenteCitada] = Field(default_factory=list, description="Citas documentales de sustento")
    nivel_confianza: Optional[str] = Field(default=None, description="Nivel de confianza asignado")
    outdated_alert: bool = Field(default=False, description="True si involucra normas derogadas")
    traza_mcp: List[MCPToolTrace] = Field(default_factory=list, description="Trazas de herramientas ejecutadas")
    tiempo_ms: int = Field(default=0, description="Tiempo de procesamiento")
    creado_en: str = Field(description="Timestamp de registro")


class ConversacionDetalle(BaseModel):
    conversacion: ConversacionItem
    mensajes: List[MensajeItem]


class SystemStatusResponse(BaseModel):
    proveedor: str = Field(default="openrouter", description="Proveedor del modelo LLM")
    modelo: str = Field(description="ID del modelo configurado")
    clave_configurada: bool = Field(description="True si la API key del LLM está presente")
    supabase_conectado: bool = Field(description="True si la conexión a Supabase responde correctamente")
    mcp_url: str = Field(description="URL activa del servidor FastMCP")
    estado_general: Literal["listo", "degradado", "error"] = Field(description="Estado operativo del sistema")


# ---------------------------------------------------------------------------
# Envoltura Estándar de Resultados de Tools FastMCP
# ---------------------------------------------------------------------------

class MCPToolResultWrapper(BaseModel):
    ok: bool = Field(default=True, description="Indica si la consulta a la base de datos se ejecutó con éxito")
    capacidad: str = Field(description="Nombre de la tool ejecutada")
    parametros: Dict[str, Any] = Field(description="Parámetros recibidos por la tool")
    cantidad_registros: int = Field(description="Total de fragmentos encontrados")
    resultados: List[Dict[str, Any]] = Field(default_factory=list, description="Fragmentos recuperados con metadatos")
    fuente: str = Field(description="Origen de los datos (ej. Supabase pgvector · tabla documentos_normativos)")
    advertencia: Optional[str] = Field(default=None, description="Advertencia explícita en caso de 0 registros o normas derogadas")


class ActualizarDocumentoRequest(BaseModel):
    vigente: Optional[bool] = Field(default=None, description="Estado de vigencia (True=Vigente, False=Derogada)")
    resolucion_articulo: Optional[str] = Field(default=None, description="Título o resolución oficial formal")
    area_normativa: Optional[str] = Field(default=None, description="Área normativa regulatoria")
