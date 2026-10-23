// Local-only QA fixture at port 5175. Never uses production credentials/data.
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url);const {chromium}=require(process.env.PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1365,height:900}});const page=await context.newPage();
const base='http://127.0.0.1:5175';const results=[];const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const check=(name,condition)=>{if(!condition)throw Error(name);results.push(name)};
try{
 const unauth=await context.request.get(base+'/api/systems');check('unauthenticated API refused',unauth.status()===401);
 await page.goto(base+'/signin-with-chatgpt?return_to=/');await page.getByRole('heading',{name:'AI Systems 学习与岗位实训',exact:true}).waitFor();await page.getByText('当前账号记录已连接',{exact:true}).waitFor();
 const headers={'x-study-user-id':'qa-browser-A','Content-Type':'application/json','Origin':base};
 const api=(data,extra={})=>context.request.post(base+'/api/systems',{headers:{...headers,...extra},data});
 let r=await context.request.get(base+'/api/systems');check('missing account context refused',r.status()===428);
 r=await api({itemId:'qa:test',kind:'concept',body:'test',expectedUpdatedAt:0},{'x-study-user-id':'qa-browser-B'});check('stale account refused',r.status()===409);
 r=await api({itemId:'qa:test',kind:'concept',body:'test',expectedUpdatedAt:0},{Origin:'https://evil.invalid'});check('cross origin refused',r.status()===403);
 const oldBefore=await context.request.get(base+'/api/state',{headers}).then(r=>r.json());
 r=await api({itemId:'qa:test',kind:'concept',body:'first',expectedUpdatedAt:0});check('first write succeeds',r.status()===200);let row=(await r.json()).record;
 r=await api({itemId:'qa:test',kind:'concept',body:'stale',expectedUpdatedAt:0});check('stale revision refused',r.status()===409);
 r=await api({itemId:'qa:test',kind:'concept',body:'second',expectedUpdatedAt:row.updated_at});check('CAS update succeeds',r.status()===200);
 const oldAfter=await context.request.get(base+'/api/state',{headers}).then(r=>r.json());check('legacy records unchanged',JSON.stringify(oldBefore)===JSON.stringify(oldAfter));
 r=await api({itemId:'bad space',kind:'concept',body:'a',expectedUpdatedAt:0});check('invalid ID refused',r.status()===400);
 r=await api({itemId:'qa:huge',kind:'concept',body:'x'.repeat(110000),expectedUpdatedAt:0});check('oversize request refused',r.status()===413);
 await page.getByRole('button',{name:'中文课堂',exact:true}).click();await page.getByLabel('用自己的话回答：我做了什么？证据是什么？什么条件会让结论失效？').fill('QA reflection retained across tabs.');
 await page.getByRole('button',{name:'可视化实验',exact:true}).click();for(const name of ['张量与梯度','缓存与局部性','Roofline 上限','Batch 与排队','KV Cache 预算','量化与误差','算子融合与访存','请求 Trace']){await page.getByRole('button',{name:new RegExp(name)}).click();check('interactive lab '+name,await page.locator('.sys-sim-body').isVisible())}
 await page.getByRole('button',{name:'中文课堂',exact:true}).click();check('reflection survives tab switch',(await page.locator('#reflection').inputValue()).includes('QA reflection'));
 await page.getByRole('button',{name:'真实动手',exact:true}).click();await page.locator('#result-json').fill('{"p95_ms":"foo"}');await page.getByRole('button',{name:'重算指标并保存实践证据'}).click();check('malformed CPU evidence rejected',await page.getByText(/未通过格式\/内部一致性检查/).isVisible());
 await page.getByRole('button',{name:'岗位工单',exact:true}).click();await page.locator('textarea:visible').first().fill('QA workplace draft');await page.getByRole('button',{name:'学习路线',exact:true}).click();await page.getByRole('button',{name:'岗位工单',exact:true}).click();check('ticket draft survives module switch',await page.locator('textarea:visible').first().inputValue()==='QA workplace draft');
 mkdirSync('verification/systems',{recursive:true});await page.getByRole('button',{name:'学习路线',exact:true}).click();await page.screenshot({path:'verification/systems/desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'verification/systems/mobile.png',fullPage:true});check('mobile no document overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2));
 page.on('dialog',dialog=>dialog.accept());await page.goto(base+'/legacy?lesson=w01-d1');await page.waitForTimeout(1200);check('legacy direct lesson remains legacy',page.url().includes('/legacy'));check('legacy lesson loaded',await page.locator('#learning-content').innerText().then(t=>t.length>100));
 await page.goto(base+'/signin-with-chatgpt?qa=B');r=await context.request.get(base+'/api/systems',{headers:{'x-study-user-id':'qa-browser-B'}});check('account B isolated',(await r.json()).records.length===0);
 check('no uncaught UI errors',errors.length===0);
 writeFileSync('verification/systems/browser-results.json',JSON.stringify({results,errors,scope:'disposable loopback QA, not production auth verification'},null,2));console.log(JSON.stringify({passed:results.length,results,errors},null,2));
}finally{await browser.close()}
