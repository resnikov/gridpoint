#!/usr/bin/env python3
"""
GridPoint — Location Format Explorer
Static file server with What3Words proxy support
"""
import os
import json
import time
import logging
import mimetypes
import threading
import urllib.parse
import urllib.request
import urllib.error
from collections import deque, defaultdict
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

W3W_API_KEY = os.environ.get('W3W_API_KEY', '')
STATIC_DIR = Path(__file__).parent / 'static'
PORT = int(os.environ.get('PORT', 8080))

# Comma-separated list of origins permitted to call /api/w3w cross-origin.
# Empty (the default) means same-origin only — no CORS header is sent.
ALLOWED_ORIGINS = {
    o.strip() for o in os.environ.get('ALLOWED_ORIGINS', '').split(',') if o.strip()
}

# Rate limit for the W3W proxy: it spends *our* API key, so cap per client IP.
RATE_LIMIT_REQUESTS = int(os.environ.get('RATE_LIMIT_REQUESTS', 30))
RATE_LIMIT_WINDOW = int(os.environ.get('RATE_LIMIT_WINDOW', 60))  # seconds

_rate_hits = defaultdict(deque)
_rate_lock = threading.Lock()

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
    "https://*.basemaps.cartocdn.com "
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


def rate_limit_ok(client_ip):
    """Sliding-window limiter. Returns (allowed, seconds_until_retry)."""
    now = time.monotonic()
    cutoff = now - RATE_LIMIT_WINDOW
    with _rate_lock:
        hits = _rate_hits[client_ip]
        while hits and hits[0] < cutoff:
            hits.popleft()
        if len(hits) >= RATE_LIMIT_REQUESTS:
            return False, int(hits[0] + RATE_LIMIT_WINDOW - now) + 1
        hits.append(now)
        # Opportunistic cleanup so idle IPs don't accumulate forever
        if len(_rate_hits) > 10000:
            for ip in [k for k, v in _rate_hits.items() if not v or v[-1] < cutoff]:
                del _rate_hits[ip]
        return True, 0

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

    def handle_w3w(self, parsed):
        allowed, retry_after = rate_limit_ok(self.client_address[0])
        if not allowed:
            log.warning(f'Rate limit hit for {self.client_address[0]} on /api/w3w')
            self.send_json(
                429,
                {'error': 'Too many requests. Please wait and try again.'},
                extra_headers={'Retry-After': str(retry_after)},
            )
            return

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

    def send_security_headers(self):
        for name, value in SECURITY_HEADERS.items():
            self.send_header(name, value)

    def send_json(self, code, obj, extra_headers=None):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_security_headers()

        # Only echo an origin we've been explicitly configured to trust.
        # Without ALLOWED_ORIGINS set, the API is same-origin only.
        origin = self.headers.get('Origin')
        if origin and origin in ALLOWED_ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')

        for name, value in (extra_headers or {}).items():
            self.send_header(name, value)
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
    log.info(f'What3Words: {"configured" if W3W_API_KEY else "not configured (optional)"}')
    log.info(f'CORS allowlist: {sorted(ALLOWED_ORIGINS) or "same-origin only"}')
    log.info(f'W3W rate limit: {RATE_LIMIT_REQUESTS} req / {RATE_LIMIT_WINDOW}s per IP')

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
