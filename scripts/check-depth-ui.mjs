import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,extname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url),modules=new Map();
function load(relative){
 let file=resolve(root,relative);
 if(!extname(file)){try{readFileSync(file+'.ts');file+='.ts'}catch{file+='.tsx'}}
 if(file.endsWith('.json'))return JSON.parse(readFileSync(file,'utf8'));
 if(modules.has(file))return modules.get(file).exports;
 const testModule={exports:{}};modules.set(file,testModule);
 const output=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 function localRequire(id){if(id.startsWith('@/'))return load(id.slice(2));if(id.startsWith('.'))return load(resolve(dirname(file),id));return require(id)}
 new Function('require','module','exports',output)(localRequire,testModule,testModule.exports);return testModule.exports;
}
const {DepthReading,DepthQuiz}=load('app/lesson-depth.tsx'),{DraftProvider}=load('app/lesson-view.tsx');
const {default:SelfStudyReading}=load('app/self-study-reading.tsx');
let checked=0,studyChecked=0,figures=0;
for(const group of ['foundations','models','vision','timeseries','language','research']){
 const data=load(`data/depth-${group}.json`),guides=load(`data/self-study-${group}.json`);
 for(const [lessonId,lesson] of Object.entries(data)){
  const {questions,...content}=lesson,payload={lessonId,version:'depth-v2',content,questions:questions.map(({answer:_answer,explanation:_explanation,...question})=>question)};
  const reading=renderToStaticMarkup(React.createElement(DepthReading,{data:payload,onQuiz:()=>{}}));
  for(const section of lesson.sections)assert(reading.includes('id="depth-'+section.id+'"'));
  assert(reading.includes('id="depth-example"'));assert(reading.includes('id="depth-pitfalls"'));
  const quiz=renderToStaticMarkup(React.createElement(DraftProvider,{userId:'isolated-ui-check'},React.createElement(DepthQuiz,{data:payload,save:async()=>{throw new Error('SSR must not submit')},busy:false,readOnly:false,onLearn:()=>{}})));
  assert.equal((quiz.match(/type="radio"/g)??[]).length,20);
  assert(quiz.includes('disabled=""'),'Incomplete answers must not submit');
  for(const html of [reading,quiz])assert(!/<textarea|type="file"|\/api\/(?:autonomous|research|tutor|import)/.test(html));
  if(guides[lessonId]){const html=renderToStaticMarkup(React.createElement(SelfStudyReading,{lessonId,data:guides[lessonId],onQuiz:()=>{}}));assert(html.includes('id="study-worked"'));assert(html.includes('<table>'));assert(html.includes('id="study-faded"'));assert.equal((html.match(/type="radio"/g)??[]).length,4);assert(!/<textarea|type="file"/.test(html));assert(!html.includes('-retention-'));studyChecked++;if(html.includes('<figure'))figures++}
  checked++;
 }
}
assert.equal(checked,170);assert.equal(studyChecked,170);assert(figures>=12);
console.log(`Deep lesson UI: ${checked} readings and ${checked} five-question forms rendered; links, read-only content, and incomplete-answer guard passed. ${studyChecked} scaffolded readings and ${figures} visual lessons also rendered. SSR only; no browser interaction claim.`);
