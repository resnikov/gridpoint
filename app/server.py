#!/usr/bin/env python3
"""
GridPoint — Location Format Explorer
Static file server. No outbound API calls, no credentials.
"""
import os
import json
import logging
import mimetypes
import urllib.parse
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

STATIC_DIR = Path(__file__).parent / 'static'
PORT = int(os.environ.get('PORT', 8080))

# Content Security Policy.
# script-src needs no 'unsafe-inline' — every script is an external file.
# style-src does, because Leaflet sets inline styles at runtime and index.html
# uses a handful of style="" attributes.
CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self' https://unpkg.com",
    "style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: "
    "https://server.arcgisonline.com "
    "https://*.tile.opentopomap.org "
    "https://tile.openstreetmap.org "
    "https://unpkg.com",
    "connect-src 'self' https://nominatim.openstreetmap.org https://api.postcodes.io",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
])

SECURITY_HEADERS = {
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    # Geolocation is used by the "locate me" button, so allow it same-origin only.
    'Permissions-Policy': 'geolocation=(self), camera=(), microphone=(), payment=()',
}


logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('gridpoint')


class GridPointHandler(BaseHTTPRequestHandler):

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path

        if path == '/health':
            self.send_json(200, {'status': 'ok'})
            return

        # Static files — map / to index.html
        if path in ('/', ''):
            path = '/index.html'

        # Resolve against static dir, prevent path traversal
        try:
            rel = path.lstrip('/')
            file_path = (STATIC_DIR / rel).resolve()
            file_path.relative_to(STATIC_DIR.resolve())
        except ValueError:
            # relative_to() failed: the path escapes the static root.
            self.send_error_response(403, 'Forbidden')
            return
        except OSError:
            # Unresolvable path (too long, bad encoding) — a bad request,
            # not an access-control decision.
            self.send_error_response(400, 'Bad request')
            return

        if not file_path.exists() or not file_path.is_file():
            self.send_error_response(404, 'Not found')
            return

        mime, _ = mimetypes.guess_type(str(file_path))
        if not mime:
            mime = 'application/octet-stream'

        data = file_path.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-cache')
        self.send_security_headers()
        self.end_headers()
        self.wfile.write(data)

    def send_security_headers(self):
        for name, value in SECURITY_HEADERS.items():
            self.send_header(name, value)

    def send_json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_security_headers()
        self.end_headers()
        self.wfile.write(body)

    def send_error_response(self, code, message):
        body = message.encode()
        self.send_response(code)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_security_headers()
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        log.info(f'{self.address_string()} - {fmt % args}')


if __name__ == '__main__':
    log.info(f'GridPoint starting on port {PORT}')
    log.info(f'Serving files from: {STATIC_DIR}')

    if not STATIC_DIR.exists():
        log.error(f'Static directory not found: {STATIC_DIR}')
        raise SystemExit(1)

    log.info(f'Static files: {[f.name for f in STATIC_DIR.rglob("*") if f.is_file()]}')

    server = ThreadingHTTPServer(('0.0.0.0', PORT), GridPointHandler)
    log.info(f'Ready at http://0.0.0.0:{PORT}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info('Shutting down')
