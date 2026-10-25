// Disposable local preview only; fake identities never deployed.
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync,readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const base='http://127.0.0.1:5175',results=[];
const req=(path,{user='A',context='qa-browser-A',data,origin=base,method}={})=>(globalThis.__systemsTestDispatch??fetch)(base+path,{method:method??(data?'POST':'GET'),headers:{...(user?{Cookie:'__qa_auth='+user}:{}),...(context?{'x-study-user-id':context}:{}),...(data?{'Content-Type':'application/json',Origin:origin}:{} )},body:data?JSON.stringify(data):undefined,redirect:'manual'});
const record=(name,condition)=>{assert.ok(condition,name);results.push(name)};
let r=await req('/api/systems',{user:null,context:null});record('unauthenticated denied',r.status===401);
r=await req('/api/systems',{context:null});record('missing account context denied',r.status===428);
r=await req('/api/systems',{context:'qa-browser-B'});record('stale account context denied',r.status===409);
const id='qa:'+Date.now(),body={itemId:id,kind:'concept',body:'first',expectedUpdatedAt:0};
r=await req('/api/systems',{data:body,origin:'https://evil.invalid'});record('cross origin denied',r.status===403);
const before=await req('/api/state').then(r=>r.json());
r=await req('/api/systems',{data:body});record('initial evidence save',r.status===200);const saved=(await r.json()).record;
r=await req('/api/systems',{data:body});record('stale CAS rejected',r.status===409);
r=await req('/api/systems',{data:{...body,body:'second',expectedUpdatedAt:saved.updated_at}});record('matching revision updates',r.status===200);const second=(await r.json()).record;record('returned row belongs to own write',second.body==='second'&&second.updated_at>saved.updated_at);
const after=await req('/api/state').then(r=>r.json());record('legacy state unmodified',JSON.stringify(before)===JSON.stringify(after));
r=await req('/api/systems',{user:'B',context:'qa-browser-B'});record('other user cannot read A records',(await r.json()).records.every(x=>x.item_id!==id));
r=await req('/api/systems',{data:{...body,itemId:'invalid id'}});record('invalid ID denied',r.status===400);
r=await req('/api/systems',{data:{...body,body:'x'.repeat(110000)}});record('oversize denied',r.status===413);
// Validation migration: use only this disposable worker's synthetic accounts.
const stateBeforeValidation=await req('/api/state').then(response=>response.json());
for(const [name,data,status] of [
 ['unknown action',{action:'invented'},400],
 ['missing required fields',{action:'quiz'},400],
 ['invalid answer type',{action:'diagnostic',answers:['1']},400],
 ['invalid answer range',{action:'diagnostic',answers:[-2]},400],
 ['fractional answer',{action:'diagnostic',answers:[0.5]},400],
 ['oversize answer array',{action:'diagnostic',answers:Array(51).fill(0)},400],
 ['unsafe revision',{action:'profile',hours:4,track:'undecided',start_date:'2026-10-24',expectedUpdatedAt:Number.MAX_SAFE_INTEGER+1},400],
 ['missing revision',{action:'profile',hours:4,track:'undecided',start_date:'2026-10-24'},428],
 ['invalid calendar date',{action:'profile',hours:4,track:'undecided',start_date:'2026-02-30',expectedUpdatedAt:0},400],
 ['body limit before validation',{action:'diagnostic',answers:[],padding:'x'.repeat(120001)},413],
]){r=await req('/api/state',{data});record('state '+name+' rejected',r.status===status);record('state '+name+' returns readable error',typeof(await r.json()).error==='string');}
record('rejected validation leaves learning data unchanged',JSON.stringify(stateBeforeValidation)===JSON.stringify(await req('/api/state').then(response=>response.json())));
for(const [name,patch] of [['negative revision',{expectedUpdatedAt:-1}],['unsafe revision',{expectedUpdatedAt:Number.MAX_SAFE_INTEGER+1}],['invalid kind',{kind:'invented'}],['overlong evidence',{body:'x'.repeat(20001)}]]){
 r=await req('/api/systems',{data:{...body,...patch}});record('systems '+name+' rejected',r.status===400);
}
const profile=stateBeforeValidation.profile;
r=await req('/api/state',{data:{action:'profile',hours:profile.hours,track:profile.track,start_date:profile.start_date,expectedUpdatedAt:profile.updated_at}});
record('valid profile round trip after validation migration',r.status===200);
const updatedProfile=(await r.json()).state.profile;record('profile CAS advances safely',updatedProfile.updated_at>profile.updated_at&&updatedProfile.hours===profile.hours);
// The worker must independently recompute uploaded results and retain partial drafts.
const artifact={schema:'mlsys-lab-pack-v1',command:'basics',source:'deterministic-computation',tests_passed:3,python:'QA synthetic fixture',platform:'loopback test',input:[1,2],loop_trace:[{index:0,value:1,running_sum:1},{index:1,value:2,running_sum:3}],squares:[1,4],mean:1.5};
const evidence={schema:'mlsys-evidence-v2',artifact,assistance:'reference',explanation:'这是隔离测试夹具，只核验数据一致性，不代表任何学习者的独立成绩。',check:{status:'certified',mastered:true}};
const evidenceId='practice:validated:qa-'+Date.now();
const evidenceBody={itemId:evidenceId,kind:'practice',body:JSON.stringify(evidence),expectedUpdatedAt:0};
r=await req('/api/systems',{data:{...evidenceBody,body:JSON.stringify({...evidence,artifact:{...artifact,mean:99}})}});record('worker rejects forged aggregate',r.status===400);
r=await req('/api/systems',{data:evidenceBody});record('worker accepts consistent raw evidence',r.status===200);
const canonical=JSON.parse((await r.json()).record.body);record('worker replaces client certification with consistency check',canonical.check.status==='consistency-checked'&&canonical.check.mastered===undefined);
record('reference implementation remains reference',canonical.assistance==='reference');
r=await req('/api/systems',{data:{...evidenceBody,itemId:evidenceId+'-wrong-kind',kind:'concept'}});record('validated evidence cannot use another record kind',r.status===400);
const partial={schema:'mlsys-import-draft-v1',raw:'not yet valid JSON',explanation:'',assistance:'guided'};
r=await req('/api/systems',{data:{itemId:'practice:draft:import',kind:'practice',body:JSON.stringify(partial),expectedUpdatedAt:0}});record('partial import draft saves without claiming a pass',r.status===200);
const draftRow=(await r.json()).record;
const restoredRows=(await req('/api/systems').then(response=>response.json())).records;
record('saved import draft round trips exactly',restoredRows.some(row=>row.item_id===draftRow.item_id&&JSON.stringify(JSON.parse(row.body))===JSON.stringify(partial)));
r=await req('/api/systems',{data:{itemId:draftRow.item_id,kind:'practice',body:JSON.stringify({...partial,explanation:'stale attempt'}),expectedUpdatedAt:0}});record('draft conflict preserves saved version',r.status===409);
r=await req('/api/systems',{user:'B',context:'qa-browser-B'});record('other account cannot restore evidence or draft',(await r.json()).records.every(row=>row.item_id!==evidenceId&&row.item_id!==draftRow.item_id));
// Executable unfamiliar-task records are append-only and account scoped.
const assessmentDirectory=mkdtempSync(join(tmpdir(),'mlsys-api-assessment-'));
let failedArtifact,referenceArtifact;
try{
 const target=join(assessmentDirectory,'task');
 execFileSync('python3',['-B','public/systems/assessment/assessment.py','create','--family','trace','--seed','104729','--directory',target]);
 for(const reference of [false,true]){const output=join(assessmentDirectory,reference?'reference.json':'failed.json');execFileSync('python3',['-B','public/systems/assessment/assessment.py','check','--directory',target,'--output',output,...(reference?['--reference']:[])]);const data=JSON.parse(readFileSync(output,'utf8'));if(reference)referenceArtifact=data;else failedArtifact=data;}
}finally{rmSync(assessmentDirectory,{recursive:true,force:true})}
const notes={diagnosis:'从失败输入核对根因，同时保存原始记录并检查另一个可能解释。',change:'最小修改后重新执行全部正常、边界和错误用例，保留旧失败。',transfer:'更换任务种子验证迁移，真实并发和生产性能仍未测试。',english:'Keep raw failures, repair one cause, retest and state the limits.',previousId:''};
const attempt={schema:'mlsys-attempt-v1',artifact:failedArtifact,assistance:'guided',...notes};
const attemptId='assessment:attempt:qa-'+Date.now();
const attemptRequest={itemId:attemptId,kind:'practice',body:JSON.stringify(attempt),expectedUpdatedAt:0};
r=await req('/api/systems',{data:attemptRequest});record('failed attempt can be retained for feedback',r.status===200);const savedAttempt=(await r.json()).record;record('failed result is not certified',JSON.parse(savedAttempt.body).status==='needs-revision'&&!JSON.parse(savedAttempt.body).competencyCertified);
r=await req('/api/systems',{data:{...attemptRequest,expectedUpdatedAt:savedAttempt.updated_at}});record('attempt history cannot be overwritten',r.status===400);
r=await req('/api/systems',{data:{...attemptRequest,itemId:attemptId+'-reference',body:JSON.stringify({...attempt,artifact:referenceArtifact,assistance:'independent'})}});record('reference cannot become independent API achievement',r.status===400);
const referenceRequest={...attemptRequest,itemId:attemptId+'-reference',body:JSON.stringify({...attempt,artifact:referenceArtifact,assistance:'reference'})};
r=await req('/api/systems',{data:referenceRequest});record('reference attempt explicitly retained',r.status===200);
const retryRequest={...attemptRequest,itemId:attemptId+'-retry',body:JSON.stringify({...attempt,previousId:attemptId})};
r=await req('/api/systems',{data:retryRequest});record('retry links an existing own attempt',r.status===200);
r=await req('/api/systems',{data:{...retryRequest,itemId:attemptId+'-missing',body:JSON.stringify({...attempt,previousId:'assessment:attempt:missing'})}});record('missing retry parent rejected',r.status===400);
r=await req('/api/systems',{user:'B',context:'qa-browser-B',data:{...retryRequest,itemId:attemptId+'-cross-account'}});record('retry cannot link another account record',r.status===400);
const rubric=Object.fromEntries(['correctness','reproduction','diagnosis','transfer'].map(key=>[key,{rating:'adequate',evidence:'已检查对应材料和原始输出；这是隔离测试，不是真实评阅。'}]));
const review={schema:'mlsys-review-v1',attemptId,reviewerRole:'peer',reviewerAlias:'合成同伴',rubric,feedback:notes.diagnosis,nextAction:notes.transfer,decision:'new-variant',reviewerIdentityVerified:true,competencyCertified:true};
const reviewRequest={itemId:'assessment:review:qa-'+Date.now(),kind:'practice',body:JSON.stringify(review),expectedUpdatedAt:0};
r=await req('/api/systems',{data:reviewRequest});record('failed tests cannot be advanced by an adequate rubric',r.status===400);
r=await req('/api/systems',{data:{...reviewRequest,body:JSON.stringify({...review,decision:'revise'})}});record('specific revision feedback can be saved',r.status===200);const savedReview=(await r.json()).record;const reviewData=JSON.parse(savedReview.body);record('review identity and competency claims stripped',!reviewData.reviewerIdentityVerified&&!reviewData.competencyCertified&&reviewData.provenance==='owner-recorded-review');
r=await req('/api/systems',{data:{...reviewRequest,expectedUpdatedAt:savedReview.updated_at}});record('review history cannot be overwritten',r.status===400);
r=await req('/api/systems',{data:{...reviewRequest,itemId:reviewRequest.itemId+'-missing',body:JSON.stringify({...review,decision:'revise',attemptId:'assessment:attempt:missing'})}});record('review requires existing own attempt',r.status===400);
r=await req('/api/systems',{data:{...reviewRequest,itemId:reviewRequest.itemId+'-next',body:JSON.stringify({...review,attemptId:referenceRequest.itemId})}});record('review can recommend a new variant without certifying competence',r.status===200);
const draftAssessment={schema:'mlsys-assessment-draft-v1',family:'partition',seed:'7331',raw:'unfinished',assistance:'guided',diagnosis:'',change:'',transfer:'',english:'',previousId:''};
r=await req('/api/systems',{data:{itemId:'assessment:draft:workbench',kind:'practice',body:JSON.stringify(draftAssessment),expectedUpdatedAt:0}});record('unfinished assessment draft saves',r.status===200);
const ownRecords=(await req('/api/systems').then(response=>response.json())).records;record('assessment draft restores exact unfinished text',JSON.parse(ownRecords.find(row=>row.item_id==='assessment:draft:workbench').body).raw==='unfinished');
const restoredTask=JSON.parse(ownRecords.find(row=>row.item_id==='assessment:draft:workbench').body);record('assessment task family and seed restore with draft',restoredTask.family==='partition'&&restoredTask.seed==='7331');
r=await req('/api/systems',{user:'B',context:'qa-browser-B'});record('B cannot see A assessment history',(await r.json()).records.every(row=>!row.item_id.startsWith('assessment:')));
r=await req('/');const home=await r.text();record('new homepage rendered',r.status===200&&home.includes('AI Systems 学习与岗位实训'));
r=await req('/legacy?lesson=w01-d1');const legacyHtml=await r.text();writeFileSync('/tmp/mlsystems-legacy-ssr.html',legacyHtml);console.log('legacy status',r.status,legacyHtml.length);record('legacy lesson route rendered',r.status===200&&legacyHtml.includes('连接学习与考查记录'));
r=await req('/?view=lesson&lesson=w01-d1');record('legacy bookmarks redirect',r.status>=300&&r.status<400&&r.headers.get('location')?.startsWith('/legacy?'));
for(const asset of ['cpu_lab.py','lab_pack.py','LAB_GUIDE.md']){r=await req('/systems/'+asset);record('download '+asset,r.status===200&&(await r.text()).length>1000)}
for(const asset of ['labs/cpp/cpp_labs.zip','model_project/model_project.zip','cuda_project/cuda_project.zip','framework_project/framework_project.zip','labs/llm-serving/llm_serving.zip']){r=await req('/systems/'+asset);const bytes=new Uint8Array(await r.arrayBuffer());record('project archive '+asset,r.status===200&&bytes.length>1000&&bytes[0]===80&&bytes[1]===75)}
mkdirSync('verification/systems',{recursive:true});writeFileSync('verification/systems/api-results.json',JSON.stringify({passed:results.length,results,scope:'disposable local worker and synthetic identities, not production UI proof'},null,2));console.log(JSON.stringify({passed:results.length,results},null,2));
