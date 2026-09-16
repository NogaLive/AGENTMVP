"""
Módulo de Autenticación y Seguridad (auth.py)
Implementa la validación de contraseñas (máx 16 chars, min 1 número, min 1 símbolo),
hashing con SHA-256 y gestión de tokens de sesión JWT.
"""

import re
import hashlib
import datetime
from typing import Optional, Tuple, Dict, Any

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client

from config import settings

security_bearer = HTTPBearer(auto_error=False)


def validar_politica_password(password: str) -> Tuple[bool, str]:
    """
    Valida la política de contraseñas institucional:
    - Máximo 16 caracteres.
    - Mínimo 6 caracteres.
    - Mínimo 1 número (0-9).
    - Mínimo 1 símbolo o carácter especial.
    """
    if len(password) > 16:
        return False, "La contraseña no debe superar los 16 caracteres de longitud."
    if len(password) < 6:
        return False, "La contraseña debe tener al menos 6 caracteres."
    if not re.search(r"\d", password):
        return False, "La contraseña debe contener al menos un número (0-9)."
    if not re.search(r"[^a-zA-Z0-9\s]", password):
        return False, "La contraseña debe contener al menos un símbolo o carácter especial (!@#$%^&* etc.)."

    return True, "Contraseña válida."


def hashear_password(password: str) -> str:
    """Calcula el hash criptográfico SHA-256 de la contraseña utilizando salt institucional."""
    texto_a_cifrar = f"{settings.password_salt}:{password}"
    return hashlib.sha256(texto_a_cifrar.encode("utf-8")).hexdigest()


def verificar_password(password: str, hashed_esperado: str) -> bool:
    """Verifica si la contraseña ingresada coincide con el hash SHA-256 almacenado."""
    return hashear_password(password) == hashed_esperado


def crear_token_jwt(usuario_id: str, usuario: str) -> str:
    """Genera un JWT firmado para la sesión del analista con expiración configurable."""
    expiracion = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(
        minutes=settings.jwt_expiration_minutes
    )
    payload = {
        "sub": usuario_id,
        "usuario": usuario,
        "exp": expiracion,
        "iat": datetime.datetime.now(datetime.timezone.utc)
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def verificar_token_jwt(token: str) -> Dict[str, Any]:
    """Decodifica y valida la firma y vigencia del token JWT."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm]
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="La sesión ha expirado. Inicia sesión nuevamente.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autorización inválido.",
            headers={"WWW-Authenticate": "Bearer"}
        )


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer)
) -> Dict[str, Any]:
    """Dependencia de FastAPI para proteger endpoints requiriendo autenticación JWT."""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Se requiere token de autenticación en la cabecera Authorization: Bearer <token>",
            headers={"WWW-Authenticate": "Bearer"}
        )

    payload = verificar_token_jwt(credentials.credentials)
    usuario_id = payload.get("sub")

    if not usuario_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales de usuario no válidas en el token."
        )

    # Validar en Supabase que el usuario exista y esté activo
    if not settings.supabase_url or not settings.active_supabase_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Base de datos no configurada."
        )

    client: Client = create_client(settings.supabase_url, settings.active_supabase_key)
    res = client.table("usuarios").select("id, usuario, nombre, activo").eq("id", usuario_id).execute()

    if not res.data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="El usuario no existe o ha sido deshabilitado."
        )

    user = res.data[0]
    if not user.get("activo", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="La cuenta de usuario se encuentra suspendida."
        )

    return user
