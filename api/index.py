"""
Punto de Entrada Serverless para Vercel (api/index.py)
Expone la aplicación FastAPI unificada con soporte para Chat, FastMCP y endpoints de la plataforma.
"""

from main import app

# Vercel Serverless Function handler
app = app
