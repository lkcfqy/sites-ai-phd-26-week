// Disposable local preview only; fake identities never deployed.
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
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
r=await req('/');const home=await r.text();record('new homepage rendered',r.status===200&&home.includes('AI Systems 学习与岗位实训'));
r=await req('/legacy?lesson=w01-d1');const legacyHtml=await r.text();writeFileSync('/tmp/mlsystems-legacy-ssr.html',legacyHtml);console.log('legacy status',r.status,legacyHtml.length);record('legacy lesson route rendered',r.status===200&&legacyHtml.includes('连接学习与考查记录'));
r=await req('/?view=lesson&lesson=w01-d1');record('legacy bookmarks redirect',r.status>=300&&r.status<400&&r.headers.get('location')?.startsWith('/legacy?'));
for(const asset of ['cpu_lab.py','lab_pack.py','LAB_GUIDE.md','log_lab/README.md','log_lab/learner.py']){r=await req('/systems/'+asset);record('download '+asset,r.status===200&&(await r.text()).length>(asset.endsWith('learner.py')?500:1000))}
for(const asset of ['labs/cpp/cpp_labs.zip','model_project/model_project.zip','cuda_project/cuda_project.zip','framework_project/framework_project.zip','labs/llm-serving/llm_serving.zip','log_lab/log_lab.zip']){r=await req('/systems/'+asset);const bytes=new Uint8Array(await r.arrayBuffer());record('project archive '+asset,r.status===200&&bytes.length>1000&&bytes[0]===80&&bytes[1]===75)}
mkdirSync('verification/systems',{recursive:true});writeFileSync('verification/systems/api-results.json',JSON.stringify({passed:results.length,results,scope:'disposable local worker and synthetic identities, not production UI proof'},null,2));console.log(JSON.stringify({passed:results.length,results},null,2));
