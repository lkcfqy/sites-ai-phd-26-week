// Real built Worker, fresh local D1, and boundary cases for the guided forms.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {Miniflare} from 'miniflare';
import {blankReport,reportManifest,manifestDraft,predictionCSV,importManifest} from '../lib/report-form.ts';
import {evidenceFields,evidenceValues} from '../lib/evidence-form.ts';
import {reviewQueue} from '../lib/review-queue.ts';
const results=[],pass=name=>{results.push(name);console.log('PASS '+name)};
const manifest={scope:'method-adaptation',codeSha256:'b'.repeat(64),dataSha256:'a'.repeat(64),trainIds:['train-01'],validationIds:['valid-01'],predictions:[{sampleId:'test-01',truth:1,prediction:'1'},{sampleId:'test-02',truth:'01',prediction:'01'}],candidates:[{id:'baseline',status:'completed',validationScore:.7,selected:true},{id:'failed-candidate',status:'failed',validationScore:null,selected:false}],limits:'隔离测试使用的示例材料，未运行研究实验，不代表真实研究成果。'};
assert.deepEqual(JSON.parse(JSON.stringify(reportManifest(manifestDraft(manifest),'macro-F1'))),manifest);
assert.deepEqual(importManifest(JSON.stringify({manifest})),manifestDraft(manifest));
assert.throws(()=>reportManifest(blankReport(),'macro-F1'));
assert.throws(()=>reportManifest({...manifestDraft(manifest),predictions:[{sampleId:'x',truth:'',prediction:'1',truthType:'number',predictionType:'number'}]},'MAE'),/有效数值/);
assert.throws(()=>reportManifest({...manifestDraft(manifest),predictions:[{sampleId:'x',truth:'',prediction:'',truthType:'text',predictionType:'text'}]},'accuracy'));
pass('guided report round trip preserves typed labels, failed/null candidates; blank or invalid input rejected');
const csv=predictionCSV('\uFEFFsampleId,truth,prediction\r\n"id,1","class ""A""","class ""A"""\r\nid2,01,01\r\n','text');
assert.equal(csv[0].sampleId,'id,1');assert.equal(csv[0].truth,'class "A"');assert.equal(csv[1].truth,'01');
for(const text of ['sampleId,truth,prediction\nx,NaN,1','sampleId,truth,prediction\nx,,1','sampleId,truth,prediction\nx,1,1\nx,2,2','sampleId,truth,prediction\nx,"open,1','sampleId,truth,prediction\nx,1,1,extra'])assert.throws(()=>predictionCSV(text,'number'));
assert.equal(predictionCSV('truth,prediction,sampleId\n1,2,test','number')[0].sampleId,'test');
pass('CSV handles BOM, CRLF, quoting, column order and text labels; malformed/nonfinite/duplicate input rejected');
assert.throws(()=>evidenceValues([{key:'n',label:'数量',type:'number',requirement:''}],{n:''}),/有效数值/);
assert.equal(evidenceValues([{key:'n',label:'数量',type:'number',requirement:''}],{n:'0'}).n,0);
const curriculum=JSON.parse(readFileSync('data/curriculum.json')),lessons=curriculum[0].lessons;
const sample={profile:{track:'undecided'},progress:[{lesson_id:lessons[0].id,next_review:1}],practiceRuns:[{id:'a',lesson_id:lessons[0].id,status:'result-checked',created_at:3,next_retest:2},{id:'hidden',lesson_id:'w13-v1',status:'verified',created_at:3,next_retest:1}]};
assert.deepEqual(reviewQueue(sample,lessons,10).map(item=>item.kind),['review','retest']);
sample.practiceRuns.push({id:'b',lesson_id:lessons[0].id,status:'failed',created_at:4,next_retest:0});assert.equal(reviewQueue(sample,lessons,10).length,1);
sample.practiceRuns[2].status='imported';assert.equal(reviewQueue(sample,lessons,10).length,1);
pass('review queue combines both task kinds, follows latest result and selected path, excludes imported passes');

