// Loopback-only review fixture. Uses a new QA database; never deploy this file.
import {fetch as proxyFetch,EnvHttpProxyAgent} from 'undici';
const outboundAgent=new EnvHttpProxyAgent();
import {Miniflare} from 'miniflare';
import {mkdirSync,mkdtempSync,writeFileSync,readdirSync,readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const root=process.cwd();mkdirSync('.sites-runtime',{recursive:true});const temporary=mkdtempSync(resolve('.sites-runtime/browser-check-'));
const wrapper=resolve(temporary,'worker.mjs');
writeFileSync(wrapper,`import app from '../../dist/server/index.js';
export default {async fetch(request,env,ctx){
 const url=new URL(request.url),headers=new Headers(request.headers);
 if(url.pathname.startsWith('/_next/static/')||url.pathname.startsWith('/systems/')||url.pathname==='/python-worker.js'||url.pathname==='/favicon.svg')return env.ASSETS.fetch(request);
 for(const key of [...headers.keys()])if(key.startsWith('oai-authenticated-user-'))headers.delete(key);
 if(url.pathname==='/signin-with-chatgpt')return new Response(null,{status:302,headers:{Location:'/', 'Set-Cookie':'__qa_auth='+ (url.searchParams.get('qa')==='B'?'B':'A') +'; HttpOnly; SameSite=Lax; Path=/'}});
 if(url.pathname==='/signout-with-chatgpt')return new Response(null,{status:302,headers:{Location:'/', 'Set-Cookie':'__qa_auth=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/'}});
 const signed=headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith('__qa_auth='))?.split('=')[1];
 const auth=signed==='A'||signed==='B'?signed:undefined;
 if(auth){headers.set('oai-authenticated-user-id','qa-browser-'+auth);headers.set('oai-authenticated-user-email','browser-'+auth+'@example.test');}
 if(url.pathname==='/__qa/failure'||url.pathname==='/__qa/recover')return new Response(null,{status:302,headers:{Location:'/', 'Set-Cookie':'__qa_failure='+ (url.pathname.endsWith('failure')?'1':'0') +'; SameSite=Lax; Path=/'}});
 if(['/api/state','/api/export'].includes(url.pathname)&&headers.get('cookie')?.includes('__qa_failure=1'))return Response.json({error:'验收用服务暂不可用；输入保留，请重试。'},{status:503});
 return app.fetch(new Request(request,{headers}),env,ctx);
}};`);
const modules=[wrapper,...readdirSync('dist/server',{recursive:true}).filter(f=>/\.m?js$/.test(f)).map(f=>resolve('dist/server',f))].map(path=>({type:'ESModule',path}));
const mf=new Miniflare({host:'127.0.0.1',port:5175,modules,modulesRoot:root,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],outboundService:async request=>{const url=new URL(request.url);if(url.origin!=='https://cdn.jsdelivr.net'||!url.pathname.startsWith('/pyodide/v0.28.3/full/'))return new Response('QA outbound destination refused',{status:403});const response=await proxyFetch(request.url,{dispatcher:outboundAgent});return new Response(response.body,{status:response.status,headers:Object.fromEntries(response.headers)});},d1Databases:{DB:'qa-browser-db'},d1Persist:resolve(temporary,'db'),serviceBindings:{ASSETS:async request=>{const path=resolve('dist/client','.'+new URL(request.url).pathname);if(!path.startsWith(resolve('dist/client')+'/')||!existsSync(path))return new Response('Not found',{status:404});const mime=path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'application/javascript';return new Response(readFileSync(path),{headers:{'Content-Type':mime}})}}});
const db=await mf.getD1Database('DB');
for(const name of ['0000_abnormal_khan.sql','0001_volatile_the_twelve.sql','0002_minor_black_bolt.sql','0003_learning_evidence.sql','0004_autonomous_learning.sql','0005_research_protocols.sql']){const sql=readFileSync(resolve('drizzle',name),'utf8').split(';').map(s=>s.replace(/--> statement-breakpoint/g,'').trim()).filter(Boolean);await db.batch(sql.map(s=>db.prepare(s)))}
console.log('Disposable QA preview: '+await mf.ready);console.log('DB: '+temporary);console.log('Login: /signin-with-chatgpt?return_to=/');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await mf.dispose();process.exit(0)});
if(process.env.SYSTEMS_QA_TEST==='1'){globalThis.__systemsTestDispatch=(url,init)=>mf.dispatchFetch(url,init);try{await import('./check-systems-api.mjs')}finally{await mf.dispose()}}else await new Promise(()=>{});
