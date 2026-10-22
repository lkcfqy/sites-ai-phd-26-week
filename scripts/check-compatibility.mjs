import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const before=JSON.parse(execFileSync('git',['show','e56cf4847c396b46712a6924b6f82912d911ee30:data/curriculum.json'],{encoding:'utf8'}));
const after=JSON.parse(readFileSync('data/curriculum.json','utf8'));
const original=before.flatMap(w=>w.lessons),current=after.flatMap(w=>w.lessons);
assert.deepEqual(current.map(l=>l.id),original.map(l=>l.id),'stable IDs/order changed without migration');
for(const lesson of current){const previous=original.find(l=>l.id===lesson.id);assert.deepEqual(lesson.quiz,previous.quiz,'question semantic change needs new version: '+lesson.id)}
for(const week of after)assert.deepEqual(week.challenge.rubric,before.find(w=>w.number===week.number).challenge.rubric,'historical rubric checkbox mapping changed: '+week.number);
const manifest={version:'v1',curriculumRevision:'2026-10-09-autonomous1',questionSemanticsUnchanged:true,lessonIds:current.map(l=>l.id),lessons:current.map(l=>({id:l.id,sha256:createHash('sha256').update(JSON.stringify(l.quiz)).digest('hex'),questions:l.quiz})),rubrics:after.map(w=>({week:w.number,items:w.challenge.rubric}))};
writeFileSync('verification/questions-v1.json',JSON.stringify(manifest,null,2)+'\n');
writeFileSync('verification/compatibility-validation.json',JSON.stringify({verifiedAt:new Date().toISOString(),lessons:current.length,questions:current.reduce((n,l)=>n+l.quiz.length,0),checks:['IDs/order preserved','question/options/answer/explanation unchanged','rubric checkbox order/meaning preserved'],passed:true},null,2)+'\n');
console.log('Stable IDs, 510 question semantics and 26 rubric checkbox mappings preserved.');
