// Verify the checker and its visual correspondence, not learner independence.
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {inspectTensorReceipt} from '../lib/systems-tensor-evidence.ts';
import {tensorExample} from '../lib/systems-tensor-model.ts';

const python=process.env.SYSTEMS_NUMPY_PYTHON??'python3';
const env={...process.env,PYTHONDONTWRITEBYTECODE:'1',OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1',MKL_NUM_THREADS:'1'};
const folder=await mkdtemp(join(tmpdir(),'mlsys-tensor-check-')),project=join(folder,'lab');
const reference=await readFile('scripts/fixtures/tensor-reference.py','utf8');
const tests=[];let serial=0;
function test(name,fn){tests.push([name,fn])}
async function run(task='attention',variant='practice',seed=137,flags=[]){
 const output=join(folder,`receipt-${serial++}.json`);
 const process=spawnSync(python,[...flags,join(project,'run.py'),task,'--variant',variant,'--seed',String(seed),'--output',output],{encoding:'utf8',env,timeout:15000,maxBuffer:100000});
 assert.ifError(process.error);
 const raw=await readFile(output,'utf8');return {process,raw,report:inspectTensorReceipt(raw),output};
}
test('Browser intermediates and finite-difference example agree with actual NumPy CPU execution',()=>{
 const code=`import json, runpy, sys, numpy as np
impl=runpy.run_path(sys.argv[1])
f=json.load(open('public/systems/tensor_lab/cases.json'))
x,w,b,dy=[np.array(f[k],dtype=np.float64) for k in ['tokens','weights','bias','upstream']]
y=impl['linear'](x,w,b)
dx,dw,db=impl['linear_backward'](x,w,dy)
q,k,v=[impl['linear'](x,np.array(f[name]),np.zeros(2)) for name in ['query_weights','key_weights','value_weights']]
s,p,o=impl['attention'](q,k,v,np.tri(3,dtype=bool))
print(json.dumps({name:value.tolist() for name,value in dict(y=y,dx=dx,dw=dw,db=db,scores=s,probabilities=p,output=o).items()}))`;
 const result=spawnSync(python,['-B','-c',code,resolve('scripts/fixtures/tensor-reference.py')],{encoding:'utf8',env,timeout:15000});assert.equal(result.status,0,result.stderr);
 const measured=JSON.parse(result.stdout),model=tensorExample();
 function close(a,b){if(Array.isArray(a)){assert.equal(a.length,b.length);a.forEach((value,i)=>close(value,b[i]))}else assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`)}
 for(const key of Object.keys(measured))close(model[key],measured[key]);
 assert.ok(Math.abs(model.finiteDifference-model.dw[0][0])<1e-6);
 close(tensorExample(true,3).output.slice(0,2),model.output.slice(0,2));
 assert.notDeepEqual(tensorExample(false,3).output[0],tensorExample(false,1).output[0]);
});
test('TODO scaffold fails all 20 groups; receipts reject forged counts, omissions, duplicates and status',async()=>{
 const {process,report,raw,output}=await run();assert.equal(process.status,1);assert.equal(report.checks.total,20);assert.equal(report.checks.passed,0);assert.equal(report.status,'needs-work');assert.ok(raw.length<15000);
 for(const changed of [
  {...report,status:'passed'}, {...report,source:'real-GPU-measurement'}, {...report,numpy:null},
  {...report,checks:{...report.checks,passed:20}},
  {...report,checks:{...report.checks,cases:report.checks.cases.map((c,i)=>i===1?report.checks.cases[0]:c)}},
  {...report,checks:{total:0,passed:0,failed:0,cases:[]}},
  {...report,seed:-1},
 ])assert.throws(()=>inspectTensorReceipt(JSON.stringify(changed)));
 assert.throws(()=>inspectTensorReceipt('{'));assert.throws(()=>inspectTensorReceipt('x'.repeat(15001)));
 const overwrite=spawnSync(python,[join(project,'run.py'),'attention','--output',output],{encoding:'utf8',env,timeout:15000});assert.notEqual(overwrite.status,0);assert.match(overwrite.stderr,/输出已存在/);assert.equal(await readFile(output,'utf8'),raw);
});
test('Reference passes 5/10/15/20 cumulative groups, practice plus three reproducible transfer seeds',async()=>{
 await writeFile(join(project,'learner.py'),reference);
 for(const [task,count]of [['arrays',5],['linear',10],['gradient',15],['attention',20]]){
  for(const [variant,seed]of [['practice',137],['transfer',913],['transfer',2718],['transfer',0]]){
   const {process,report,raw}=await run(task,variant,seed);assert.equal(process.status,0,process.stdout+process.stderr);assert.equal(report.checks.total,count);assert.equal(report.checks.passed,count);assert.equal(report.status,'passed');assert.equal(report.numpy,'2.3.5');
   const original=JSON.parse(raw);assert.deepEqual(original.example.x,[[1,0],[0,1],[1,1]]);
   if(task==='attention')assert.deepEqual(original.example.output[0],[10,0]);
  }
 }
});
test('Eight mutations expose aliasing, wrong broadcast axis, gradient averaging/axis, scale, mask, softmax axis and overflow',async()=>{
 const mutations=[
  ['alias',reference.replace('return _real(rows, 2)','return rows if isinstance(rows, np.ndarray) else _real(rows, 2)'),'ArraysChecks.test_copy'],
  ['broadcast',reference.replace('_real(bias, 1)','np.array(bias, dtype=np.float64)').replace(' or bias.shape != (weights.shape[1],)',''),'LinearChecks.test_bias_axis'],
  ['gradient mean',reference.replace('upstream.sum(axis=0)','upstream.mean(axis=0)'),'GradientChecks.test_no_extra_average'],
  ['gradient axis',reference.replace('upstream.sum(axis=0)','upstream.sum(axis=1)'),'GradientChecks.test_scalar_oracle'],
  ['scale',reference.replace('np.sqrt(query.shape[1])','np.sqrt(len(query))'),'AttentionChecks.test_scalar_oracle'],
  ['mask',reference.replace('np.where(allowed, scores, -np.inf)','scores.copy()'),'AttentionChecks.test_mask_and_future'],
  ['softmax axis',reference.replace('numerators.sum(axis=1, keepdims=True)','numerators.sum(axis=0, keepdims=True)'),'AttentionChecks.test_scalar_oracle'],
  ['stability',reference.replace('np.exp(masked - masked.max(axis=1, keepdims=True))','np.exp(masked)'),'AttentionChecks.test_stability'],
 ];
 for(const [label,code,expected]of mutations){assert.notEqual(code,reference);await writeFile(join(project,'learner.py'),code);const {process,report}=await run();assert.equal(process.status,1,label);assert.ok(report.checks.cases.some(c=>c.id===expected&&!c.passed),label+' lacks expected diagnostic')}
});
test('Infinite loop terminates with a zero-check timeout, never a fabricated pass',async()=>{
 await writeFile(join(project,'learner.py'),'def as_tokens(rows):\n    while True: pass\n');
 const {process,report}=await run('arrays');assert.equal(process.status,1);assert.equal(report.status,'timed-out');assert.equal(report.checks.total,0);assert.match(report.diagnostic,/8 秒/);
});
test('Interpreter without site packages produces dependency-unavailable and zero executed checks',async()=>{
 const {process,report}=await run('arrays','practice',137,['-S']);assert.equal(process.status,2);assert.equal(report.status,'dependency-unavailable');assert.equal(report.numpy,null);assert.equal(report.checks.total,0);
 assert.throws(()=>inspectTensorReceipt(JSON.stringify({...report,status:'passed'})));
});
test('ZIP has exactly six matching teaching sources, no answers/results; extracted TODO actually fails',async()=>{
 const extracted=join(folder,'extracted');
 const code=`import pathlib,zipfile,sys
root=pathlib.Path('public/systems/tensor_lab')
with zipfile.ZipFile(root/'tensor_lab.zip') as z:
 assert set(z.namelist())=={'README.md','learner.py','run.py','test_lab.py','cases.json','requirements.txt'}
 assert z.testzip() is None
 for name in z.namelist(): assert z.read(name)==(root/name).read_bytes(),name
 z.extractall(sys.argv[1])`;
 const checked=spawnSync(python,['-B','-c',code,extracted],{encoding:'utf8',env});assert.equal(checked.status,0,checked.stderr);
 const output=join(folder,'extracted-before.json');const executed=spawnSync(python,[join(extracted,'run.py'),'arrays','--output',output],{encoding:'utf8',env,timeout:15000});assert.equal(executed.status,1);assert.equal(inspectTensorReceipt(await readFile(output,'utf8')).checks.passed,0);
});
try{
 await cp('public/systems/tensor_lab',project,{recursive:true});let failed=0;
 for(const[name,fn]of tests){try{await fn();console.log('PASS '+name)}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack)}}
 console.log(`${tests.length-failed}/${tests.length} tensor regression groups passed; only correctness checks on synthetic CPU data, no learner certification.`);process.exitCode=failed?1:0;
}finally{await rm(folder,{recursive:true,force:true})}
