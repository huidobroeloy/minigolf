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


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    with http.server.ThreadingHTTPServer(("", port), NoCacheHandler) as httpd:
        print(f"Serving on http://localhost:{port}")
        httpd.serve_forever()
