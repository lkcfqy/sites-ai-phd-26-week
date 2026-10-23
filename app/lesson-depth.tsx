'use client';
import {useEffect,useState} from 'react';
import {BookOpen,CheckCircle2,RefreshCw} from 'lucide-react';
import type {PublicDepthPayload,DepthScore} from '@/lib/depth-types';
import {CURRICULUM_REVISION} from '@/lib/content-version';
import {orderedChoices} from '@/lib/choice-order';
import {useDraft,useStudyIdentity,type Save,type Feedback} from './lesson-view';
import type {RetentionScore} from '@/lib/self-study-types';

const kindNames={reasoning:'原理推理',calculation:'计算与推演',transfer:'情境迁移',boundary:'边界判断'};
export function useLessonDepth(lessonId:string){
 const [retry,setRetry]=useState(0);
 const requestKey=lessonId+':'+retry;
 const [result,setResult]=useState<{key:string;data:PublicDepthPayload|null;error:string}|null>(null);
 const current=result?.key===requestKey?result:null;
 useEffect(()=>{
  const controller=new AbortController();let active=true;
  fetch('/api/lesson-depth?lesson='+encodeURIComponent(lessonId)+'&revision='+encodeURIComponent(CURRICULUM_REVISION),{signal:controller.signal}).then(async response=>{const result=await response.json() as PublicDepthPayload&{error?:string};if(!response.ok)throw new Error(result.error||'深化内容暂时无法读取。');return result}).then(result=>{if(active)setResult({key:requestKey,data:result,error:''})}).catch(error=>{if(active)setResult({key:requestKey,data:null,error:error instanceof Error?error.message:'内容读取失败，请重试。'})});
  return()=>{active=false;controller.abort()};
 },[lessonId,requestKey]);
 return {data:current?.data??null,error:current?.error??'',reload:()=>setRetry(value=>value+1)};
}

export function DepthStatus({error,reload}:{error:string;reload:()=>void}){
 return <div className="callout" role="status">{error?<><strong>深化内容暂未载入</strong><p>{error}</p><button className="secondary" onClick={reload}><RefreshCw size={15}/>重新读取</button></>:<p>正在读取深入讲解与例题…</p>}</div>;
}

export function DepthReading({data,onQuiz}:{data:PublicDepthPayload;onQuiz:()=>void}){
 const content=data.content;
 return <section className="depth-reading" id="depth-reading">
  <div className="depth-heading"><span className="eyebrow">从理解现象到解释原理</span><h2>深入讲解</h2><p>沿着推导、例题和反例，把结论与它成立的条件联系起来。</p></div>
  <section className="depth-outcomes"><h3>读完这一层，你应能</h3><ul>{content.outcomes.map(item=><li key={item}>{item}</li>)}</ul></section>
  <nav className="depth-outline" aria-label="深入讲解目录">{content.sections.map((section,index)=><a key={section.id} href={'#depth-'+section.id}>{index+1}. {section.title}</a>)}<a href="#depth-example">完整例题</a><a href="#depth-pitfalls">易错辨析</a></nav>
  {content.sections.map((section,index)=><section className="concept depth-concept" id={'depth-'+section.id} key={section.id}><span className="concept-index">深入 {index+1}</span><h2>{section.title}</h2>{section.body.split('\n').filter(Boolean).map((paragraph,index)=><p key={index}>{paragraph}</p>)}</section>)}
  <section className="depth-example" id="depth-example"><span className="eyebrow">逐步跟随推理</span><h2>{content.workedExample.title}</h2><p className="example-given"><strong>已知条件：</strong>{content.workedExample.given}</p><ol>{content.workedExample.steps.map((step,index)=><li key={index}>{step}</li>)}</ol><div className="example-result"><strong>结论与核对</strong><p>{content.workedExample.result}</p></div></section>
  <section className="depth-pitfalls" id="depth-pitfalls"><h2>易错辨析</h2>{content.pitfalls.map((pitfall,index)=><div className="depth-pitfall" key={index}><h3>容易误解：{pitfall.mistake}</h3><p>{pitfall.correction}</p></div>)}</section>
  <section className="concept"><h2>进一步研读</h2><div className="references">{content.references.map((source,index)=><a key={index} href={source.url} target="_blank" rel="noreferrer">{source.title}<span>教材 / 原始资料</span></a>)}</div></section>
  <button className="primary" onClick={onQuiz}>用深化选择题检验理解<CheckCircle2 size={16}/></button>
 </section>;
}

