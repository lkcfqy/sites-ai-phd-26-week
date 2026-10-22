import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url),partial=process.argv.includes('--partial');
const curriculum=JSON.parse(readFileSync(new URL('../data/curriculum.json',import.meta.url),'utf8'));
const expected=new Set(curriculum.flatMap(week=>week.lessons).map(lesson=>lesson.id));
const seen=new Set(),questions=new Set(),texts=new Set(),lengths=[];
const normalized=value=>value.replace(/\s/g,'');
const visiblePrompts=new Set(curriculum.flatMap(week=>week.lessons).flatMap(lesson=>lesson.quiz.map(q=>normalized(q.question))));
for(const group of ['foundations','models','vision','timeseries','language','research']){
 const depth=JSON.parse(readFileSync(new URL(`../data/depth-${group}.json`,import.meta.url),'utf8'));
 for(const lesson of Object.values(depth))for(const q of lesson.questions)visiblePrompts.add(normalized(q.question));
 const study=JSON.parse(readFileSync(new URL(`../data/self-study-${group}.json`,import.meta.url),'utf8'));
 for(const lesson of Object.values(study))visiblePrompts.add(normalized(lesson.faded.prompt));
}
const han=value=>(value.match(/[\u4e00-\u9fff]/g)??[]).length;
for(const group of ['foundations','models','vision','timeseries','language','research']){
 const data=JSON.parse(readFileSync(new URL(`../data/self-study-${group}.json`,import.meta.url),'utf8'));
 for(const [id,lesson]of Object.entries(data)){
  assert(expected.has(id)&&!seen.has(id),id);seen.add(id);
  assert(lesson.question&&lesson.prerequisites.length>=3,id+': prerequisite explanations');
  for(const term of lesson.prerequisites)assert(term.term&&han(term.explanation)>=8&&term.check,id+': explain vocabulary');
  assert(lesson.sections.length>=4,id+': gradual explanation');
  for(const section of lesson.sections)assert(section.title&&han(section.body)>=70,id+': substantive explanation');
  const worked=lesson.worked;assert(worked.title&&worked.given&&worked.conclusion&&worked.steps.length>=5,id+': worked reasoning');
  assert(worked.table.headers.length>=2&&worked.table.rows.length>=3,id+': visible intermediate results');
  for(const row of worked.table.rows)assert.equal(row.length,worked.table.headers.length,id+': table columns');
  assert(lesson.faded.steps.length>=3&&lesson.faded.prompt&&lesson.faded.explanation,id+': faded example');
  const content=lesson.sections.map(section=>section.body).join('')+JSON.stringify(worked)+JSON.stringify(lesson.prerequisites)+JSON.stringify(lesson.faded);
  lengths.push(han(content));assert(han(content)>=(Number(id.slice(1,3))<=3?750:1000),id+': self-contained teaching content');
  assert(!/请提交|请上传代码|请保存代码到|学完必定精通/.test(content),id+': learning-only scope');
  assert(lesson.recap.length>=3&&lesson.readingMinutes>=15&&lesson.readingMinutes<=120,id+': clear learning plan');
  assert.equal(lesson.transfer.length,3,id+': three held-out questions');
  for(const [index,q]of lesson.transfer.entries()){
   assert.equal(q.id,id+'-retention-'+(index+1));assert(!questions.has(q.id));questions.add(q.id);
   const prompt=normalized(q.question);assert(!visiblePrompts.has(prompt),q.id+': held-out question must not repeat a visible question');assert(!texts.has(prompt),q.id+': duplicate transfer prompt');texts.add(prompt);
   assert(['principle','derivation','comparison','boundaries'].includes(q.sectionId));
   assert(['reasoning','calculation','transfer','boundary'].includes(q.kind));
   assert(q.explanation.length>=20,q.id+': reasoning feedback');
  }
  for(const q of [lesson.faded,...lesson.transfer]){assert.equal(q.options.length,4);assert.equal(new Set(q.options).size,4);assert(Number.isInteger(q.answer)&&q.answer>=0&&q.answer<=3,id+': valid answer')}
 }
}
if(!partial){assert.equal(seen.size,170);assert.equal(questions.size,510);for(const id of expected)assert(seen.has(id))}
// The source indexes must round-trip through presentation order, without mutation.
const module={exports:{}};
const source=ts.transpileModule(readFileSync(new URL('../lib/choice-order.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
new Function('require','module','exports',source)(require,module,module.exports);
let cyclic=0;
for(const lesson of curriculum.flatMap(week=>week.lessons)){
 const positions=lesson.quiz.map((question,index)=>{const original=[...question.options],ordered=module.exports.orderedChoices(question.options,lesson.id+':basic:'+index+':'+question.question);assert.deepEqual(question.options,original);assert.deepEqual(ordered.map(item=>item.index).sort(),[0,1,2,3]);const position=ordered.findIndex(item=>item.index===question.answer);assert.equal(ordered[position].text,question.options[question.answer]);return position});
 if(positions[1]===(positions[0]+1)%4&&positions[2]===(positions[0]+2)%4)cyclic++;
}
assert(cyclic<35,'Presentation must eliminate the old cross-course answer cycle');
console.log(JSON.stringify({scope:partial?'partial draft':'full curriculum',lessons:seen.size,heldOutQuestions:questions.size,minTeachingChineseCharacters:Math.min(...lengths),basicCyclicPatterns:cyclic,boundary:'Content structure and source-index mapping; does not prove learning efficacy or all mathematics.'},null,2));
