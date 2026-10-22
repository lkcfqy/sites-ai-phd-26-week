import {z} from 'zod';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {database,readState} from '@/lib/storage';
import curriculum from '@/data/curriculum.json';
import {checkpoints,checkpointQuestions} from '@/lib/checkpoints';
import {diagnostics} from '@/lib/diagnostic';
import {todaySeoul,type Week,type Track} from '@/lib/types';
import {CONTENT_VERSION} from '@/lib/content-version';
import {depthLesson} from '@/lib/depth-content';
import {DEPTH_VERSION} from '@/lib/depth-types';
import {selfStudyLesson} from '@/lib/self-study-content';
import {SELF_STUDY_VERSION} from '@/lib/self-study-types';
import {retentionAvailability} from '@/lib/retention';
import {requireAccountContext} from '@/lib/account-context';
export const dynamic='force-dynamic';
const weeks=curriculum as Week[];
const lessons=new Map(weeks.flatMap(w=>w.lessons).map(l=>[l.id,l]));
const reply=(x:unknown,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store'}});
const answers=z.array(z.number().int().min(0).max(3)).max(50);
const revision=z.number().int().nonnegative();
const bodySchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('profile'),hours:z.union([z.literal(4),z.literal(5)]),track:z.enum(['undecided','vision','timeseries','language']),start_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),expectedUpdatedAt:revision.optional()}),
 z.object({action:z.literal('diagnostic'),answers:z.array(z.number().int().min(-1).max(3)).max(50)}),
 z.object({action:z.literal('checkpoint'),week:z.number().int(),answers,track:z.enum(['common','vision','timeseries','language']).optional()}),
 z.object({action:z.literal('start'),lessonId:z.string().max(60)}),
 z.object({action:z.literal('retention-quiz'),lessonId:z.string().max(60),answers,version:z.string().min(1).max(80)}),
 z.object({action:z.literal('depth-quiz'),lessonId:z.string().max(60),answers,version:z.string().min(1).max(80)}),
 z.object({action:z.literal('quiz'),lessonId:z.string().max(60),answers,mode:z.enum(['study','exam','review'])})
]);
async function ensure(user:string){await database().prepare('INSERT OR IGNORE INTO profiles (user_id,hours,track,start_date,diagnostic,updated_at) VALUES (?,4,\'undecided\',?,\'{}\',?)').bind(user,todaySeoul(),Date.now()).run();}
async function limitedJSON(request:Request){
 const limit=120000;
 if(Number(request.headers.get('content-length')??0)>limit)throw new RangeError('请求内容过大。');
 const reader=request.body?.getReader();if(!reader)throw new SyntaxError('请求为空。');
 const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new RangeError('请求内容过大。')}chunks.push(value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
export async function GET(request:Request){const u=await getChatGPTUser();if(!u)return reply({error:'请登录后继续学习。'},401);const contextError=requireAccountContext(request,u.userId);if(contextError)return contextError;try{await ensure(u.userId);return reply(await readState(u.userId));}catch(e){console.error('state read unavailable',e);return reply({error:'云端记录暂时无法读取。请稍后重试，课程仍可阅读。'},503)}}
export async function POST(request:Request){
 const u=await getChatGPTUser();if(!u)return reply({error:'请登录后保存学习记录。'},401);
 const contextError=requireAccountContext(request,u.userId);if(contextError)return contextError;
 const origin=request.headers.get('origin');if((origin&&origin!==new URL(request.url).origin)||request.headers.get('sec-fetch-site')==='cross-site')return reply({error:'请求来源不匹配。'},403);
 if(!request.headers.get('content-type')?.toLowerCase().includes('application/json'))return reply({error:'需要 JSON 请求。'},415);
 let raw:unknown;try{raw=await limitedJSON(request)}catch(e){return reply({error:e instanceof RangeError?'请求内容过大。':'JSON 格式不正确。'},e instanceof RangeError?413:400)}
 const parsed=bodySchema.safeParse(raw);if(!parsed.success)return reply({error:'请求字段、长度或作答格式不正确。'},400);
 const b=parsed.data;
 if(b.action==='profile'&&b.expectedUpdatedAt===undefined)return reply({error:'需要记录版本，请刷新页面；输入草稿会保留。'},428);
 try{
  const db=database(),now=Date.now();await ensure(u.userId);let feedback:unknown=null;
  const conflict=async()=>reply({error:'云端记录已由另一页面或设备更新。你的输入已保留，请重新读取并比较后保存。',code:'conflict',state:await readState(u.userId)},409);
  if(b.action==='profile'){
   if(!Number.isFinite(Date.parse(b.start_date))||new Date(b.start_date).toISOString().slice(0,10)!==b.start_date)return reply({error:'学习日期不正确。'},400);
   const result=await db.prepare('UPDATE profiles SET hours=?,track=?,start_date=?,updated_at=MAX(updated_at+1,?) WHERE user_id=? AND updated_at=?').bind(b.hours,b.track,b.start_date,now,u.userId,b.expectedUpdatedAt!).run();
   if(result.meta.changes===0)return conflict();
  }else if(b.action==='diagnostic'){
   if(b.answers.length!==diagnostics.length)return reply({error:'请完成全部诊断题。'},400);
   const areas:Record<string,{correct:number,total:number}>={};diagnostics.forEach((q,i)=>{areas[q.area]??={correct:0,total:0};areas[q.area].total++;if(q.answer===b.answers[i])areas[q.area].correct++});
   const d={areas,answers:b.answers,at:now,contentVersion:CONTENT_VERSION};await db.prepare('UPDATE profiles SET diagnostic=?,updated_at=MAX(updated_at+1,?) WHERE user_id=?').bind(JSON.stringify(d),now,u.userId).run();feedback=d;
  }else if(b.action==='retention-quiz'){
   if(b.version!==SELF_STUDY_VERSION)return reply({error:'复测题目已更新，请重新读取。',code:'retention-version'},409);
   const content=lessons.has(b.lessonId)?selfStudyLesson(b.lessonId):undefined;
   if(!content)return reply({error:'未找到这节课的延迟复测。'},404);
   if(b.answers.length!==content.transfer.length)return reply({error:'请完成全部复测题。'},400);
   const availability=await retentionAvailability(u.userId,b.lessonId);
   if(!availability.available)return reply({error:availability.completed?'本课延迟复测已通过。':'复测尚未到期，请按计划返回。',code:'retention-due',...availability},409);
   const results=content.transfer.map((question,index)=>({correct:question.answer===b.answers[index],answer:question.answer,explanation:question.explanation,kind:question.kind,sectionId:question.sectionId}));
   const score=Math.round(results.filter(result=>result.correct).length/results.length*100),key='retention:'+b.lessonId;
   const saved=await db.prepare("INSERT OR IGNORE INTO attempts(user_id,id,lesson_id,score,mode,answers,created_at,content_version) VALUES(?,?,?,?,'retention',?,MAX(?,COALESCE((SELECT MAX(created_at)+1 FROM attempts WHERE user_id=? AND lesson_id=? AND mode='retention' AND content_version=?),0)),?)").bind(u.userId,SELF_STUDY_VERSION+':'+b.lessonId+':'+availability.due_at,key,score,JSON.stringify(b.answers),now,u.userId,key,SELF_STUDY_VERSION,SELF_STUDY_VERSION).run();
   if(saved.meta.changes===0)return reply({error:'本轮复测已由另一页面提交，请重新读取记录。',code:'retention-conflict',state:await readState(u.userId)},409);
   feedback={score,results,version:SELF_STUDY_VERSION};
  }else if(b.action==='depth-quiz'){
   if(b.version!==DEPTH_VERSION)return reply({error:'深化题目已更新，请重新载入后作答；原有基础题成绩保持。',code:'depth-version'},409);
   const content=lessons.has(b.lessonId)?depthLesson(b.lessonId):undefined;
   if(!content)return reply({error:'未找到这节课的深化考查。'},404);
   if(b.answers.length!==content.questions.length)return reply({error:'请完成全部深化选择题。'},400);
   const results=content.questions.map((question,index)=>({correct:question.answer===b.answers[index],answer:question.answer,explanation:question.explanation,kind:question.kind,sectionId:question.sectionId}));
   const score=Math.round(results.filter(result=>result.correct).length/results.length*100),key='depth:'+b.lessonId;
   await db.prepare("INSERT INTO attempts(user_id,id,lesson_id,score,mode,answers,created_at,content_version) VALUES(?,?,?,?,'depth',?,MAX(?,COALESCE((SELECT MAX(created_at)+1 FROM attempts WHERE user_id=? AND lesson_id=? AND mode='depth' AND content_version=?),0)),?)").bind(u.userId,crypto.randomUUID(),key,score,JSON.stringify(b.answers),now,u.userId,key,DEPTH_VERSION,DEPTH_VERSION).run();
   feedback={score,results,version:DEPTH_VERSION};
  }else if(b.action==='checkpoint'){
   const stage=checkpoints.find(c=>c.week===b.week);if(!stage)return reply({error:'考核不存在。'},400);
   const profile=await db.prepare('SELECT track FROM profiles WHERE user_id=?').bind(u.userId).first<{track:Track}>();
   if(stage.week===16&&profile?.track==='undecided')return reply({error:'请先选择主攻方向。'},400);
   if(stage.week===16&&!b.track)return reply({error:'考核缺少出题方向。请返回考核页重新读取；原答案草稿会保留。'},400);
   if(stage.week===16&&b.track!==profile?.track)return reply({error:'考核方向已在另一页面或设备改变。原方向答案草稿已保留，请按当前方向重新作答。',code:'assessment-context',state:await readState(u.userId)},409);
   if(stage.week!==16&&b.track&&b.track!=='common')return reply({error:'共同考核的出题方向不正确。'},400);
   const questions=checkpointQuestions(stage,profile?.track??'undecided');const assessmentTrack=stage.week===16?profile!.track:'common';
   if(b.answers.length!==questions.length)return reply({error:'请完成全部考核题。'},400);
   const results=questions.map((q,i)=>({correct:q.answer===b.answers[i],answer:q.answer,explanation:q.explanation}));const score=Math.round(results.filter(x=>x.correct).length/questions.length*100),serialized=JSON.stringify(b.answers);
   await db.batch([
    db.prepare('INSERT INTO checkpoints (user_id,week,track,score,best_score,answers,updated_at,content_version) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id,week,track) DO UPDATE SET score=excluded.score,best_score=MAX(checkpoints.best_score,excluded.best_score),answers=excluded.answers,updated_at=MAX(checkpoints.updated_at+1,excluded.updated_at),content_version=excluded.content_version').bind(u.userId,b.week,assessmentTrack,score,score,serialized,now,CONTENT_VERSION),
    db.prepare('INSERT INTO attempts (user_id,id,lesson_id,score,mode,answers,created_at,content_version) VALUES (?,?,?,?,?,?,?,?)').bind(u.userId,crypto.randomUUID(),'checkpoint-'+b.week+'-'+assessmentTrack,score,'checkpoint',serialized,now,CONTENT_VERSION)
   ]);feedback={score,results,contentVersion:CONTENT_VERSION};
  }else{
   const lesson=lessons.get(b.lessonId);if(!lesson)return reply({error:'课程不存在。'},404);
   if(b.action==='start'){
    // Opening a lesson does not change an existing record revision.
    await db.prepare('INSERT OR IGNORE INTO progress (user_id,lesson_id,updated_at) VALUES (?,?,?)').bind(u.userId,lesson.id,now).run();
   }else if(b.action==='quiz'){
    if(b.answers.length!==lesson.quiz.length)return reply({error:'请回答全部测验题。'},400);
    const results=lesson.quiz.map((q,i)=>({correct:q.answer===b.answers[i],answer:q.answer,explanation:q.explanation}));const score=Math.round(results.filter(x=>x.correct).length/results.length*100);
    const dueReview=b.mode==='review'?1:0;
    const serialized=JSON.stringify(b.answers);
    await db.batch([
     db.prepare('INSERT INTO attempts (user_id,id,lesson_id,score,mode,answers,created_at,content_version) VALUES (?,?,?,?,?,?,?,?)').bind(u.userId,crypto.randomUUID(),lesson.id,score,b.mode,serialized,now,CONTENT_VERSION),
     db.prepare(`INSERT INTO progress (user_id,lesson_id,score,best_score,completed,answers,review_step,next_review,updated_at,content_version) VALUES (?,?,?,?,?,?,0,?,?,?) ON CONFLICT(user_id,lesson_id) DO UPDATE SET
      score=excluded.score,best_score=MAX(progress.best_score,excluded.best_score),answers=excluded.answers,
      completed=CASE WHEN MAX(progress.best_score,excluded.best_score)>=80 THEN 1 ELSE 0 END,
      review_step=CASE WHEN excluded.score<80 THEN 0 WHEN ?=1 AND progress.next_review>0 AND progress.next_review<=? THEN MIN(progress.review_step+1,4) ELSE progress.review_step END,
      next_review=CASE WHEN excluded.score<80 THEN excluded.updated_at+86400000 WHEN ?=1 AND progress.next_review>0 AND progress.next_review<=? THEN excluded.updated_at+CASE MIN(progress.review_step+1,4) WHEN 1 THEN 259200000 WHEN 2 THEN 604800000 WHEN 3 THEN 1209600000 ELSE 2592000000 END WHEN progress.next_review=0 THEN excluded.updated_at+86400000 ELSE progress.next_review END,
      updated_at=MAX(progress.updated_at+1,excluded.updated_at),content_version=excluded.content_version`).bind(u.userId,lesson.id,score,score,score>=80?1:0,serialized,now+86400000,now,CONTENT_VERSION,dueReview,now,dueReview,now)
    ]);feedback={score,results,contentVersion:CONTENT_VERSION};
   }
  }
  return reply({state:await readState(u.userId),feedback});
 }catch(e){console.error('state write unavailable',e);return reply({error:'本次保存未完成。请保留输入并重试。'},503)}
}
