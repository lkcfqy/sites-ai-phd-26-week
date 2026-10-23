#!/usr/bin/env python3
"""Bounded loopback-only closed-loop load test, not an open-loop production traffic simulator."""
import argparse,json,time,concurrent.futures,urllib.request
from pathlib import Path
from core import dataset,summarize

def main():
 p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8765);p.add_argument('--requests',type=int,default=60);p.add_argument('--concurrency',type=int,default=1);p.add_argument('--batch',type=int,default=8);p.add_argument('--output',default='service.json');a=p.parse_args()
 if not 1024<=a.port<=65535 or not 20<=a.requests<=300 or not 1<=a.concurrency<=4 or not 1<=a.batch<=64:p.error('port 1024..65535, requests20..300, concurrency1..4, batch1..64')
 if Path(a.output).exists():p.error('refusing overwrite')
 xs,_=dataset(a.batch,99);payload=json.dumps({'inputs':xs}).encode()
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({})) # fixed loopback; do not use environment proxy
 def one(i):
  start=time.perf_counter_ns()
  try:
   req=urllib.request.Request(f'http://127.0.0.1:{a.port}/predict',payload,{'Content-Type':'application/json'})
   with opener.open(req,timeout=5) as response:body=json.load(response)
   assert len(body['logits'])==a.batch
   return {'id':i,'ok':True,'e2e_ms':(time.perf_counter_ns()-start)/1e6,'compute_ms':body['compute_ms']}
  except Exception as error:return {'id':i,'ok':False,'e2e_ms':(time.perf_counter_ns()-start)/1e6,'error':type(error).__name__}
 for i in range(5):one(-i-1)
 start=time.perf_counter()
 with concurrent.futures.ThreadPoolExecutor(a.concurrency) as pool:rows=list(pool.map(one,range(a.requests)))
 elapsed=time.perf_counter()-start;ok=[r for r in rows if r['ok']]
 report={'schema':'model-service-v1','provenance':'actual-loopback-HTTP-measurement','load_model':'closed-loop bounded thread pool; no promised arrival rate','concurrency':a.concurrency,'batch':a.batch,'warmup_requests':5,'requests':rows,'errors':len(rows)-len(ok),'elapsed_s':elapsed,'successful_requests_per_s':len(ok)/elapsed,'latency':summarize([r['e2e_ms'] for r in ok]) if ok else None,'limits':'HTTPServer is deliberately serial. Client threads may queue; CPU timer does not isolate server queue from network/serialization. Loopback is not production networking.'}
 Path(a.output).write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k not in ('requests','latency')},indent=2))
if __name__=='__main__':main()
