#!/usr/bin/env python3
"""LOCAL ONLY: fixed localhost, bounded JSON inference; no shell, eval, files, credentials or remote models."""
import argparse,json,time,math,platform,resource
from pathlib import Path
from http.server import BaseHTTPRequestHandler,HTTPServer
from core import train,quantize,predict,predict_quantized,validate

def main():
 p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8765);p.add_argument('--mode',choices=['float','int8'],default='float');p.add_argument('--backend',choices=['python','torch-export'],default='python');p.add_argument('--model-file');p.add_argument('--export-file');a=p.parse_args()
 if not 1024<=a.port<=65535:p.error('unprivileged port required')
 model=json.loads(Path(a.model_file).read_text()) if a.model_file else train()
 if not isinstance(model,dict) or len(model.get('weights',[]))!=8 or any(type(v) not in (int,float) or not math.isfinite(v) for v in model['weights']) or type(model.get('bias')) not in (int,float) or not math.isfinite(model['bias']):p.error('invalid local model file')
 q=quantize(model)
 if a.backend=='torch-export':
  if not a.export_file or a.mode!='float':p.error('torch-export requires a trusted local --export-file and float mode')
  import torch
  torch.set_num_threads(1);torch.set_num_interop_threads(1)
  runtime=torch.export.load(a.export_file).module()
 def infer(xs):
  validate(xs)
  if a.backend=='python':return predict(model,xs) if a.mode=='float' else predict_quantized(q,xs)
  with torch.inference_mode():return runtime(torch.tensor(xs,dtype=torch.float64,device='cpu')).tolist()
 def peak_rss_bytes():
  value=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
  return int(value if platform.system()=='Darwin' else value*1024)
 class Handler(BaseHTTPRequestHandler):
  def log_message(self,*args):pass # Do not log request bodies.
  def do_GET(self):
   if self.path!='/health':self.send_error(404);return
   payload=json.dumps({'status':'ready','backend':a.backend}).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)
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
    out=infer(xs)
    payload=json.dumps({'logits':out,'compute_ms':(time.perf_counter_ns()-start)/1e6,'mode':a.mode,'backend':a.backend,'server_peak_rss_bytes':peak_rss_bytes()}).encode()
   except (ValueError,KeyError,TypeError,TimeoutError):self.send_error(400);return
   self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)
 print(f'Local teaching server: http://127.0.0.1:{a.port}/predict mode={a.mode}; Ctrl-C stops. Never expose to LAN/Internet.',flush=True)
 server=HTTPServer(('127.0.0.1',a.port),Handler)
 try:server.serve_forever()
 except KeyboardInterrupt:pass
 finally:server.server_close()
if __name__=='__main__':main()
