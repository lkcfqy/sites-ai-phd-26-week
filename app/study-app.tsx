'use client';

import {useCallback,useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {BookOpen,CheckCircle2,ChevronDown,ClipboardCheck,CloudCheck,CloudOff,Menu,Play,RefreshCw,Search,X} from 'lucide-react';
import {diagnostics} from '@/lib/diagnostic';
import {type Week,type StudyState,type Track,type Lesson,lessonList,pathLessons,trackNames,todaySeoul} from '@/lib/types';
import LessonView,{DraftProvider,useDraft,type Save,type SaveResult} from './lesson-view';
import Assessment from './assessment';
import {checkpoints} from '@/lib/checkpoints';

const navigation=[{id:'learn',name:'学习',icon:BookOpen},{id:'assess',name:'考查',icon:ClipboardCheck}];
const initial:StudyState={profile:{hours:4,track:'undecided',start_date:'',diagnostic:'{}',updated_at:0},progress:[],projects:[],attemptCount:0,checkpoints:[]};
const subscribeMobile=(listener:()=>void)=>{const media=window.matchMedia('(max-width:760px)');media.addEventListener('change',listener);return()=>media.removeEventListener('change',listener)};
const mobileSnapshot=()=>window.matchMedia('(max-width:760px)').matches;
type TestTab='lessons'|'stages'|'review';

export default function StudyApp({weeks,userName,userId}:{weeks:Week[];userName:string;userId:string}){
 return <DraftProvider key={userId} userId={userId}><StudyWorkspace weeks={weeks} userName={userName} userId={userId}/></DraftProvider>;
}

function StudyWorkspace({weeks,userName,userId}:{weeks:Week[];userName:string;userId:string}){
 const [view,setView]=useState('learn'),[selected,setSelected]=useState('w01-d1'),[mode,setMode]=useState('study'),[lessonTab,setLessonTab]=useState<'learn'|'quiz'>('learn');
 const [state,setState]=useState<StudyState>(initial),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [menu,setMenu]=useState(false),[query,setQuery]=useState(''),[openedWeek,setOpenedWeek]=useState(1),[stageWeek,setStageWeek]=useState(4),[testTab,setTestTab]=useState<TestTab>('lessons'),[now,setNow]=useState(0),[accountIssue,setAccountIssue]=useState('');
 const accountBlocked=useRef(false),stateRef=useRef(initial),readVersion=useRef(0),pending=useRef(0),queue=useRef<Promise<unknown>>(Promise.resolve()),inFlight=useRef(new Map<string,Promise<SaveResult|null>>());
 const isMobile=useSyncExternalStore(subscribeMobile,mobileSnapshot,()=>false),track=state.profile.track;
 const lessons=useMemo(()=>lessonList(weeks,track),[weeks,track]);
 const allLessons=useMemo(()=>weeks.flatMap(w=>w.lessons),[weeks]);
 const lessonTitles=useMemo(()=>Object.fromEntries(allLessons.map(l=>[l.id,l.title])),[allLessons]);
 const progress=new Map(state.progress.map(p=>[p.lesson_id,p]));
 const depthScores=new Map((state.depthScores??[]).map(item=>[item.lesson_id,item]));
 const previousDepthScores=new Map((state.previousDepthScores??[]).map(item=>[item.lesson_id,item]));
 const retentionScores=new Map((state.retentionScores??[]).map(item=>[item.lesson_id,item]));
 const retentionSchedule=(state.retentionDue??[]).filter(item=>lessons.some(lesson=>lesson.id===item.lesson_id));
 const retentionDue=retentionSchedule.filter(item=>item.due_at<=now),nextRetention=retentionSchedule.find(item=>item.due_at>now);
 const retentionFirstPassed=lessons.filter(item=>retentionScores.get(item.id)?.first_score===100).length;
 const retentionPassed=lessons.filter(item=>retentionScores.get(item.id)?.best_score===100).length;
 const basePassed=lessons.filter(l=>(progress.get(l.id)?.best_score??0)>=80).length;
 const deepPassed=lessons.filter(l=>(depthScores.get(l.id)?.best_score??0)>=80).length;
 const passed=lessons.filter(l=>(progress.get(l.id)?.best_score??0)>=80&&(depthScores.get(l.id)?.best_score??0)>=80).length;
 const due=lessons.filter(l=>{const p=progress.get(l.id);return !!p&&p.next_review>0&&p.next_review<=now});
 const wrong=lessons.filter(l=>{const p=progress.get(l.id);const deep=depthScores.get(l.id);return (!!p&&p.score<80&&p.answers&&p.answers!=='[]')||!!deep&&deep.score<80});
 const candidate=lessons.find(l=>(progress.get(l.id)?.best_score??0)<80||(depthScores.get(l.id)?.best_score??0)<80);
 const needsTrack=track==='undecided'&&(!candidate||Number(candidate.id.slice(1,3))>=13),next=needsTrack?undefined:candidate;
 const lesson=allLessons.find(l=>l.id===selected),lessonWeek=weeks.find(w=>w.lessons.some(l=>l.id===selected));
 const activeSection=view==='assess'||view==='assessment'||view==='diagnostic'||(view==='lesson'&&lessonTab==='quiz')?'assess':'learn';
 const syncLessonTab=useCallback((tab:'learn'|'quiz',level?:'basic'|'depth'|'retention')=>{setLessonTab(tab);const params=new URLSearchParams(location.search);if(params.get('view')==='lesson'){params.set('mode',tab==='learn'?'study':level==='retention'?'retention':level==='depth'?'depth':mode==='review'?'review':'exam');history.replaceState({},'',`/?${params}`)}},[mode]);

 const lockAccount=useCallback((message:string)=>{accountBlocked.current=true;readVersion.current++;setAccountIssue(message);setLoaded(false);setError('');setNotice('');setMenu(false)},[]);
 const applyState=useCallback((nextState:StudyState)=>{stateRef.current=nextState;setState(nextState);setNow(Date.now())},[]);
 const load=useCallback(async()=>{
  if(pending.current||accountBlocked.current)return;
  const version=++readVersion.current;setError('');
  try{
   const response=await fetch('/api/state',{cache:'no-store',headers:{'x-study-user-id':userId}});
   if(version!==readVersion.current||accountBlocked.current)return;
   if(response.status===401){lockAccount('登录已失效，请重新登录后继续。');return}
   const result=await response.json() as StudyState&{error?:string;code?:string};
   if(version!==readVersion.current||accountBlocked.current)return;
   if(result.code==='account-context'||result.code==='account-context-required'){lockAccount(result.error||'账号已变化，请重新载入。');return}
   if(!response.ok)throw new Error(result.error||'学习记录读取失败，请重试。');
   applyState(result);setLoaded(true);
  }catch(e){if(version===readVersion.current&&!accountBlocked.current)setError(e instanceof TypeError?'暂时无法连接，请检查网络后重试。':e instanceof Error?e.message:'读取失败，请重试。')}
 },[applyState,lockAccount,userId]);
 useEffect(()=>{
  function restore(){
   const params=new URLSearchParams(location.search),target=params.get('view')??'learn',restoredMode=params.get('mode')??'study';
   setView(['learn','assess','lesson','assessment','diagnostic'].includes(target)?target:['review','progress'].includes(target)?'assess':'learn');
   const restored=['study','review','exam','quiz','depth','retention'].includes(restoredMode)?restoredMode:'exam';setMode(restored);setLessonTab(restored==='study'?'learn':'quiz');
   if(params.get('lesson'))setSelected(params.get('lesson')!);
   const week=Number(params.get('week'));if(week>=1&&week<=26){setOpenedWeek(week);setStageWeek(checkpoints.some(stage=>stage.week===week)?week:4)}
   const tab=params.get('tab');setTestTab(tab==='stages'||tab==='review'?tab:target==='review'?'review':'lessons');
   setMenu(false);
  }
  const timer=window.setTimeout(()=>{void load();restore()},0);
  function refresh(){if(document.visibilityState==='visible')void load()}
  window.addEventListener('popstate',restore);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  return()=>{window.clearTimeout(timer);window.removeEventListener('popstate',restore);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)};
 },[load]);
 useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),60000);return()=>window.clearInterval(timer)},[]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),3500);return()=>clearTimeout(timer)},[notice]);
 const closeMenu=useCallback(()=>{setMenu(false);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.mobile-menu')?.focus())},[]);
 useEffect(()=>{
  if(!menu||!isMobile)return;
  const panel=document.getElementById('learning-navigation'),overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  const frame=requestAnimationFrame(()=>panel?.querySelector<HTMLButtonElement>('button')?.focus());
  function keydown(event:KeyboardEvent){
   if(event.key==='Escape')closeMenu();
   if(event.key==='Tab'){
    const buttons=panel?.querySelectorAll<HTMLButtonElement>('button:not(:disabled),a[href]');if(!buttons?.length)return;
    const first=buttons[0],last=buttons[buttons.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
   }
  }
  document.addEventListener('keydown',keydown);
  return()=>{cancelAnimationFrame(frame);document.body.style.overflow=overflow;document.removeEventListener('keydown',keydown)};
 },[menu,isMobile,closeMenu]);

 const save:Save=body=>{
  if(accountBlocked.current)return Promise.resolve(null);
  if(!loaded){setError('尚未连接学习记录，请先重试。');return Promise.resolve(null)}
  const signature=JSON.stringify(body),existing=inFlight.current.get(signature);if(existing)return existing;
  pending.current++;setBusy(true);readVersion.current++;
  const request=queue.current.then(async()=>{
   try{
    if(accountBlocked.current)return null;
    setError('');const payload={...body};
    if(body.action==='profile'&&payload.expectedUpdatedAt===undefined)payload.expectedUpdatedAt=stateRef.current.profile.updated_at;
    const response=await fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json','x-study-user-id':userId},body:JSON.stringify(payload)});
    if(accountBlocked.current)return null;
    if(response.status===401){lockAccount('登录已失效，本次作答未提交。请重新登录。');return null}
    const result=await response.json() as SaveResult&{error?:string;code?:string};
    if(accountBlocked.current)return null;
    if(result.code==='account-context'||result.code==='account-context-required'){lockAccount(result.error||'账号已变化，本次提交未完成。');return null}
    if(!response.ok){if(response.status===409&&result.state)applyState(result.state);throw new Error(result.error||'提交未完成，作答已保留，请重试。')}
    applyState(result.state);if(body.action!=='start')setNotice(body.action==='profile'?'学习安排已更新':'作答与成绩已保存');return result;
   }catch(e){if(!accountBlocked.current)setError(e instanceof TypeError?'连接中断，作答已保留，请重试。':e instanceof Error?e.message:'提交未完成，请重试。');return null}
   finally{pending.current--;inFlight.current.delete(signature);if(!pending.current)setBusy(false)}
  });
  inFlight.current.set(signature,request);queue.current=request;return request;
 };
 function go(target:string,id?:string,nextMode='study',week?:number,tab?:TestTab){
  setView(target);setMenu(false);setMode(nextMode);setLessonTab(nextMode==='study'?'learn':'quiz');if(id)setSelected(id);if(week){setStageWeek(week);setOpenedWeek(week)}if(target==='assess')setTestTab(tab??'lessons');
  const params=new URLSearchParams({view:target});if(id)params.set('lesson',id);if(nextMode!=='study')params.set('mode',nextMode);if(week)params.set('week',String(week));if(tab)params.set('tab',tab);
  history.pushState({},'',`/?${params}`);window.scrollTo({top:0,behavior:'instant'});
  requestAnimationFrame(()=>{const heading=document.querySelector<HTMLElement>('#learning-content h1');heading?.setAttribute('tabindex','-1');heading?.focus({preventScroll:true})});
  if(target==='lesson'&&id&&loaded)void save({action:'start',lessonId:id});
 }
 function openLesson(item:Lesson,nextMode='study'){go('lesson',item.id,nextMode)}
 function showPlan(){go('learn');requestAnimationFrame(()=>{const plan=document.querySelector<HTMLDetailsElement>('#learning-plan');if(plan){plan.open=true;plan.scrollIntoView({behavior:'smooth',block:'center'});plan.querySelector<HTMLElement>('select')?.focus()}})}
 function nextLesson(){const index=lessons.findIndex(l=>l.id===selected),item=lessons[index+1];if(item&&!(track==='undecided'&&Number(item.id.slice(1,3))>=13))openLesson(item);else if(track==='undecided')showPlan();else go('learn')}
 function preferredTestMode(id:string){const basic=progress.get(id),deep=depthScores.get(id);if((basic?.best_score??0)<80||(basic?.answers&&basic.answers!=='[]'&&basic.score<80))return 'exam';return (deep?.best_score??0)<80||(deep?.score??100)<80?'depth':'exam'}
 function courseRow(item:Lesson,forTest=false){
  const record=progress.get(item.id),deep=depthScores.get(item.id),hasAttempt=!!record?.answers&&record.answers!=='[]'||!!deep,hasPassed=(record?.best_score??0)>=80&&(deep?.best_score??0)>=80;
  return <button key={item.id} className="lesson-row" onClick={()=>openLesson(item,forTest?preferredTestMode(item.id):'study')}><span className={'lesson-symbol '+(hasPassed?'done':'')}>{hasPassed?<CheckCircle2 size={19}/>:String(item.day).padStart(2,'0')}</span><span className="lesson-row-text"><strong>{item.title}</strong><small>{forTest?`基础 ${item.quiz.length} 题＋深化 5 题 · 基础最高 ${record?.best_score??0} 分 / 深化最高 ${deep?.best_score??0} 分`:item.summary}</small></span><span className="lesson-meta">{hasPassed?'两层通过':(record?.best_score??0)>=80&&!deep?'待深化':hasAttempt?'待巩固':forTest?'未作答':`${item.minutes} 分钟`}</span>{forTest?<ClipboardCheck size={16}/>:<Play size={15}/>}</button>;
 }
 function courseList(forTest=false){
  const normalized=query.trim().toLowerCase();
  const filtered=weeks.map(week=>({week,items:pathLessons(week,track).filter(item=>!normalized||`${week.number} ${week.title} ${item.title} ${item.summary}`.toLowerCase().includes(normalized))})).filter(({week,items})=>items.length||(!normalized&&week.number>=13&&week.number<=16&&track==='undecided'));
  return <><label className="search-box course-search"><Search size={18}/><input aria-label={forTest?'搜索课后考查':'搜索课程'} value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索课程、主题或周次"/>{query&&<button aria-label="清空搜索" onClick={()=>setQuery('')}><X size={16}/></button>}</label><div className="roadmap-list">{filtered.map(({week,items})=>{
   const isOpen=!!normalized||openedWeek===week.number,weekPassed=items.filter(item=>(progress.get(item.id)?.best_score??0)>=80&&(depthScores.get(item.id)?.best_score??0)>=80).length;
   return <section className="week-card" key={week.number}><button className="simple-week-heading" aria-expanded={isOpen} aria-controls={'week-lessons-'+week.number} onClick={()=>setOpenedWeek(isOpen?0:week.number)}><span className="week-number">{String(week.number).padStart(2,'0')}</span><span><small>{week.phase}</small><strong>{week.title}</strong></span><span className="week-summary">{items.length?`${weekPassed} / ${items.length} 已通过`:'选择方向'}</span><ChevronDown size={18} className={isOpen?'rotated':''}/></button>{isOpen&&<div id={'week-lessons-'+week.number} className="simple-week-body"><p className="muted">{week.focus}</p>{items.length?items.map(item=>courseRow(item,forTest)):<div className="callout"><strong>选择一个主攻方向</strong><p>视觉、时间序列、自然语言处理三选一，然后继续第 13–16 周的专项学习与考查。</p><button className="text-button" onClick={showPlan}>选择方向</button></div>}</div>}</section>;
  })}{!filtered.length&&<section className="panel empty-state"><h2>没有找到相关课程</h2><p>试试其他关键词，或清空搜索查看全部课程。</p><button className="secondary" onClick={()=>setQuery('')}>查看全部课程</button></section>}</div></>;
 }

 if(accountIssue)return <main className="view-content reading-width"><h1>请重新连接账号</h1><div className="callout danger" role="alert"><p>{accountIssue}</p><p>当前作答保留在原账号的此标签页中。重新登录原账号后刷新，可继续作答。</p></div><div className="row-actions"><a className="primary" href="/signin-with-chatgpt?return_to=%2F" target="_top">重新登录</a><button className="secondary" onClick={()=>window.location.reload()}>重新载入</button></div></main>;
 if(!loaded)return <main className="view-content" aria-busy={!error}><h1>连接学习与考查记录</h1><p role={error?'alert':'status'}>{error||'正在读取课程进度与选择题成绩…'}</p>{error&&<><button className="primary" onClick={()=>void load()}>重试连接</button><details className="offline-reader"><summary>先阅读课程</summary><p className="muted">可以阅读课程和示例。恢复连接后再提交考查。</p><label className="evidence-field">选择课程<select value={selected} onChange={event=>setSelected(event.target.value)}>{weeks.map(week=><optgroup label={'第 '+week.number+' 周 · '+week.title} key={week.number}>{week.lessons.map(item=><option key={item.id} value={item.id}>{item.title}{item.track==='common'?'':' · '+trackNames[item.track]}</option>)}</optgroup>)}</select></label>{lesson&&lessonWeek&&<LessonView key={'offline:'+selected} lesson={lesson} week={lessonWeek} save={save} readOnly busy mode="study" hours={4} lessonTitles={lessonTitles} onPrerequisite={setSelected} onBack={()=>setSelected('')} onNext={()=>{const index=allLessons.findIndex(item=>item.id===selected);setSelected(allLessons[index+1]?.id??'')}}/>}</details></>}</main>;

 return <div className="app-shell simple-study"><a className="skip-link" href="#learning-content">跳到主要内容</a><aside role={isMobile&&menu?'dialog':undefined} aria-modal={isMobile&&menu?true:undefined} aria-label="学习与考查导航" inert={isMobile&&!menu} id="learning-navigation" className={'sidebar '+(menu?'mobile-open':'')}><button className="brand" onClick={()=>go('learn')}><span className="brand-mark">A<span>i</span></span><span><strong>AI 博士</strong><small>26 周系统自学</small></span></button><button className="mobile-nav-close" onClick={closeMenu}><X size={18}/>关闭导航</button><div className="side-kicker">专注理解，及时检验</div><nav aria-label="主要导航">{navigation.map(item=><button key={item.id} aria-current={activeSection===item.id?'page':undefined} className={activeSection===item.id?'active':''} onClick={()=>go(item.id)}><item.icon size={20}/><span>{item.name}</span>{item.id==='assess'&&(due.length+retentionDue.length)>0&&<b className="nav-count">{due.length+retentionDue.length}</b>}</button>)}</nav><div className="sidebar-plan"><span>26 周 · 一个主攻方向</span><strong>{trackNames[track]}</strong><div className="side-progress"><div style={{width:`${passed/130*100}%`}}/></div><small>{passed} / 130 课两层考查已通过</small></div><div className="side-bottom"><div className="learner"><span>学</span><div><strong>{userName}</strong><small>学习 · 选择题考查</small></div></div></div></aside>{menu&&<button className="menu-overlay" aria-label="关闭导航" onClick={closeMenu}/>}
  <main inert={isMobile&&menu} id="learning-content" tabIndex={-1} className="main-shell"><header className="topbar"><div><button className="mobile-menu" aria-expanded={menu} aria-controls="learning-navigation" aria-label={menu?'关闭导航':'打开导航'} onClick={()=>setMenu(!menu)}>{menu?<X size={21}/>:<Menu size={21}/>}</button><span className="top-title">{activeSection==='learn'?'学习':'考查'}</span><span className="top-divider"/><span className="muted top-subtitle">26 周 AI 学习计划</span></div><div className="top-actions"><span className="sync-status">{error?<><CloudOff size={16}/>连接待恢复</>:<><CloudCheck size={16}/>{busy?'正在保存成绩…':'记录已连接'}</>}</span><a className="text-button" href="/signout-with-chatgpt?return_to=/" target="_top">退出</a></div></header>{error&&<div className="error-banner" role="alert"><span>{error}</span><button disabled={busy} onClick={()=>void load()}>重新读取</button><button aria-label="关闭提示" onClick={()=>setError('')}><X size={16}/></button></div>}{notice&&<div className="toast" role="status"><CheckCircle2 size={17}/>{notice}</div>}

   {view==='learn'&&<div className="view-content"><div className="page-heading"><div><span className="eyebrow">26 周 · 循序渐进</span><h1>学习</h1><p>从机器学习与深度学习的前置知识出发，跟随分步讲解、结果表和渐少提示的例题，逐步形成独立推理能力。</p></div><button className="secondary" onClick={()=>go('assess')}>进入考查<ClipboardCheck size={16}/></button></div><div className="simple-intro-grid"><section className="today-main"><span className="today-card-label">继续深入学习</span><h2>{next?.title??(needsTrack?'选择你的主攻方向':'主线基础与深化考查已全部通过')}</h2><p>{next?.summary??(needsTrack?'完成共同基础后，选择一个方向继续专项学习。':'继续完成延迟复测和阶段考查，并回顾薄弱内容。')}</p><div className="today-lesson-meta"><span>{next?`第 ${Number(next.id.slice(1,3))} 周 · ${next.minutes} 分钟主课`:'按自己的节奏巩固理解'}</span></div><div className="today-card-actions"><button className="light-button" onClick={()=>next?openLesson(next):needsTrack?showPlan():go('assess',undefined,'study',undefined,'stages')}>{next?'开始学习':needsTrack?'选择方向':'查看阶段考查'}<Play size={16}/></button>{next&&<button className="subtle-light" onClick={()=>openLesson(next,preferredTestMode(next.id))}>直接考查本课</button>}</div></section><section className="panel learning-overview"><span className="eyebrow">学习进度</span><h2>{passed}<small> / 130 课两层考查已通过</small></h2><div className="mini-bar"><span style={{width:`${passed/130*100}%`}}/></div><p>基础通过 {basePassed} 课 · 新版深化通过 {deepPassed} 课</p><p>首次延迟复测通过 {retentionFirstPassed} 课 · 补弱后通过 {retentionPassed-retentionFirstPassed} 课</p><p>基础3题需全对，深化5题至少答对4题。延迟复测与阶段考查单独记录。</p><button className="secondary" onClick={()=>go('assess',undefined,'study',undefined,'review')}><RefreshCw size={16}/>{due.length+retentionDue.length?`${due.length+retentionDue.length} 项到期复习`:'查看错题与复习'}</button></section></div><SelfStudyGoal/><LearningPlan profile={state.profile} save={save} busy={busy}/><section className="simple-course-section"><div className="section-title"><h2>26 周课程</h2><span className="pill">主线 130 课 · 三选一专项</span></div>{courseList()}</section></div>}

   {view==='assess'&&<div className="view-content"><div className="page-heading"><div><span className="eyebrow">选择题 · 即时评分与解析</span><h1>考查</h1><p>完成选择题后查看成绩和解析，按错题返回课程巩固。</p></div><button className="secondary" onClick={()=>go('diagnostic')}>起点自测 · 12 题</button></div><div className="tabs assessment-tabs" aria-label="考查范围">{([{id:'lessons',label:'课后考查'},{id:'stages',label:'阶段考查'},{id:'review',label:'错题与复习'}] as const).map(tab=><button key={tab.id} className={testTab===tab.id?'selected':''} aria-pressed={testTab===tab.id} onClick={()=>go('assess',undefined,'study',undefined,tab.id)}>{tab.label}{tab.id==='review'&&(due.length+retentionDue.length)>0?` · ${due.length+retentionDue.length}`:''}</button>)}</div>
    {testTab==='lessons'&&<><p className="muted section-description">每课基础 3 题需全对，深化 5 题至少答对 4 题。旧基础成绩保留，新增深化考查单独计分；两层通过计入当堂考查进度；延迟复测与阶段考查另行记录。</p>{courseList(true)}</>}
    {testTab==='stages'&&<><p className="muted section-description">第 4、8、12、16、20、24、26 周各一次阶段考查；每次 6 道选择题，至少答对 5 题通过。</p><div className="checkpoint-grid simple-checkpoints">{checkpoints.map(stage=>{const record=state.checkpoints.find(item=>item.week===stage.week&&item.track===(stage.week===16?track:'common')),choose=stage.week===16&&track==='undecided';return <section className="panel" key={stage.week}><span className="eyebrow">第 {stage.week} 周</span><h2>{stage.title}</h2><p>{choose?'先选择主攻方向，题目将与你的专项匹配。':record?`最近 ${record.score} 分 · 最高 ${record.best_score} 分`:'6 道选择题 · 通过线 80%'}</p><button className="primary" onClick={()=>choose?showPlan():go('assessment',undefined,'exam',stage.week)}>{choose?'选择方向':record?'再次考查':'开始考查'}</button></section>})}</div></>}
    {testTab==='review'&&<div className="simple-review-grid"><section className="panel"><div className="section-title"><h2>延迟迁移复测</h2><span className="pill">{retentionDue.length} 课到期</span></div><p className="muted">新版深化通过7天后开放三道独立变式，全对通过；补弱后须满24小时再重做同组。</p>{retentionDue.map(item=>{const course=allLessons.find(lesson=>lesson.id===item.lesson_id);return course&&<button className="lesson-row" key={item.lesson_id} onClick={()=>openLesson(course,'retention')}><span className="lesson-symbol"><RefreshCw size={17}/></span><span className="lesson-row-text"><strong>{course.title}</strong><small>{item.attempts?'补弱后的同组重测':'首次延迟新题'} · 3题</small></span><Play size={15}/></button>})}{!retentionDue.length&&<p className="empty-copy">{nextRetention?`最近一课将在 ${new Date(nextRetention.due_at).toLocaleString()} 开放。`:'先完成新版深化题，一周后回到这里。'}</p>}<p className="muted">已通过 {retentionPassed} 课；全部尝试保留在账号记录中。</p></section><section className="panel"><div className="section-title"><h2>基础到期复习</h2><span className="pill">{due.length} 课</span></div><p className="muted">到期后重做本课选择题，通过后逐步延长复习间隔。</p>{due.map(item=><div key={item.id} className="review-lesson"><button className="lesson-row" onClick={()=>openLesson(item,'review')}><span className="lesson-symbol"><RefreshCw size={17}/></span><span className="lesson-row-text"><strong>{item.title}</strong><small>3 道选择题 · 复习后更新计划</small></span><Play size={15}/></button></div>)}{!due.length&&<p className="empty-copy">暂时没有到期任务，可以继续学习新课。</p>}</section><section className="panel"><div className="section-title"><h2>需要巩固</h2><span className="pill">{wrong.length} 课</span></div><p className="muted">最近一次未通过的课程。重新理解后再作答。</p>{wrong.map(item=><div key={item.id} className="review-lesson">{courseRow(item,true)}<button className="text-button compact" onClick={()=>openLesson(item)}>先复习讲解</button></div>)}{!wrong.length&&<p className="empty-copy">暂无未通过的课后考查。</p>}</section></div>}
   </div>}

   {view==='lesson'&&(lesson&&lessonWeek?<LessonView key={selected+mode} lesson={lesson} week={lessonWeek} progress={progress.get(selected)} depthScore={depthScores.get(selected)} previousDepthScore={previousDepthScores.get(selected)} retentionScore={retentionScores.get(selected)} save={save} busy={busy} mode={mode} hours={state.profile.hours} track={track} lessonTitles={lessonTitles} onPrerequisite={id=>{const item=allLessons.find(l=>l.id===id);if(item)openLesson(item)}} onBack={()=>go(activeSection)} onNext={nextLesson} onTabChange={syncLessonTab}/>:<div className="view-content"><h1>未找到这节课程</h1><p>请从课程列表重新选择。</p><button className="primary" onClick={()=>go('learn')}>返回学习</button></div>)}
   {view==='assessment'&&<Assessment key={stageWeek+track} week={stageWeek} state={state} save={save} busy={busy} onBack={()=>go('assess',undefined,'study',undefined,'stages')} onLesson={id=>{const item=allLessons.find(l=>l.id===id);if(item)openLesson(item)}} reviewLessons={weeks.filter(week=>week.number>([...checkpoints].reverse().find(stage=>stage.week<stageWeek)?.week??0)&&week.number<=stageWeek).flatMap(week=>pathLessons(week,track).slice(0,1)).map(item=>({id:item.id,title:item.title}))}/>}
   {view==='diagnostic'&&<Diagnostic state={state} save={save} busy={busy} onDone={()=>go('assess')}/>}
   <footer className="page-footer"><span>AI 博士 · 26 周强化计划</span><span>学习 · 选择题考查</span></footer>
  </main><nav inert={isMobile&&menu} className="mobile-bottom simple-mobile-bottom" aria-label="快捷导航">{navigation.map(item=><button key={item.id} aria-current={activeSection===item.id?'page':undefined} className={activeSection===item.id?'active':''} onClick={()=>go(item.id)}><item.icon size={21}/><span>{item.name}</span></button>)}</nav>
 </div>;
}

