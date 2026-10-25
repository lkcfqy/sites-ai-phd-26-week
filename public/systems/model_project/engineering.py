#!/usr/bin/env python3
"""Reference CPU engineering exercise: train, export, serve, measure, break, regress, hand off.

Requires an already installed CPU-capable PyTorch. No package/model downloads or GPU.
Every output is a reference run, never a learner achievement. Existing learner.py stays TODO.
"""
import argparse
import hashlib
import json
import math
import os
import platform
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from core import dataset, predict, summarize

def write(path, data):
    with path.open('x') as file: json.dump(data,file,ensure_ascii=False,allow_nan=False,separators=(',',':'))

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output-dir',required=True);args=parser.parse_args()
    directory=Path(args.output_dir).resolve()
    if directory.exists():parser.error('output directory exists; choose a new run')
    directory.mkdir(parents=True)
    # All optional framework cache writes stay in this run, not an unrelated experiment.
    os.environ['TORCH_HOME']=str(directory/'cache');os.environ['TORCHINDUCTOR_CACHE_DIR']=str(directory/'cache/inductor');os.environ['PYTHONDONTWRITEBYTECODE']='1'
    os.environ['OMP_NUM_THREADS']='1';os.environ['MKL_NUM_THREADS']='1'
    try:import torch
    except ImportError:
        write(directory/'status.json',{'status':'dependency-unavailable','required':'torch','executed':False});parser.exit(2,'PyTorch is missing. No installation attempted; choose an approved existing environment.\n')
    torch.set_num_threads(1);torch.set_num_interop_threads(1);torch.manual_seed(41)
    root=Path(__file__).resolve().parent
    class Classifier(torch.nn.Module):
        def __init__(self):
            super().__init__();self.linear=torch.nn.Linear(8,1,dtype=torch.float64,device='cpu')
            torch.nn.init.zeros_(self.linear.weight);torch.nn.init.zeros_(self.linear.bias)
        def forward(self, inputs):return self.linear(inputs).squeeze(1)
    model=Classifier();xs,ys=dataset(256,41);x=torch.tensor(xs,dtype=torch.float64,device='cpu');y=torch.tensor(ys,dtype=torch.float64,device='cpu')
    optimizer=torch.optim.SGD(model.parameters(),lr=.5);losses=[];start=time.perf_counter()
    for _ in range(180):
        optimizer.zero_grad();loss=torch.nn.functional.binary_cross_entropy_with_logits(model(x),y);losses.append(float(loss.detach()));loss.backward();optimizer.step()
    train_seconds=time.perf_counter()-start;model.eval()
    weights={'schema':'tiny-linear-v1','weights':model.linear.weight.detach().tolist()[0],'bias':float(model.linear.bias.detach()[0]),'train_seed':41,'features':8}
    write(directory/'model.json',weights)
    export_input=torch.tensor(dataset(3,83)[0],dtype=torch.float64,device='cpu');start=time.perf_counter()
    exported=torch.export.export(model,(export_input,),dynamic_shapes={'inputs':{0:torch.export.Dim('batch',min=1,max=64)}})
    torch.export.save(exported,directory/'model.pt2');restored=torch.export.load(directory/'model.pt2').module();export_ms=(time.perf_counter()-start)*1000
    shape_results=[]
    with torch.inference_mode():
        for batch in [1,7,31,64]:
            features,_=dataset(batch,83);inputs=torch.tensor(features,dtype=torch.float64,device='cpu');reference=predict(weights,features);output=restored(inputs).tolist()
            assert max(abs(a-b) for a,b in zip(reference,output))<1e-9
            for _ in range(5):restored(inputs).tolist()
            times=[]
            for _ in range(31):
                tick=time.perf_counter_ns();restored(inputs).tolist();times.append((time.perf_counter_ns()-tick)/1e6)
            shape_results.append({'batch':batch,'features':features,'reference_logits':reference,'export_logits':output,'timing':summarize(times)})
        holdout,labels=dataset(64,73);scores=restored(torch.tensor(holdout,dtype=torch.float64,device='cpu')).tolist()
    accuracy=sum((score>=0)==bool(label) for score,label in zip(scores,labels))/64
    assert accuracy>=.9
    faulty_accuracy=sum((-score>=0)==bool(label) for score,label in zip(scores,labels))/64
    assert faulty_accuracy<.8
    quality=[{'features':features,'label':label,'logit':score} for features,label,score in zip(holdout,labels,scores)]
    framework={'schema':'framework-cpu-v1','source':'actual-local-PyTorch-CPU','source_kind':'reference','torch':torch.__version__,'python':platform.python_version(),'platform':platform.platform(),'dtype':'float64','device':'cpu','weights':weights,'train':{'seed':41,'samples':256,'steps':180,'learning_rate':.5,'losses':losses,'seconds':train_seconds},'export_roundtrip_ms':export_ms,'warmup':5,'repeats':31,'shapes':shape_results,'holdout':quality,'accuracy':accuracy,'negative_control_accuracy':faulty_accuracy,'limits':'Synthetic binary task; no LLM, CUDA, compiler optimization, ONNX or production quality claim. Timer covers exported CPU call plus conversion to Python list; input construction excluded.'}
    write(directory/'framework.json',framework)
    # Reuse the existing real HTTP server/load client, preserving its serial queue behavior.
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}));services=[]
    for backend in ['python','torch-export']:
        with socket.socket() as lease:lease.bind(('127.0.0.1',0));port=lease.getsockname()[1]
        command=[sys.executable,'-B',str(root/'server.py'),'--port',str(port),'--backend',backend,'--model-file',str(directory/'model.json')]
        if backend=='torch-export':command+=['--export-file',str(directory/'model.pt2')]
        log=(directory/(backend+'-server.log')).open('x');process=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT,env=os.environ.copy());started=time.perf_counter()
        try:
            ready=False
            for _ in range(200):
                if process.poll() is not None:raise RuntimeError('server exited: '+backend)
                try:
                    with opener.open(f'http://127.0.0.1:{port}/health',timeout=.2) as response:ready=response.status==200
                    if ready:break
                except (urllib.error.URLError,TimeoutError):time.sleep(.05)
            if not ready:raise RuntimeError('server readiness timeout')
            startup_ms=(time.perf_counter()-started)*1000
            faults=[]
            for name,payload,content_type,origin,wanted in [('shape',b'{"inputs":[[1,2]]}','application/json',None,400),('nonfinite',b'{"inputs":[[NaN,0,0,0,0,0,0,0]]}','application/json',None,400),('json',b'{','application/json',None,400),('media',b'{}','text/plain',None,415),('origin',b'{}','application/json','https://example.invalid',403)]:
                request=urllib.request.Request(f'http://127.0.0.1:{port}/predict',payload,{'Content-Type':content_type,**({'Origin':origin} if origin else {})})
                try:
                    with opener.open(request,timeout=3) as response:status=response.status
                except urllib.error.HTTPError as error:status=error.code
                assert status==wanted,(name,status,wanted);faults.append({'case':name,'expected':wanted,'actual':status})
            for concurrency in [1,4]:
                name=f'{backend}-c{concurrency}.json'
                result=subprocess.run([sys.executable,'-B',str(root/'load.py'),'--port',str(port),'--requests','40','--batch','8','--concurrency',str(concurrency),'--output',str(directory/name)],capture_output=True,text=True,timeout=30,check=True,env=os.environ.copy())
                measured=json.loads((directory/name).read_text());assert measured['errors']==0
                services.append({'backend':backend,'concurrency':concurrency,'startup_ms':startup_ms,'artifact':name,'requests':40,'errors':0,'p95_ms':measured['latency']['p95_ms'],'requests_per_s':measured['successful_requests_per_s'],'server_peak_rss_bytes':max(row['server_peak_rss_bytes'] for row in measured['requests']),'faults':faults})
        finally:
            process.terminate()
            try:process.wait(timeout=5)
            except subprocess.TimeoutExpired:process.kill();process.wait(timeout=5)
            log.close()
        with socket.socket() as check:
            check.settimeout(.2);assert check.connect_ex(('127.0.0.1',port))!=0,'owned server still listening'
    hashes={name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in ['engineering.py','server.py','load.py','core.py']}
    report={'schema':'mlsys-cpu-engineering-v1','status':'reference-acceptance-passed','source_kind':'reference','framework_artifact':'framework.json','accuracy':accuracy,'negative_control_accuracy':faulty_accuracy,'services':services,'source_sha256':hashes,'servers_stopped':True,'learner_implementation':'not executed; learner.py remains an independent assignment','not_verified':['CUDA/vLLM','ONNX','production networking','production model/data quality','learner independence'],'cost_boundary':'CPU process startup and service times measured; no invented cloud price or GPU cost.'}
    write(directory/'results.json',report)
    (directory/'HANDOFF.md').write_text('# CPU reference exercise\n\nReview results.json and every raw artifact, not only this summary.\n\nRun: python engineering.py --output-dir NEW_DIRECTORY\n\nCompare framework.json holdout quality, export time, and each service p95/throughput/peak process RSS. RSS includes runtime, not just weights. A faster low-quality candidate is rejected by the negative control. These are synthetic reference results, not learner competence. All owned servers have stopped.\n\nNext: implement your own learner.py; run CHECK_LEARNER=1 python -m unittest test_project.py. Preserve failed attempts, new seeds and reviewer feedback.\n')
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
