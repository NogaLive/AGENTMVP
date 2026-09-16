"""
Servidor FastMCP expuesto como aplicación ASGI (api/mcp.py)
Permite ejecución en local mediante Uvicorn y montaje unificado en Vercel con stateless_http=True.
"""

from mcp_server import mcp

# Exposición formal ASGI en modo stateless HTTP
app = mcp.http_app(path="/", stateless_http=True)
