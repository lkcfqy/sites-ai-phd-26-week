#!/usr/bin/env python3
"""Prepare a bounded LOCAL vLLM exercise. Does NOT start vLLM, install, download or access GPUs."""
import argparse,json,shlex
from pathlib import Path

def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--model-dir',required=True);p.add_argument('--output-dir',required=True)
 p.add_argument('--requests',type=int,default=32);p.add_argument('--rate',type=float,default=1.0)
 p.add_argument('--concurrency',type=int,default=1);a=p.parse_args()
 model=Path(a.model_dir).expanduser().resolve();out=Path(a.output_dir).expanduser()
 if not model.is_dir():p.error('model-dir must be an existing, locally authorized model directory; no download is performed')
 if not (model/'config.json').is_file():p.error('model directory must contain config.json; this does not prove runtime compatibility')
 if not 16<=a.requests<=128 or not .1<=a.rate<=5 or not 1<=a.concurrency<=4:p.error('bounded exercise: requests 16..128, rate 0.1..5, concurrency 1..4')
 if out.exists():p.error('output-dir exists; refusing overwrite')
 # No shell execution: this program only constructs reviewable command arguments.
 serve=['vllm','serve',str(model),'--served-model-name','course-local','--host','127.0.0.1','--port','8000','--max-model-len','1024','--max-num-seqs','4','--gpu-memory-utilization','0.5']
 bench=['vllm','bench','serve','--backend','openai','--base-url','http://127.0.0.1:8000','--endpoint','/v1/completions','--model',str(model),'--served-model-name','course-local','--tokenizer',str(model),'--dataset-name','random','--random-input-len','128','--random-output-len','64','--num-prompts',str(a.requests),'--request-rate',str(a.rate),'--max-concurrency',str(a.concurrency),'--num-warmups','4','--seed','41','--save-result','--save-detailed','--result-dir',str(out.resolve()),'--result-filename','benchmark.json']
 plan={'schema':'llm-local-plan-v1','status':'prepared-not-executed','model_path':str(model),'model_license_review_required':True,'gpu_authorization_required':True,'a100_requires_separate_approval':True,'request_count':a.requests,'requested_rate_rps':a.rate,'max_concurrency':a.concurrency,'input_tokens':128,'output_token_limit':64,'workload':'synthetic token-length benchmark; not quality evaluation','serve_argv':serve,'benchmark_argv':bench,'limitations':['No environment/model compatibility validation','Not a real hardware measurement','Run only after explicit hardware and budget authorization','Do not increase resource limits automatically after failure']}
 out.mkdir(parents=True);(out/'plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n')
 text=['# REVIEW ONLY: no commands have been run. Read README before executing.', '# These environment flags prevent model hub fetches and optional usage reporting; use a dedicated shell.', 'export HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 VLLM_NO_USAGE_STATS=1', '# Terminal A: only on specifically authorized NVIDIA hardware; A100 separately requires approval.', shlex.join(serve), '# Terminal B: wait for readiness; abort on errors; bounded benchmark.', shlex.join(bench), '# Stop ONLY your server with Ctrl-C in Terminal A when finished.']
 (out/'commands.txt').write_text('\n'.join(text)+'\n');print('Prepared only:',out/'plan.json');print('No GPU, service, model download or benchmark was started.')
if __name__=='__main__':main()
