#!/usr/bin/env python3
"""OPTIONAL / not executed in authoring environment (torch absent). CPU only, synthetic data.
Requires separately reviewed PyTorch installation; no installation or downloads performed here.
"""
import argparse,json,time,platform
from pathlib import Path

def main():
 p=argparse.ArgumentParser();p.add_argument('--output',default='torch-result.json');a=p.parse_args()
 if Path(a.output).exists():p.error('refusing overwrite')
 try:import torch
 except ImportError:p.exit(2,'PyTorch is not installed. Standard-library track remains fully runnable. Read README before choosing installation.\n')
 torch.manual_seed(41);torch.set_num_threads(1);device=torch.device('cpu')
 x=torch.randn(256,8,device=device);y=(1.7*x[:,0]-1.2*x[:,1]+.8*x[:,2]>.0).float().view(-1,1)
 model=torch.nn.Sequential(torch.nn.Linear(8,16),torch.nn.ReLU(),torch.nn.Linear(16,1)).to(device)
 opt=torch.optim.SGD(model.parameters(),lr=.1)
 for _ in range(150):
  opt.zero_grad();loss=torch.nn.functional.binary_cross_entropy_with_logits(model(x),y);loss.backward();opt.step()
 model.eval();engines=torch.backends.quantized.supported_engines
 engine=next((e for e in ['x86','fbgemm','qnnpack'] if e in engines),None)
 if not engine:p.exit(2,'No supported CPU quantization engine in this build; do not silently report quantized results.\n')
 torch.backends.quantized.engine=engine
 try:q=torch.ao.quantization.quantize_dynamic(model,{torch.nn.Linear},dtype=torch.qint8)
 except (AttributeError,RuntimeError) as e:p.exit(2,f'Legacy dynamic quantization unavailable: {type(e).__name__}. See version/deprecation note.\n')
 test=torch.randn(64,8);target=(1.7*test[:,0]-1.2*test[:,1]+.8*test[:,2]>.0).view(-1,1)
 results={}
 with torch.inference_mode():
  for name,m in [('float32',model),('dynamic_int8',q)]:
   for _ in range(10):m(test)
   times=[]
   for _ in range(100):
    start=time.perf_counter_ns();out=m(test);times.append((time.perf_counter_ns()-start)/1e6)
   results[name]={'raw_latency_ms':times,'p95_ms':sorted(times)[94],'accuracy':float(((out>=0)==target).float().mean())}
  difference=float((model(test)-q(test)).abs().max())
 report={'schema':'torch-cpu-project-v1','provenance':'actual-local-CPU-measurement','torch_version':torch.__version__,'python':platform.python_version(),'quantization_engine':engine,'threads':1,'data':'synthetic; not LLM/production','results':results,'max_logit_difference':difference,'limits':'Small CPU MLP. Quantization speedup not guaranteed; installation/platform backend availability varies.'}
 Path(a.output).write_text(json.dumps(report,indent=2));print('Saved',a.output)
if __name__=='__main__':main()
