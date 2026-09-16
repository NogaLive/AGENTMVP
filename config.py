"""
Módulo de Configuración Centralizada (config.py)
Utiliza Pydantic Settings para cargar y validar variables de entorno desde .env o el sistema.
"""

from typing import Optional
from pydantic import Field, AliasChoices
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # Proveedor LLM (OpenRouter)
    openrouter_api_key: Optional[str] = Field(default=None, alias="OPENROUTER_API_KEY")
    openrouter_base_url: str = Field(default="https://openrouter.ai/api/v1", alias="OPENROUTER_BASE_URL")
    model_id: str = Field(
        default="nvidia/nemotron-3-ultra-550b-a55b:free",
        validation_alias=AliasChoices("MODEL_ID", "LLM_MODEL")
    )

    # Persistencia Vectorial (Supabase)
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_secret_key: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("SUPABASE_SECRET_KEY", "SUPABASE_KEY", "SUPABASE_SERVICE_ROLE_KEY")
    )
    supabase_publishable_key: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY")
    )

    # Servidor FastMCP
    mcp_url: str = Field(default="http://127.0.0.1:8001/", alias="MCP_URL")

    # Autenticación y Seguridad
    jwt_secret: str = Field(
        default="complianceai-secret-key-2026-production",
        validation_alias=AliasChoices("JWT_SECRET", "SECRET_KEY")
    )
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    jwt_expiration_minutes: int = Field(default=10080, alias="JWT_EXPIRATION_MINUTES") # 7 días
    password_salt: str = Field(default="complianceai-salt-security", alias="PASSWORD_SALT")

    # Entorno y Logging
    environment: str = Field(default="development", alias="ENVIRONMENT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    @property
    def active_supabase_key(self) -> str:
        """Retorna la secret key preferentemente para operaciones del servidor; si no existe, la publishable key."""
        return self.supabase_secret_key or self.supabase_publishable_key or ""

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in ("production", "prod")


settings = Settings()
