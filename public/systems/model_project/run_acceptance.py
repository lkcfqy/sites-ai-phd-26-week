#!/usr/bin/env python3
"""Bounded local integration acceptance; evidence saved in a fresh directory."""
import argparse,json,subprocess,sys,time,urllib.request,urllib.error
from pathlib import Path

def main():
 p=argparse.ArgumentParser();p.add_argument('--out',required=True);a=p.parse_args();dest=Path(a.out).resolve();dest.mkdir(exist_ok=False);here=Path(__file__).resolve().parent
 def run(*args):return subprocess.run([sys.executable,*args],cwd=here,check=True,capture_output=True,text=True,timeout=30)
 unit=run('test_project.py');(dest/'tests.txt').write_text(unit.stdout+unit.stderr);run('experiment.py','--repeats','30','--output',str(dest/'baseline.json'))
 server=subprocess.Popen([sys.executable,'server.py','--port','18765'],cwd=here,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 try:
  opener=urllib.request.build_opener(urllib.request.ProxyHandler({}));url='http://127.0.0.1:18765/predict'
  for _ in range(50):
   try:
    req=urllib.request.Request(url,json.dumps({'inputs':[[0]*8]}).encode(),{'Content-Type':'application/json'});opener.open(req,timeout=1).close();break
   except (OSError,urllib.error.URLError):
    if server.poll() is not None:raise RuntimeError('server exited')
    time.sleep(.1)
  else:raise RuntimeError('server not ready')
  for c in (1,4):
   run('load.py','--port','18765','--concurrency',str(c),'--requests','30','--output',str(dest/f'service-c{c}.json'))
   report=json.loads((dest/f'service-c{c}.json').read_text());assert report['errors']==0;assert len(report['requests'])==30;assert report['latency']['n']==30
  req=urllib.request.Request(url,b'{"inputs":[[1]]}',{'Content-Type':'application/json'})
  try:opener.open(req,timeout=2);raise AssertionError('bad shape accepted')
  except urllib.error.HTTPError as e:assert e.code==400
 finally:
  server.terminate()
  try:server.wait(timeout=3)
  except subprocess.TimeoutExpired:server.kill();server.wait()
 optional=subprocess.run([sys.executable,'torch_optional.py','--output',str(dest/'torch.json')],cwd=here,capture_output=True,text=True,timeout=30)
 report={'reference_tests':'passed; learner TODO test explicitly skipped','inference':'real CPU float/integer measured','HTTP':'real loopback c1/c4; malformed shape rejected400','torch_status':'measured' if optional.returncode==0 else 'not-run-or-unavailable','torch_exit':optional.returncode,'torch_message':optional.stderr,'limits':'Authoring-machine reference measurements, not learner competency or universal speed claims.'}
 (dest/'acceptance.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
if __name__=='__main__':main()