function SelfStudyGoal(){
 return <details className="panel self-study-goal"><summary><strong>26周要学到什么，怎样判断自己学会了？</strong><ChevronDown size={18}/></summary><p>目标是解释机器学习与深度学习核心原理、核对关键推导、分析陌生小例，并判断研究证据的适用范围。按每周5课推进，主讲研读后留时间手算、考查与复习；遇到卡点可以延长该周。</p><div className="study-milestones"><div><strong>1–6周 · 补齐基础</strong><p>程序与数据、线性代数、导数、概率统计。先能说明每个量和每一步。</p></div><div><strong>7–12周 · 理解模型</strong><p>回归、分类、评估、张量、反传、优化、卷积和注意力。能核对计算并辨认错误。</p></div><div><strong>13–16周 · 深入一个方向</strong><p>视觉、时序、语言三选一，用完整小例连接模型与评价。</p></div><div><strong>17–26周 · 综合判断</strong><p>从给定研究材料判断主张、对照、统计不确定性与外推边界，完成新条件推理。</p></div></div><p>每课先学术语，跟算例，再做减少提示的练习。基础3题全对、深化5题至少4题正确；深化通过满7天后做3道独立变式，全对通过。主线结束后继续完成末周新课的延迟复测。</p><p className="muted">成绩反馈受测理解与保持；实际编程、训练执行与原创研究能力需另外验证。课程时长与26周安排是可调整的路线，不保证完成后自动精通。</p></details>;
}

