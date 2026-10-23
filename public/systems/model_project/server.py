#!/usr/bin/env python3
"""LOCAL ONLY: fixed localhost, bounded JSON inference; no shell, eval, files, credentials or remote models."""
import argparse,json,time
from http.server import BaseHTTPRequestHandler,HTTPServer
from core import train,quantize,predict,predict_quantized

def main():
 p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8765);p.add_argument('--mode',choices=['float','int8'],default='float');a=p.parse_args()
 if not 1024<=a.port<=65535:p.error('unprivileged port required')
 model=train();q=quantize(model)
 class Handler(BaseHTTPRequestHandler):
  def log_message(self,*args):pass # Do not log request bodies.
  def do_POST(self):
   if self.path!='/predict':self.send_error(404);return
   length=self.headers.get('Content-Length','')
   if not length.isdigit() or not 1<=int(length)<=32768:self.send_error(413);return
   if self.headers.get('Content-Type','').split(';')[0]!='application/json':self.send_error(415);return
   origin=self.headers.get('Origin')
   if origin and origin!=f'http://127.0.0.1:{a.port}':self.send_error(403);return
   self.connection.settimeout(3)
   try:
    body=json.loads(self.rfile.read(int(length)));xs=body['inputs'];start=time.perf_counter_ns()
    out=predict(model,xs) if a.mode=='float' else predict_quantized(q,xs)
    payload=json.dumps({'logits':out,'compute_ms':(time.perf_counter_ns()-start)/1e6,'mode':a.mode}).encode()
   except (ValueError,KeyError,TypeError,TimeoutError):self.send_error(400);return
   self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)
 print(f'Local teaching server: http://127.0.0.1:{a.port}/predict mode={a.mode}; Ctrl-C stops. Never expose to LAN/Internet.',flush=True)
 server=HTTPServer(('127.0.0.1',a.port),Handler)
 try:server.serve_forever()
 except KeyboardInterrupt:pass
 finally:server.server_close()
if __name__=='__main__':main()
