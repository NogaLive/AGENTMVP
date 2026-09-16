"""
ETL Documental para Supabase pgvector (etl.py)
Extrae texto de PDFs normativos y directivas internas, genera embeddings
con all-MiniLM-L6-v2 e inserta los fragmentos en la tabla 'documentos_normativos'.
"""

import os
import glob
import argparse
import logging
from typing import List, Dict, Any

from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from fastembed import TextEmbedding
from supabase import create_client, Client

from config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

DIR_SBS = "documentos_sbs"
DIR_POLITICAS = "documentos_politicas"
MODEL_EMBEDDINGS = "all-MiniLM-L6-v2"


def extraer_y_chunkear_documentos(directorio: str, origen: str) -> List[Dict[str, Any]]:
    """Lee PDFs de un directorio y los divide en fragmentos con metadatos estructurados."""
    patron = os.path.join(directorio, "*.pdf")
    archivos = glob.glob(patron)
    if not archivos:
        logger.warning(f"No se encontraron archivos PDF en {directorio}")
        return []

    splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=120)
    fragmentos_totales = []

    for ruta in archivos:
        nombre_archivo = os.path.basename(ruta)
        es_derogada = any(k in nombre_archivo.lower() for k in ["derogada", "obsoleta"])

        # Inferencia de resolución / directiva según nombre del archivo
        if "2660" in nombre_archivo:
            res_art = "Res. SBS N° 2660-2015"
        elif "2180" in nombre_archivo:
            res_art = "Circular SBS N° B-2180-2008"
        elif "DIR_PLA_04" in nombre_archivo or "DIR-PLA-04" in nombre_archivo:
            res_art = "DIR-PLA-04"
        else:
            res_art = nombre_archivo.replace(".pdf", "")

        reader = PdfReader(ruta)
        for num_pag, page in enumerate(reader.pages, start=1):
            texto = page.extract_text() or ""
            if not texto.strip():
                continue

            chunks = splitter.split_text(texto)
            for chunk in chunks:
                fragmentos_totales.append({
                    "documento": nombre_archivo,
                    "resolucion_articulo": res_art,
                    "pagina": num_pag,
                    "area_normativa": "prevencion_lavado_activos",
                    "vigente": not es_derogada,
                    "origen": origen,
                    "contenido": chunk.strip()
                })

        logger.info(f"Procesado: {nombre_archivo} -> {len(fragmentos_totales)} fragmentos acumulados.")

    return fragmentos_totales


def ejecutar_etl(dry_run: bool = False) -> None:
    """Ejecuta el pipeline completo de extracción, embeddings y carga a Supabase."""
    logger.info("=== Iniciando ETL Documental para Supabase pgvector ===")

    # 1. Cargar fragmentos de SBS y políticas
    docs_sbs = extraer_y_chunkear_documentos(DIR_SBS, origen="sbs")
    docs_pol = extraer_y_chunkear_documentos(DIR_POLITICAS, origen="politica_interna")
    todos_documentos = docs_sbs + docs_pol

    if not todos_documentos:
        logger.error("No se extrajeron fragmentos documentales. Revisa las carpetas de PDFs.")
        return

    logger.info(f"Total de fragmentos extraídos: {len(todos_documentos)}")

    # 2. Generar embeddings con modelo local
    logger.info(f"Cargando modelo de embeddings: {MODEL_EMBEDDINGS}...")
    encoder = TextEmbedding(f"sentence-transformers/{MODEL_EMBEDDINGS}")

    textos = [doc["contenido"] for doc in todos_documentos]
    logger.info("Calculando vectores de 384 dimensiones...")
    vectores = list(encoder.embed(textos))

    for doc, vec in zip(todos_documentos, vectores):
        doc["embedding"] = vec.tolist()

    logger.info(f"Embeddings generados exitosamente para {len(todos_documentos)} fragmentos.")

    if dry_run:
        logger.info("[MODO DRY-RUN] Validación completada exitosamente sin escribir en Supabase.")
        vigentes = sum(1 for d in todos_documentos if d["vigente"])
        derogadas = sum(1 for d in todos_documentos if not d["vigente"])
        print("\n" + "=" * 60)
        print("RESUMEN DE DRY-RUN:")
        print(f"  - Total fragmentos : {len(todos_documentos)}")
        print(f"  - Normas vigentes  : {vigentes}")
        print(f"  - Normas derogadas : {derogadas}")
        print(f"  - Dimensión vector : {len(todos_documentos[0]['embedding'])}")
        print("=" * 60)
        return

    # 3. Conexión y carga en Supabase
    if not settings.supabase_url or not settings.active_supabase_key:
        logger.error("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en la configuración. Abortando carga.")
        return

    logger.info(f"Conectando a Supabase en {settings.supabase_url}...")
    supabase: Client = create_client(settings.supabase_url, settings.active_supabase_key)

    try:
        # Limpiar registros existentes para evitar duplicación en re-ejecuciones
        logger.info("Limpiando registros previos en tabla 'documentos_normativos'...")
        supabase.table("documentos_normativos").delete().neq("id", 0).execute()

        # Insertar registros en lotes
        lote_tamano = 50
        total_insertados = 0
        for i in range(0, len(todos_documentos), lote_tamano):
            lote = todos_documentos[i:i + lote_tamano]
            res = supabase.table("documentos_normativos").insert(lote).execute()
            total_insertados += len(lote)
            logger.info(f"Insertados {total_insertados}/{len(todos_documentos)} registros.")

        vigentes = sum(1 for d in todos_documentos if d["vigente"])
        derogadas = sum(1 for d in todos_documentos if not d["vigente"])

        print("\n" + "=" * 65)
        print("[OK] ETL SUPABASE COMPLETADO EXITOSAMENTE")
        print(f"  - Fragmentos indexados : {total_insertados}")
        print(f"  - Normas vigentes      : {vigentes}")
        print(f"  - Normas derogadas     : {derogadas}")
        print(f"  - Destino              : {settings.supabase_url}")
        print("=" * 65)

    except Exception as e:
        logger.error(f"Error al escribir en Supabase: {e}")
        logger.info(
            "Recuerda que debes haber ejecutado el script 'schema_supabase.sql' "
            "en el SQL Editor de tu panel de Supabase antes de cargar los datos."
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ETL de documentos normativos a Supabase pgvector.")
    parser.add_argument("--dry-run", action="store_true", help="Ejecuta la extracción y embeddings sin insertar en Supabase.")
    args = parser.parse_args()

    ejecutar_etl(dry_run=args.dry_run)
