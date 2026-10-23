// Only the disposable loopback fixture and synthetic accounts, never production.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,rm,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE??'playwright');
const base='http://127.0.0.1:5175',folder=await mkdtemp(join(tmpdir(),'mlsys-tensor-browser-'));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1365,height:900}}),page=await context.newPage();
const errors=[],results=[];page.on('pageerror',error=>errors.push(String(error)));
const check=(name,ok)=>{assert.ok(ok,name);results.push(name)};
const noOverflow=()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2);
const dirty=()=>page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented});
try{
 const output=join(folder,'before.json');
 const executed=spawnSync(process.env.SYSTEMS_NUMPY_PYTHON??'python3',[resolve('public/systems/tensor_lab/run.py'),'attention','--output',output],{encoding:'utf8',timeout:15000});assert.equal(executed.status,1);
 const raw=await readFile(output,'utf8');
 await page.goto(base+'/signin-with-chatgpt?return_to=/');await page.getByText('当前账号记录已连接',{exact:true}).waitFor();
 await page.getByRole('button',{name:'可视化实验',exact:true}).click();
 await page.getByRole('button',{name:'去数组到 Attention 工作台',exact:true}).click();
 check('gradient simulator focuses continuous tensor project',await page.locator(':focus').getAttribute('id')==='tensor-workshop-title');
 for(const width of [1365,390,320]){
  await page.setViewportSize({width,height:844});
  for(const label of ['1 数组与轴','2 线性层与广播','3 梯度与有限差分','4 Attention 与 mask']){
   const button=page.getByRole('button',{name:label,exact:true});await button.focus();await page.keyboard.press('Enter');
   check(`keyboard ${label} at ${width}px`,await button.getAttribute('aria-pressed')==='true');
   check(`no overflow ${label} at ${width}px`,await noOverflow());
  }
 }
 await page.getByRole('button',{name:'1 数组与轴',exact:true}).click();
 await page.getByRole('button',{name:'查看 token 1',exact:true}).click();
 check('array selection explains axis-preserving slices',await page.getByText(/X\[1,:\] = \[0,1\].*shape=\(3,1\)/).isVisible());
 await page.getByRole('spinbutton',{name:'X 的元素总数是多少？',exact:true}).fill('3');await page.getByRole('button',{name:'核对张量推导',exact:true}).click();
 check('wrong shape reasoning gets useful feedback',await page.getByText(/尚未吻合.*3×2=6/).isVisible());
 await page.getByRole('button',{name:'2 线性层与广播',exact:true}).click();await page.locator('#tensor-output-feature').selectOption('2');
 check('linear cell expands a real dot product',await page.getByText(/Y\[0,2\] = 1×3 \+ 0×6 \+ b\[2\]\(1.5\) = 4.5/).isVisible());
 await page.getByRole('button',{name:'3 梯度与有限差分',exact:true}).click();
 check('gradient example includes unbroadcast sum and finite difference',await page.getByText(/db=\[3,2,0\].*独立中心有限差分约=1/).isVisible());
 await page.getByRole('button',{name:'4 Attention 与 mask',exact:true}).click();
 const attention=page.locator('#tensor-attention-output');check('initial causal output is hand-checkable',(await attention.innerText()).includes('[10, 0]'));
 await page.locator('#tensor-future').focus();await page.keyboard.press('End');
 check('future perturbation leaves causal prefix intact',(await attention.innerText()).includes('[10, 0]'));
 await page.getByRole('checkbox',{name:'因果 mask：每个 query 只看当前与之前 token',exact:true}).uncheck();
 check('removing mask reveals future influence',!(await attention.innerText()).includes('[10, 0]'));
 await mkdir('verification/systems',{recursive:true});await page.screenshot({path:'verification/systems/tensor-mobile-320.png',fullPage:true});
 await page.locator('#tensor-receipt').fill('{');await page.getByRole('button',{name:'检查张量回执与反馈',exact:true}).click();
 check('bad tensor JSON is rejected',await page.getByRole('alert').filter({hasText:'JSON 无法解析'}).isVisible());
 await page.locator('#tensor-receipt').fill(raw);await page.getByRole('button',{name:'检查张量回执与反馈',exact:true}).click();
 check('actual 0/20 failure is displayed honestly',await page.getByText(/attention \/ practice \/ seed 137 · needs-work · 0\/20/).isVisible());
 const save=page.getByRole('button',{name:'保存张量练习交接（自报证据）',exact:true});await save.click();
 check('receipt alone cannot replace tensor handoff',await page.getByRole('alert').filter({hasText:'请填完四项张量练习交接'}).isVisible());
 for(const [field,value]of [['problem','QA tensor TODO: 20 failed groups.'],['change','QA: no implementation claimed.'],['verification','QA: run attention, preserve failed receipt.'],['limits','QA: synthetic correctness, no framework or GPU measurement.']])await page.locator('#tensor-'+field).fill(value);
 await page.getByRole('button',{name:'学习路线',exact:true}).click();await page.getByRole('button',{name:'真实动手',exact:true}).click();
 check('tensor handoff survives module switch',(await page.locator('#tensor-problem').inputValue()).includes('QA tensor TODO'));
 check('tensor draft protects unload',await dirty());
 await page.route('**/api/systems',route=>route.request().method()==='POST'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'QA temporary failure'})}):route.continue());
 await save.click();await page.getByText(/云端未确认张量交接保存，草稿仍在/).waitFor();check('failed tensor save retains draft',await dirty());await page.unroute('**/api/systems');
 let release;const gate=new Promise(resolve=>{release=resolve});
 await page.route('**/api/systems',async route=>{if(route.request().method()==='POST')await gate;await route.continue()});
 await save.click();await page.getByRole('button',{name:'正在保存张量交接…',exact:true}).waitFor();
 await page.locator('#tensor-change').fill('QA tensor pending edit retained.');await page.locator('#tensor-receipt').fill(raw+'\n');release();
 await page.getByText(/已保存张量练习交接（自报证据）/).waitFor();check('pending edit remains dirty and prior feedback stays cleared',await dirty()&&await page.getByText(/attention \/ practice \/ seed 137 · needs-work · 0\/20/).count()===0);await page.unroute('**/api/systems');
 await save.click();await page.getByRole('button',{name:'正在保存张量交接…',exact:true}).waitFor({state:'hidden'});check('matching tensor save clears dirty state',!(await dirty()));
 const stored=await context.request.get(base+'/api/systems',{headers:{'x-study-user-id':'qa-browser-A'}}).then(r=>r.json());
 const record=stored.records.find(row=>row.body.includes('QA tensor pending edit retained.'));
 check('tensor evidence uses own existing account with explicit limits',record?.kind==='practice'&&JSON.parse(record.body).independence==='not-verified');
 await page.setViewportSize({width:1365,height:900});await page.screenshot({path:'verification/systems/tensor-desktop.png',fullPage:true});
 await page.goto(base+'/signin-with-chatgpt?qa=B');await page.getByText('当前账号记录已连接',{exact:true}).waitFor();
 const other=await context.request.get(base+'/api/systems',{headers:{'x-study-user-id':'qa-browser-B'}}).then(r=>r.json());check('other account cannot read tensor evidence',!other.records.some(row=>row.item_id===record.item_id));
 // Legacy lint repairs: real fetch failures/retries must clear stale state and keep draft guards.
 await page.setViewportSize({width:1365,height:900});
 let first=true;let releaseDepth;const depthGate=new Promise(resolve=>{releaseDepth=resolve});
 await page.route('**/api/lesson-depth?*',async route=>{if(first){first=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'QA depth temporary failure'})})}else{await depthGate;await route.continue()}});
 await page.goto(base+'/legacy?lesson=w01-d1&mode=depth');await page.getByText('QA depth temporary failure',{exact:true}).waitFor();
 await page.getByRole('button',{name:'重新读取',exact:true}).click();await page.getByText('正在读取深入讲解与例题…',{exact:true}).waitFor();check('depth retry clears old error before fetch resolves',await page.getByText('QA depth temporary failure',{exact:true}).count()===0);releaseDepth();await page.getByRole('heading',{name:'深化考查',exact:true}).waitFor();await page.unroute('**/api/lesson-depth?*');
 await page.route('**/api/retention?*',route=>route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'QA retention waiting period'})}));
 await page.goto(base+'/legacy?lesson=w01-d1&mode=retention');await page.getByText('QA retention waiting period',{exact:true}).waitFor();await page.unroute('**/api/retention?*');
 let releaseRetention;const retentionGate=new Promise(resolve=>{releaseRetention=resolve});
 await page.route('**/api/retention?*',async route=>{await retentionGate;await route.continue()});
 await page.getByRole('button',{name:'重新读取到期状态',exact:true}).click();await page.getByText('正在读取复测安排…',{exact:true}).waitFor();check('retention retry clears prior status while pending',await page.getByText('QA retention waiting period',{exact:true}).count()===0);releaseRetention();await page.getByRole('button',{name:'重新读取到期状态',exact:true}).waitFor();await page.unroute('**/api/retention?*');
 await page.goto(base+'/legacy?lesson=w01-d1&mode=exam');await page.getByRole('radio').first().check();
 const dialog=page.waitForEvent('dialog').then(async dialog=>{check('legacy new-path link retains explicit draft warning',dialog.message().includes('尚未提交的草稿'));await dialog.dismiss()});await page.getByRole('link',{name:'新能力路径',exact:true}).click();await dialog;
 check('dismissed legacy navigation keeps answers and route',page.url().includes('/legacy')&&await page.getByRole('radio').first().isChecked());
 check('no uncaught UI errors',errors.length===0);
 console.log(JSON.stringify({passed:results.length,results,errors,scope:'real Chromium, synthetic loopback accounts, 1365/390/320px; no production authentication assertion'},null,2));
}finally{await browser.close();await rm(folder,{recursive:true,force:true})}
