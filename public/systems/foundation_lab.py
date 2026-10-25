#!/usr/bin/env python3
"""Eleven small reference bridges. Standard library, CPU only, no network/install.
The output is a teaching record, not learner assessment or GPU execution evidence.
"""
import argparse,hashlib,json,math,platform,statistics,time
from pathlib import Path

def mean(values):
    if not values:raise ValueError('empty input')
    return sum(values)/len(values)

def attention(scores,values,allowed):
    active=[score for score,keep in zip(scores,allowed) if keep]
    if not active:raise ValueError('no allowed keys')
    peak=max(active);weights=[math.exp(score-peak) if keep else 0 for score,keep in zip(scores,allowed)]
    total=sum(weights);weights=[value/total for value in weights]
    return weights,sum(weight*value for weight,value in zip(weights,values))

def mapping(n,block):
    return [{'block':b,'thread':t,'index':b*block+t,'active':b*block+t<n} for b in range((n+block-1)//block) for t in range(block)]

def run(stage):
    if stage=='s0':
        rows=[8,15,22];assert mean(rows)==15
        try:mean([])
        except ValueError:empty='rejected'
        else:raise AssertionError('empty input must fail')
        return {'input_ms':rows,'sum_ms':sum(rows),'mean_ms':mean(rows),'empty':empty,'evidence':'deterministic computation'}
    if stage=='s1':
        rows=[{'ms':0,'ok':True},{'ms':20,'ok':False},{'ms':100,'ok':True}]
        good=[row['ms'] for row in rows if row['ok']];assert good==[0,100]
        return {'rows':rows,'successful':len(good),'errors':len(rows)-len(good),'mean_success_ms':mean(good),'evidence':'synthetic logs; no service run'}
    if stage=='s2':
        w=.4;x=3;target=2;loss=lambda weight:(weight*x-target)**2;derivative=2*(w*x-target)*x;h=1e-4
        numerical=(loss(w+h)-loss(w-h))/(2*h);assert abs(derivative-numerical)<1e-6
        return {'weight':w,'x':x,'target':target,'analytic':derivative,'finite_difference':numerical,'loss_before':loss(w),'loss_after':loss(w-.05*derivative),'evidence':'numerical check, not model training'}
    if stage=='s3':
        full=attention([1000,1000],[2,6],[True,True]);causal=attention([1000,1000],[2,6],[True,False]);assert full==([.5,.5],4) and causal==([1.,0.],2)
        return {'scores':[1000,1000],'values':[2,6],'full':full,'causal':causal,'evidence':'two-token reference calculation, not LLM inference'}
    if stage=='s4':
        rows,cols,element_bytes=2,3,4
        addresses=[[((r*cols)+c)*element_bytes for c in range(cols)] for r in range(rows)];assert addresses==[[0,4,8],[12,16,20]]
        return {'shape':[rows,cols],'row_major_byte_offsets':addresses,'next':'compile foundation_raii.cpp and foundation_threads.cpp for actual C++ execution','evidence':'address model only'}
    if stage=='s5':
        values=list(range(4096));expected=4095*4096//2
        def work():assert sum(values)==expected
        start=time.perf_counter_ns();work();cold=(time.perf_counter_ns()-start)/1e6
        for _ in range(5):work()
        raw=[]
        for _ in range(15):
            start=time.perf_counter_ns();work();raw.append((time.perf_counter_ns()-start)/1e6)
        return {'cold_call_ms':cold,'warmup':5,'raw_ms':raw,'median_ms':statistics.median(raw),'p95_nearest_rank_ms':sorted(raw)[math.ceil(.95*len(raw))-1],'checksum':expected,'evidence':'actual CPU timing; input allocation excluded, process startup excluded'}
    if stage=='s6':
        rows=mapping(10,4);active=[r['index'] for r in rows if r['active']];assert active==list(range(10))
        return {'n':10,'block':4,'mapping':rows,'tail_threads':2,'evidence':'CPU index simulation; no CUDA compilation or GPU measurement'}
    if stage=='s7':
        arrival=0;tokens=[100,140,180,260];intervals=[b-a for a,b in zip(tokens,tokens[1:])];tpot=(tokens[-1]-tokens[0])/(len(tokens)-1)
        assert intervals==[40,40,80]
        return {'arrival_ms':arrival,'token_ms':tokens,'ttft_ms':tokens[0]-arrival,'itl_ms':intervals,'tpot_ms':tpot,'single_token_tpot':None,'evidence':'synthetic token timestamps; not vLLM run'}
    if stage=='s8':
        spec={'features':8,'batch_min':1,'batch_max':64,'dtype':'float64'};blob=json.dumps(spec,sort_keys=True).encode()
        return {'interface':spec,'manifest_sha256':hashlib.sha256(blob).hexdigest(),'invalid_cases':['empty batch','wrong feature count','NaN','wrong media type'],'next':'model_project/engineering.py executes the actual framework and HTTP path','evidence':'interface contract; hash identifies content, not trust'}
    if stage=='s9':
        flops=1e9;bytes_moved=1e8;bandwidth=20e9;peak=100e9;intensity=flops/bytes_moved;bound=min(peak,bandwidth*intensity);seconds=flops/bound
        assert intensity==10 and abs(seconds-.01)<1e-12
        return {'flops':flops,'bytes':bytes_moved,'intensity_flops_per_byte':intensity,'bound_flops_per_s':bound,'ideal_lower_bound_s':seconds,'pim_example_ms':{'baseline':2+8,'candidate':3+1+7},'evidence':'analytical bound, uncalibrated; not hardware measurement'}
    required=['command','environment','input','raw_result','quality','limitations','retry']
    provided={'command','environment','input','raw_result'};missing=[key for key in required if key not in provided];assert missing==['quality','limitations','retry']
    return {'provided':sorted(provided),'missing':missing,'decision':'collect evidence before review','evidence':'handoff completeness exercise, no automatic competence scoring'}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('stage',choices=['s'+str(i) for i in range(11)]);p.add_argument('--output',required=True);a=p.parse_args()
    output=Path(a.output)
    if output.exists():p.error('refusing overwrite; choose a new result filename')
    result={'schema':'mlsys-foundation-reference-v1','stage':a.stage,'source_kind':'reference','python':platform.python_version(),'platform':platform.platform(),'result':run(a.stage)}
    with output.open('x') as file:json.dump(result,file,ensure_ascii=False,indent=2,allow_nan=False)
    print(json.dumps(result,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
