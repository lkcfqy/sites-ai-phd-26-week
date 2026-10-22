// QA identities on the actual built Worker, fresh D1; never touches Sites records.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Miniflare} from 'miniflare';
const baseline=process.argv.includes('--baseline'),root=process.cwd();
mkdirSync('.sites-runtime',{recursive:true});
const temporary=mkdtempSync(resolve('.sites-runtime/account-context-')),wrapper=resolve(temporary,'worker.mjs');
writeFileSync(wrapper,`import app from '../../dist/server/index.js';
export default {async fetch(request,env,ctx){const headers=new Headers(request.headers);for(const key of [...headers.keys()])if(key.startsWith('oai-authenticated-user-'))headers.delete(key);const identity=headers.get('x-qa-identity');headers.delete('x-qa-identity');if(identity==='A'||identity==='B'){headers.set('oai-authenticated-user-id','qa-'+identity);headers.set('oai-authenticated-user-email',identity+'@example.test');}return app.fetch(new Request(request,{headers}),env,ctx)}};`);
const modules=[wrapper,...readdirSync('dist/server',{recursive:true}).filter(f=>/\.m?js$/.test(f)).map(f=>resolve('dist/server',f))].map(path=>({type:'ESModule',path}));
const mf=new Miniflare({modules,modulesRoot:root,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'qa-account-context'},d1Persist:resolve(temporary,'db')});
const results=[];
async function request(identity,expected=identity,body,path='/api/state'){
 const response=await mf.dispatchFetch('http://localhost'+path,{method:body===undefined?'GET':'POST',headers:{'x-qa-identity':identity,...(expected?{'x-study-user-id':'qa-'+expected}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:response.status,body:await response.json()};
}
function pass(name){results.push({name,passed:true});console.log('PASS '+name)}
try{
 const db=await mf.getD1Database('DB');
 for(const file of ['0000_abnormal_khan.sql','0001_volatile_the_twelve.sql','0002_minor_black_bolt.sql','0003_learning_evidence.sql','0004_autonomous_learning.sql','0005_research_protocols.sql']){const sql=readFileSync('drizzle/'+file,'utf8').split(';').map(s=>s.replace(/--> statement-breakpoint/g,'').trim()).filter(Boolean);await db.batch(sql.map(s=>db.prepare(s)))}
 assert.equal((await request('A')).status,200);assert.equal((await request('B')).status,200);
 const payload={action:'project',week:1,body:'A-only unsaved project from a tab opened before account switch',checks:[false,false,false,false],submitted:false,assistance:'unrecorded',expectedUpdatedAt:0};
 const read=await request('B','A'),write=await request('B','A',payload),b=await request('B');
 if(baseline){
  const bug=write.status===200&&b.body.projects.some(p=>p.body===payload.body);
  const report={verifiedAt:new Date().toISOString(),scope:'Actual old production build + fresh QA D1; stale A tab context, trusted current identity B, new project version0',staleReadStatus:read.status,staleWriteStatus:write.status,aDraftWronglySavedToB:bug,confirmed:bug};
  writeFileSync('verification/account-context-baseline.json',JSON.stringify(report,null,2)+'\n');assert(bug,'Expected baseline reproduction before fix');console.log('CONFIRMED stale A project is stored under B in old build');
 }else{
  assert.equal(read.status,409);assert.equal(write.status,409);assert.equal(read.body.code,'account-context');assert.equal(write.body.code,'account-context');assert(!('state' in read.body));assert(!('state' in write.body));assert.equal(b.body.projects.length,0);pass('account switch refuses stale read/write without exposing B state or saving A draft');
  assert.equal((await request('B',null)).status,428);assert.equal((await request('B',null,payload)).status,428);pass('missing account context rejected before state access or write');
  const attempts=b.body.attemptCount;
  for(const body of [{action:'start',lessonId:'w01-d1'},{action:'note',lessonId:'w01-d1',note:'A-draft',expectedUpdatedAt:0},{action:'quiz',lessonId:'w01-d1',answers:[0,0,0],mode:'study'},{action:'diagnostic',answers:Array(12).fill(-1)},{action:'checkpoint',week:4,track:'common',answers:Array(6).fill(0)},{action:'practice',lessonId:'w01-d1',practiced:true,assistance:'independent',evidence:'A evidence',expectedUpdatedAt:0},{action:'profile',hours:5,track:'vision',start_date:'2026-10-08',expectedUpdatedAt:b.body.profile.updated_at}])assert.equal((await request('B','A',body)).status,409);
  const after=await request('B');assert.equal(after.body.attemptCount,attempts);assert.equal(after.body.progress.length,0);assert.equal(after.body.projects.length,0);assert.equal(after.body.checkpoints.length,0);assert.equal(after.body.profile.hours,4);pass('all state actions reject stale identity with no B records or scores');
  assert.equal((await request('A','A',payload)).status,200);assert.equal((await request('B')).body.projects.length,0);assert.equal((await request('A')).body.projects[0].body,payload.body);pass('returning to A accepts its draft while B remains isolated');
  const exported=await request('B','A',undefined,'/api/export');assert.equal(exported.status,409);assert(!('progress' in exported.body));
  const staleLink=await request('B',null,undefined,'/api/export?account=qa-A');assert.equal(staleLink.status,409);assert(!('progress' in staleLink.body));
  assert.equal((await request('B',null,undefined,'/api/export')).status,428);
  const ownLink=await request('B',null,undefined,'/api/export?account=qa-B');assert.equal(ownLink.status,200);assert.equal(ownLink.body.format,'ai-phd-backup-v3');assert.equal(ownLink.body.projects.length,0);
  pass('backup rejects stale header/query or missing context; matching account link exports only its records');
  const report={verifiedAt:new Date().toISOString(),scope:'Built production Worker + fresh isolated D1; trusted A/B ingress fixture, not real Sites login',passed:true,results,sourceSHA256:Object.fromEntries(['app/api/state/route.ts','app/api/export/route.ts','lib/account-context.ts'].map(f=>[f,createHash('sha256').update(readFileSync(f)).digest('hex')]))};writeFileSync('verification/account-context-validation.json',JSON.stringify(report,null,2)+'\n');
 }
}finally{await mf.dispose()}
