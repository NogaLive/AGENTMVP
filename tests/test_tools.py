"""
Suite de Pruebas de Contratos de Herramientas FastMCP (tests/test_tools.py)
Se ejecuta SIN API key de LLM y valida contratos defensivos, límites y seguridad.
"""

import sys
import json
import unittest
from pathlib import Path

# Agregar directorio raíz al path para importar módulos
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from mcp_server import (
    rag_normativa_sbs,
    rag_politicas_internas,
    validar_vigencia_documento
)


class TestMCPToolsContracts(unittest.TestCase):

    def test_01_rag_sbs_input_corto_defensivo(self):
        """Verifica que consultas con menos de 3 caracteres sean rechazadas con advertencia limpia sin error."""
        res_raw = rag_normativa_sbs("ab")
        data = json.loads(res_raw)
        self.assertTrue(data.get("ok"))
        self.assertEqual(data.get("cantidad_registros"), 0)
        self.assertIn("al menos 3 caracteres", data.get("advertencia", ""))

    def test_02_rag_politicas_input_corto_defensivo(self):
        """Verifica que consultas cortas a políticas sean gestionadas defensivamente."""
        res_raw = rag_politicas_internas("  ")
        data = json.loads(res_raw)
        self.assertTrue(data.get("ok"))
        self.assertEqual(data.get("cantidad_registros"), 0)
        self.assertIn("al menos 3 caracteres", data.get("advertencia", ""))

    def test_03_validar_vigencia_input_vacio_defensivo(self):
        """Verifica que códigos con solo caracteres especiales no rompan la búsqueda."""
        res_raw = validar_vigencia_documento("$$$%%%")
        data = json.loads(res_raw)
        self.assertTrue(data.get("ok"))
        self.assertEqual(data.get("cantidad_registros"), 0)
        self.assertIn("no contiene caracteres válidos", data.get("advertencia", ""))

    def test_04_seguridad_solo_lectura_en_codigo(self):
        """Auditoría de seguridad: verifica que mcp_server.py no contenga sentencias DML de escritura."""
        archivo_server = ROOT_DIR / "mcp_server.py"
        with open(archivo_server, "r", encoding="utf-8") as f:
            contenido = f.read().upper()

        keywords_prohibidas = [
            ".INSERT(",
            ".UPDATE(",
            ".DELETE(",
            "DROP TABLE",
            "ALTER TABLE",
            "TRUNCATE "
        ]
        for kw in keywords_prohibidas:
            self.assertNotIn(kw, contenido, f"Vulnerabilidad de seguridad detectada: {kw} en mcp_server.py")

    def test_05_estructura_envoltura_evidencia(self):
        """Valida que los campos obligatorios del contrato de evidencia estén presentes."""
        campos_obligatorios = {
            "ok",
            "capacidad",
            "parametros",
            "cantidad_registros",
            "resultados",
            "fuente",
            "advertencia"
        }
        res_raw = rag_normativa_sbs("test")
        data = json.loads(res_raw)
        for campo in campos_obligatorios:
            self.assertIn(campo, data, f"Campo obligatorio ausente en respuesta de tool: {campo}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
