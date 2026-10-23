#!/usr/bin/env python3
"""Train baseline and measure actual CPU inference. No downloads, GPU, or paid APIs."""
import argparse,json,platform,time
from pathlib import Path
from core import dataset,train,quantize,predict,predict_quantized,accuracy,summarize

def main():
 p=argparse.ArgumentParser();p.add_argument('--output',default='baseline.json');p.add_argument('--batch',type=int,default=16);p.add_argument('--repeats',type=int,default=100);a=p.parse_args()
 if not 1<=a.batch<=64 or not 20<=a.repeats<=1000:p.error('batch 1..64, repeats 20..1000')
 if Path(a.output).exists():p.error('refusing overwrite: choose a new output')
 m=train();q=quantize(m);x,y=dataset(64,73);ref=predict(m,x);reduced=predict_quantized(q,x)
 batch,_=dataset(a.batch,91);results={}
 for name,fn,model in [('float_python',predict,m),('int8_python',predict_quantized,q)]:
  for _ in range(10):fn(model,batch)
  times=[]
  for _ in range(a.repeats):
   start=time.perf_counter_ns();fn(model,batch);times.append((time.perf_counter_ns()-start)/1e6)
  results[name]=summarize(times)
 report={'schema':'model-project-v1','provenance':'actual-local-CPU-measurement','data':'synthetic eight-feature binary classification; not LLM or production data','python':platform.python_version(),'platform':platform.platform(),'batch':a.batch,'warmup':10,'results':results,'quality':{'float_accuracy':accuracy(ref,y),'int8_accuracy':accuracy(reduced,y),'max_logit_difference':max(abs(a-b) for a,b in zip(ref,reduced))},'weights':m,'limits':'Python integer arithmetic is not optimized INT8 hardware. No speedup guaranteed. 64 synthetic holdout samples are not a production quality benchmark.'}
 Path(a.output).write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k not in ('results','weights')},indent=2))
if __name__=='__main__':main()
