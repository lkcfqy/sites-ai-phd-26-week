'use client';
import {createContext,useContext,useEffect,useState,useSyncExternalStore,type ReactNode} from 'react';
import {BookOpen,CheckCircle2,ChevronLeft} from 'lucide-react';
import type {Lesson,Progress,Week,StudyState,Track} from '@/lib/types';
import teachingUpgrade from '@/data/teaching-upgrade.json';
import type {TeachingUpgrade} from '@/lib/autonomous-types';
import learningDesign from '@/data/learning-design.json';
import {useLessonDepth,DepthReading,DepthQuiz,DepthStatus,RetentionQuiz} from './lesson-depth';
import type {DepthScore} from '@/lib/depth-types';
import type {RetentionScore} from '@/lib/self-study-types';
import {orderedChoices} from '@/lib/choice-order';
import SelfStudyReading from './self-study-reading';
type LessonDesign=typeof learningDesign.lessons[keyof typeof learningDesign.lessons];
const lessonDesigns:Record<string,LessonDesign>=learningDesign.lessons;
export type Feedback={score:number;results:{answer:number;correct:boolean;explanation:string}[]};
export type SaveResult={state:StudyState;feedback?:Feedback};
export type Save=(b:Record<string,unknown>)=>Promise<SaveResult|null>;
type DraftContextValue={userId?:string;drafts:Record<string,unknown>;write:(key:string,value:unknown)=>void;clear:(key:string,expected?:unknown)=>void;download:()=>void;persisted:boolean};
const DraftContext=createContext<DraftContextValue>({drafts:{},write:()=>{},clear:()=>{},download:()=>{},persisted:false});
// Drafts live in this tab and are namespaced by the authenticated user; they are never uploaded implicitly.
export function DraftProvider({userId,children}:{userId?:string;children:ReactNode}){
 const [store]=useState(()=>{let snapshot={drafts:{} as Record<string,unknown>,persisted:false};const empty=snapshot,listeners=new Set<()=>void>(),storageKey=userId?'ai-phd:learning-drafts:v2:'+userId:null;function notify(){listeners.forEach(listener=>listener())}return {subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}},read:()=>snapshot,server:()=>empty,restore:()=>{if(!storageKey)return;try{const raw=sessionStorage.getItem(storageKey);const data:unknown=raw?JSON.parse(raw):{};if(data&&typeof data==='object'&&!Array.isArray(data))snapshot={drafts:data as Record<string,unknown>,persisted:true};notify()}catch{/* A blocked browser store leaves drafts in memory. */}},update:(drafts:Record<string,unknown>)=>{let persisted=false;if(storageKey){try{sessionStorage.setItem(storageKey,JSON.stringify(drafts));persisted=true}catch{/* Keep the live draft and expose the storage limitation. */}}snapshot={drafts,persisted};notify()}}});
 const {drafts,persisted}=useSyncExternalStore(store.subscribe,store.read,store.server);
 useEffect(()=>store.restore(),[store]);
 useEffect(()=>{function warn(e:BeforeUnloadEvent){if(Object.keys(drafts).length){e.preventDefault();e.returnValue=''}}window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[drafts]);
 function download(){const snapshot={format:'ai-phd-tab-drafts-v1',account:userId??null,exportedAt:new Date().toISOString(),scope:'原账号当前标签页的本地草稿；不含云端记录；无自动导入或上传。',drafts:store.read().drafts};const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json;charset=utf-8'})),anchor=document.createElement('a');anchor.href=url;anchor.download='ai-phd-tab-drafts.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 return <DraftContext.Provider value={{userId,drafts,persisted,download,write:(key,value)=>store.update({...store.read().drafts,[key]:value}),clear:(key,expected)=>{const next={...store.read().drafts};if(expected!==undefined&&JSON.stringify(next[key])!==JSON.stringify(expected))return;delete next[key];store.update(next)}}}>{children}</DraftContext.Provider>
}
export function useDraft<T>(key:string,fallback:T){const context=useContext(DraftContext);return {value:(context.drafts[key]??fallback) as T,dirty:key in context.drafts,persisted:context.persisted,set:(value:T)=>context.write(key,value),clear:(expected?:T)=>context.clear(key,expected)}}
export function useDraftStatus(){const context=useContext(DraftContext);return {count:Object.keys(context.drafts).length,persisted:context.persisted,download:context.download}}
export function useStudyIdentity(){return useContext(DraftContext).userId;}
type LessonViewProps={
 lesson:Lesson;
 week:Week;
 progress?:Progress;
 save:Save;
 busy:boolean;
 mode:string;
 onBack:()=>void;
 onNext:()=>void;
 onPrerequisite:(id:string)=>void;
 lessonTitles:Record<string,string>;
 hours:number;
 track?:Track;
 readOnly?:boolean;
 onRefresh?:()=>Promise<unknown>;
 onTabChange?:(tab:'learn'|'quiz',level?:'basic'|'depth'|'retention')=>void;
 depthScore?:DepthScore;
 previousDepthScore?:DepthScore;
 retentionScore?:RetentionScore;
};

export default function LessonView(props:LessonViewProps){
 return <LessonContent key={props.lesson.id+':'+props.mode} {...props}/>;
}

function LessonContent({lesson,week,progress,save,busy,mode,onBack,onNext,onPrerequisite,lessonTitles,track='undecided',readOnly=false,onTabChange,depthScore,previousDepthScore,retentionScore}:LessonViewProps){
 const design=lessonDesigns[lesson.id];
 const hasTrackPrerequisites=!!design&&'prerequisitesByTrack' in design;
 const branchPrerequisites=hasTrackPrerequisites&&track!=='undecided'&&'prerequisitesByTrack' in design?design.prerequisitesByTrack[track]:[];
 const prerequisites=[...new Set([...(design?.prerequisites??[]),...branchPrerequisites])];
 const startsWithQuiz=['review','exam','quiz','practice','retest','depth','retention'].includes(mode);
 const [tab,setTab]=useState<'learn'|'quiz'>(startsWithQuiz?'quiz':'learn');
 const [quizLevel,setQuizLevel]=useState<'basic'|'depth'|'retention'>(mode==='retention'?'retention':mode==='depth'?'depth':'basic');
 const depth=useLessonDepth(lesson.id);
 useEffect(()=>{onTabChange?.(tab,quizLevel)},[tab,quizLevel,onTabChange]);
 const [feedback,setFeedback]=useState<Feedback|null>(null);
 const [submittedAnswers,setSubmittedAnswers]=useState<number[]>([]);
 const [submitting,setSubmitting]=useState(false);
 const [submitError,setSubmitError]=useState('');
 const answerDraft=useDraft<number[]>('answers:'+lesson.id+':'+mode,submittedAnswers);
 const answers=answerDraft.value;
 const answeredCount=lesson.quiz.filter((question,index)=>Number.isInteger(answers[index])&&answers[index]>=0&&answers[index]<question.options.length).length;
 const allAnswered=lesson.quiz.length>0&&answeredCount===lesson.quiz.length;
 const saving=busy||submitting;
 const basePassed=(feedback?.score??0)>=80||(progress?.best_score??0)>=80;
 const depthPassed=(depthScore?.best_score??0)>=80;
 const passed=basePassed&&depthPassed;
 const objectives=depth.data?.content.outcomes??lesson.objectives.filter(objective=>!/(提交|交付|产物|上传|保存)/.test(objective));

 async function submit(){
  if(readOnly||saving||!allAnswered)return;
  setSubmitting(true);
  setSubmitError('');
  const submitted=[...answers];
  try{
   const result=await save({action:'quiz',lessonId:lesson.id,answers:submitted,mode:mode==='review'?'review':mode==='exam'?'exam':'study'});
   if(result?.feedback){
    setFeedback(result.feedback);
    setSubmittedAnswers(submitted);
    answerDraft.clear(submitted);
   }else{
    setSubmitError('考查未提交成功，请重试。');
   }
  }catch{
   setSubmitError('考查未提交成功，请检查连接后重试。');
  }finally{
   setSubmitting(false);
  }
 }

 return <div className="view-content lesson-page">
  <button className="text-button back" onClick={onBack}><ChevronLeft size={17}/>{tab==='quiz'?'返回考查列表':'返回课程列表'}</button>
  <div className="lesson-heading">
   <div>
    <span className="eyebrow">第 {String(week.number).padStart(2,'0')} 周 / DAY {lesson.day} · {week.phase}</span>
    <h1>{lesson.title}</h1>
    <p>{lesson.summary}</p>
   </div>
   <span className={'pill '+(passed?'success':'')}>{passed?<><CheckCircle2 size={15}/>基础与深化均通过</>:basePassed?'基础通过 · 继续深化':`${lesson.minutes} 分钟基础讲解＋深入研读`}</span>
  </div>
  <div className="tabs lesson-tabs" aria-label="学习与考查">
   <button aria-pressed={tab==='learn'} className={tab==='learn'?'selected':''} onClick={()=>setTab('learn')}><BookOpen size={16}/>学习</button>
   <button aria-pressed={tab==='quiz'} className={tab==='quiz'?'selected':''} onClick={()=>setTab('quiz')}><CheckCircle2 size={16}/>考查</button>
  </div>

  {tab==='learn'&&<div className="lesson-layout">
   <LearningHighlights lessonId={lesson.id}/>
   <article className="lesson-body">
    {objectives.length>0&&<div className="objectives"><h2>本课要学会什么</h2><ul>{objectives.map((objective,index)=><li key={index}>{objective}</li>)}</ul></div>}
    {prerequisites.length>0&&<div className="lesson-readiness"><h2>需要时回顾前置课</h2><div>{prerequisites.map(id=><button className="text-button" key={id} onClick={()=>onPrerequisite(id)}>{lessonTitles[id]??id}</button>)}</div></div>}
    {depth.data?.selfStudy?<SelfStudyReading key={lesson.id} lessonId={lesson.id} data={depth.data.selfStudy} onQuiz={()=>{setQuizLevel('depth');setTab('quiz');window.scrollTo({top:0,behavior:'smooth'})}}/>:<DepthStatus error={depth.error} reload={depth.reload}/>}
    <details className="study-supplement" id="deep-appendix"><summary>继续研读：公式推导、方法比较与适用边界</summary>{depth.data?<DepthReading data={depth.data} onQuiz={()=>{setQuizLevel('depth');setTab('quiz');window.scrollTo({top:0,behavior:'smooth'})}}/>:<DepthStatus error={depth.error} reload={depth.reload}/>}</details>
    <details className="study-supplement"><summary>概念速查、只读代码与参考资料</summary>{lesson.concepts.map((concept,index)=><section key={index} className="concept" id={'concept-'+index}><h2>{concept.title}</h2>{concept.body.split('\n').filter(Boolean).map((paragraph,i)=><p key={i}>{paragraph}</p>)}</section>)}{lesson.formula&&<div className="equation" aria-label="本课公式">{lesson.formula}</div>}{lesson.code&&<section className="concept"><h2>只读代码</h2><p className="muted">先完成上方算例和结果核对，再按需对照代码中的计算步骤。</p><div className="code-cell"><div className="code-toolbar"><span>Python 示例 · 只读</span></div><pre className="code-editor" style={{overflowX:'auto',margin:0}} tabIndex={0} aria-label="Python 示例代码"><code>{lesson.code}</code></pre></div></section>}<section className="concept"><h2>参考资料</h2><div className="references">{lesson.references.map((reference,index)=><a key={index} href={reference.url} target="_blank" rel="noreferrer">{reference.title}<span>原始资料</span></a>)}</div></section></details>
    <div className="row-actions"><button className="primary" onClick={()=>setTab('quiz')}>进入考查</button><button className="secondary" onClick={onNext}>学习下一课</button></div>
   </article>
   <aside className="lesson-aside">
    <div className="panel">
     <h3>本课学习顺序</h3>
     <ol><li>补齐术语与前置</li><li>跟着分步讲解推演</li><li>核对完整算例与结果表</li><li>完成减少提示的例题</li><li>通过基础与深化考查</li><li>一周后用变式复测</li></ol>
     <button className="primary full" onClick={()=>setTab('quiz')}>进入考查</button>
     {depth.data&&<a className="text-button full" href="#self-study-reading">跳到自学主讲</a>}
     <p className="muted">{basePassed?'基础已通过':'基础待考查'} · {depthPassed?'深化已通过':'深化待考查'}</p>
    </div>
    {design&&design.recovery.lessonIds.length>0&&<div className="callout">
     <strong>需要回顾时</strong>
     <p>可回到相关课程，重新阅读对应概念和示例。</p>
     {design.recovery.lessonIds.map(id=><button className="text-button" key={id} onClick={()=>onPrerequisite(id)}>{lessonTitles[id]??id}</button>)}
    </div>}
   </aside>
  </div>}

  {tab==='quiz'&&<div className="reading-width depth-level-tabs"><div className="tabs" aria-label="考查层次"><button className={quizLevel==='basic'?'selected':''} aria-pressed={quizLevel==='basic'} onClick={()=>setQuizLevel('basic')}>基础理解 · {lesson.quiz.length} 题</button><button className={quizLevel==='depth'?'selected':''} aria-pressed={quizLevel==='depth'} onClick={()=>setQuizLevel('depth')}>深入理解 · 5 题</button><button className={quizLevel==='retention'?'selected':''} aria-pressed={quizLevel==='retention'} onClick={()=>setQuizLevel('retention')}>延迟复测 · 3 题</button></div><p className="muted">基础题检验概念，深化题检验推理、计算与情境判断，两层成绩分别保留。</p></div>}
  {tab==='quiz'&&quizLevel==='basic'&&<div className="reading-width">
   <section className="panel" aria-busy={saving}>
    <div className="section-title"><h2>{mode==='review'?'基础复习考查':'基础选择题考查'}</h2><span className="pill">3题需全对</span></div>
    <p className="muted">共 {lesson.quiz.length} 道单项选择题，至少答对 {Math.ceil(lesson.quiz.length*.8)} 道通过。全部作答后提交，查看分数、正确答案和逐题解析。</p>
    {readOnly&&<p className="callout" role="status">当前为只读浏览，连接学习记录后即可提交考查。</p>}
    {lesson.quiz.map((question,index)=>{
     const result=feedback?.results[index],choices=orderedChoices(question.options,lesson.id+':basic:'+index+':'+question.question);
     return <fieldset className="quiz-question" key={index} disabled={saving}>
      <legend><span>{index+1}</span>{question.question}</legend>
      {choices.map(({text:option,index:optionIndex},displayIndex)=><label key={optionIndex} className={'quiz-option '+(answers[index]===optionIndex?'chosen ':'')+(result?(result.answer===optionIndex?'correct':answers[index]===optionIndex?'incorrect':''):'')}>
       <input type="radio" name={lesson.id+'-q-'+index} checked={answers[index]===optionIndex} onChange={()=>{
        const next=[...answers];
        next[index]=optionIndex;
        answerDraft.set(next);
        setFeedback(null);
        setSubmitError('');
       }}/>
       <span className="option-letter">{String.fromCharCode(65+displayIndex)}</span>{option}
      </label>)}
      {result&&<div className={'quiz-explanation '+(result.correct?'good':'bad')}>
       <strong>{result.correct?'回答正确':'回答有误'}</strong>
       <p>正确答案：{String.fromCharCode(65+choices.findIndex(choice=>choice.index===result.answer))}. {question.options[result.answer]}</p>
       <p>{result.explanation}</p>
      </div>}
     </fieldset>;
    })}
    <p className="muted" role="status">已作答 {answeredCount} / {lesson.quiz.length} 题</p>
    <button className="primary" disabled={readOnly||saving||!allAnswered} onClick={()=>void submit()}>{readOnly?'暂不可提交':saving?'正在提交…':'提交考查'}</button>
    {submitError&&<p className="callout danger" role="alert">{submitError}</p>}
    {feedback&&<div className={'quiz-result '+(feedback.score>=80?'good':'bad')} role="status" aria-live="polite">
     <strong>{feedback.score} 分 · {feedback.score>=80?'基础选择题通过':'还需复习'}</strong>
     <p>{feedback.score>=80?'继续深入讲解与深化考查，检验能否推理和分析新情境。':'阅读错题解析，回到学习内容复习后再作答。'}</p>
     {feedback.score>=80&&<button className="primary" onClick={()=>setQuizLevel('depth')}>进入深化考查</button>}
    </div>}
   </section>
   <div className="row-actions">
    <button className="secondary" onClick={()=>setTab('learn')}>返回学习</button>
    <button className="primary" onClick={onNext}>学习下一课</button>
   </div>
  </div>}
  {tab==='quiz'&&previousDepthScore&&<p className="reading-width muted">此前题组深化最高 {previousDepthScore.best_score} 分，已保留历史。新版深化题检验新的多步推理，单独记录成绩。</p>}
  <div className="reading-width" hidden={tab!=='quiz'||quizLevel!=='depth'}>{depth.data?<DepthQuiz key={lesson.id+depth.data.version} data={depth.data} save={save} busy={busy} readOnly={readOnly} record={depthScore} onLearn={()=>setTab('learn')}/>:<DepthStatus error={depth.error} reload={depth.reload}/>}</div>
  <div className="reading-width" hidden={tab!=='quiz'||quizLevel!=='retention'}>{depth.data&&<RetentionQuiz active={tab==='quiz'&&quizLevel==='retention'} data={depth.data} save={save} busy={busy} readOnly={readOnly} record={retentionScore} onLearn={()=>setTab('learn')}/>}</div>
 </div>;
}

function LearningHighlights({lessonId}:{lessonId:string}){
 const item=(teachingUpgrade as unknown as Record<string,TeachingUpgrade>)[lessonId];
 if(!item)return null;
 const guides=Array.isArray(item.readingGuide)?item.readingGuide as {title:string;url:string;focus:string}[]:[];
 return <section className="panel teaching-steps">
  <span className="eyebrow">带着问题学习</span>
  <h2>{item.hook}</h2>
  {item.pitfalls.length>0&&<details><summary>学习重点与常见误区</summary><ul>{item.pitfalls.map(pitfall=><li key={pitfall}>{pitfall}</li>)}</ul></details>}
  {guides.length>0&&<details><summary>延伸阅读指引</summary>{guides.map((guide,index)=><p key={index}><a href={guide.url} target="_blank" rel="noreferrer">{guide.title}</a>：{guide.focus}</p>)}</details>}
 </section>;
}
