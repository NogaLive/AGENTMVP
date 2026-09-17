"""
Orquestador de Desarrollo Local en Terminal Única (dev.py)
Inicia FastMCP, FastAPI y el frontend Vite de manera concurrente con unificación de logs y cierre coordinado.
"""

import os
import sys
import subprocess
import signal
import time
from pathlib import Path

# Asegurar codificación UTF-8 en Windows para evitar UnicodeEncodeError con emojis
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Asegurar disponibilidad de Node/npm en Windows
if r"C:\Program Files\nodejs" not in os.environ.get("PATH", ""):
    os.environ["PATH"] = r"C:\Program Files\nodejs;" + os.environ.get("PATH", "")

ROOT_DIR = Path(__file__).resolve().parent

def obtener_python_venv() -> str:
    """Detecta y prioriza automáticamente el intérprete del entorno virtual del proyecto."""
    candidatos = [
        ROOT_DIR / "venv" / "Scripts" / "python.exe",
        ROOT_DIR / ".venv" / "Scripts" / "python.exe",
        ROOT_DIR / "venv" / "bin" / "python",
        ROOT_DIR / ".venv" / "bin" / "python",
    ]
    for cand in candidatos:
        if cand.exists():
            return str(cand)
    return sys.executable

PYTHON_EXE = obtener_python_venv()

PROCESOS = []


def detener_procesos(signum=None, frame=None):
    """Detiene limpiamente todos los subprocesos hijos y sus árboles de procesos."""
    print("\n[DEV] Deteniendo todos los servicios...")
    for nombre, p in PROCESOS:
        if p.poll() is None:
            print(f"[DEV] Finalizando {nombre} (PID: {p.pid})...")
            if sys.platform == "win32":
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)], capture_output=True)
            else:
                p.terminate()
                try:
                    p.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    p.kill()
    print("[DEV] Todos los servicios han sido detenidos. ¡Hasta pronto!")
    sys.exit(0)


def iniciar_servicio(nombre: str, comando: list, cwd: Path = ROOT_DIR):
    """Inicia un subproceso con el comando indicado."""
    print(f"[DEV] Iniciando {nombre}: {' '.join(str(c) for c in comando)}")
    p = subprocess.Popen(
        comando,
        cwd=str(cwd),
        shell=(sys.platform == "win32")
    )
    PROCESOS.append((nombre, p))
    return p


def main():
    signal.signal(signal.SIGINT, detener_procesos)
    signal.signal(signal.SIGTERM, detener_procesos)

    print("=" * 65)
    print("🚀 INICIANDO ENTORNO DE DESARROLLO (ComplianceAI)")
    print(f"🐍 Python Runtime: {PYTHON_EXE}")
    print("=" * 65)

    # 1. Iniciar Servidor FastMCP en puerto 8001
    iniciar_servicio(
        "FastMCP (:8001)",
        [PYTHON_EXE, "-m", "uvicorn", "api.mcp:app", "--reload", "--reload-dir", str(ROOT_DIR), "--port", "8001"]
    )
    time.sleep(1.5)

    # 2. Iniciar Backend FastAPI en puerto 8000 (si api/chat.py existe)
    chat_file = ROOT_DIR / "api" / "chat.py"
    if chat_file.exists():
        iniciar_servicio(
            "FastAPI (:8000)",
            [PYTHON_EXE, "-m", "uvicorn", "api.chat:app", "--reload", "--reload-dir", str(ROOT_DIR), "--port", "8000"]
        )
    else:
        print("[DEV] Nota: api/chat.py aún no implementado; omitiendo inicio de FastAPI.")

    # 3. Iniciar Frontend React Vite en puerto 5173 (si la carpeta frontend existe)
    frontend_dir = ROOT_DIR / "frontend"
    if frontend_dir.exists() and (frontend_dir / "package.json").exists():
        npm_bin = "npm.cmd" if sys.platform == "win32" else "npm"
        iniciar_servicio(
            "Frontend Vite (:5173)",
            [npm_bin, "run", "dev"],
            cwd=frontend_dir
        )
    else:
        print("[DEV] Nota: Carpeta frontend aún no creada; omitiendo inicio de Vite.")

    print("\n[DEV] Stack en ejecución. Presiona Ctrl + C para detener todos los servicios.\n")

    procesos_advertidos = set()
    try:
        while True:
            # Monitorear si algún proceso murió inesperadamente
            for nombre, p in PROCESOS:
                ret = p.poll()
                if ret is not None and nombre not in procesos_advertidos:
                    procesos_advertidos.add(nombre)
                    print(f"[DEV] ⚠️ Advertencia: El proceso {nombre} terminó con código {ret}.")
            time.sleep(2)
    except KeyboardInterrupt:
        detener_procesos()


if __name__ == "__main__":
    main()