function LearningPlan({profile,save,busy}:{profile:StudyState['profile'];save:Save;busy:boolean}){
 const draft=useDraft('learning-plan',{track:profile.track,date:profile.start_date||todaySeoul(),hours:profile.hours,updatedAt:profile.updated_at});
 const changed=draft.dirty,conflict=changed&&draft.value.updatedAt!==profile.updated_at;
 return <details id="learning-plan" className="panel simple-plan"><summary><span>学习安排</span><small>{trackNames[profile.track]}</small><ChevronDown size={18}/></summary><p className="muted">保留 26 周路线，专项选择一个方向。可以按理解程度放慢节奏。</p><div className="simple-plan-fields"><label className="evidence-field">主攻方向<select value={draft.value.track} onChange={event=>draft.set({...draft.value,track:event.target.value as Track})}>{(Object.keys(trackNames) as Track[]).map(track=><option key={track} value={track}>{trackNames[track]}</option>)}</select></label><label className="evidence-field">开始日期<input type="date" value={draft.value.date} onChange={event=>draft.set({...draft.value,date:event.target.value})}/></label></div>{conflict&&<div className="callout danger"><strong>学习安排已在另一页面更新</strong><p>当前云端方向：{trackNames[profile.track]}，开始日期：{profile.start_date}。</p><div className="row-actions"><button className="secondary" onClick={()=>draft.set({...draft.value,updatedAt:profile.updated_at})}>保留当前选择</button><button className="text-button" onClick={()=>draft.clear()}>采用云端安排</button></div></div>}<button className="secondary" disabled={busy||!changed||conflict||!draft.value.date} onClick={async()=>{const snapshot=draft.value;if(await save({action:'profile',track:snapshot.track,start_date:snapshot.date,hours:snapshot.hours,expectedUpdatedAt:snapshot.updatedAt}))draft.clear(snapshot)}}>{busy?'正在更新…':'更新学习安排'}</button></details>;
}

