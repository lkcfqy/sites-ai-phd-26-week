import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {loadTS} from './test-ts-loader.mjs';
const {checkAssessmentArtifact,normalizeAttempt,normalizeReview,blankReview}=loadTS('lib/systems-assessment.ts');
const {normalizeSystemsWrite}=loadTS('lib/systems-write.ts');
const {buildSystemsBackup}=loadTS('lib/systems-provenance.ts');
const script=resolve('public/systems/assessment/assessment.py');
const notes={diagnosis:'保留原始失败输入，说明具体错误和可以推翻假设的观察。',change:'修复局部逻辑，并复跑既有正常和边界案例确认没有退化。',transfer:'这是合成任务的编程检查，尚未验证真实设备、模型质量或生产服务。',english:'Synthetic fixture only. Preserve the failure and retry with a new artifact.',previousId:''};
function py(args,timeout=15000){return spawnSync('python3',['-B',...args],{encoding:'utf8',timeout});}
function create(directory,family,seed,version=2){const run=py([script,'create','--family',family,'--seed',String(seed),'--case-version',String(version),'--directory',directory]);assert.equal(run.status,0,run.stderr);}
function solution(kind,debug=''){
 return `import importlib.util\nspec=importlib.util.spec_from_file_location('fixture_oracle',${JSON.stringify(script)})\nmodule=importlib.util.module_from_spec(spec)\nspec.loader.exec_module(module)\n${debug}\ndef analyze(rows):\n    result=module.oracle('trace',[rows])\n    ${kind==='maximum'?'result["p95_ms"]=max(row["ms"] for row in rows if row["ok"])':'pass'}\n    return result\ndef partition(n,workers):\n    return module.oracle('partition',[n,workers])\ndef choose(candidates,slo_ms,min_quality,memory_bytes):\n    result=module.oracle('decision',[candidates,slo_ms,min_quality,memory_bytes])\n    ${kind==='ignore-quality'?'feasible=[r for r in candidates if r["p95_ms"]<=slo_ms and r["memory_bytes"]<=memory_bytes]\n    return min(feasible,key=lambda r:(r["p95_ms"],r["name"]))["name"] if feasible else None':'return result'}\n`;
}

test('current fixtures reject max-as-p95 and omitted quality filtering across four seeds',()=>{
 const root=mkdtempSync(join(tmpdir(),'assessment-mutants-'));
 try{
  for(const seed of [1,7331,104729,2147483647])for(const [family,mutant]of [['trace','maximum'],['decision','ignore-quality']]){
   const dir=join(root,`${family}-${seed}`);create(dir,family,seed);
   for(const kind of ['correct',mutant]){
    writeFileSync(join(dir,'learner.py'),solution(kind));const output=join(dir,kind+'.json');
    const run=py([script,'check','--directory',dir,'--output',output]);assert.equal(run.status,0,run.stderr);
    const data=JSON.parse(readFileSync(output,'utf8')),checked=checkAssessmentArtifact(data);
    assert.equal(data.case_version,2);assert.equal(checked.passed,kind==='correct');assert.equal(checked.currentCaseCoverage,true);
    if(kind!=='correct'){assert.equal(checked.tests[0].passed,false);assert.equal(checked.tests[0].actual.error,null);}
   }
  }
 }finally{rmSync(root,{recursive:true,force:true})}
});
test('historical v1 results remain readable and are marked as weaker legacy coverage',()=>{
 const root=mkdtempSync(join(tmpdir(),'assessment-v1-'));
 try{
  const dir=join(root,'task');create(dir,'trace',1,1);writeFileSync(join(dir,'learner.py'),solution('maximum'));
  const output=join(root,'v1.json');let run=py([script,'check','--directory',dir,'--output',output]);assert.equal(run.status,0,run.stderr);
  const data=JSON.parse(readFileSync(output,'utf8'));delete data.case_version;delete data.execution;
  const checked=checkAssessmentArtifact(data);assert.equal(checked.passed,true);assert.equal(checked.case_version,1);assert.equal(checked.currentCaseCoverage,false);
  assert.equal(checked.input_provenance,'synthetic-task-inputs');
 }finally{rmSync(root,{recursive:true,force:true})}
});
test('ordinary print and stderr debugging do not corrupt machine results; diagnostics are bounded',()=>{
 const root=mkdtempSync(join(tmpdir(),'assessment-logging-'));
 try{
  const dir=join(root,'task');create(dir,'trace',7331);
  writeFileSync(join(dir,'learner.py'),solution('correct',`import sys\nprint('debug: inspecting rows')\nprint('warning: local debugging',file=sys.stderr)\nprint('x'*20000)`));
  const output=join(root,'debug.json'),run=py([script,'check','--directory',dir,'--output',output]);assert.equal(run.status,0,run.stderr);
  const summary=JSON.parse(run.stdout),data=JSON.parse(readFileSync(output,'utf8'));
  assert.equal(summary.passed,true);assert.equal(checkAssessmentArtifact(data).passed,true);
  assert.match(data.execution.stdout,/debug: inspecting rows/);assert.match(data.execution.stderr,/warning: local debugging/);
  assert.equal(data.execution.stdout_truncated,true);assert.ok(data.execution.stdout.length<5000);assert.ok(!run.stdout.includes('inspecting'));
 }finally{rmSync(root,{recursive:true,force:true})}
});
test('syntax, timeout and malformed machine reports remain actionable failed attempts',()=>{
 const root=mkdtempSync(join(tmpdir(),'assessment-failures-'));
 try{
  for(const failure of ['syntax','timeout','invalid-result']){
   const dir=join(root,failure);create(dir,'trace',104729);let chosen=script;
   writeFileSync(join(dir,'learner.py'),failure==='syntax'?'def analyze(rows)\n    return 0\n':failure==='timeout'?'while True:\n    pass\n':solution('correct'));
   if(failure==='invalid-result'){
    chosen=join(root,'broken-protocol.py');const text=readFileSync(script,'utf8');
    assert.ok(text.includes('Path(args.report_file).write_text(payload)'));
    writeFileSync(chosen,text.replace('Path(args.report_file).write_text(payload)',`Path(args.report_file).write_text('{')`));
   }
   const output=join(root,failure+'.json'),run=py([chosen,'check','--directory',dir,'--output',output,'--timeout-seconds','0.5']);
   assert.equal(run.status,2,run.stdout+run.stderr);const data=JSON.parse(readFileSync(output,'utf8'));
   assert.equal(data.execution.status,failure==='syntax'?'failed':failure);assert.equal(data.passed,false);assert.deepEqual(data.tests,[]);
   if(failure==='syntax'){assert.match(data.execution.stderr,/SyntaxError/);assert.match(data.execution.stderr,/learner\.py.*line 1/);}
   if(failure==='timeout')assert.match(data.execution.message,/exceeded/);
   if(failure==='invalid-result')assert.match(data.execution.message,/JSONDecodeError/);
   const checked=checkAssessmentArtifact({...data,passed:true});assert.equal(checked.passed,false);assert.equal(checked.tests.length,0);
   const attempt=normalizeAttempt({schema:'mlsys-attempt-v1',artifact:data,assistance:'guided',...notes});assert.equal(attempt.status,'needs-revision');
   const body=normalizeSystemsWrite('assessment:attempt:failed-'+failure,'practice',JSON.stringify(attempt));
   const backup=buildSystemsBackup([{item_id:'assessment:attempt:failed-'+failure,kind:'practice',body,updated_at:1}],'2026-10-24');
   assert.equal(JSON.parse(backup.records[0].body).artifact.execution.status,data.execution.status);assert.equal(backup.records[0].realDeviceGateSatisfied,false);
  }
 }finally{rmSync(root,{recursive:true,force:true})}
});
test('review cannot promote synthetic tasks into real-device evidence',()=>{
 const review={...blankReview(),schema:'mlsys-review-v1',attemptId:'assessment:attempt:one',reviewerAlias:'测试同伴',feedback:notes.diagnosis,nextAction:notes.transfer,realDeviceGateSatisfied:true};
 for(const key of Object.keys(review.rubric))review.rubric[key]={rating:'adequate',evidence:'具体依据是合成输入上的源代码、原始测试与错误修订记录。'};
 const checked=normalizeReview(review);assert.equal(checked.realDeviceGateSatisfied,false);assert.equal(checked.evidenceScope,'synthetic-task-review');
});

