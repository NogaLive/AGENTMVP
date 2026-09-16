"""
Router de Autenticación de Usuarios (api/auth.py)
Endpoints de registro con SHA-256, inicio de sesión y perfil del analista por identificador de usuario.
"""

import logging
from fastapi import APIRouter, HTTPException, status, Depends
from supabase import create_client, Client

from config import settings
from auth import (
    validar_politica_password,
    hashear_password,
    verificar_password,
    crear_token_jwt,
    get_current_user
)
from schemas import (
    UserRegisterRequest,
    UserLoginRequest,
    UserResponse,
    TokenResponse
)

logger = logging.getLogger("api_auth")

router = APIRouter(prefix="/api/auth", tags=["Autenticación"])


def get_db() -> Client:
    if not settings.supabase_url or not settings.active_supabase_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Servicio de base de datos no configurado."
        )
    return create_client(settings.supabase_url, settings.active_supabase_key)


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED, summary="Registro de nuevo analista")
def register(req: UserRegisterRequest, db: Client = Depends(get_db)) -> UserResponse:
    """Registra un nuevo analista validando política de contraseñas (máx 16 chars, mín 1 número y mín 1 símbolo) y cifrando con SHA-256."""
    # 1. Validar política de contraseña
    es_valida, motivo = validar_politica_password(req.password)
    if not es_valida:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=motivo)

    usuario_clean = req.usuario.strip().lower()

    # 2. Comprobar si el usuario ya existe
    res = db.table("usuarios").select("id").eq("usuario", usuario_clean).execute()
    if res.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El nombre de usuario ya se encuentra registrado."
        )

    # 3. Cifrar con SHA-256 institucional
    pwd_hash = hashear_password(req.password)

    # 4. Insertar usuario
    res_insert = db.table("usuarios").insert({
        "usuario": usuario_clean,
        "nombre": req.nombre.strip(),
        "password_hash": pwd_hash,
        "activo": True
    }).execute()

    if not res_insert.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al crear la cuenta de usuario."
        )

    nuevo_user = res_insert.data[0]
    return UserResponse(
        id=str(nuevo_user["id"]),
        usuario=nuevo_user["usuario"],
        nombre=nuevo_user["nombre"],
        activo=nuevo_user.get("activo", True)
    )


@router.post("/login", response_model=TokenResponse, summary="Inicio de sesión de analista")
def login(req: UserLoginRequest, db: Client = Depends(get_db)) -> TokenResponse:
    """Verifica credenciales contra el hash SHA-256 y emite un token de sesión JWT."""
    usuario_clean = req.usuario.strip().lower()

    res = db.table("usuarios").select("id, usuario, nombre, password_hash, activo").eq("usuario", usuario_clean).execute()
    if not res.data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos."
        )

    user = res.data[0]

    if not user.get("activo", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta se encuentra deshabilitada."
        )

    # Validar coincidencia de hash SHA-256
    if not verificar_password(req.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos."
        )

    token = crear_token_jwt(str(user["id"]), user["usuario"])

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        usuario=UserResponse(
            id=str(user["id"]),
            usuario=user["usuario"],
            nombre=user["nombre"],
            activo=user["activo"]
        )
    )


@router.get("/me", response_model=UserResponse, summary="Obtener perfil del usuario autenticado")
def me(current_user: dict = Depends(get_current_user)) -> UserResponse:
    """Retorna los datos del analista actualmente autenticado con su token JWT."""
    return UserResponse(
        id=str(current_user["id"]),
        usuario=current_user["usuario"],
        nombre=current_user["nombre"],
        activo=current_user.get("activo", True)
    )
