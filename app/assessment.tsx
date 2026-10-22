'use client';

import {useState} from 'react';
import {orderedChoices} from '@/lib/choice-order';
import {checkpoints,checkpointQuestions} from '@/lib/checkpoints';
import type {StudyState} from '@/lib/types';
import {useDraft,type Save,type Feedback} from './lesson-view';

type ReviewLesson={id:string;title:string};
type AssessmentProps={
 week:number;
 state:StudyState;
 save:Save;
 busy:boolean;
 onBack:()=>void;
 onProject?:()=>void;
 onLesson:(id:string)=>void;
 reviewLessons?:ReviewLesson[];
};

export default function Assessment({week,state,save,busy,onBack,onLesson,reviewLessons}:AssessmentProps){
 const stage=checkpoints.find(item=>item.week===week)??checkpoints[0];
 const track=state.profile.track;
 const [submittedAnswers,setSubmittedAnswers]=useState<number[]>([]);
 const [feedback,setFeedback]=useState<Feedback|null>(null);
 const [submitting,setSubmitting]=useState(false);
 const [error,setError]=useState('');
 const draft=useDraft<number[]>('checkpoint:'+stage.week+':'+track,submittedAnswers);
 const answers=draft.value;
 const questions=checkpointQuestions(stage,track);
 const record=state.checkpoints?.find(item=>item.week===stage.week&&item.track===(stage.week===16?track:'common'));
 const answered=questions.reduce((count,question,index)=>count+(Number.isInteger(answers[index])&&answers[index]>=0&&answers[index]<question.options.length?1:0),0);
 const minimumCorrect=Math.ceil(questions.length*.8);
 const pending=busy||submitting;
 const previousWeek=Math.max(0,...checkpoints.filter(item=>item.week<stage.week).map(item=>item.week));
 const reviewWeek=previousWeek+1;
 const reviewId=reviewWeek>=13&&reviewWeek<=16&&track!=='undecided'?`w${reviewWeek}-${track}-d1`:`w${String(reviewWeek).padStart(2,'0')}-d1`;
 const lessons=reviewLessons?.length?reviewLessons:[{id:reviewId,title:'复习本阶段课程'}];

 async function submit(){
  if(pending||answered!==questions.length||feedback)return;
  const submitted=[...answers];
  setSubmitting(true);
  setError('');
  try{
   const result=await save({action:'checkpoint',week:stage.week,track:stage.week===16?track:'common',answers:submitted});
   if(!result?.feedback){setError('提交未完成，答案草稿已保留，请重试。');return;}
   setFeedback(result.feedback);
   setSubmittedAnswers(submitted);
   draft.clear(submitted);
  }catch{
   setError('提交未完成，答案草稿已保留，请重试。');
  }finally{
   setSubmitting(false);
  }
 }

 function restart(){
  if(pending)return;
  setFeedback(null);
  setSubmittedAnswers([]);
  draft.clear();
  setError('');
 }

 if(stage.week===16&&track==='undecided')return <div className="view-content reading-width"><h1>先选择学习方向</h1><p>第 16 周考查的题目与你的专项课程对应。请在学习设置中选择方向。</p><button className="secondary" onClick={onBack}>返回考查列表</button></div>;

 return <div className="view-content reading-width">
  <button className="text-button back" onClick={onBack}>返回考查列表</button>
  <div className="page-heading"><div><span className="eyebrow">第 {stage.week} 周 · 阶段考查</span><h1>{stage.title}</h1><p>完成本阶段选择题，提交后查看得分和每题解析。</p></div>{record&&<span className="pill">历史最高 {record.best_score} 分</span>}</div>
  <section className="panel">
   <div className="section-title"><h2>阶段选择题</h2><span className="pill">共 {questions.length} 题 · 通过线 80%</span></div>
   <p role="status">已答 {answered} / {questions.length} 题 · 答对至少 {minimumCorrect} 题通过</p>
   {questions.map((question,index)=>{
    const result=feedback?.results[index];
    return <fieldset className="quiz-question" key={index} disabled={pending||!!feedback}>
     <legend><span>{index+1}</span>{question.question}</legend>
     {orderedChoices(question.options,'stage:'+stage.week+':'+index+':'+question.question).map(({text:option,index:optionIndex})=><label className={'quiz-option '+(answers[index]===optionIndex?'chosen ':'')+(result?(result.answer===optionIndex?'correct':answers[index]===optionIndex?'incorrect':''):'')} key={optionIndex}><input type="radio" name={'stage-'+stage.week+'-'+index} checked={answers[index]===optionIndex} onChange={()=>{const next=[...answers];next[index]=optionIndex;draft.set(next);setError('');}}/>{option}</label>)}
     {result&&<div className={'quiz-explanation '+(result.correct?'good':'bad')}><strong>{result.correct?'回答正确':'回答错误'}</strong><p>{result.explanation}</p></div>}
    </fieldset>;
   })}
   {error&&<p className="form-error" role="alert">{error}</p>}
   {!feedback&&<><button className="primary" disabled={pending||answered!==questions.length} onClick={()=>void submit()}>{pending?'正在提交…':'提交考查'}</button><p className="muted">{answered<questions.length?`还有 ${questions.length-answered} 题未作答。`:''}{draft.persisted?'答案草稿会在当前标签页刷新后保留。':'答案草稿保留在当前页面。'}</p></>}
   {feedback&&<div className={'quiz-result '+(feedback.score>=80?'good':'bad')} role="status"><strong>{feedback.score} 分 · {feedback.score>=80?'本阶段选择题通过':'本阶段选择题未通过'}</strong><p>{feedback.score>=80?'可以继续学习，也可以查看解析巩固知识。':'查看错题解析，复习对应课程后再做一次。'}</p><div className="card-actions"><button className="primary" onClick={onBack}>返回考查列表</button><button className="secondary" disabled={pending} onClick={restart}>重新作答</button></div></div>}
  </section>
  <section className="panel"><h2>复习对应课程</h2><p>回到本阶段课程，重新理解题目涉及的知识。</p><div className="card-actions">{lessons.map(lesson=><button className="secondary" key={lesson.id} onClick={()=>onLesson(lesson.id)}>{lesson.title}</button>)}</div></section>
 </div>;
}
