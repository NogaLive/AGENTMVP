"""
Prueba de Humo e2e de Aceptación con OpenRouter (tests/test_smoke.py)
Evalúa programáticamente los 3 casos de aceptación oficiales del MVP.
"""

import sys
import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from schemas import ChatRequest, ChatFilters
from agent import consultar_asistente


class TestSmokeAcceptance(unittest.TestCase):

    def test_caso_01_camino_feliz_pep(self):
        """Caso 1: Consulta sobre requisitos y aprobaciones para clientes PEP (Camino Feliz)."""
        solicitud = ChatRequest(
            query="¿Cuáles son los requisitos obligatorios y aprobaciones necesarias para la apertura de cuentas a Personas Expuestas Políticamente (PEP)?",
            session_id="smoke_test_01",
            filters=ChatFilters(area_normativa="prevencion_lavado_activos", tipo_producto="cuenta_ahorros", vigente=True)
        )

        resp = consultar_asistente(solicitud)
        self.assertTrue(resp.ok, f"Error en la llamada: {resp.error}")
        data = resp.data

        print("\n[CASO 1 - PEP]")
        print("Respuesta:", data.respuesta[:150], "...")
        print("Confianza:", data.nivel_confianza, "| Outdated:", data.outdated_alert)
        print("Fuentes citadas:", [f.documento for f in data.fuentes_citadas])
        print("Trazas MCP:", [t.tool for t in resp.traza_mcp])

        self.assertFalse(data.outdated_alert, "No debe activar outdated_alert para normas vigentes")
        self.assertIn(data.nivel_confianza, ["ALTO", "MEDIO"], "El nivel de confianza debe ser ALTO o MEDIO")
        self.assertGreater(len(data.fuentes_citadas), 0, "Debe citar al menos una fuente documental oficial")

        # Comprobar que se invocaron herramientas MCP
        self.assertGreater(len(resp.traza_mcp), 0, "Debe existir al menos una traza de herramienta MCP")

    def test_caso_02_norma_derogada(self):
        """Caso 2: Consulta sobre la Circular SBS B-2180-2008 (Incertidumbre / Derogada)."""
        solicitud = ChatRequest(
            query="¿Es aplicable la Circular SBS B-2180-2008 para simplificar la apertura de cuentas de ahorro sin declaración jurada?",
            session_id="smoke_test_02",
            filters=ChatFilters(area_normativa="prevencion_lavado_activos", tipo_producto="cuenta_ahorros", vigente=False)
        )

        resp = consultar_asistente(solicitud)
        self.assertTrue(resp.ok, f"Error en la llamada: {resp.error}")
        data = resp.data

        print("\n[CASO 2 - DEROGADA]")
        print("Respuesta:", data.respuesta[:150], "...")
        print("Confianza:", data.nivel_confianza, "| Outdated:", data.outdated_alert)
        print("Fuentes citadas:", [f.documento for f in data.fuentes_citadas])
        print("Trazas MCP:", [t.tool for t in resp.traza_mcp])

        # Debe alertar sobre la derogación o clasificar con baja confianza
        es_derogada_reconocida = (
            data.outdated_alert is True
            or data.nivel_confianza in ["BAJO", "NO_CONCLUYENTE"]
            or "derogada" in data.respuesta.lower()
        )
        self.assertTrue(es_derogada_reconocida, "El agente debe reconocer activamente la norma derogada")

    def test_caso_03_fuera_de_alcance(self):
        """Caso 3: Consulta sobre cálculo matemático de provisiones e interés (Fuera de Alcance)."""
        solicitud = ChatRequest(
            query="¿Cuál es la fórmula matemática para calcular el interés compuesto y las provisiones específicas de mi cartera de créditos hipotecarios este mes?",
            session_id="smoke_test_03",
            filters=ChatFilters(area_normativa="calculo_financiero", tipo_producto="credito_hipotecario")
        )

        resp = consultar_asistente(solicitud)
        self.assertTrue(resp.ok, f"Error en la llamada: {resp.error}")
        data = resp.data

        print("\n[CASO 3 - FUERA DE ALCANCE]")
        print("Respuesta:", data.respuesta[:150], "...")
        print("Confianza:", data.nivel_confianza, "| Outdated:", data.outdated_alert)
        print("Fuentes citadas:", [f.documento for f in data.fuentes_citadas])
        print("Trazas MCP:", [t.tool for t in resp.traza_mcp])

        self.assertEqual(len(data.fuentes_citadas), 0, "No debe citar fuentes para preguntas fuera de alcance")
        self.assertEqual(data.nivel_confianza, "NO_CONCLUYENTE", "La confianza debe ser NO_CONCLUYENTE")


if __name__ == "__main__":
    unittest.main(verbosity=2)
