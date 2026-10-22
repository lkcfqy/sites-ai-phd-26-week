// Runs the actual learning routes/storage against an isolated in-memory SQLite DB.
// Authentication is an explicit fixture; this does not test the production auth proxy.
// No HTTP server, browser, external service, or persisted user database is used.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,extname,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const sqlite=new DatabaseSync(':memory:');
const queries=[];
let authenticatedUser=null,networkCalls=0,passed=0;
const originalFetch=globalThis.fetch;
globalThis.fetch=()=>{networkCalls++;throw new Error('Network access is forbidden in learning regression checks.');};

// Only the D1 transport is adapted: all SQL comes from the real route/storage files.
function statement(sql,values=[]){
 return {
  bind(...bindings){return statement(sql,bindings)},
  run(){const result=sqlite.prepare(sql).run(...values);return {results:[],meta:{changes:Number(result.changes)}}},
  all(){return {results:sqlite.prepare(sql).all(...values)}},
  first(){return sqlite.prepare(sql).get(...values)??null}
 };
}
const db={
 prepare(sql){queries.push(sql);return statement(sql)},
 batch(statements){sqlite.exec('BEGIN');try{const result=statements.map(item=>item.all());sqlite.exec('COMMIT');return result}catch(error){sqlite.exec('ROLLBACK');throw error}}
};

// Transpile the same TypeScript modules the app builds, replacing only host bindings.
const modules=new Map();
function load(relative){
 let file=resolve(root,relative);if(!extname(file))file+='.ts';
 if(file.endsWith('.json'))return JSON.parse(readFileSync(file,'utf8'));
 if(modules.has(file))return modules.get(file).exports;
 const sourceModule={exports:{}};modules.set(file,sourceModule);
 const source=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 function localRequire(id){
  if(id==='cloudflare:workers')return {env:{DB:db}};
  if(id==='@/app/chatgpt-auth')return {getChatGPTUser:async()=>authenticatedUser};
  if(id.startsWith('@/'))return load(id.slice(2));
  if(id.startsWith('.'))return load(resolve(dirname(file),id));
  return require(id);
 }
 new Function('require','module','exports',source)(localRequire,sourceModule,sourceModule.exports);
 return sourceModule.exports;
}

const USER_A='learning-check-A',USER_B='learning-check-B',LEGACY='learning-check-legacy';
const origin='http://learning-check.local';
let route;
async function invoke(body,options={}){
 const user='user' in options?options.user:USER_A;
 authenticatedUser=user?{userId:user}:null;
 const account='account' in options?options.account:user;
 const method=options.method??(body!==undefined||options.raw!==undefined?'POST':'GET');
 const headers={...(account?{'x-study-user-id':account}:{}),...(method==='POST'?{'content-type':'application/json',origin}:{}),...options.headers};
 const request=new Request(origin+'/api/state',{method,headers,...(method==='POST'?{body:options.raw??JSON.stringify(body)}:{})});
 const response=await route[method](request);
 assert.equal(response.headers.get('cache-control'),'no-store');
 return {status:response.status,data:await response.json()};
}
async function request(body,expected=200,options={}){
 const response=await invoke(body,options);
 assert.equal(response.status,expected,JSON.stringify(response.data));
 return response.data;
}
const pass=name=>{passed++;console.log('PASS '+name)};
const countAttempts=user=>Number(sqlite.prepare('SELECT COUNT(*) AS n FROM attempts WHERE user_id=?').get(user).n);
const correct=questions=>questions.map(question=>question.answer);
const wrong=questions=>questions.map(question=>(question.answer+1)%question.options.length);
const progress=(state,lesson)=>state.progress.find(item=>item.lesson_id===lesson.id);
function assertDelay(value,days,before,after){assert(value>=before+days*86400000&&value<=after+days*86400000,`Expected ${days}-day review interval; received ${value-before} ms.`)}

