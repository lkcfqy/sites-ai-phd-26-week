import {getChatGPTUser} from '@/app/chatgpt-auth';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{file:string}>}){
 if(!await getChatGPTUser())return Response.json({error:'请先登录。'},{status:401});
 const {file}=await params;
 if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,180}$/.test(file)||file.includes('..')||!(/\.(js|wasm|json|zip|whl)$/.test(file)))return new Response('Not found',{status:404});
 try{const upstream=await fetch('https://cdn.jsdelivr.net/pyodide/v0.28.3/full/'+file);if(!upstream.ok)return new Response('Python 资源暂时不可用',{status:upstream.status});return new Response(upstream.body,{headers:{'Content-Type':upstream.headers.get('Content-Type')??'application/octet-stream','Cache-Control':'private, max-age=86400','X-Content-Type-Options':'nosniff'}})}catch{return new Response('Python 资源加载失败，请重试或下载 Notebook。',{status:503})}
}
