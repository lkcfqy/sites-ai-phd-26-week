import {getChatGPTUser} from '@/app/chatgpt-auth';
import curriculum from '@/data/curriculum.json';
import templates from '@/data/research-templates.json';
import type {Week,Lesson} from '@/lib/types';
import {buildNotebook} from '@/lib/notebook';
export const dynamic='force-dynamic';
export async function GET(r:Request){
 const u=await getChatGPTUser();if(!u)return Response.json({error:'请先登录。'},{status:401,headers:{'Cache-Control':'no-store'}});
 const params=new URL(r.url).searchParams;const id=params.get('id');
 const lesson=(curriculum as Week[]).flatMap(w=>w.lessons).find(l=>l.id===id)??(templates as Lesson[]).find(t=>'template-'+t.id===id);
 if(!lesson)return Response.json({error:'课程不存在。'},{status:404,headers:{'Cache-Control':'no-store'}});
 return new Response(JSON.stringify(buildNotebook(lesson,params.get('solutions')==='1'),null,2),{headers:{'Content-Type':'application/x-ipynb+json','Content-Disposition':`attachment; filename="${lesson.id}.ipynb"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
