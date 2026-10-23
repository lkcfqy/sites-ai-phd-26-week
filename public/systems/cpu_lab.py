#!/usr/bin/env python3
"""Local, CPU-only beginner lab. Standard library only. No network/files modified
except the explicitly requested output JSON. python3 cpu_lab.py --help"""
import argparse, json, math, platform, random, statistics, time
from pathlib import Path

def percentile(values, p):
    ordered = sorted(values)
    return ordered[max(0, math.ceil(p * len(ordered)) - 1)]

def mm(a, b):
    # TODO experiment: transpose b once, then compute row dot products.
    return [[sum(a[i][k] * b[k][j] for k in range(len(b)))
             for j in range(len(b[0]))] for i in range(len(a))]

def main():
    if not __debug__:
        raise SystemExit('Do not use python -O: tests must remain enabled.')
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--size',type=int,default=24)
    parser.add_argument('--repeats',type=int,default=15)
    parser.add_argument('--output',default='systems-evidence.json')
    args=parser.parse_args()
    if not 2<=args.size<=96 or not 5<=args.repeats<=100:
        parser.error('size 2..96, repeats 5..100: bounded CPU lab')
    random.seed(41)
    # Unit tests must remain unchanged when you optimize mm.
    assert mm([[1,2],[3,4]],[[5,6],[7,8]])==[[19,22],[43,50]]
    assert mm([[2,3]],[[4],[5]])==[[23]]
    x=1.5; target=3; weight=1.2
    loss=lambda w:(w*x-target)**2
    analytic=2*(weight*x-target)*x
    h=1e-5; numeric=(loss(weight+h)-loss(weight-h))/(2*h)
    assert abs(analytic-numeric)<1e-6
    values=[-1.0,-0.31,0.12,0.78,1.0]
    scale=max(map(abs,values))/127
    restored=[max(-127,min(127,round(v/scale)))*scale for v in values]
    max_error=max(abs(a-b) for a,b in zip(values,restored))
    assert max_error<=scale/2+1e-10
    assert percentile([1,2,3,4,100],.95)==100
    n=args.size
    a=[[random.random() for _ in range(n)] for _ in range(n)]
    b=[[random.random() for _ in range(n)] for _ in range(n)]
    mm(a,b) # explicit warmup, excluded from measurements
    elapsed=[]
    for _ in range(args.repeats):
        start=time.perf_counter(); out=mm(a,b)
        elapsed.append((time.perf_counter()-start)*1000)
    result={'schema':'mlsys-local-v1','source':'real-local-CPU-measurement',
        'python':platform.python_version(),'platform':platform.platform(),
        'size':n,'repeats':args.repeats,'seed':41,'warmup':1,
        'tests_passed':5,'gradient':{'analytic':analytic,'finite_difference':numeric},
        'quantization_max_error':max_error,'latency_ms':elapsed,
        'median_ms':statistics.median(elapsed),'p95_ms':percentile(elapsed,.95),
        'checksum':sum(map(sum,out)),
        'limitations':'Python list CPU implementation, not BLAS/GPU; finite sample tail estimate; no universal speed claim'}
    destination=Path(args.output)
    if destination.exists():
        parser.error('Output already exists. Choose a new --output name to preserve evidence.')
    with destination.open('x',encoding='utf-8') as stream:
        json.dump(result,stream,ensure_ascii=False,indent=2,allow_nan=False)
    print(json.dumps(result,ensure_ascii=False,indent=2))
if __name__=='__main__': main()
