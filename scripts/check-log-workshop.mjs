// Regression of the teaching checker itself. Reference execution is not learner certification.
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {inspectLogReceipt} from '../lib/systems-log-evidence.ts';
import {stages} from '../data/mlsystems-curriculum.ts';

const directory=await mkdtemp(join(tmpdir(),'mlsys-log-regression-'));
const project=join(directory,'lab');
const reference=`import math
def valid(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0
def mean_ms(values):
    if not values or not all(valid(x) for x in values): raise ValueError('invalid samples')
    return sum(values) / len(values)
def summarize(records, threshold_ms=100):
    if not valid(threshold_ms): raise ValueError('invalid threshold')
    success, errors, invalid = [], 0, 0
    for row in records:
        if not isinstance(row, dict) or row.get('status') not in ['ok', 'error'] or not valid(row.get('latency_ms')):
            invalid += 1
        elif row['status'] == 'error': errors += 1
        else: success.append(row['latency_ms'])
    count = len(success) + errors
    return dict(rows_total=len(records), valid_count=count, invalid_count=invalid,
                success_count=len(success), error_count=errors, error_rate=errors/count if count else None,
                success_latencies_ms=success, mean_ms=mean_ms(success) if success else None,
                over_threshold_count=sum(x > threshold_ms for x in success))
def nearest_rank(values, probability):
    if not values or not all(valid(x) for x in values) or not valid(probability) or not 0 < probability <= 1: raise ValueError('invalid percentile')
    return sorted(values)[math.ceil(probability * len(values))-1]
`;
const tests=[];
function test(name,fn){tests.push([name,fn])}
let serial=0;
async function run(task='tail',variant='practice'){
 const output=join(directory,`receipt-${serial++}.json`);
 const process=spawnSync('python3',[join(project,'run.py'),task,'--variant',variant,'--output',output],{encoding:'utf8',timeout:12000,maxBuffer:100000});
 assert.ifError(process.error);
 const raw=await readFile(output,'utf8');
 return {process,raw,report:inspectLogReceipt(raw),output};
}
test('First experiment record is real JSON a beginner can save and parse without prior JSON code',()=>{
 const lesson=stages.flatMap(stage=>stage.lessons).find(lesson=>lesson.id==='s0-l4');
 const snippet=lesson.workedExample.match(/\{[\s\S]*\}/)?.[0];assert.ok(snippet);
 const manifest=JSON.parse(snippet);assert.deepEqual(manifest.input,[8,15,22]);assert.equal(manifest.result_mean,15);assert.equal(manifest.unit,'ms');assert.match(manifest.limitation,/不是硬件测量/);
});
test('TODO scaffold fails all 15 groups, including subTest failures; failure receipts remain inspectable',async()=>{
 const {process,report,raw,output}=await run();assert.equal(process.status,1);assert.equal(report.status,'needs-work');assert.equal(report.checks.total,15);assert.equal(report.checks.passed,0);assert.equal(report.checks.failed,15);
 const retry=spawnSync('python3',[join(project,'run.py'),'tail','--output',output],{encoding:'utf8',timeout:12000});assert.notEqual(retry.status,0);assert.match(retry.stderr,/输出已存在/);assert.equal(await readFile(output,'utf8'),raw);
 for(const changed of [
  {...report,checks:{...report.checks,passed:15}},
  {...report,status:'passed'},
  {...report,checks:{total:0,passed:0,failed:0,cases:[]}},
  {...report,checks:{...report.checks,cases:report.checks.cases.map((c,i)=>i===1?report.checks.cases[0]:c)}},
  {...report,source:'real-GPU-measurement'},
 ])assert.throws(()=>inspectLogReceipt(JSON.stringify(changed)));
 assert.throws(()=>inspectLogReceipt('{'));assert.throws(()=>inspectLogReceipt('x'.repeat(15001)));
});
test('Reference code passes cumulative checks for all 3 tasks × 2 fixture variants',async()=>{
 await writeFile(join(project,'learner.py'),reference);
 for(const [task,count]of [['mean',5],['records',10],['tail',15]])for(const variant of ['practice','transfer']){
  const {process,report}=await run(task,variant);assert.equal(process.status,0,process.stdout);assert.equal(report.status,'passed');assert.equal(report.checks.total,count);assert.equal(report.checks.passed,count);
 }
});
test('Independent mutations expose denominator, strict threshold, bool, rank, and input-mutation defects',async()=>{
 for(const [label,code,expected]of [
  ['fixed mean denominator',reference.replace('sum(values) / len(values)','sum(values) / 3'),'MeanChecks.test_count_and_zero'],
  ['wrong error denominator',reference.replace('errors/count if count','errors/len(records) if count'),'RecordChecks.test_fixture'],
  ['inclusive threshold',reference.replace('x > threshold_ms','x >= threshold_ms'),'RecordChecks.test_strict_threshold'],
  ['bool accepted',reference.replace(' and not isinstance(value, bool)',''),'MeanChecks.test_invalid_values'],
  ['floor rank',reference.replace('math.ceil(probability','math.floor(probability'),'TailChecks.test_fixture_tail'],
  ['in-place sorting',reference.replace('return sorted(values)[','values.sort()\n    return values['),'TailChecks.test_nearest_rank'],
 ]){
  await writeFile(join(project,'learner.py'),code);
  const {process,report}=await run();assert.equal(process.status,1,label);assert.equal(report.status,'needs-work');assert.ok(report.checks.cases.some(c=>c.id===expected&&!c.passed),`${label}: expected meaningful feedback`);
 }
});
test('Infinite learner loops time out and preserve a nonpassing, zero-check diagnostic',async()=>{
 await writeFile(join(project,'learner.py'),'def mean_ms(values):\n    while True: pass\n');
 const {process,report}=await run('mean');assert.equal(process.status,1);assert.equal(report.status,'timed-out');assert.equal(report.checks.total,0);assert.match(report.diagnostic,/5 秒/);
 assert.throws(()=>inspectLogReceipt(JSON.stringify({...report,status:'passed'})));
});
test('Download contains exact current teaching sources, no receipts; extracted scaffold actually executes',async()=>{
 const script=`import pathlib, zipfile, sys
source=pathlib.Path('public/systems/log_lab')
with zipfile.ZipFile(source/'log_lab.zip') as z:
 assert set(z.namelist()) == {'README.md','learner.py','run.py','test_lab.py','cases.json'}
 assert z.testzip() is None
 for name in z.namelist(): assert z.read(name) == (source/name).read_bytes(), name
 z.extractall(sys.argv[1])
`;
 const extracted=join(directory,'extracted');
 const zipCheck=spawnSync('python3',['-c',script,extracted],{encoding:'utf8'});assert.equal(zipCheck.status,0,zipCheck.stderr);
 const output=join(directory,'archive-receipt.json');
 const archiveRun=spawnSync('python3',[join(extracted,'run.py'),'mean','--output',output],{encoding:'utf8',timeout:12000});assert.equal(archiveRun.status,1);assert.equal(inspectLogReceipt(await readFile(output,'utf8')).checks.passed,0);
});
try{
 await cp('public/systems/log_lab',project,{recursive:true});
 let failed=0;
 for(const[name,fn]of tests){try{await fn();console.log('PASS '+name)}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack)}}
 console.log(`${tests.length-failed}/${tests.length} log-workshop regression groups passed; execution checks do not certify independent learner work.`);
 process.exitCode=failed?1:0;
}finally{await rm(directory,{recursive:true,force:true})}
