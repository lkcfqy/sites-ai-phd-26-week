import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {loadTS} from './test-ts-loader.mjs';
const {simulationModels, simulationDefaults, makeSimulationArtifact, checkSimulationArtifact, scheduleRequests, syntheticRequests}=loadTS('lib/systems-simulation-evidence.ts');
const {inspectArtifact, validateEvidenceSubmission}=loadTS('lib/systems-evidence.ts');
const {normalizeSystemsWrite}=loadTS('lib/systems-write.ts');
const {progressLabel}=loadTS('lib/systems-records.ts');
const {buildSystemsBackup}=loadTS('lib/systems-provenance.ts');
const {checkAssessmentArtifact}=loadTS('lib/systems-assessment.ts');
const params={seed:1,rate:100,batch:2,lanes:2,waitMs:2,policy:'fifo'};

test('queue hand calculation: partial final batch, deadline, causal start and end',()=>{
 const rows=scheduleRequests([{id:0,arrival_ms:0,assumed_output_tokens:8},{id:1,arrival_ms:1,assumed_output_tokens:8},{id:2,arrival_ms:2,assumed_output_tokens:8}],params);
 assert.deepEqual(rows.map(r=>[r.id,r.batch_id,r.start_ms,r.finish_ms,r.wait_ms]),[[0,0,1,11,1],[1,0,1,11,0],[2,1,11,21,9]]);
 const one=scheduleRequests([{id:0,arrival_ms:0,assumed_output_tokens:8}],params);
 assert.equal(one[0].start_ms,2);assert.equal(one[0].finish_ms,12);
});
test('short-first is a policy tradeoff, not a fabricated universal latency improvement',()=>{
 const jobs=[{id:0,arrival_ms:0,assumed_output_tokens:64},{id:1,arrival_ms:0,assumed_output_tokens:8},{id:2,arrival_ms:0,assumed_output_tokens:8}];
 const fifo=scheduleRequests(jobs,{...params,batch:1,waitMs:0}),short=scheduleRequests(jobs,{...params,batch:1,waitMs:0,policy:'shortest'});
 assert.equal(fifo[0].start_ms,0);assert.equal(short[1].start_ms,0);assert.ok(short[0].latency_ms>fifo[0].latency_ms);
});
test('bounded scheduling variations retain every request, no overlaps or time travel',()=>{
 for(const seed of [1,7331,104729,2147483647])for(const batch of [1,4,32])for(const policy of ['fifo','shortest']){
  const p={...params,seed,batch,policy,rate:seed%2?500:10,waitMs:seed%3?20:0};
  const inputs=syntheticRequests(seed,p.rate),rows=scheduleRequests(inputs,p);
  assert.equal(rows.length,32);assert.deepEqual(rows.map(r=>r.id),inputs.map(r=>r.id));
  for(const r of rows){assert.ok(r.start_ms>=r.arrival_ms);assert.ok(Math.abs(r.latency_ms-r.wait_ms-r.service_ms)<1e-9);}
  const groups=[...new Map(rows.map(r=>[r.batch_id,r])).values()].sort((a,b)=>a.batch_id-b.batch_id);
  for(let i=1;i<groups.length;i++)assert.ok(groups[i].start_ms>=groups[i-1].finish_ms);
 }
 assert.throws(()=>scheduleRequests([{id:0,arrival_ms:0,assumed_output_tokens:8},{id:0,arrival_ms:0,assumed_output_tokens:8}],params),/重复/);
});
test('parallelism and paged KV have independent hand-checkable boundaries',()=>{
 const parallel=makeSimulationArtifact('roofline',simulationDefaults.roofline);
 assert.equal(parallel.metrics.waves,9);assert.equal(parallel.metrics.last_wave_idle_slots,7);assert.equal(parallel.metrics.modeled_parallel_ms,13);
 const kv=makeSimulationArtifact('kv',{...simulationDefaults.kv,tokens:4097});
 assert.equal(kv.trace[0].allocated_tokens,4112);
 assert.equal(kv.metrics.fragmentation_bytes,2*32*8*128*15*4*2);
 const impossible=makeSimulationArtifact('kv',{...simulationDefaults.kv,capacityGiB:1});
 assert.equal(impossible.metrics.payload_fits_assumed_budget,false);assert.equal(impossible.metrics.max_concurrency_in_model,0);
});
test('all eight existing models preserve simulation provenance across generation, import, storage and export',()=>{
 for(const model of simulationModels){
  const raw=makeSimulationArtifact(model,simulationDefaults[model]);
  assert.deepEqual(raw,makeSimulationArtifact(model,simulationDefaults[model]));
  assert.deepEqual(checkSimulationArtifact(JSON.parse(JSON.stringify(raw))),raw);
  const check=inspectArtifact(raw);assert.equal(check.kind,'simulation');assert.equal(check.provenance.realDeviceGateSatisfied,false);
  const submitted={schema:'mlsys-evidence-v2',artifact:raw,assistance:'guided',explanation:'我改变参数并核对完整合成轨迹；这只是机制仿真，没有验证真实 GPU、vLLM 或语言模型质量。',check:{kind:'llm-measurement',hardwareExecutionVerified:true}};
  const body=normalizeSystemsWrite('practice:validated:simulation-'+model,'practice',JSON.stringify(submitted));
  const saved=JSON.parse(body);assert.equal(saved.check.kind,'simulation');assert.equal(saved.check.provenance.hardwareExecutionVerified,false);
  const row={item_id:'practice:validated:simulation-'+model,kind:'practice',body,updated_at:1};
  assert.match(progressLabel(row),/教学仿真/);
  const backup=JSON.parse(JSON.stringify(buildSystemsBackup([row],'2026-10-24T00:00:00Z')));
  assert.equal(backup.records[0].evidenceScope,'教学仿真');assert.equal(backup.records[0].realDeviceGateSatisfied,false);
  const restored=JSON.parse(backup.records[0].body);assert.deepEqual(restored.artifact.provenance,raw.provenance);
  assert.equal(validateEvidenceSubmission(restored).check.kind,'simulation');
  assert.throws(()=>checkAssessmentArtifact(raw),/字段/);
 }
});
test('source laundering, missing rows and forged simulation metrics are rejected',()=>{
 const original=makeSimulationArtifact('batch',simulationDefaults.batch);
 for(const change of [r=>r.provenance.hardwareMeasured=true,r=>r.source='real-local-CPU-measurement',r=>r.trace.pop(),r=>r.metrics.modeled_p95_ms=1,r=>r.parameters.seed++,r=>r.realDeviceGateSatisfied=true]){
  const r=structuredClone(original);change(r);assert.throws(()=>inspectArtifact(r));
 }
 for(const schema of ['mlsys-local-v1','mlsys-llm-v2','model-service-v2']) assert.throws(()=>inspectArtifact({...original,schema}));
 const invalid=structuredClone(original);invalid.parameters.batch=100000;assert.throws(()=>inspectArtifact(invalid));
});
test('CPU measurement classification stays distinct from simulations',()=>{
 const cpu={schema:'mlsys-local-v1',source:'real-local-CPU-measurement',python:'test',platform:'test',size:2,tests_passed:5,warmup:1,latency_ms:[1,2,3,4,5],repeats:5,median_ms:3,p95_ms:5,gradient:{analytic:-3.6,finite_difference:-3.6},quantization_max_error:0,checksum:1};
 assert.equal(inspectArtifact(cpu).kind,'cpu-measurement');assert.equal(inspectArtifact(cpu).provenance.basis,'submitted-measurement');
});
test('CLI reproducibility and refuse-overwrite behavior retain original synthetic records',()=>{
 const directory=mkdtempSync(join(tmpdir(),'simulation-cli-'));
 try{
  const out=join(directory,'batch.json');const args=['scripts/run-simulation.mjs','--model','batch','--output',out];
  let run=spawnSync(process.execPath,args,{encoding:'utf8',timeout:5000});assert.equal(run.status,0,run.stderr);const before=readFileSync(out,'utf8');
  run=spawnSync(process.execPath,['scripts/run-simulation.mjs','--verify',out],{encoding:'utf8',timeout:5000});assert.equal(run.status,0,run.stderr);
  run=spawnSync(process.execPath,args,{encoding:'utf8',timeout:5000});assert.notEqual(run.status,0);assert.equal(readFileSync(out,'utf8'),before);
 }finally{rmSync(directory,{recursive:true,force:true})}
});
