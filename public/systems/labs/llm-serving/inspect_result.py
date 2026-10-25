#!/usr/bin/env python3
"""Recompute detailed vLLM request statistics; never authenticate hardware or competence.

Requires all planned requests including failures and raw per-request latencies.
Older exports lacking latencies are unsupported, not silently accepted.
"""
import argparse
import json
import math
import statistics
from pathlib import Path

def finite(value, path, minimum=0):
    if type(value) not in (int, float) or not math.isfinite(value) or value < minimum or value > 1e15:
        raise ValueError(path+': finite numeric value required')
    return value

def integer(value, path):
    if type(value) is not int or not 0 <= value <= 10000000: raise ValueError(path+': bounded integer required')
    return value

def close(actual, expected, path):
    if abs(finite(actual,path)-expected) > 1e-6*max(1,abs(expected)): raise ValueError(path+': inconsistent with raw records; expected '+str(expected))

def linear_percentile(values, probability):
    values=sorted(values or [0]); index=(len(values)-1)*probability; lower=math.floor(index)
    return values[lower]+(values[min(lower+1,len(values)-1)]-values[lower])*(index-lower)

def inspect(data, expected):
    if not isinstance(data,dict) or type(expected) is not int or not 16 <= expected <= 128: raise ValueError('object and planned count 16..128 required')
    duration=finite(data.get('duration'),'duration',1e-12)
    keys=('input_lens','output_lens','ttfts','itls','latencies','errors')
    for key in keys:
        if not isinstance(data.get(key),list) or len(data[key]) != expected: raise ValueError(key+': every planned request is required; use --save-detailed and a version exporting latencies')
    records=[]; successes=[]; all_itls=[]
    for i in range(expected):
        tokens_in=integer(data['input_lens'][i],f'input_lens[{i}]');tokens_out=integer(data['output_lens'][i],f'output_lens[{i}]')
        ttft=finite(data['ttfts'][i],f'ttfts[{i}]');latency=finite(data['latencies'][i],f'latencies[{i}]')
        itls=data['itls'][i];error=data['errors'][i]
        if not isinstance(itls,list) or len(itls)>4096 or not isinstance(error,str) or len(error)>2000: raise ValueError('invalid itls/errors at request '+str(i))
        itls=[finite(value,f'itls[{i}]') for value in itls]
        if ttft>latency+1e-8 or latency>duration+1e-6 or sum(itls)>latency+1e-6: raise ValueError('inconsistent timing boundary at request '+str(i))
        ok=error==''
        if not ok and tokens_out!=0: raise ValueError('failed requests must retain zero output length from vLLM')
        row={'id':i,'ok':ok,'input_tokens':tokens_in,'output_tokens':tokens_out,'ttft_s':ttft,'latency_s':latency,'itl_s':itls,'error':error}
        records.append(row)
        if ok:successes.append(row);all_itls.extend(itls)
    completed=len(successes);total_input=sum(r['input_tokens'] for r in successes);total_output=sum(r['output_tokens'] for r in successes)
    metrics={'completed':completed,'failed':expected-completed,'total_input_tokens':total_input,'total_output_tokens':total_output,'request_throughput':completed/duration,'output_throughput':total_output/duration,'total_token_throughput':(total_input+total_output)/duration}
    groups={'ttft':[r['ttft_s'] for r in successes],'tpot':[(r['latency_s']-r['ttft_s'])/(r['output_tokens']-1) for r in successes if r['output_tokens']>1],'itl':all_itls,'e2el':[r['latency_s'] for r in successes]}
    for name, values in groups.items():
        values=values or [0]
        metrics.update({f'mean_{name}_ms':statistics.mean(values)*1000,f'median_{name}_ms':statistics.median(values)*1000,f'std_{name}_ms':statistics.pstdev(values)*1000,f'p95_{name}_ms':linear_percentile(values,.95)*1000,f'p99_{name}_ms':linear_percentile(values,.99)*1000})
    required=('completed','total_input_tokens','total_output_tokens','request_throughput','output_throughput','total_token_throughput','mean_ttft_ms','mean_tpot_ms')
    for key in required:
        if key not in data:raise ValueError('missing aggregate '+key)
    for key,value in metrics.items():
        if key in data:close(data[key],value,key)
    return {'schema':'mlsys-llm-v2','source':'submitted-vllm-detailed-artifact','expected_requests':expected,'duration_s':duration,'requests':records,'metrics':metrics,'percentile_method':'linear interpolation, as vLLM numpy.percentile default','not_verified':['hardware or execution authenticity','independent authorship','tokenizer correctness','model task quality','server memory','client queue boundary'],'limits':'All statistics are internal consistency only. A complete failed run is retained as failed evidence, never certified performance.'}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('result');p.add_argument('--expected-requests',type=int,required=True);p.add_argument('--output',required=True);a=p.parse_args()
    src=Path(a.result);out=Path(a.output)
    if not src.is_file() or src.stat().st_size>8*1024*1024:p.error('result missing or larger than 8 MiB')
    if out.exists():p.error('output exists; refusing overwrite')
    try:r=inspect(json.loads(src.read_text()),a.expected_requests)
    except (ValueError,TypeError,UnicodeError) as error:p.exit(2,'artifact check failed: '+str(error)+'\n')
    with out.open('x') as file:json.dump(r,file,ensure_ascii=False,indent=2,allow_nan=False)
    print('Recomputed raw request metrics only; no execution or competency certified.')

if __name__=='__main__':main()
