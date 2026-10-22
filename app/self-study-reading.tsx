'use client';
import {useState} from 'react';
import type {PublicSelfStudyLesson} from '@/lib/self-study-types';
import LessonVisual from './lesson-visuals';

export default function SelfStudyReading({lessonId,data,onQuiz}:{lessonId:string;data:PublicSelfStudyLesson;onQuiz:()=>void}){
 const [choice,setChoice]=useState<number|null>(null),[revealed,setRevealed]=useState(false);
 return <section className="self-study-reading" id="self-study-reading">
  <div className="self-study-start"><span className="eyebrow">自学主讲 · 约 {data.readingMinutes} 分钟研读</span><h2>{data.question}</h2><p>先理解每一步，再用完整算例核对。遇到陌生词，先读下面的解释。</p></div>
  <section className="study-vocabulary"><h2>先补齐这几个概念</h2><dl>{data.prerequisites.map(item=><div key={item.term}><dt>{item.term}</dt><dd><p>{item.explanation}</p><p className="study-check"><strong>快速核对：</strong>{item.check}</p></dd></div>)}</dl></section>
  <nav className="depth-outline" aria-label="自学讲解目录">{data.sections.map((section,index)=><a key={index} href={'#study-step-'+index}>{index+1}. {section.title}</a>)}<a href="#study-worked">跟着算一遍</a><a href="#study-faded">减少提示再试一次</a></nav>
  {data.sections.map((section,index)=><section className="concept study-step" id={'study-step-'+index} key={index}><span className="concept-index">第 {index+1} 步</span><h2>{section.title}</h2>{section.body.split('\n').filter(Boolean).map((line,i)=><p key={i}>{line}</p>)}</section>)}
  <LessonVisual lessonId={lessonId}/>
  <section className="study-worked" id="study-worked"><span className="eyebrow">完整推演</span><h2>{data.worked.title}</h2><p><strong>已知：</strong>{data.worked.given}</p><ol>{data.worked.steps.map((step,index)=><li key={index}>{step}</li>)}</ol><div className="study-table-scroll"><table><caption>中间结果与最终结果 · 本课教学算例</caption><thead><tr>{data.worked.table.headers.map((header,index)=><th scope="col" key={index}>{header}</th>)}</tr></thead><tbody>{data.worked.table.rows.map((row,index)=><tr key={index}>{row.map((cell,i)=><td key={i}>{cell}</td>)}</tr>)}</tbody></table></div><p className="example-result">{data.worked.conclusion}</p></section>
  <section className="study-faded" id="study-faded"><span className="eyebrow">提示减少一点</span><h2>换一个例子，你会怎样继续？</h2><p>{data.faded.prompt}</p><fieldset disabled={revealed}><legend className="sr-only">选择下一步或结果</legend>{data.faded.options.map((option,index)=><label className={'quiz-option '+(choice===index?'chosen ':'')+(revealed&&data.faded.answer===index?'correct':'')} key={index}><input type="radio" name={'faded-'+lessonId} checked={choice===index} onChange={()=>setChoice(index)}/><span className="option-letter">{String.fromCharCode(65+index)}</span>{option}</label>)}</fieldset>{!revealed?<button className="secondary" disabled={choice===null} onClick={()=>setRevealed(true)}>对照完整推理</button>:<div className="quiz-explanation"><strong>{choice===data.faded.answer?'这一步判断正确':'沿着下面的步骤重新核对'}</strong><p>正确选择：{data.faded.options[data.faded.answer]}</p><p>{data.faded.explanation}</p><ol>{data.faded.steps.map((step,index)=><li key={index}>{step}</li>)}</ol><button className="text-button" onClick={()=>{setChoice(null);setRevealed(false)}}>收起解析，再推演一次</button></div>}<p className="muted">这是讲解中的练习，帮助定位理解卡点。正式考查单独记录成绩。</p></section>
  <section className="study-recap"><h2>进入考查前，再核对三件事</h2><ul>{data.recap.map(item=><li key={item}>{item}</li>)}</ul><button className="primary" onClick={onQuiz}>用新情境深化题检验理解</button></section>
 </section>;
}
