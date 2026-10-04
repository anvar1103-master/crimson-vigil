"""Локальный dev-сервер для игры.

Запуск:  python tools/serve.py   (затем открыть http://localhost:8080)

Почему не просто `python -m http.server`: на Windows MIME-тип .js иногда
берётся из реестра как text/plain, и браузер отказывается грузить ES-модули.
Здесь типы заданы явно, а кэш отключён, чтобы после правки кода
браузер всегда получал свежие файлы.
"""
import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".html": "text/html",
        ".css": "text/css",
        ".png": "image/png",
        ".wasm": "application/wasm",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # не засоряем консоль логом каждого запроса


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    with Server(("127.0.0.1", PORT), Handler) as httpd:
        print(f"Serving {ROOT} at http://localhost:{PORT}")
        httpd.serve_forever()
