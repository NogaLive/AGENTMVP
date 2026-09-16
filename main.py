"""
Entrypoint Unificado de la Aplicación (main.py)
Monta la API de Chat, el servidor FastMCP y los archivos estáticos de React para Vercel o ejecución local.
"""

import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from api.chat import app as chat_app
from api.mcp import app as mcp_app

# Aplicación principal unificada
app = chat_app

# Montar el servidor FastMCP bajo el prefijo /api/mcp (con soporte para trailing slash)
app.mount("/api/mcp", mcp_app)

# Servir los archivos compilados del frontend React en producción si existen
DIST_DIR = Path(__file__).resolve().parent / "frontend" / "dist"
if DIST_DIR.exists():
    app.mount("/", StaticFiles(directory=str(DIST_DIR), html=True), name="frontend_static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
