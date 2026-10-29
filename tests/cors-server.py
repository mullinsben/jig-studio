# serves /tmp/foreign on 8777 WITH CORS headers, the way a real CDN does; python -m http.server on 8777 is the no-CORS case
import http.server, sys, os
os.chdir(sys.argv[1] if len(sys.argv) > 1 else '/tmp/foreign')
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*'); super().end_headers()
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('', 8777), H).serve_forever()
