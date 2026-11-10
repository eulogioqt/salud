import base64
import hashlib
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from salud import auth, mcp  # noqa: E402


class OAuthTest(unittest.TestCase):
    def setUp(self):
        self.base = tempfile.mkdtemp()
        auth.set_password(self.base, "ana", "contraseña-larga", "Ana")

    def test_flujo_completo(self):
        with self.assertRaises(auth.AuthError):
            auth.register_client(self.base, {"redirect_uris": ["http://evil.com/cb"]})
        c = auth.register_client(self.base, {"client_name": "Claude", "redirect_uris": ["https://claude.ai/api/mcp/auth_callback"]})
        cl = auth.get_client(self.base, c["client_id"])
        ver = "v" * 50
        ch = base64.urlsafe_b64encode(hashlib.sha256(ver.encode()).digest()).rstrip(b"=").decode()
        code = auth.new_code("ana", cl["client_id"], cl["redirect_uris"][0], ch)
        got = auth.take_code(code)
        self.assertTrue(auth.pkce_ok(ver, got["challenge"]))
        self.assertFalse(auth.pkce_ok("otro", got["challenge"]))
        self.assertIsNone(auth.take_code(code))  # un solo uso
        t = auth.issue_oauth(self.base, "ana", cl)
        self.assertEqual(auth.token_user(self.base, t["access_token"]), "ana")
        self.assertEqual(auth.list_tokens(self.base, "ana")[0]["kind"], "claude")
        t2 = auth.refresh_oauth(self.base, t["refresh_token"], cl["client_id"])
        self.assertIsNone(auth.token_user(self.base, t["access_token"]))
        self.assertEqual(auth.token_user(self.base, t2["access_token"]), "ana")
        self.assertIsNone(auth.refresh_oauth(self.base, t["refresh_token"], cl["client_id"]))
        auth.issue_oauth(self.base, "ana", cl)  # reconectar sustituye
        self.assertEqual(len(auth.list_tokens(self.base, "ana")), 1)

    def test_tipos(self):
        self.assertEqual(auth.kind_of("Claude Code (salud)"), "claude-code")
        self.assertEqual(auth.kind_of("ChatGPT"), "chatgpt")
        self.assertEqual(auth.kind_of("MCP Inspector"), "otro")


class McpTest(unittest.TestCase):
    def run_cli(self, argv):
        self.last = argv
        return 0, "ok", ""

    def test_protocolo(self):
        r = mcp.handle({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}}, self.run_cli)
        self.assertEqual(r["result"]["protocolVersion"], "2025-06-18")
        self.assertIn("leer_contexto", r["result"]["instructions"])
        self.assertIsNone(mcp.handle({"jsonrpc": "2.0", "method": "notifications/initialized"}, self.run_cli))
        names = [t["name"] for t in mcp.handle({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}, self.run_cli)["result"]["tools"]]
        self.assertIn("anadir_alimento", names)

    def test_argumentos(self):
        call = lambda n, a: mcp.handle({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": n, "arguments": a}}, self.run_cli)  # noqa: E731
        call("anadir_alimento", {"alimento": "12", "cantidad": 60, "unidad": "g", "comida": "desayuno", "hora": "08:30"})
        self.assertEqual(self.last, ["add", "12", "60", "g", "-c", "desayuno", "--hora", "08:30"])
        call("comida_habitual", {"nombre": "batido", "comida": "desayuno", "cambios": [{"item_id": 4, "cantidad": 50}], "omitir": [5]})
        self.assertEqual(self.last, ["habitual", "batido", "-c", "desayuno", "--set", "4=50", "--skip", "5"])
        call("registrar_pasos", {"pasos": 0})
        self.assertEqual(self.last, ["pasos", "0"])
        r = call("guia_ilustraciones", {})
        self.assertIn("viewBox", r["result"]["content"][0]["text"])
        self.assertIn("error", call("no_existe", {}))


if __name__ == "__main__":
    unittest.main()