export function DepthQuiz({data,save,busy,readOnly,record,onLearn,variant='depth'}:{data:PublicDepthPayload;save:Save;busy:boolean;readOnly:boolean;record?:(DepthScore&{first_score?:number});onLearn:()=>void;variant?:'depth'|'retention'}){
 const retention=variant==='retention',threshold=retention?100:80;
 const [isRetry]=useState(()=>(record?.attempts??0)>0);
 const draft=useDraft<number[]>(variant+'-answers:'+data.lessonId+':'+data.version,[]),answers=draft.value;
 const [feedback,setFeedback]=useState<Feedback|null>(null),[submitted,setSubmitted]=useState<number[]>([]),[pending,setPending]=useState(false),[error,setError]=useState('');
 const visibleAnswers=feedback?submitted:answers;
 const answered=data.questions.filter((question,index)=>Number.isInteger(visibleAnswers[index])&&visibleAnswers[index]>=0&&visibleAnswers[index]<question.options.length).length;
 async function submit(){
  if(readOnly||busy||pending||feedback||answered!==data.questions.length)return;
  setPending(true);setError('');const snapshot=[...answers];
  try{
   const result=await save({action:retention?'retention-quiz':'depth-quiz',lessonId:data.lessonId,answers:snapshot,version:data.version});
   if(!result?.feedback){setError('作答尚未提交成功，答案已保留；请查看连接或到期提示后重试。');return}
   setSubmitted(snapshot);setFeedback(result.feedback);draft.clear(snapshot);
  }catch{setError('连接中断，答案已保留，请重试。')}finally{setPending(false)}
 }
 function restart(){setFeedback(null);setSubmitted([]);draft.clear();setError('')}
 return <section className="panel depth-quiz" aria-busy={busy||pending}>
  <div className="section-title"><h2>{retention?'延迟迁移复测':'深化考查'}</h2><span className="pill">{data.questions.length} 题 · {retention?'需全对':'80%通过'}</span></div>
  <p className="muted">{retention?(isRetry?'这次是补弱后的同组重做，成绩与首次复测分别保留在历史中。':'在间隔一周后，用独立变式检查保持与迁移；三题全对通过。'):'至少答对4题通过。根据条件推理并核对计算，此成绩与基础题分开记录。'}</p>
  {record&&<p className="depth-score-history">{retention&&record.first_score!==undefined?`首次 ${record.first_score} 分 · `:''}最近 {record.score} 分 · 最高 {record.best_score} 分 · 已作答 {record.attempts} 次</p>}
  {readOnly&&<p className="callout">连接账号记录后即可提交考查。</p>}
  {data.questions.map((question,index)=>{const result=feedback?.results[index],choices=orderedChoices(question.options,variant+':'+question.id);return <fieldset className="quiz-question" key={question.id} disabled={busy||pending||!!feedback}>
   <legend><span>{index+1}</span><small className="pill">{kindNames[question.kind]}</small>{question.question}</legend>
   {choices.map(({text:option,index:choice},displayIndex)=><label className={'quiz-option '+(visibleAnswers[index]===choice?'chosen ':'')+(result?(result.answer===choice?'correct':visibleAnswers[index]===choice?'incorrect':''):'')} key={choice}><input type="radio" name={variant+'-'+question.id} checked={visibleAnswers[index]===choice} onChange={()=>{const next=[...answers];next[index]=choice;draft.set(next);setError('')}}/><span className="option-letter">{String.fromCharCode(65+displayIndex)}</span>{option}</label>)}
   {result&&<div className={'quiz-explanation '+(result.correct?'good':'bad')}><strong>{result.correct?'回答正确':'需要回顾推理'}</strong><p>正确答案：{String.fromCharCode(65+choices.findIndex(choice=>choice.index===result.answer))}. {question.options[result.answer]}</p><p>{result.explanation}</p>{!result.correct&&<button className="text-button" onClick={()=>{onLearn();requestAnimationFrame(()=>{const appendix=document.getElementById('deep-appendix');if(appendix instanceof HTMLDetailsElement)appendix.open=true;document.getElementById('depth-'+question.sectionId)?.scrollIntoView({behavior:'smooth',block:'start'})})}}><BookOpen size={15}/>回看对应推导</button>}</div>}
  </fieldset>})}
  <p className="muted" role="status">已作答 {answered} / {data.questions.length} 题</p>
  {error&&<p className="callout danger" role="alert">{error}</p>}
  {!feedback?<button className="primary" disabled={readOnly||busy||pending||answered!==data.questions.length} onClick={()=>void submit()}>{pending?'正在评分…':retention?'提交延迟复测':'提交深化考查'}</button>:<div className={'quiz-result '+(feedback.score>=threshold?'good':'bad')} role="status"><strong>{feedback.score} 分 · {feedback.score>=threshold?'本轮通过':'继续巩固'}</strong><p>{retention?(feedback.score===100?'保留了本次间隔后的理解证据。':'先回顾推导，本次提交满24小时后再做本组补弱重测。'):'对照解析核查每一步，继续用改变条件的例子检验理解。'}</p><div className="row-actions"><button className="secondary" onClick={onLearn}>回看讲解</button>{!retention&&<button className="primary" onClick={restart}>重新作答</button>}</div></div>}
 </section>;
}

