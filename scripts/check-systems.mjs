#!/usr/bin/env node
/** Local regression suite. Run `node scripts/check-systems.mjs` with Node >=22.18 (native type stripping). */
import assert from 'node:assert/strict';
import {readFile, readdir, mkdtemp, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const baselineHashes=JSON.parse(await readFile(join(root,'data/legacy-source-hashes.json'),'utf8'));
const tests=[];
function test(name,fn){tests.push([name,fn]);}
const text=(value,label,min=1)=>assert.ok(typeof value==='string'&&value.trim().length>=min,`${label}: missing substantive text`);
const unique=(values,label)=>assert.equal(new Set(values).size,values.length,`${label}: duplicate IDs`);
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const loadTs=path=>import(pathToFileURL(join(root,path)).href);
const legacy=JSON.parse(await readFile(join(root,'data/curriculum.json'),'utf8'));
const legacyLessons=legacy.flatMap(w=>w.lessons);
const legacyIds=new Set(legacyLessons.map(l=>l.id));

test('Legacy 170 lessons and teaching-data bytes remain unchanged',async()=>{
 assert.equal(legacyLessons.length,170);unique(legacyLessons.map(l=>l.id),'legacy lessons');
 const files=(await readdir(join(root,'data'))).filter(f=>f==='curriculum.json'||f.startsWith('self-study-')||f.startsWith('depth-'));
 for(const file of files){const after=await readFile(join(root,'data',file));assert.equal(sha(after),baselineHashes[file],`legacy data changed: ${file}`);}
});
test('55 new lessons have valid content, unique IDs, and an acyclic prerequisite graph',async()=>{
 const {stages}=await loadTs('data/mlsystems-curriculum.ts');
 assert.ok(Array.isArray(stages)&&stages.length>=8,'missing staged curriculum');unique(stages.map(s=>s.id),'stages');
 const ids=new Set(stages.map(s=>s.id)), lessons=stages.flatMap(s=>s.lessons);
 assert.equal(lessons.length,55,'update explicit release expectation after intentional curriculum change');unique(lessons.map(l=>l.id),'new lesson IDs');
 const complete=new Set(),active=new Set();
 function visit(id){if(complete.has(id))return;assert.ok(!active.has(id),`prerequisite cycle at ${id}`);active.add(id);const stage=stages.find(s=>s.id===id);for(const p of stage.prerequisites){assert.ok(ids.has(p),`unknown prerequisite ${p}`);visit(p);}active.delete(id);complete.add(id);}
 for(const s of stages){text(s.id,'stage.id');text(s.title,'stage.title');text(s.goal,'stage.goal',8);assert.ok(Array.isArray(s.prerequisites));assert.ok(s.lessons.length>0);visit(s.id);
  for(const l of s.lessons){assert.ok(!legacyIds.has(l.id),'new IDs must not alias old progress IDs');for(const k of ['id','title','summary','workedExample','exercise','transfer'])text(l[k],`${l.id}.${k}`);assert.ok(l.sections.length>=2,`${l.id}: at least two explanations`);for(const section of l.sections){text(section.title,'section title');text(section.body,'section body',30);}assert.ok(l.acceptance.length>=2,`${l.id}: acceptance evidence`);for(const a of l.acceptance)text(a,'acceptance');for(const old of l.legacyLessonIds??[])assert.ok(legacyIds.has(old),`${l.id}: broken legacy link ${old}`);}
 }
});
test('Eight simulator numerical models obey formulas and boundary invariants',async()=>{
 const {gradientModel,cacheModel,rooflineModel,batchModel,kvModel,quantModel,fusionModel,percentile}=await loadTs('lib/systems-simulations.ts');
 assert.equal(gradientModel(2,3,4).dw,8);
 for(const x of [-3,0,3])for(const w of [-4,0,4])for(const t of [-5,0,5]){const eps=1e-5;const fd=(gradientModel(x,w+eps,t).loss-gradientModel(x,w-eps,t).loss)/(2*eps);assert.ok(Math.abs(fd-gradientModel(x,w,t).dw)<1e-6,'chain rule differs from finite difference');}
 assert.equal(cacheModel(1).misses,4);assert.equal(cacheModel(16).misses,64);
 for(let s=1;s<=32;s++){const c=cacheModel(s);assert.equal(c.hits+c.misses,64);assert.ok(c.bytes>=256&&c.bytes<=4096);}
 for(const ai of [.5,64])for(const bw of [25,500])for(const peak of [500,10000]){const r=rooflineModel(ai,bw,peak);assert.equal(r.attainable,Math.min(peak,bw*ai));assert.equal(r.ridge,peak/bw);}
 assert.equal(batchModel(4,50,8,2).meanLatency,46);assert.equal(batchModel(1,500,8,2).stable,false);assert.equal(batchModel(1,50,8,2).meanFill,0);
 assert.equal(kvModel(32,8,128,4096,4,2)/2**30,2);assert.equal(kvModel(32,8,128,8192,4,2)/2**30,4);
 for(const bits of [2,4,8])for(const clip of [.5,4]){const q=quantModel([-3,0,3],bits,clip);assert.ok(q.rows.every(r=>Math.abs(r.restored)<=clip+1e-10));assert.ok(q.mse>=0);assert.equal(q.rows[1].error,0);}
 assert.equal(fusionModel(100e6,4,1000).unfusedMs,1.6);assert.equal(fusionModel(100e6,4,1000).fusedMs,.8);
 assert.equal(percentile(Array.from({length:20},(_,i)=>i+1),.95),19);assert.equal(percentile([1,1,2,2],.5),1);
});
test('Six workplace scenarios contain evidence, alternatives, constraints, and transfer tasks',async()=>{
 const {systemsTickets}=await loadTs('data/systems-tickets.ts');assert.equal(systemsTickets.length,6);unique(systemsTickets.map(t=>t.id),'tickets');
 for(const t of systemsTickets){for(const k of ['id','title','role','brief','glossary','constraint','logs','transfer','handoff'])text(t[k],`${t.id}.${k}`);assert.ok(t.metrics.length>=3);assert.ok(t.probes.length>=2);unique(t.probes.map(p=>p.id),`${t.id}.probes`);for(const p of t.probes){text(p.label,'probe label');text(p.result,'probe evidence',15);}assert.ok(t.decisions.length>=3);unique(t.decisions.map(d=>d.id),`${t.id}.decisions`);assert.ok(t.decisions.some(d=>d.accepted)&&t.decisions.some(d=>!d.accepted));for(const d of t.decisions){text(d.lesson,'decision explanation',8);text(d.outcome,'decision outcome');assert.ok(d.metrics.length>=1);if(d.accepted)assert.ok(d.metrics.every(m=>m.pass),'accepted case contradicts metrics');}assert.equal(t.rubric.length,3,'UI checkbox schema expects three explicit rubric criteria');}
});
test('CPU lab executes, reports reproducible structure, and refuses overwrite / unbounded work',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mlsys-regression-'));try{
  const script=join(root,'public/systems/cpu_lab.py'),out=join(dir,'result.json');
  const first=spawnSync('python3',[script,'--size','4','--repeats','5','--output',out],{encoding:'utf8',timeout:30000});assert.equal(first.status,0,first.stderr);
  const bytes=await readFile(out),r=JSON.parse(bytes);assert.equal(r.schema,'mlsys-local-v1');assert.equal(r.source,'real-local-CPU-measurement');assert.equal(r.tests_passed,5);assert.equal(r.latency_ms.length,5);assert.equal(r.repeats,5);assert.ok(r.latency_ms.every(x=>Number.isFinite(x)&&x>=0));assert.equal(r.p95_ms,Math.max(...r.latency_ms));assert.ok(Math.abs(r.gradient.analytic-r.gradient.finite_difference)<1e-6);text(r.limitations,'measurement limitations');
  const overwrite=spawnSync('python3',[script,'--size','4','--repeats','5','--output',out],{encoding:'utf8',timeout:30000});assert.notEqual(overwrite.status,0);assert.equal(sha(await readFile(out)),sha(bytes),'failed overwrite changed existing evidence');
  const unbounded=spawnSync('python3',[script,'--size','9999','--output',join(dir,'bad.json')],{encoding:'utf8',timeout:30000});assert.notEqual(unbounded.status,0);assert.match(unbounded.stderr,/size/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('Eight-command CPU practice pack runs and distinguishes evidence sources',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mlsys-pack-regression-'));try{
  const script=join(root,'public/systems/lab_pack.py');
  for(const command of ['basics','gradient','matrix','trace','quantization','memory','queue','compare']){
   const out=join(dir,command+'.json');const run=spawnSync('python3',[script,command,'--size','4','--repeats','5','--output',out],{encoding:'utf8',timeout:30000});assert.equal(run.status,0,run.stderr);
   const result=JSON.parse(await readFile(out));assert.equal(result.schema,'mlsys-lab-pack-v1');assert.equal(result.command,command);assert.ok(result.tests_passed>0);text(result.source,'source');
   if(['matrix','compare'].includes(command))assert.equal(result.source,'real-local-CPU-measurement');else assert.notEqual(result.source,'real-local-CPU-measurement');
   assert.notEqual(spawnSync('python3',[script,command,'--output',out],{encoding:'utf8',timeout:30000}).status,0);
  }
  assert.notEqual(spawnSync('python3',['-O',script,'basics','--output',join(dir,'no-tests.json')],{encoding:'utf8'}).status,0);
  assert.notEqual(spawnSync('python3',[script,'queue','--rate','nan','--output',join(dir,'nan.json')],{encoding:'utf8'}).status,0);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('Real C++ project compiles and passes independent nonmultiple-shape tests',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mlsys-cpp-'));try{const out=join(dir,'result.json');const run=spawnSync('python3',[join(root,'public/systems/labs/cpp/run.py'),'all','--size','13','--elements','257','--workers','4','--tile','5','--repeats','3','--output',out],{encoding:'utf8',timeout:60000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});assert.equal(run.status,0,run.stderr);const result=JSON.parse(await readFile(out));assert.equal(result.status,'passed');assert.equal(result.labs.length,4);assert.equal(result.evidence_kind,'cpu-measured');}finally{await rm(dir,{recursive:true,force:true})}
});
test('Capability gates and project downloads are complete and separate evidence from certification',async()=>{
 const {capabilityLevels,practiceLabs,graduationProjects}=await loadTs('data/systems-practice-contracts.ts');
 assert.ok(capabilityLevels.length>=3);assert.ok(practiceLabs.length>=4);assert.ok(graduationProjects.length>=2);
 unique(practiceLabs.map(l=>l.id),'practice projects');const labs=new Set(practiceLabs.map(l=>l.id));
 for(const level of capabilityLevels){text(level.title,'level');assert.ok(level.evidence.length);for(const id of level.gateLabIds)assert.ok(labs.has(id)||graduationProjects.some(p=>p.id===id),'unknown gate '+id);}
 for(const lab of practiceLabs){for(const key of ['title','summary','evidenceType','verificationStatus','transfer'])text(lab[key],key);assert.ok(lab.steps.length);assert.ok(lab.acceptance.length);assert.ok(lab.limits.length);for(const href of [lab.packageHref,lab.guideHref].filter(Boolean)){assert.ok(href.startsWith('/systems/')&&!href.includes('..'));assert.ok((await readFile(join(root,'public',href))).length>100);}}
 for(const project of graduationProjects){assert.ok(project.criticalFailures.length);text(project.unseenTask,'unseen task');for(const id of project.requiredLabIds)assert.ok(labs.has(id));}
 const app=await readFile(join(root,'app/systems/systems-app.tsx'),'utf8');assert.ok(!app.includes('href="/legacy"'),'legacy is not the new main learning route');
});
test('Advanced packages have safe archives, syntax checks, and honest unavailable-dependency paths',async()=>{
 const check=spawnSync('python3',['-c',`import ast, pathlib, zipfile
root=pathlib.Path('public/systems')
for folder in ['cuda_project','framework_project','model_project']:
 p=root/folder
 for f in p.glob('*.py'): ast.parse(f.read_text())
 z=zipfile.ZipFile(p/(folder+'.zip'))
 assert z.testzip() is None
 for name in z.namelist():
  assert not name.startswith('/') and '..' not in pathlib.PurePosixPath(name).parts and '__pycache__' not in name
  assert pathlib.PurePosixPath(name).suffix in ['.py','.md','.cu','.txt']
print('archive and syntax checks passed')`],{cwd:root,encoding:'utf8'});assert.equal(check.status,0,check.stderr);
});
let failures=0;for(const[name,run]of tests){try{await run();console.log(`PASS ${name}`);}catch(error){failures++;console.error(`FAIL ${name}\n${error.stack??error}`);}}
console.log(`\n${tests.length-failures}/${tests.length} systems regression groups passed. UI, authentication boundary, and deployed data persistence require separate integration checks.`);
process.exitCode=failures?1:0;
