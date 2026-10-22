import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const files=['foundations','models','vision','timeseries','language','research'];
const partial=process.argv.includes('--partial');
const curriculum=JSON.parse(readFileSync(new URL('../data/curriculum.json',import.meta.url),'utf8'));
const lessons=curriculum.flatMap(week=>week.lessons);
const expected=new Set(lessons.map(lesson=>lesson.id));
const entries=new Map(),questionIds=new Set(),questionTexts=new Set(),kinds=new Set(['reasoning','calculation','transfer','boundary']);
const lengths=[],answers=[0,0,0,0],rows=[];
const han=text=>(text.match(/[\u4e00-\u9fff]/g)??[]).length;
for(const name of files){
 const data=JSON.parse(readFileSync(new URL(`../data/depth-${name}.json`,import.meta.url),'utf8'));
 rows.push({section:name,lessons:Object.keys(data).length});
 for(const [id,lesson] of Object.entries(data)){
  assert(expected.has(id),`Unknown lesson ${id}`);assert(!entries.has(id),`Duplicate lesson ${id}`);entries.set(id,lesson);
  assert(lesson.outcomes.length>=3,`${id}: observable outcomes`);
  assert.deepEqual(lesson.sections.map(section=>section.id),['principle','derivation','comparison','boundaries'],`${id}: four substantive sections`);
  // Formula-heavy derivations include meaningful notation as well as Chinese prose.
  for(const section of lesson.sections){assert(section.title&&han(section.body)>=60&&section.body.length>=100,`${id}/${section.id}: explanation too thin`)}
  const example=lesson.workedExample;assert(example.title&&example.given&&example.result&&example.steps.length>=4,`${id}: complete worked example`);
  assert(lesson.pitfalls.length>=2&&lesson.pitfalls.every(pitfall=>pitfall.mistake&&pitfall.correction),`${id}: concrete corrections`);
  const text=lesson.sections.map(section=>section.body).join('')+example.given+example.steps.join('')+example.result+lesson.pitfalls.map(pitfall=>pitfall.mistake+pitfall.correction).join('');
  lengths.push(han(text));assert(han(text)>=600,`${id}: insufficient explanation/example content`);
  assert(!/请提交|上传代码|提交代码到|保存代码到云端/.test(text),`${id}: retired submission instruction`);
  assert.equal(lesson.questions.length,5,`${id}: five new questions`);
  const categories=new Set();
  lesson.questions.forEach((question,index)=>{
   assert.equal(question.id,`${id}-depth-${index+1}`);assert(!questionIds.has(question.id));questionIds.add(question.id);
   assert(kinds.has(question.kind),`${question.id}: valid cognitive skill`);categories.add(question.kind);
   assert(lesson.sections.some(section=>section.id===question.sectionId),`${question.id}: explanation link`);
   assert.equal(question.options.length,4);assert.equal(new Set(question.options.map(option=>option.trim())).size,4);
   assert(Number.isInteger(question.answer)&&question.answer>=0&&question.answer<4,`${question.id}: answer`);answers[question.answer]++;
   assert(han(question.explanation)>=12&&question.explanation.length>=30,`${question.id}: explain reasoning and distractors`);
   const normalized=question.question.replace(/\s/g,'');assert(!questionTexts.has(normalized),`${question.id}: duplicated prompt`);questionTexts.add(normalized);
  });assert(categories.size>=3,`${id}: varied reasoning, calculation, transfer/boundary`);
  assert(lesson.references.length>=1&&lesson.references.every(reference=>reference.title&&/^https:\/\//.test(reference.url)),`${id}: inspectable sources`);
 }
}
if(!partial){assert.equal(entries.size,170);assert.equal(questionIds.size,850);for(const id of expected)assert(entries.has(id),`Missing ${id}`)}
const sorted=[...lengths].sort((a,b)=>a-b);
console.log(JSON.stringify({scope:partial?'partial draft validation; full coverage not checked':'full curriculum coverage',lessons:entries.size,newQuestions:questionIds.size,sections:rows,explanationChineseCharacters:{min:sorted[0],median:sorted[Math.floor(sorted.length/2)],max:sorted.at(-1)},answerPositions:answers,originalQuestionSha256:createHash('sha256').update(JSON.stringify(lessons.map(lesson=>({id:lesson.id,quiz:lesson.quiz})))).digest('hex'),boundary:'Structural/content coverage verification; mathematical and pedagogical accuracy also reviewed separately.'},null,2));