export function RetentionQuiz({active,data,save,busy,readOnly,record,onLearn}:{active:boolean;data:PublicDepthPayload;save:Save;busy:boolean;readOnly:boolean;record?:RetentionScore;onLearn:()=>void}){
 const userId=useStudyIdentity();
 const [retry,setRetry]=useState(0);
 const requestKey=JSON.stringify([userId,data.lessonId,data.version,retry]);
 const [result,setResult]=useState<{key:string;data:PublicDepthPayload|null;error:string}|null>(null);
 const current=result?.key===requestKey?result:null,loaded=current?.data??null,error=current?.error??'';
 useEffect(()=>{
  if(!active||readOnly||!userId||loaded)return;
  const controller=new AbortController();let live=true;
  fetch('/api/retention?lesson='+encodeURIComponent(data.lessonId),{cache:'no-store',headers:{'x-study-user-id':userId},signal:controller.signal}).then(async response=>{const body=await response.json() as Partial<PublicDepthPayload>&{error?:string;due_at?:number};if(!response.ok)throw new Error((body.error??'复测暂时不能读取。')+(body.due_at?' 开放时间：'+new Date(body.due_at).toLocaleString():''));if(live)setResult({key:requestKey,data:{...data,version:body.version!,questions:body.questions!},error:''})}).catch(error=>{if(live)setResult({key:requestKey,data:null,error:error instanceof Error?error.message:'读取失败'})});
  return()=>{live=false;controller.abort()};
 },[active,data,loaded,readOnly,userId,requestKey]);
 if(loaded)return <><DepthQuiz data={loaded} save={save} busy={busy} readOnly={readOnly} record={record} onLearn={onLearn} variant="retention"/>{record&&record.best_score<100&&<button className="secondary" onClick={()=>{setRetry(value=>value+1)}}>重新读取下一次复测安排</button>}</>;
 if(record?.best_score===100)return <section className="panel"><h2>延迟复测已通过</h2><p>首次{record.first_score??record.score}分，最高100分，共{record.attempts}次作答。可以回顾讲解，继续后续课程。</p></section>;
 return <section className="panel"><h2>间隔后再检验</h2><p>新版深化考查首次通过满7天后，开放3道独立变式；未通过时先补弱，本次提交满24小时后可重做本组。</p>{error?<div role="status"><p>{error}</p><button className="secondary" onClick={()=>setRetry(value=>value+1)}>重新读取到期状态</button></div>:<p role="status">{active?'正在读取复测安排…':'进入此页时读取安排。'}</p>}</section>;
}
