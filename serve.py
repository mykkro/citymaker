"""Serves the CityMaker web app (the static/ folder) on http://127.0.0.1:8000.

    python serve.py [port]

It is Python's built-in http.server with two tweaks: JavaScript is always sent as
text/javascript (on Windows the registry can map .js to text/plain, which browsers
refuse for modules), and nothing is cached, so edits show up on reload.
Any static file server works too, e.g. `python -m http.server -d static`.
"""

import functools
import http.server
import sys
from pathlib import Path

ROOT = Path(__file__).parent / "static"


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".svg": "image/svg+xml",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = functools.partial(Handler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        print(f"CityMaker on http://127.0.0.1:{port}  (Ctrl+C to stop)")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
