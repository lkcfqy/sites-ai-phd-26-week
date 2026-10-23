#!/usr/bin/env python3
"""Check local vLLM artifact structure only; cannot authenticate hardware, authorship or quality."""
import argparse,json,math
from pathlib import Path

def inspect(data,expected):
 if not isinstance(data,dict):raise ValueError('result must be a JSON object')
 completed=data.get('completed');duration=data.get('duration')
 if type(completed) is not int or not 0<=completed<=expected:raise ValueError('completed missing/invalid or exceeds planned requests')
 if type(duration) not in (int,float) or not math.isfinite(duration) or duration<=0:raise ValueError('duration missing/invalid')
 keys=('total_input_tokens','total_output_tokens','request_throughput','output_throughput','mean_ttft_ms','median_ttft_ms','mean_tpot_ms')
 metrics={}
 for key in keys:
  if key in data:
   v=data[key]
   if type(v) not in (int,float) or not math.isfinite(v) or v<0:raise ValueError('invalid metric '+key)
   metrics[key]=v
 detailed={}
 for key in ('ttfts','tpots','errors'):
  if key in data:
   if not isinstance(data[key],list):raise ValueError(key+' must be a list')
   detailed[key]=len(data[key])
 return {'schema':'llm-artifact-check-v1','verification':'artifact-consistency-only','expected_requests':expected,'completed':completed,'incomplete':expected-completed,'duration_s':duration,'metrics':metrics,'detail_lengths':detailed,'not_verified':['hardware identity','independent authorship','model quality','actual workload token distribution','server memory','measurement boundary correctness'],'warning':'A structurally valid file is NOT a passed performance or job-skill assessment.'}
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('result');p.add_argument('--expected-requests',type=int,required=True);p.add_argument('--output',required=True);a=p.parse_args()
 src=Path(a.result);out=Path(a.output)
 if not 16<=a.expected_requests<=128:p.error('expected requests must be 16..128')
 if not src.is_file() or src.stat().st_size>8*1024*1024:p.error('result missing or larger than 8 MiB')
 if out.exists():p.error('output exists; refusing overwrite')
 try:r=inspect(json.loads(src.read_text()),a.expected_requests)
 except (ValueError,TypeError,UnicodeError) as e:p.exit(2,'artifact check failed: '+str(e)+'\n')
 with out.open('x') as f:json.dump(r,f,ensure_ascii=False,indent=2)
 print('Structure checked only; no competency or measurement authenticity certified.')
if __name__=='__main__':main()
