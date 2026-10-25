import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {loadTS} from './test-ts-loader.mjs';
const {checkAssessmentArtifact,normalizeAttempt,normalizeReview,blankReview,assessmentDraftSchema}=loadTS('lib/systems-assessment.ts');
const {normalizeSystemsWrite}=loadTS('lib/systems-write.ts');
let directory;const fixtures=[];
before(()=>{
 directory=mkdtempSync(join(tmpdir(),'mlsys-assessment-'));
 for(const family of ['trace','partition','decision'])for(const seed of [104729,7331]){
  const target=join(directory,family+'-'+seed);
  execFileSync('python3',['-B','public/systems/assessment/assessment.py','create','--family',family,'--seed',String(seed),'--directory',target],{timeout:10000});
  for(const reference of [false,true]){
   const output=target+(reference?'-reference':'-learner')+'.json';
   execFileSync('python3',['-B','public/systems/assessment/assessment.py','check','--directory',target,'--output',output,...(reference?['--reference']:[])],{timeout:12000});
   fixtures.push({reference,data:JSON.parse(readFileSync(output,'utf8'))});
  }
 }
});
after(()=>{if(directory)rmSync(directory,{recursive:true,force:true})});
test('three executable task families, two seeds: starter fails and reference passes across Python/TS',()=>{
 for(const {reference,data} of fixtures){const result=checkAssessmentArtifact(data);assert.equal(result.passed,reference);assert.deepEqual(result.tests,data.tests);assert.equal(result.source_kind,reference?'reference':'learner')}
});
test('missing cases, changed seed inputs and tampered expected/pass flags cannot mint a pass',()=>{
 const data=structuredClone(fixtures[0].data);data.passed=true;data.tests.forEach(row=>{row.expected=row.actual;row.passed=true});assert.equal(checkAssessmentArtifact(data).passed,false);
 const incomplete=structuredClone(data);incomplete.tests.pop();assert.throws(()=>checkAssessmentArtifact(incomplete),/缺少/);
 const changed=structuredClone(data);changed.seed+=1;assert.throws(()=>checkAssessmentArtifact(changed),/种子/);
 data.source_sha256='claimed';assert.throws(()=>checkAssessmentArtifact(data),/字段/);
});
const notes={diagnosis:'需要使用失败原始输入定位根因，并用另一条观察排除替代假设。',change:'修复最小一处逻辑，同时保留正常输入和边界输入的回归测试。',transfer:'使用新的任务种子检查迁移；没有验证真实并发和生产延迟。',english:'The first run fails. Keep raw evidence and retest the minimal repair.',previousId:''};
test('reference source cannot become an independent attempt and failed attempts can be retained',()=>{
 assert.throws(()=>normalizeAttempt({schema:'mlsys-attempt-v1',artifact:fixtures[1].data,assistance:'independent',...notes}),/参考/);
 const attempt=normalizeAttempt({schema:'mlsys-attempt-v1',artifact:fixtures[0].data,assistance:'guided',...notes});assert.equal(attempt.status,'needs-revision');assert.equal(attempt.competencyCertified,false);
 const saved=JSON.parse(normalizeSystemsWrite('assessment:attempt:one','practice',JSON.stringify({...attempt,competencyCertified:true})));assert.equal(saved.competencyCertified,false);
 assert.throws(()=>normalizeSystemsWrite('assessment:attempt:one','concept',JSON.stringify(attempt)),/practice/);
});
test('review requires specific evidence on every dimension and cannot certify identity or competence',()=>{
 const review={...blankReview(),schema:'mlsys-review-v1',attemptId:'assessment:attempt:one',reviewerAlias:'同行甲',feedback:notes.diagnosis,nextAction:notes.transfer};
 assert.throws(()=>normalizeReview(review));
 for(const key of Object.keys(review.rubric))review.rubric[key]={rating:'not-reviewed',evidence:'尚未实际复跑此部分，需要下一次补充证据。'};
 assert.throws(()=>normalizeReview({...review,decision:'new-variant'}),/未评阅/);
 const result=normalizeReview({...review,reviewerRole:'peer',reviewerIdentityVerified:true,competencyCertified:true});assert.equal(result.reviewerIdentityVerified,false);assert.equal(result.competencyCertified,false);
});

test('task selection restores with drafts; old drafts migrate without losing notes',()=>{
 const old={schema:'mlsys-assessment-draft-v1',raw:'unfinished',assistance:'guided',diagnosis:'keep this',change:'',transfer:'',english:'',previousId:''};
 const migrated=assessmentDraftSchema.parse(old);assert.equal(migrated.family,'trace');assert.equal(migrated.seed,'104729');assert.equal(migrated.diagnosis,old.diagnosis);
 const draft={...migrated,family:'partition',seed:'7331'};
 const saved=JSON.parse(normalizeSystemsWrite('assessment:draft:workbench','practice',JSON.stringify(draft)));assert.deepEqual(saved,draft);
});
test('deep or oversized unknown results are rejected before recursive comparison',()=>{
 const data=structuredClone(fixtures[0].data);let nested=null;for(let i=0;i<30;i++)nested=[nested];data.tests[0].actual.value=nested;
 assert.throws(()=>checkAssessmentArtifact(data),/过深/);data.tests[0].actual.value=Array(12001).fill(0);assert.throws(()=>checkAssessmentArtifact(data),/过大/);
});