test('saved v1 history and review selection warn without rechecking or changing evidence; v2 stays distinct',()=>{
 const root=mkdtempSync(join(tmpdir(),'assessment-history-ui-'));
 const Assessment=loadTS('app/systems/assessment.tsx').default;
 try{
  for(const scenario of [
   {name:'legacy-implicit-pass',version:1,pass:true,implicit:true},
   {name:'legacy-explicit-pass',version:1,pass:true,implicit:false},
   {name:'legacy-failure',version:1,pass:false,implicit:false},
   {name:'current-pass',version:2,pass:true,implicit:false},
  ]){
   const dir=join(root,scenario.name);create(dir,'trace',7331,scenario.version);
   if(scenario.pass)writeFileSync(join(dir,'learner.py'),solution('correct'));
   const output=join(dir,'result.json'),run=py([script,'check','--directory',dir,'--output',output]);
   assert.equal(run.status,0,run.stderr);
   const artifact=JSON.parse(readFileSync(output,'utf8'));
   if(scenario.implicit){delete artifact.case_version;delete artifact.execution;}
   const id='assessment:attempt:'+scenario.name;
   const attempt=normalizeAttempt({schema:'mlsys-attempt-v1',artifact,assistance:'guided',...notes});
   assert.equal(attempt.artifact.passed,scenario.pass);
   const records=[
    {item_id:id,kind:'practice',body:JSON.stringify(attempt),updated_at:1},
    {item_id:'assessment:draft:review',kind:'practice',body:JSON.stringify({...blankReview(),attemptId:id}),updated_at:2},
   ];
   const before=JSON.stringify(records);
   const html=renderToStaticMarkup(createElement(Assessment,{records,onSave:async()=>{assert.fail('rendering history must never write records')},onDirtyChange:()=>{}}));
   const options=html.match(/<select[^>]*id="review-attempt"[\s\S]*?<\/select>/)?.[0];
   const history=html.slice(html.indexOf('<h3>尝试与反馈历史'));
   assert.ok(options);assert.ok(history.startsWith('<h3>尝试与反馈历史'));
   if(scenario.version===1){
    assert.match(options,/旧题库 v1 · 覆盖较弱，需重跑 v2/);
    assert.match(history,/旧题库 v1 的覆盖较弱，请新建 v2 任务补验/);
    assert.match(history,/原结果保留，旧版全通过不代表当前要求已满足/);
    assert.equal((html.match(/旧题库 v1 的覆盖较弱/g)||[]).length,2,'selected-review warning and visible history warning both required');
   }else{
    assert.match(options,/题库 v2/);assert.doesNotMatch(options,/旧题库|覆盖较弱/);assert.doesNotMatch(history,/旧题库|覆盖较弱/);
   }
   assert.match(history,scenario.pass?/测试输出一致，未认证能力/:/存在失败，需要修订/);
   assert.equal(JSON.stringify(records),before,'original evidence and review selection must be preserved');
   assert.equal(attempt.artifact.case_version,scenario.version);
   assert.equal(attempt.competencyCertified,false);
  }
 }finally{rmSync(root,{recursive:true,force:true})}
});
