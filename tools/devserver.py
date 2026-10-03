"""Static dev server that disables caching, so edited ES modules always reload.

Usage: python tools/devserver.py [port]   (serves the repo root)
"""
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def do_POST(self):
        """Dev only: POST /__shot?name=x with a PNG body saves .local/shots/x.png (local
        screenshots of the game canvas, e.g. from tools/gallery.html)."""
        if not self.path.startswith("/__shot"):
            self.send_error(404)
            return
        from urllib.parse import urlparse, parse_qs
        name = parse_qs(urlparse(self.path).query).get("name", ["shot"])[0]
        name = "".join(ch for ch in name if ch.isalnum() or ch in "-_")[:60] or "shot"
        data = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        os.makedirs(os.path.join(".local", "shots"), exist_ok=True)
        with open(os.path.join(".local", "shots", name + ".png"), "wb") as f:
            f.write(data)
        self.send_response(204)
        self.end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    with http.server.ThreadingHTTPServer(("", port), NoCacheHandler) as httpd:
        print(f"Serving on http://localhost:{port}")
        httpd.serve_forever()