const root=process.cwd();mkdirSync('.sites-runtime',{recursive:true});const temp=mkdtempSync(resolve('.sites-runtime/usability-check-')),wrapper=resolve(temp,'worker.mjs');
writeFileSync(wrapper,`import app from '../../dist/server/index.js';export default {async fetch(request,env,ctx){const headers=new Headers(request.headers);for(const key of [...headers.keys()])if(key.startsWith('oai-authenticated-user-'))headers.delete(key);const user=headers.get('x-test-user');headers.delete('x-test-user');if(user==='A'||user==='B'){headers.set('oai-authenticated-user-id','qa-'+user);headers.set('oai-authenticated-user-email',user+'@example.test')}return app.fetch(new Request(request,{headers}),env,ctx)}};`);
const modules=[wrapper,...readdirSync('dist/server',{recursive:true}).filter(file=>/\.m?js$/.test(file)).map(file=>resolve('dist/server',file))].map(path=>({type:'ESModule',path}));
const mf=new Miniflare({modules,modulesRoot:root,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'usability'},d1Persist:resolve(temp,'db')});
async function request(user,path,body,status=200,headers={}){const response=await mf.dispatchFetch('http://localhost'+path,{method:body===undefined?'GET':'POST',headers:{...(user?{'x-test-user':user,'x-study-user-id':'qa-'+user}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,status,JSON.stringify(data).slice(0,500));return data;}
try{
 const db=await mf.getD1Database('DB');for(const file of readdirSync('drizzle').filter(file=>/^\d+.*\.sql$/.test(file)).sort()){const parts=readFileSync(resolve('drizzle',file),'utf8').split(';').map(part=>part.replace(/--> statement-breakpoint/g,'').trim()).filter(Boolean);await db.batch(parts.map(part=>db.prepare(part)))}
 await request('A','/api/state');await request('B','/api/state');
 const spec=JSON.parse(readFileSync('data/auto-tasks.json'))[0],task=await request('A','/api/autonomous?lesson='+spec.lessonId);
 const run=(await request('A','/api/autonomous',{action:'submit',instanceId:task.id,code:'def solve(data): return 42',outputs:[42,42,42]})).run;
 const history='/api/autonomous?history=1&lesson='+spec.lessonId;
 await request(null,history,undefined,401);await request('B',history,undefined,409,{'x-study-user-id':'qa-A'});
 assert.equal((await request('B',history)).runs.length,0);await request('B',history+'&run='+run.id,undefined,404);
 await request('A',history.replace(spec.lessonId,'no-such-lesson'),undefined,404);await request('A',history+'&cursor=invalid',undefined,400);
 const detail=(await request('A',history+'&run='+run.id)).run;assert.equal(detail.code,'def solve(data): return 42');assert.equal(detail.kind,'code');assert.equal(JSON.parse(detail.feedback_json).taskSnapshot.inputs.length,3);assert.equal(detail.user_id,undefined);
 pass('history and run details require matching account, never expose another user, restore actual code and failed inputs');
 const count=()=>db.prepare('SELECT COUNT(*) AS n FROM task_instances').first();const before=await count();
 const insert=db.prepare('INSERT INTO practice_runs(user_id,id,instance_id,lesson_id,task_version,code_sha,code,status,provenance,score,feedback_json,result_json,created_at,next_retest) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
 await db.batch(Array.from({length:23},(_,index)=>insert.bind('qa-A','history-'+String(index).padStart(2,'0'),'instance-'+index,spec.lessonId,'test-history','c'.repeat(64),'saved-'+index,index===22?'imported':'failed',index===22?'imported':'browser',0,'{}','[]',1,0)));
 const ids=[];let cursor=null;do{const page=await request('A',history+(cursor?'&cursor='+encodeURIComponent(cursor):''));assert(page.runs.length<=10);assert(page.runs.every(row=>!('code' in row)&&!('feedback_json' in row)));ids.push(...page.runs.map(row=>row.id));cursor=page.nextCursor;}while(cursor);
 assert.equal(ids.length,24);assert.equal(new Set(ids).size,24);assert.deepEqual(await count(),before);
 assert.equal((await request('A',history+'&run=history-22')).run.status,'imported');
 pass('stable paginated history has no missing/duplicate tied timestamps, bounded summaries, no task issuance or imported promotion');
 const tasks=JSON.parse(readFileSync('data/auto-evidence.json'));
 for(const spec of tasks){
  const task=await request('A','/api/autonomous?lesson='+spec.lessonId),fields=evidenceFields(spec);assert.deepEqual(task.fields,JSON.parse(JSON.stringify(fields)));
  const evidence=Object.fromEntries(fields.map(field=>{let value='隔离测试材料示例，不代表真实研究结果';if(field.type==='url')value='https://example.test/source';if(field.choices)value=field.choices[0];if(field.type==='number'){const rule=spec.rules.find(rule=>rule.field===field.key&&rule.type==='numberRange');value=rule?.min??1;}if(field.type==='list')value=field.key==='runRefs'?[]:field.suggestions??Array.from({length:field.minItems??1},()=>field.itemKeys?Object.fromEntries(field.itemKeys.map(key=>[key,'隔离测试材料'])):'隔离测试材料');return [field.key,value]}));
  const checked=await request('A','/api/autonomous',{action:'evidence',instanceId:task.id,evidence});assert.equal(checked.run.status,'evidence-checked',spec.lessonId+JSON.stringify(checked.run.feedback));
 }
 const measured=await request('A','/api/autonomous?lesson='+tasks[0].lessonId);const invalid=await request('A','/api/autonomous',{action:'evidence',instanceId:measured.id,evidence:{evidenceStatus:'measured',runRefs:[]}});assert.equal(invalid.run.status,'failed');
 pass('all 44 evidence forms expose matching rules and accept honest plans with empty run references; missing measured evidence fails');
 const route=JSON.parse(readFileSync('data/paper-routes.json')).routes[0],protocol={track:'vision',question:'隔离测试中的有限研究问题与验证目标',sourceUrl:route.paper.sourceUrl,dataSha256:'a'.repeat(64),splitRule:'训练验证测试使用各自唯一编号并固定',primaryMetric:'macro-F1',selectionRule:'验证集选择候选并保留失败方案记录',budgetMinutes:30,testPolicy:'冻结后记录测试启封与历史接触说明',deviations:'教学用模拟材料，不声称论文复现或创新'};
 const frozen=await request('A','/api/research',{action:'freeze',protocol});await request('A','/api/research',{action:'open-test',id:frozen.id});
 await request('A','/api/research',{action:'report',id:frozen.id,manifest:{...manifest,trainIds:['test-01']}},400);
 const saved=await request('A','/api/research',{action:'report',id:frozen.id,manifest:reportManifest(manifestDraft(manifest),'macro-F1')});assert(saved.report.metric.value<1);assert.equal(saved.report.status,'manifest-checked');
 await request('A','/api/research',{action:'report',id:frozen.id,manifest},409);
 pass('guided report persists through frozen/open protocol, typed metric calculation, overlap and immutable-report guards');
 mkdirSync('verification/usability',{recursive:true});writeFileSync('verification/usability/api-and-forms.json',JSON.stringify({verifiedAt:new Date().toISOString(),scope:'Built Worker + isolated local D1; fixture materials only; no production records',passed:true,checks:results},null,2));
}finally{await mf.dispose()}
