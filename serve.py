#!/usr/bin/env python3
"""Dev server with no-cache headers for ES module hot-reload."""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    server = ThreadingHTTPServer(('0.0.0.0', port), NoCacheHandler)
    print(f'Serving (no-cache) on port {port}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()
