"""
Pruebas Unitarias para Autenticación, Política de Contraseñas y Memoria (tests/test_auth_and_memory.py)
"""

import sys
import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from fastapi.testclient import TestClient
from auth import (
    validar_politica_password,
    hashear_password,
    verificar_password,
    crear_token_jwt,
    verificar_token_jwt
)
from main import app

client = TestClient(app)


class TestAuthAndMemory(unittest.TestCase):

    def test_politica_password_valida(self):
        """Valida que una contraseña que cumple las reglas sea aceptada."""
        valida, msg = validar_politica_password("Sbs2026!#")
        self.assertTrue(valida)
        self.assertEqual(msg, "Contraseña válida.")

    def test_politica_password_longitud_excedida(self):
        """Rechaza contraseñas con más de 16 caracteres."""
        valida, msg = validar_politica_password("SuperSecretPassword123!@#")
        self.assertFalse(valida)
        self.assertIn("16 caracteres", msg)

    def test_politica_password_minimo_caracteres(self):
        """Rechaza contraseñas con menos de 6 caracteres."""
        valida, msg = validar_politica_password("Ab1!")
        self.assertFalse(valida)
        self.assertIn("6 caracteres", msg)

    def test_politica_password_sin_numero(self):
        """Rechaza contraseñas sin dígitos."""
        valida, msg = validar_politica_password("PasswordSinNum!")
        self.assertFalse(valida)
        self.assertIn("número", msg)

    def test_politica_password_sin_simbolo(self):
        """Rechaza contraseñas sin símbolos especiales."""
        valida, msg = validar_politica_password("Password12345")
        self.assertFalse(valida)
        self.assertIn("símbolo", msg)

    def test_hashing_sha256(self):
        """Verifica que el hashing SHA-256 sea determinista de 64 caracteres hex."""
        pwd = "Prueba123!"
        h1 = hashear_password(pwd)
        h2 = hashear_password(pwd)
        self.assertEqual(len(h1), 64)
        self.assertEqual(h1, h2)
        self.assertTrue(verificar_password(pwd, h1))
        self.assertFalse(verificar_password("OtraClave123!", h1))

    def test_creacion_y_validacion_jwt(self):
        """Verifica emisión y verificación de claims en JWT con identificador de usuario."""
        user_id = "test-uuid-1234"
        usuario = "analista_riesgos"
        token = crear_token_jwt(user_id, usuario)
        self.assertIsInstance(token, str)

        payload = verificar_token_jwt(token)
        self.assertEqual(payload["sub"], user_id)
        self.assertEqual(payload["usuario"], usuario)

    def test_endpoint_protegido_sin_token(self):
        """Verifica que /api/chat y /api/conversaciones rechacen accesos no autenticados (401)."""
        resp_chat = client.post("/api/chat", json={"query": "¿Requisitos PEP?"})
        self.assertEqual(resp_chat.status_code, 401)

        resp_conv = client.get("/api/conversaciones")
        self.assertEqual(resp_conv.status_code, 401)

    def test_registro_rechaza_password_invalida(self):
        """Verifica que el endpoint /api/auth/register aplique la validación de política de contraseñas."""
        resp = client.post("/api/auth/register", json={
            "usuario": "nuevo_analista",
            "nombre": "Analista Nuevo",
            "password": "simplepassword"  # Sin número ni símbolo
        })
        self.assertEqual(resp.status_code, 400)
        self.assertIn("número", resp.json()["detail"].lower())

    def test_compartir_requiere_autenticacion(self):
        """Verifica que /api/conversaciones/{id}/compartir requiera usuario autenticado (401)."""
        resp = client.post("/api/conversaciones/test-id-123/compartir")
        self.assertEqual(resp.status_code, 401)

    def test_endpoint_compartido_invalido_retorna_404(self):
        """Verifica que /api/compartido/{token} retorne 404 para tokens inexistentes sin requerir login."""
        resp = client.get("/api/compartido/token_inexistente_12345")
        self.assertEqual(resp.status_code, 404)
        self.assertIn("no es válido", resp.json()["detail"])

    def test_renombrar_requiere_autenticacion(self):
        """Verifica que /api/conversaciones/{id} con PATCH requiera usuario autenticado (401)."""
        resp = client.patch("/api/conversaciones/test-id-123", json={"titulo": "Nuevo Título"})
        self.assertEqual(resp.status_code, 401)


if __name__ == "__main__":
    unittest.main(verbosity=2)
