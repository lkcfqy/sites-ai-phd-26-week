#!/usr/bin/env python3
"""CPU-only PyTorch/ONNX/compile teaching baseline; optional dependencies, no downloads."""
import argparse, importlib.util, json, math, pathlib, statistics, sys, time

def main():
    p=argparse.ArgumentParser();p.add_argument('--mode',choices=['onnx','compile'],required=True);p.add_argument('--output-dir',required=True);a=p.parse_args()
    if not __debug__: p.error('Do not use -O: validation must remain enabled')
    needed=['torch','numpy']+(['onnx','onnxscript','onnxruntime'] if a.mode=='onnx' else [])
    missing=[x for x in needed if importlib.util.find_spec(x) is None]
    if missing:
        print(json.dumps({'status':'dependency-unavailable','missing':missing,'measured':False}));return 2
    import numpy as np
    import torch
    out=pathlib.Path(a.output_dir);out.mkdir(parents=False,exist_ok=False)
    torch.manual_seed(123);torch.set_num_threads(1)
    class Model(torch.nn.Module):
        def __init__(self):
            super().__init__();self.layers=torch.nn.Sequential(torch.nn.Linear(16,32),torch.nn.ReLU(),torch.nn.Linear(32,4))
        def forward(self,x): return self.layers(x)
    model=Model().cpu().eval() # Random weights: deployment equivalence, not trained task quality.
    def timed(fn):
        start=time.perf_counter_ns();y=fn();return y,(time.perf_counter_ns()-start)/1e6
    def samples(fn):
        for _ in range(5): fn()
        return [timed(fn)[1] for _ in range(31)]
    def summary(xs): return {'raw_ms':xs,'median_ms':statistics.median(xs),'p95_ms':sorted(xs)[math.ceil(.95*len(xs))-1]}
    report={'schema':'mlsys-framework-v1','source':'real-local-CPU-measurement','mode':a.mode,'torch':torch.__version__,'numpy':np.__version__,'threads':1,'task_quality':'not evaluated; random model','batches':[]}
    with torch.inference_mode():
        if a.mode=='onnx':
            import onnx,onnxruntime as ort
            report['onnx']=onnx.__version__;report['onnxruntime']=ort.__version__
            start=time.perf_counter_ns()
            program=torch.onnx.export(model,(torch.randn(2,16),),dynamo=True,input_names=['x'],output_names=['y'],dynamic_shapes=({0:torch.export.Dim('batch',min=1,max=64)},))
            program.save(str(out/'model.onnx'),external_data=False)
            onnx.checker.check_model(str(out/'model.onnx'))
            report['export_ms']=(time.perf_counter_ns()-start)/1e6
            options=ort.SessionOptions();options.intra_op_num_threads=1;options.inter_op_num_threads=1
            start=time.perf_counter_ns();session=ort.InferenceSession(str(out/'model.onnx'),sess_options=options,providers=['CPUExecutionProvider'])
            report['session_init_ms']=(time.perf_counter_ns()-start)/1e6;report['providers']=session.get_providers()
            candidate=lambda x:session.run(['y'],{'x':x.numpy()})[0]
        else:
            compiled=torch.compile(model,backend='inductor',fullgraph=True)
            candidate=lambda x:compiled(x).numpy()
        for batch in [1,2,7,31,64]:
            x=torch.randn(batch,16);reference=model(x).numpy()
            result,cold=timed(lambda:candidate(x))
            np.testing.assert_allclose(result,reference,rtol=1e-4,atol=1e-5)
            eager=samples(lambda:model(x).numpy());optimized=samples(lambda:candidate(x))
            delta=statistics.median(eager)-statistics.median(optimized)
            report['batches'].append({'batch':batch,'max_abs_error':float(np.max(np.abs(result-reference))),'first_call_ms':cold,'eager':summary(eager),'candidate':summary(optimized),'illustrative_calls_to_amortize_first_call':math.ceil(max(0,cold-statistics.median(optimized))/delta) if delta>0 else None})
    # Learner TODO: add wrong dtype/feature-count rejection tests and an unseen batch.
    (out/'results.json').write_text(json.dumps(report,indent=2,allow_nan=False),encoding='utf-8')
    print(json.dumps({'status':'completed','path':str(out/'results.json'),'not_a_skill_certificate':True}));return 0
if __name__=='__main__':
    try: sys.exit(main())
    except Exception as e:
        print(json.dumps({'status':'failed','error':type(e).__name__+': '+str(e),'do_not_claim_success':True}),file=sys.stderr);sys.exit(1)