function Diagnostic({state,save,busy,onDone}:{state:StudyState;save:Save;busy:boolean;onDone:()=>void}){
 const draft=useDraft<number[]>('simple-diagnostic',[]),answers=draft.value;
 const [result,setResult]=useState<null|Record<string,{correct:number;total:number}>>(null);
 let previous:{areas?:Record<string,{correct:number;total:number}>}={};try{previous=JSON.parse(state.profile.diagnostic)}catch{}
 return <div className="view-content reading-width"><button className="text-button back" onClick={onDone}>返回考查</button><div className="page-heading"><div><span className="eyebrow">12 道选择题 · 约 10 分钟</span><h1>起点自测</h1><p>了解当前基础。不知道时可以直接选择“我还不清楚”。</p></div></div><section className="panel">{diagnostics.map((question,index)=><fieldset className="quiz-question" key={index}><legend><span>{index+1}</span>{question.question}<small className="pill">{question.area}</small></legend>{question.options.slice(0,3).map((option,choice)=><label className={'quiz-option '+(answers[index]===choice?'chosen':'')} key={choice}><input type="radio" name={'diagnostic-'+index} checked={answers[index]===choice} onChange={()=>{const next=[...answers];next[index]=choice;draft.set(next);setResult(null)}}/>{option}</label>)}<label className={'quiz-option '+(answers[index]===-1?'chosen':'')}><input type="radio" name={'diagnostic-'+index} checked={answers[index]===-1} onChange={()=>{const next=[...answers];next[index]=-1;draft.set(next);setResult(null)}}/>我还不清楚</label></fieldset>)}<button className="primary" disabled={busy||diagnostics.some((_,index)=>!Number.isInteger(answers[index]))} onClick={async()=>{const snapshot=[...answers];if(await save({action:'diagnostic',answers:snapshot})){const areas:Record<string,{correct:number;total:number}>={};diagnostics.forEach((question,index)=>{areas[question.area]??={correct:0,total:0};areas[question.area].total++;if(snapshot[index]===question.answer)areas[question.area].correct++});setResult(areas);draft.clear(snapshot)}}}>{busy?'正在评分…':'提交自测'}</button></section>{(result||previous.areas)&&<section className="panel diagnostic-summary"><h2>{result?'本次自测结果':'最近自测结果'}</h2>{Object.entries(result??previous.areas??{}).map(([area,score])=><div className="diagnostic-result" key={area}><strong>{area}</strong><span>{score.correct} / {score.total}</span><p>{score.correct===score.total?'基础概念理解较好，可继续后续课程。':'建议按学习路线回顾这一部分。'}</p></div>)}<button className="secondary" onClick={onDone}>返回考查</button></section>}</div>;
}