try{
 for(const file of readdirSync(resolve(root,'drizzle')).filter(name=>/^\d+.*\.sql$/.test(name)).sort())sqlite.exec(readFileSync(resolve(root,'drizzle',file),'utf8'));
 const {readState}=load('lib/storage.ts');
 const {CONTENT_VERSION}=load('lib/content-version.ts');
 const {checkpoints,checkpointQuestions}=load('lib/checkpoints.ts');
 const {diagnostics}=load('lib/diagnostic.ts');
 const lessons=load('data/curriculum.json').flatMap(week=>week.lessons);
 route=load('app/api/state/route.ts');

 await request(undefined,401,{user:null});
 await request({action:'start',lessonId:lessons[0].id},401,{user:null});
 await request(undefined,428,{account:null});
 await request(undefined,409,{account:USER_B});
 await request({action:'start',lessonId:lessons[0].id},409,{account:USER_B});
 await request();await request(undefined,200,{user:USER_B});
 pass('GET/POST require authenticated matching account context');

 await request({action:'start',lessonId:lessons[0].id},403,{headers:{origin:'https://another-site.invalid'}});
 await request({action:'start',lessonId:lessons[0].id},403,{headers:{'sec-fetch-site':'cross-site'}});
 await request({action:'start',lessonId:lessons[0].id},415,{headers:{'content-type':'text/plain'}});
 await request(undefined,400,{raw:'{'});
 await request({action:'start',lessonId:lessons[0].id},413,{headers:{'content-length':'120001'}});
 await request({action:'start',lessonId:lessons[0].id,padding:'x'.repeat(120001)},413);
 for(const action of ['note','practice','project'])await request({action,lessonId:lessons[0].id,week:1,note:'retired',practiced:true,body:'retired'},400);
 assert.equal(countAttempts(USER_A),0);
 pass('cross-site/non-JSON/oversized requests and retired write workflows are rejected');

 const changesBefore=sqlite.prepare('SELECT total_changes() AS n').get().n;
 for(const name of ['autonomous','research','tutor','import']){
  const retired=load(`app/api/${name}/route.ts`);
  authenticatedUser=null;
  assert.equal((await retired.GET(new Request(origin+`/api/${name}`))).status,401);
  authenticatedUser={userId:USER_A};
  for(const method of ['GET','POST']){
   const response=await retired[method](new Request(origin+`/api/${name}`,{method,headers:{'x-study-user-id':USER_A}}));
   assert.equal(response.status,410);
   assert.equal((await response.json()).code,'learning-and-assessment-only');
  }
 }
 assert.equal(sqlite.prepare('SELECT total_changes() AS n').get().n,changesBefore);
 pass('retired code/research/tutor/import endpoints reject old pages without database writes');

 await request(undefined,200,{user:LEGACY});
 const legacyRows=[[lessons[0].id,100,0],[lessons[1].id,80,0],[lessons[2].id,79,1]];
 for(const [id,score,completed] of legacyRows)sqlite.prepare('INSERT INTO progress(user_id,lesson_id,score,best_score,completed,practiced,note,updated_at) VALUES(?,?,?,?,?,0,?,10)').run(LEGACY,id,score,score,completed,'legacy note retained');
 sqlite.prepare('INSERT INTO projects(user_id,week,body,checks,submitted,updated_at) VALUES(?,1,?,?,1,10)').run(LEGACY,'legacy project','[true]');
 sqlite.prepare('INSERT INTO code_artifacts(user_id,lesson_id,purpose,code,code_sha,updated_at) VALUES(?,?,?,?,?,10)').run(LEGACY,lessons[0].id,'example','print(1)','a'.repeat(64));
 sqlite.prepare('INSERT INTO practice_runs(user_id,id,instance_id,lesson_id,task_version,code_sha,code,status,provenance,score,feedback_json,result_json,created_at,next_retest) VALUES(?,?,?,?,?,?,?,?,?,100,?,?,10,20)').run(LEGACY,'legacy-run','legacy-task',lessons[0].id,'legacy-v1','a'.repeat(64),'print(1)','verified','trusted','{"summary":"legacy feedback"}','[1]');
 sqlite.prepare('INSERT INTO learning_sessions(user_id,id,lesson_id,activity,minutes,created_at) VALUES(?,?,?, ?,30,10)').run(LEGACY,'legacy-session',lessons[0].id,'阅读');
 sqlite.prepare('INSERT INTO tutor_reviews(user_id,id,lesson_id,code_sha,request_json,response_json,status,created_at) VALUES(?,?,?,?,?,?,?,10)').run(LEGACY,'legacy-review',lessons[0].id,'a'.repeat(64),'{}','{"text":"legacy reply"}','completed');
 sqlite.prepare('INSERT INTO research_records(user_id,id,track,protocol_json,protocol_sha,frozen_at,opened_at,report_json,created_at) VALUES(?,?,?,?,?,10,11,?,9)').run(LEGACY,'legacy-research','vision','{}','b'.repeat(64),'{}');
 sqlite.prepare('INSERT INTO attempts(user_id,id,lesson_id,score,mode,answers,created_at) VALUES(?,?,?,100,?,?,10)').run(LEGACY,'legacy-attempt',lessons[0].id,'exam','[0,0,0]');
 const originalLegacy=JSON.stringify(sqlite.prepare('SELECT * FROM progress WHERE user_id=? ORDER BY lesson_id').all(LEGACY));
 queries.length=0;
 const lean=await request(undefined,200,{user:LEGACY});
 assert.deepEqual(Object.keys(lean).sort(),['attemptCount','checkpoints','contentVersion','curriculumRevision','depthScores','previousDepthScores','profile','progress','retentionDue','retentionScores','userId']);
 assert.deepEqual(legacyRows.map(([id])=>lean.progress.find(item=>item.lesson_id===id).completed),[1,1,0]);
 assert.equal(lean.attemptCount,1);
 assert(queries.every(sql=>!/(?:FROM|JOIN)\s+(?:projects|code_artifacts|practice_runs|task_instances|learning_sessions|tutor_reviews|research_records)\b/i.test(sql)));
 assert(lean.progress.every(item=>!('note' in item)&&!('practiced' in item)&&!('practice_evidence' in item)));
 assert.equal(JSON.stringify(sqlite.prepare('SELECT * FROM progress WHERE user_id=? ORDER BY lesson_id').all(LEGACY)),originalLegacy);
 const full=await readState(LEGACY,true);
 for(const key of ['projects','codeArtifacts','practiceRuns','learningSessions','tutorReviews','researchRecords','attempts'])assert.equal(full[key].length,1,key);
 assert.equal(full.progress.find(item=>item.lesson_id===lessons[0].id).completed,0);
 assert.equal(full.progress[0].note,'legacy note retained');
 assert.equal(full.codeArtifacts[0].code,'print(1)');
 assert.equal(full.practiceRuns[0].feedback_json,'{"summary":"legacy feedback"}');
 const exportRoute=load('app/api/export/route.ts');
 authenticatedUser={userId:LEGACY};
 const exported=await exportRoute.GET(new Request(origin+'/api/export',{headers:{'x-study-user-id':LEGACY}}));
 assert.equal(exported.status,200);assert.equal(exported.headers.get('cache-control'),'no-store');
 const backup=await exported.json();
 assert.equal(backup.format,'ai-phd-backup-v3');assert.equal(backup.userId,LEGACY);
 for(const key of ['profile','progress','projects','codeArtifacts','practiceRuns','learningSessions','tutorReviews','researchRecords','attempts'])assert.equal(JSON.stringify(backup[key]),JSON.stringify(full[key]),key);
 pass('lean state avoids retired tables, projects 80+ completion, and leaves full legacy backups unchanged');

 const lesson=lessons[0];
 await request({action:'quiz',lessonId:'missing-lesson',answers:[],mode:'exam'},404);
 await request({action:'quiz',lessonId:lesson.id,answers:[],mode:'exam'},400);
 await request({action:'quiz',lessonId:lesson.id,answers:lesson.quiz.map(()=>4),mode:'exam'},400);
 let result=await request({action:'quiz',lessonId:lesson.id,answers:wrong(lesson.quiz),mode:'study',score:100,best_score:100,completed:1,user_id:USER_B});
 assert.equal(result.feedback.score,0);assert.equal(progress(result.state,lesson).completed,0);
 assert.equal(countAttempts(USER_B),0);
 result=await request({action:'quiz',lessonId:lesson.id,answers:correct(lesson.quiz),mode:'exam'});
 assert.equal(result.feedback.score,100);assert.equal(progress(result.state,lesson).completed,1);
 assert.equal(progress(result.state,lesson).best_score,100);
 assert.equal(sqlite.prepare('SELECT practiced FROM progress WHERE user_id=? AND lesson_id=?').get(USER_A,lesson.id).practiced,0);
 const partial=correct(lesson.quiz);partial[0]=wrong(lesson.quiz)[0];
 result=await request({action:'quiz',lessonId:lesson.id,answers:partial,mode:'study'});
 assert.equal(result.feedback.score,Math.round((lesson.quiz.length-1)/lesson.quiz.length*100));
 assert.equal(progress(result.state,lesson).best_score,100);assert.equal(progress(result.state,lesson).completed,1);
 assert(result.feedback.results.some(item=>!item.correct&&typeof item.explanation==='string'));
 assert.equal(result.state.attemptCount,3);
 result=await request({action:'quiz',lessonId:lessons[1].id,answers:correct(lessons[1].quiz),mode:'exam'});
 assert.equal(progress(result.state,lessons[1]).completed,1);
 assert.equal(sqlite.prepare('SELECT completed FROM progress WHERE user_id=? AND lesson_id=?').get(USER_A,lessons[1].id).completed,1);
 assert.equal(result.feedback.contentVersion,CONTENT_VERSION);
 assert.equal((await request(undefined,200,{user:USER_B})).progress.length,0);
 pass('real answers determine scores; direct first-pass completion, best scores, attempts, feedback, and account isolation persist');

 const start=await request({action:'start',lessonId:lessons[2].id});
 const started=progress(start.state,lessons[2]);assert.equal(started.completed,0);
 const reopened=await request({action:'start',lessonId:lessons[2].id});
 assert.equal(progress(reopened.state,lessons[2]).updated_at,started.updated_at);
 assert.equal(reopened.state.attemptCount,4);
 pass('opening/reopening a lesson neither completes it nor changes an existing revision');

 const future=Date.now()+10*86400000;
 sqlite.prepare('UPDATE progress SET review_step=1,next_review=? WHERE user_id=? AND lesson_id=?').run(future,USER_A,lesson.id);
 result=await request({action:'quiz',lessonId:lesson.id,answers:correct(lesson.quiz),mode:'review'});
 assert.equal(progress(result.state,lesson).review_step,1);assert.equal(progress(result.state,lesson).next_review,future);
 for(const [step,days] of [[0,3],[1,7],[2,14],[3,30],[4,30]]){
  sqlite.prepare('UPDATE progress SET review_step=?,next_review=? WHERE user_id=? AND lesson_id=?').run(step,Date.now()-1000,USER_A,lesson.id);
  const before=Date.now();result=await request({action:'quiz',lessonId:lesson.id,answers:correct(lesson.quiz),mode:'review'});const after=Date.now();
  assert.equal(progress(result.state,lesson).review_step,Math.min(step+1,4));assertDelay(progress(result.state,lesson).next_review,days,before,after);
 }
 const beforeFailure=Date.now();result=await request({action:'quiz',lessonId:lesson.id,answers:wrong(lesson.quiz),mode:'review'});
 assert.equal(progress(result.state,lesson).review_step,0);assertDelay(progress(result.state,lesson).next_review,1,beforeFailure,Date.now());assert.equal(progress(result.state,lesson).completed,1);
 pass('early reviews cannot advance intervals; due reviews use 3/7/14/30 days and failure schedules one day');

 await request({action:'diagnostic',answers:[]},400);
 result=await request({action:'diagnostic',answers:diagnostics.map(()=>-1)});
 assert(Object.values(result.feedback.areas).every(area=>area.correct===0));
 result=await request({action:'diagnostic',answers:correct(diagnostics)});
 assert(Object.values(result.feedback.areas).every(area=>area.correct===area.total));
 assert.equal(Object.values(result.feedback.areas).reduce((total,area)=>total+area.total,0),diagnostics.length);
 assert.equal(JSON.parse(result.state.profile.diagnostic).contentVersion,CONTENT_VERSION);
 await request({action:'checkpoint',week:16,answers:[]},400);
 pass('diagnostic scores real answers by area and week 16 requires a selected direction');

 const profileBody={action:'profile',hours:4,track:'vision',start_date:'2026-10-17'};
 await request(profileBody,428);
 await request({...profileBody,expectedUpdatedAt:0},409);
 let state=await request();
 await request({...profileBody,start_date:'2026-02-30',expectedUpdatedAt:state.profile.updated_at},400);
 const revision=state.profile.updated_at;
 const competing=await Promise.all([
  invoke({...profileBody,expectedUpdatedAt:revision}),
  invoke({...profileBody,hours:5,expectedUpdatedAt:revision})
 ]);
 assert.deepEqual(competing.map(item=>item.status).sort(),[200,409]);
 assert.equal(competing.find(item=>item.status===409).data.code,'conflict');
 state=await request();assert(state.profile.updated_at>revision);assert.equal(state.profile.track,'vision');
 pass('invalid dates and missing/stale revisions fail; simultaneous profile edits preserve one winner');

 const common=checkpoints.find(item=>item.week!==16),directional=checkpoints.find(item=>item.week===16);
 await request({action:'checkpoint',week:999,answers:[]},400);
 await request({action:'checkpoint',week:common.week,track:'vision',answers:correct(common.questions)},400);
 result=await request({action:'checkpoint',week:common.week,track:'common',answers:correct(checkpointQuestions(common,'vision'))});
 assert.equal(result.feedback.score,100);
 await request({action:'checkpoint',week:16,answers:[]},400);
 await request({action:'checkpoint',week:16,track:'language',answers:[]},409);
 result=await request({action:'checkpoint',week:16,track:'vision',answers:correct(checkpointQuestions(directional,'vision'))});
 assert.equal(result.feedback.score,100);
 const currentRevision=result.state.profile.updated_at;
 await request({...profileBody,track:'language',expectedUpdatedAt:currentRevision});
 await request({action:'checkpoint',week:16,track:'vision',answers:correct(checkpointQuestions(directional,'vision'))},409);
 result=await request({action:'checkpoint',week:16,track:'language',answers:wrong(checkpointQuestions(directional,'language')),score:100});
 assert.equal(result.feedback.score,0);
 assert.equal(result.state.checkpoints.find(item=>item.week===16&&item.track==='vision').best_score,100);
 assert.equal(result.state.checkpoints.find(item=>item.week===16&&item.track==='language').score,0);
 assert.equal(result.state.attemptCount,countAttempts(USER_A));
 assert.equal((await request(undefined,200,{user:USER_B})).checkpoints.length,0);
 assert.equal(networkCalls,0);
 pass('checkpoint scoring is server-side, week-16 stale directions fail, and direction/account histories stay separate');

 const {DEPTH_VERSION}=load('lib/depth-types.ts'),{depthLesson}=load('lib/depth-content.ts');
 const depth=depthLesson(lesson.id),depthAnswers=correct(depth.questions),beforeDepth=await request();
 const publicDepth=load('app/api/lesson-depth/route.ts');
 const publicResponse=await publicDepth.GET(new Request(origin+'/api/lesson-depth?lesson='+lesson.id));
 assert.equal(publicResponse.status,200);const publicContent=await publicResponse.json();
 assert.equal(publicContent.questions.length,5);assert.equal(publicContent.content.sections.length,4);
 assert(publicContent.questions.every(question=>!('answer' in question)&&!('explanation' in question)));
 assert(!('questions' in publicContent.content));
 assert.equal((await publicDepth.GET(new Request(origin+'/api/lesson-depth?lesson=missing'))).status,404);
 for(const name of ['__proto__','constructor','toString'])assert.equal((await publicDepth.GET(new Request(origin+'/api/lesson-depth?lesson='+name))).status,404);
 await request({action:'depth-quiz',lessonId:lesson.id,answers:depthAnswers,version:'old'},409);
 await request({action:'depth-quiz',lessonId:'missing',answers:depthAnswers,version:DEPTH_VERSION},404);
 await request({action:'depth-quiz',lessonId:lesson.id,answers:[],version:DEPTH_VERSION},400);
 await request({action:'depth-quiz',lessonId:lesson.id,answers:depthAnswers.map(()=>4),version:DEPTH_VERSION},400);
 assert.equal(countAttempts(USER_A),beforeDepth.attemptCount);
 assert.equal(beforeDepth.depthScores.length,0);
 const fourCorrect=[...depthAnswers];fourCorrect[0]=(fourCorrect[0]+1)%4;
 result=await request({action:'depth-quiz',lessonId:lesson.id,answers:fourCorrect,version:DEPTH_VERSION,score:100});
 assert.equal(result.feedback.score,80);assert.equal(result.feedback.results.filter(question=>question.correct).length,4);
 assert.equal(result.feedback.version,DEPTH_VERSION);
 assert(result.feedback.results.every(question=>question.sectionId&&question.kind&&question.explanation));
 assert.deepEqual(result.state.progress,beforeDepth.progress);
 let deepScore=result.state.depthScores.find(row=>row.lesson_id===lesson.id);
 assert.equal(deepScore.score,80);assert.equal(deepScore.best_score,80);assert.equal(deepScore.attempts,1);
 result=await request({action:'depth-quiz',lessonId:lesson.id,answers:wrong(depth.questions),version:DEPTH_VERSION});
 deepScore=result.state.depthScores.find(row=>row.lesson_id===lesson.id);
 assert.equal(deepScore.score,0);assert.equal(deepScore.best_score,80);assert.equal(deepScore.attempts,2);
 assert.deepEqual(result.state.progress,beforeDepth.progress);
 const times=sqlite.prepare("SELECT created_at FROM attempts WHERE user_id=? AND mode='depth' ORDER BY created_at").all(USER_A);
 assert(times[1].created_at>times[0].created_at);
 assert.equal((await request(undefined,200,{user:USER_B})).depthScores.length,0);
 sqlite.prepare('INSERT INTO attempts(user_id,id,lesson_id,score,mode,answers,created_at,content_version) VALUES(?,?,?,100,?,?,?,?)').run(USER_A,'old-depth-version','depth:'+lesson.id,'depth',JSON.stringify(depthAnswers),Date.now()+999999,'old-depth-version');
 state=await request();assert.equal(state.depthScores[0].best_score,80);assert.equal(state.depthScores[0].attempts,2);
 const complete=await readState(USER_A,true);
 assert(complete.attempts.some(attempt=>attempt.lesson_id==='depth:'+lesson.id&&attempt.content_version===DEPTH_VERSION));
 assert.equal(networkCalls,0);
 pass('deep questions omit answer keys; versioned server scoring, 80-percent threshold, latest/best history and legacy isolation work');
 const {selfStudyLesson}=load('lib/self-study-content.ts'),{SELF_STUDY_VERSION}=load('lib/self-study-types.ts');
 const study=selfStudyLesson(lesson.id),retention=load('app/api/retention/route.ts');
 const guideRoute=load('app/api/lesson-self-study/route.ts');
 const guide=await (await guideRoute.GET(new Request(origin+'/api/lesson-self-study?lesson='+lesson.id))).json();
 assert(guide.content.worked.table.rows.length>=3);assert(!('transfer' in guide.content));
 assert(!JSON.stringify(guide).includes('-retention-'));assert(!JSON.stringify(publicContent).includes('-retention-'));
 for(const key of ['missing','__proto__','constructor'])assert.equal((await guideRoute.GET(new Request(origin+'/api/lesson-self-study?lesson='+key))).status,404);
 async function retentionGet(user=USER_A,account=user){authenticatedUser=user?{userId:user}:null;return retention.GET(new Request(origin+'/api/retention?lesson='+lesson.id,{headers:account?{'x-study-user-id':account}:{}}))}
 assert.equal((await retentionGet(null)).status,401);assert.equal((await retentionGet(USER_A,USER_B)).status,409);assert.equal((await retentionGet(USER_A,null)).status,428);
 assert.equal((await retentionGet()).status,409);
 const retentionAnswers=correct(study.transfer),beforeRetention=countAttempts(USER_A);
 await request({action:'retention-quiz',lessonId:lesson.id,answers:retentionAnswers,version:'old'},409);
 await request({action:'retention-quiz',lessonId:lesson.id,answers:[],version:SELF_STUDY_VERSION},400);
 await request({action:'retention-quiz',lessonId:lesson.id,answers:retentionAnswers,version:SELF_STUDY_VERSION},409);
 assert.equal(countAttempts(USER_A),beforeRetention);
 sqlite.prepare("UPDATE attempts SET created_at=? WHERE user_id=? AND mode='depth' AND content_version=?").run(Date.now()-8*86400000,USER_A,DEPTH_VERSION);
 let fresh=await retentionGet();assert.equal(fresh.status,200);let transfer=await fresh.json();assert.equal(transfer.questions.length,3);assert(transfer.questions.every(q=>!('answer' in q)&&!('explanation' in q)));
 const beforeRetentionState=await request();
 result=await request({action:'retention-quiz',lessonId:lesson.id,answers:wrong(study.transfer),version:SELF_STUDY_VERSION,score:100});
 assert.equal(result.feedback.score,0);assert.deepEqual(result.state.progress,beforeRetentionState.progress);assert.deepEqual(result.state.depthScores,beforeRetentionState.depthScores);
 assert.equal(result.state.retentionScores[0].attempts,1);assert.equal(result.state.retentionScores[0].best_score,0);
 assert(result.state.retentionDue[0].due_at>Date.now()+23*3600000);
 assert.equal((await retentionGet()).status,409);
 await request({action:'retention-quiz',lessonId:lesson.id,answers:retentionAnswers,version:SELF_STUDY_VERSION},409);
 sqlite.prepare("UPDATE attempts SET created_at=? WHERE user_id=? AND mode='retention'").run(Date.now()-2*86400000,USER_A);
 result=await request({action:'retention-quiz',lessonId:lesson.id,answers:retentionAnswers,version:SELF_STUDY_VERSION});
 assert.equal(result.feedback.score,100);assert.equal(result.state.retentionScores[0].attempts,2);assert.equal(result.state.retentionScores[0].first_score,0);assert.equal(result.state.retentionDue.length,0);
 assert.equal((await retentionGet()).status,409);assert.equal((await retentionGet(USER_B)).status,409);
 assert.equal((await request(undefined,200,{user:USER_B})).retentionScores.length,0);
 sqlite.prepare('INSERT INTO attempts(user_id,id,lesson_id,score,mode,answers,created_at,content_version) VALUES(?,?,?,100,?,?,?,?)').run(USER_A,'preserved-v1','depth:'+lesson.id,'depth','[]',Date.now(),'depth-v1');
 state=await request();assert.equal(state.previousDepthScores[0].best_score,100);assert.equal(state.depthScores[0].best_score,80);
 assert((await readState(USER_A,true)).attempts.some(row=>row.id==='preserved-v1'));
 assert.equal(networkCalls,0);
 pass('self-study hides held-out questions; seven-day gates, one-day retry, server grading, retention isolation and previous-depth history work');
 console.log(`Learning API regression: ${passed} groups passed (real source + SQLite; fixture auth; no network).`);
}finally{
 sqlite.close();globalThis.fetch=originalFetch;
}
