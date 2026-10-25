import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {loadTS} from './test-ts-loader.mjs';
const {inspectArtifact,validateEvidenceSubmission}=loadTS('lib/systems-evidence.ts');
let directory,model,llm;
before(()=>{
 directory=mkdtempSync(join(tmpdir(),'mlsys-extended-'));
 const path=join(directory,'model.json');
 execFileSync('python3',['-B','public/systems/model_project/experiment.py','--batch','4','--repeats','20','--output',path],{timeout:10000});model=JSON.parse(readFileSync(path,'utf8'));
 llm=JSON.parse(execFileSync('python3',['-B','-c','import json;from test_tools import fixture;from inspect_result import inspect;print(json.dumps(inspect(fixture(),16)))'],{cwd:resolve('public/systems/labs/llm-serving'),timeout:10000,encoding:'utf8'}));
});
after(()=>{if(directory)rmSync(directory,{recursive:true,force:true})});
test('actual model output recomputes scores, task labels, quantization quality and all timings',()=>{
 assert.equal(inspectArtifact(model).metrics.holdout_count,64);
 for(const mutate of [x=>x.quality.float_accuracy=1,x=>x.holdout[0].float_logit+=1,x=>x.holdout[0].label=1-x.holdout[0].label,x=>x.results.float_python.raw_latency_ms.pop()]){const changed=structuredClone(model);mutate(changed);assert.throws(()=>inspectArtifact(changed))}
});
test('LLM synthetic fixture only: Python and TS recompute counts, token rates and TTFT/TPOT',()=>{
 const checked=inspectArtifact(llm);assert.equal(checked.kind,'llm-measurement');assert.equal(checked.metrics.failed,1);assert.equal(checked.metrics.total_output_tokens,60);
 for(const mutate of [x=>x.requests.pop(),x=>x.metrics.mean_tpot_ms+=2,x=>x.metrics.output_throughput+=1,x=>x.requests[0].ok=false,x=>x.requests[0].ttft_s=10]){const changed=structuredClone(llm);mutate(changed);assert.throws(()=>inspectArtifact(changed))}
});
test('real CPU framework/service artifacts when explicitly supplied', {skip:!process.env.MLSYS_CPU_EVIDENCE_DIR},()=>{
 for(const file of ['framework.json','python-c1.json','python-c4.json','torch-export-c1.json','torch-export-c4.json']){
  const data=JSON.parse(readFileSync(join(process.env.MLSYS_CPU_EVIDENCE_DIR,file),'utf8'));assert.equal(inspectArtifact(data).kind,'cpu-measurement');
  const changed=structuredClone(data);
  if(file==='framework.json'){
   changed.shapes[0].export_logits[0]+=1;
   assert.throws(()=>validateEvidenceSubmission({schema:'mlsys-evidence-v2',artifact:data,assistance:'independent',explanation:'本文件明确是课程参考运行，不能转成独立成绩。'}),/参考/);
  } else changed.requests.pop();
  assert.throws(()=>inspectArtifact(changed));
 }
});
