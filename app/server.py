#!/usr/bin/env python3
"""
GridPoint — Location Format Explorer
Static file server with What3Words proxy support
"""
import os
import json
import logging
import mimetypes
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler

W3W_API_KEY = os.environ.get('W3W_API_KEY', '')
STATIC_DIR = Path(__file__).parent / 'static'
PORT = int(os.environ.get('PORT', 8080))

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('gridpoint')


class GridPointHandler(BaseHTTPRequestHandler):

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # API routes
        if path == '/api/w3w':
            self.handle_w3w(parsed)
            return

        if path == '/health':
            self.send_json(200, {'status': 'ok', 'w3w_configured': bool(W3W_API_KEY)})
            return

        # Static files — map / to index.html
        if path in ('/', ''):
            path = '/index.html'

        # Resolve against static dir, prevent path traversal
        try:
            rel = path.lstrip('/')
            file_path = (STATIC_DIR / rel).resolve()
            file_path.relative_to(STATIC_DIR.resolve())
        except (ValueError, Exception):
            self.send_error_response(403, 'Forbidden')
            return

        if not file_path.exists() or not file_path.is_file():
            self.send_error_response(404, f'Not found: {path}')
            return

        mime, _ = mimetypes.guess_type(str(file_path))
        if not mime:
            mime = 'application/octet-stream'

        data = file_path.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(data)

    def handle_w3w(self, parsed):
        if not W3W_API_KEY:
            self.send_json(400, {
                'error': 'What3Words API key not configured. '
                         'Set W3W_API_KEY in docker-compose.yml and rebuild.'
            })
            return

        params = urllib.parse.parse_qs(parsed.query)
        words = params.get('words', [''])[0]
        if not words:
            self.send_json(400, {'error': 'Missing words parameter'})
            return

        clean = words.lstrip('/').strip()
        url = (f'https://api.what3words.com/v3/convert-to-coordinates'
               f'?words={urllib.parse.quote(clean)}&key={W3W_API_KEY}')
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'GridPoint/1.0'})
            with urllib.request.urlopen(req, timeout=10) as r:
                data = json.loads(r.read())
            if 'coordinates' in data:
                self.send_json(200, {
                    'lat': data['coordinates']['lat'],
                    'lon': data['coordinates']['lng'],
                    'words': data.get('words', clean),
                    'nearestPlace': data.get('nearestPlace', ''),
                })
            else:
                msg = data.get('error', {}).get('message', 'W3W lookup failed')
                self.send_json(400, {'error': msg})
        except urllib.error.HTTPError as e:
            self.send_json(e.code, {'error': f'W3W API error: {e.reason}'})
        except Exception as e:
            self.send_json(500, {'error': str(e)})

    def send_json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def send_error_response(self, code, message):
        body = message.encode()
        self.send_response(code)
        self.send_header('Content-Type', 'text/plain')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        log.info(f'{self.address_string()} - {fmt % args}')


if __name__ == '__main__':
    log.info(f'GridPoint starting on port {PORT}')
    log.info(f'Serving files from: {STATIC_DIR}')
    log.info(f'What3Words: {"configured" if W3W_API_KEY else "not configured (optional)"}')

    if not STATIC_DIR.exists():
        log.error(f'Static directory not found: {STATIC_DIR}')
        raise SystemExit(1)

    log.info(f'Static files: {[f.name for f in STATIC_DIR.rglob("*") if f.is_file()]}')

    server = HTTPServer(('0.0.0.0', PORT), GridPointHandler)
    log.info(f'Ready at http://0.0.0.0:{PORT}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info('Shutting down')
