// Production artifact on a fresh, disposable D1. Never touches learner DBs.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {Miniflare} from 'miniflare';
import {execFileSync} from 'node:child_process';
const root=process.cwd(),temporary=mkdtempSync(resolve('.sites-runtime/api-check-'));
const wrapper=resolve(temporary,'worker.mjs');
writeFileSync(wrapper,`import app from '../../dist/server/index.js';
export default {async fetch(request,env,ctx){const url=new URL(request.url);const headers=new Headers(request.headers);for(const key of [...headers.keys()])if(key.startsWith('oai-authenticated-user-'))headers.delete(key);const user=headers.get('x-test-user');headers.delete('x-test-user');if(user==='A'||user==='B'){headers.set('oai-authenticated-user-id','qa-'+user);headers.set('oai-authenticated-user-email',user+'@example.test');}return app.fetch(new Request(request,{headers}),env,ctx)}};`);
const modules=[wrapper,...readdirSync('dist/server',{recursive:true}).filter(f=>/\.m?js$/.test(f)).map(f=>resolve('dist/server',f))].map(path=>({type:'ESModule',path}));
const mf=new Miniflare({modules,modulesRoot:root,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'qa-db'},d1Persist:resolve(temporary,'db')});
const results=[];const notebooks=resolve(temporary,'notebooks');mkdirSync(notebooks);
const solutionNotebooks=resolve(temporary,'notebooks-solutions');mkdirSync(solutionNotebooks);
function pass(name){results.push({name,passed:true});console.log('PASS '+name)}
async function request(user,path='/api/state',body,expected=200,headers={}){const r=await mf.dispatchFetch('http://localhost'+path,{method:body===undefined?'GET':'POST',headers:{...(user?{'x-test-user':user,'x-study-user-id':'qa-'+user}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});assert.equal(r.status,expected,(await r.clone().text()).slice(0,600));return r.headers.get('content-type')?.includes('json')?r.json():r.text()}
const state=user=>request(user);
try{
 const db=await mf.getD1Database('DB');
 for(const file of ['0000_abnormal_khan.sql','0001_volatile_the_twelve.sql','0002_minor_black_bolt.sql','0003_learning_evidence.sql','0004_autonomous_learning.sql','0005_research_protocols.sql']){const statements=readFileSync(resolve('drizzle',file),'utf8').split(';').map(s=>s.replace(/--> statement-breakpoint/g,'').trim()).filter(Boolean);await db.batch(statements.map(s=>db.prepare(s)));if(file==='0002_minor_black_bolt.sql')await db.prepare("INSERT INTO progress(user_id,lesson_id,note,score,best_score,practiced,completed,updated_at) VALUES('legacy','w01-d1','preserved legacy note',67,100,1,1,123)").run()}
 const legacy=await db.prepare("SELECT * FROM progress WHERE user_id='legacy'").first();assert.equal(legacy.note,'preserved legacy note');assert.equal(legacy.best_score,100);assert.equal(legacy.updated_at,123);assert.equal(legacy.assistance,'unrecorded');pass('additive migration preserves existing note, scores, completion and revision');
 pass('fresh D1 applies all six migrations');
 await request(null,'/api/state',undefined,401,{'oai-authenticated-user-id':'qa-A','oai-authenticated-user-email':'forged@example.test'});
 for(const path of ['/api/export','/api/notebook?id=w01-d1','/api/python/pyodide.js'])await request(null,path,undefined,401);
 pass('unauthenticated state/export/notebook/runtime refused; ingress fixture strips spoofed identity');
 let a=await state('A');assert.equal(a.progress.length,0);assert.equal((await state('B')).progress.length,0);
 await request('A','/api/state',{action:'note',lessonId:'w01-d1',note:'A-only',expectedUpdatedAt:0,user_id:'qa-B'});
 assert.equal((await state('B')).progress.length,0);assert.equal((await state('A')).progress[0].note,'A-only');pass('two users isolated; submitted user_id ignored');
 a=await state('A');const revision=a.progress[0].updated_at;
 const simultaneous=await Promise.all(['first','second'].map(note=>mf.dispatchFetch('http://localhost/api/state',{method:'POST',headers:{'x-test-user':'A','x-study-user-id':'qa-A','Content-Type':'application/json'},body:JSON.stringify({action:'note',lessonId:'w01-d1',note,expectedUpdatedAt:revision})})));
 assert.deepEqual(simultaneous.map(r=>r.status).sort(),[200,409]);pass('simultaneous stale note writes: one commit, one conflict');
 await request('A','/api/state',{action:'note',lessonId:'w01-d1',note:'old-tab'},428);
 await request('A','/api/state',{action:'note',lessonId:'w01-d1',note:'cross',expectedUpdatedAt:0},403,{origin:'https://evil.example'});
 await request('A','/api/state',{action:'note',lessonId:'w01-d1',note:'cross',expectedUpdatedAt:0},403,{'sec-fetch-site':'cross-site'});
 await request('A','/api/state',{action:'quiz',lessonId:'w01-d1',answers:[7],mode:'study'},400);
 await request('A','/api/state',{action:'note',lessonId:'w01-d1',note:'x'.repeat(20001),expectedUpdatedAt:0},400);
 const malformed=await mf.dispatchFetch('http://localhost/api/state',{method:'POST',headers:{'x-test-user':'A','x-study-user-id':'qa-A','Content-Type':'application/json'},body:'{'});assert.equal(malformed.status,400);
 const giant=await mf.dispatchFetch('http://localhost/api/state',{method:'POST',headers:{'x-test-user':'A','x-study-user-id':'qa-A','Content-Type':'application/json'},body:'x'.repeat(120001)});assert.equal(giant.status,413);
 pass('revision, cross-origin, answer, length, malformed JSON and request size validated');
 const unknown=await request('A','/api/state',{action:'diagnostic',answers:Array(12).fill(-1)});assert(Object.values(unknown.feedback.areas).every(a=>a.correct===0));pass('honest diagnostic accepts unknown without guessing');
 const curriculum=JSON.parse(readFileSync('data/curriculum.json','utf8')),all=curriculum.flatMap(w=>w.lessons),lesson=all[0],correct=lesson.quiz.map(q=>q.answer),wrong=correct.map(v=>(v+1)%4);
 let result=await request('A','/api/state',{action:'quiz',lessonId:lesson.id,answers:wrong,mode:'study',score:100,best_score:100,completed:1});assert.equal(result.feedback.score,0);assert.equal(result.state.progress[0].completed,0);
 result=await request('A','/api/state',{action:'quiz',lessonId:lesson.id,answers:correct,mode:'exam'});assert.equal(result.feedback.score,100);assert.equal(result.state.progress[0].completed,0);
 await request('A','/api/state',{action:'practice',lessonId:lesson.id,practiced:true,expectedUpdatedAt:result.state.progress[0].updated_at},400);
 result=await request('A','/api/state',{action:'practice',lessonId:lesson.id,practiced:true,assistance:'hinted',evidence:'actual QA evidence',expectedUpdatedAt:result.state.progress[0].updated_at});assert.equal(result.state.progress[0].completed,1);assert.equal(result.state.progress[0].assistance,'hinted');
 result=await request('A','/api/state',{action:'quiz',lessonId:lesson.id,answers:wrong,mode:'review'});assert.equal(result.state.progress[0].score,0);assert.equal(result.state.progress[0].best_score,100);assert.equal(result.state.progress[0].review_step,0);
 pass('server grades; concept-only does not complete; assistance evidence saved; latest failure retained');
 await db.prepare('UPDATE progress SET review_step=0,next_review=1 WHERE user_id=? AND lesson_id=?').bind('qa-A',lesson.id).run();
 const quizRequest=answers=>request('A','/api/state',{action:'quiz',lessonId:lesson.id,answers,mode:'review'});
 let attemptsBefore=await db.prepare("SELECT COUNT(*) AS n FROM attempts WHERE user_id='qa-A'").first();
 await Promise.all([quizRequest(correct),quizRequest(correct)]);
 let atomic=await db.prepare('SELECT * FROM progress WHERE user_id=? AND lesson_id=?').bind('qa-A',lesson.id).first();
 assert.equal(atomic.review_step,1);assert(atomic.next_review>Date.now()+2*86400000);
 assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM attempts WHERE user_id='qa-A'").first()).n,attemptsBefore.n+2);
 await quizRequest(correct);assert.equal((await db.prepare('SELECT review_step FROM progress WHERE user_id=? AND lesson_id=?').bind('qa-A',lesson.id).first()).review_step,1);
 await db.prepare('UPDATE progress SET next_review=1 WHERE user_id=? AND lesson_id=?').bind('qa-A',lesson.id).run();
 attemptsBefore=await db.prepare("SELECT COUNT(*) AS n FROM attempts WHERE user_id='qa-A'").first();
 await Promise.all([quizRequest(correct),quizRequest(wrong)]);
 atomic=await db.prepare('SELECT * FROM progress WHERE user_id=? AND lesson_id=?').bind('qa-A',lesson.id).first();
 assert.equal(atomic.best_score,100);assert.equal(atomic.review_step,0);assert.equal(atomic.completed,1);
 assert(atomic.next_review>Date.now()+23*3600000&&atomic.next_review<Date.now()+25*3600000);
 assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM attempts WHERE user_id='qa-A'").first()).n,attemptsBefore.n+2);
 pass('concurrent due reviews advance once; premature retries do not advance; failures reset atomically and all attempts remain');
 const bank=JSON.parse(execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',"import {checkpoints,checkpointQuestions} from './lib/checkpoints.ts'; console.log(JSON.stringify(checkpoints.map(c=>({week:c.week,answers:checkpointQuestions(c,'vision').map(q=>q.answer),branches:c.week===16?Object.fromEntries(['vision','timeseries','language'].map(t=>[t,checkpointQuestions(c,t).map(q=>q.answer)])):null}))));"],{encoding:'utf8'}));
 for(const stage of bank.filter(s=>s.week!==16)){result=await request('A','/api/state',{action:'checkpoint',week:stage.week,answers:stage.answers,score:0});assert.equal(result.feedback.score,100)}
 const branch=bank.find(s=>s.week===16);await request('A','/api/state',{action:'checkpoint',week:16,answers:branch.answers},400);
 for(const track of ['vision','timeseries','language']){a=await state('A');await request('A','/api/state',{action:'profile',hours:4,track,start_date:'2026-10-08',expectedUpdatedAt:a.profile.updated_at});result=await request('A','/api/state',{action:'checkpoint',week:16,answers:branch.branches[track],track});assert.equal(result.feedback.score,100)}
 assert.equal((await state('A')).checkpoints.filter(c=>c.week===16).length,3);pass('all 7 checkpoint weeks and three independent W16 tracks scored');
 const beforeTrackMismatch=await state('A');
 const mismatch=await request('A','/api/state',{action:'checkpoint',week:16,answers:branch.branches.vision,track:'vision'},409);assert.equal(mismatch.code,'assessment-context');assert.equal(mismatch.state.profile.track,'language');
 await request('A','/api/state',{action:'checkpoint',week:16,answers:branch.branches.language},400);
 const afterTrackMismatch=await state('A');assert.deepEqual(afterTrackMismatch.checkpoints,beforeTrackMismatch.checkpoints);assert.equal(afterTrackMismatch.attemptCount,beforeTrackMismatch.attemptCount);
 pass('stale W16 assessment track and missing context rejected without scores or attempts');
 a=await state('A');await request('A','/api/state',{action:'profile',hours:5,track:'vision',start_date:'2026-02-30',expectedUpdatedAt:a.profile.updated_at},400);
 const checks=curriculum[0].challenge.rubric.map(()=>true);
 await request('A','/api/state',{action:'project',week:1,body:'真实测试记录：此内容仅用于隔离的验收数据库，记录代码、输出和局限。',checks,submitted:true,expectedUpdatedAt:0},400);
 result=await request('A','/api/state',{action:'project',week:1,body:'真实测试记录：此内容仅用于隔离的验收数据库，记录代码、输出和局限。',checks,submitted:true,assistance:'independent',expectedUpdatedAt:0});assert.equal(result.state.projects[0].assistance,'independent');
 await request('A','/api/state',{action:'project',week:1,body:'stale',checks,submitted:false,expectedUpdatedAt:0},409);assert.equal((await state('B')).projects.length,0);pass('project validation, preservation and isolation');
 const templates=JSON.parse(readFileSync('data/research-templates.json','utf8'));
 for(const item of [...all,...templates.map(t=>({...t,id:'template-'+t.id}))]){const nb=await request('A','/api/notebook?id='+item.id);assert.equal(nb.nbformat,4);assert.equal(nb.metadata.ai_phd.contentVersion,'v1');assert(nb.cells.some(c=>c.metadata.tags?.includes('example')));assert(nb.cells.filter(c=>c.cell_type==='code').every(c=>c.execution_count===null&&c.outputs.length===0));writeFileSync(resolve(notebooks,item.id+'.ipynb'),JSON.stringify(nb))}
 await request('A','/api/notebook?id=missing',undefined,404);await request('A','/api/python/bad.exe',undefined,404);pass('all 173 authenticated Notebook exports valid structure, no fabricated outputs');
 for(const item of all){const nb=await request('A','/api/notebook?id='+item.id+'&solutions=1');assert.equal(nb.metadata.ai_phd.includesReferenceSolution,true);assert.equal(nb.cells.filter(c=>c.metadata.tags?.includes('reference-solution')).length,[...item.practice.solution.matchAll(/```python\s*\n([\s\S]*?)```/g)].length);writeFileSync(resolve(solutionNotebooks,item.id+'.ipynb'),JSON.stringify(nb))}
 pass('all 170 explicitly requested reference-solution Notebook variants export actual fenced code');
 const backup=await request('A','/api/export');assert.equal(backup.format,'ai-phd-backup-v3');assert.equal(backup.attempts.length,backup.attemptCount);assert(backup.attempts.every(r=>r.content_version==='v1'));assert.equal((await request('B','/api/export')).attempts.length,0);pass('complete backup includes all attempts, assistance and versions; other user empty');
 writeFileSync('verification/api-validation.json',JSON.stringify({verifiedAt:new Date().toISOString(),scope:'built production Worker + fresh isolated D1; ingress auth simulated, local trusted-ingress fixture; production login is outside this test',passed:results.length,results,notebooksDirectory:notebooks,solutionNotebooksDirectory:solutionNotebooks},null,2)+'\n');
}catch(error){writeFileSync('verification/api-validation.json',JSON.stringify({verifiedAt:new Date().toISOString(),results,error:String(error)},null,2));throw error}
finally{await mf.dispose()}
