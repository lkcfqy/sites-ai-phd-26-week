import {getChatGPTUser} from '@/app/chatgpt-auth';
import {requireAccountContext} from '@/lib/account-context';
import {selfStudyLesson} from '@/lib/self-study-content';
import {SELF_STUDY_VERSION} from '@/lib/self-study-types';
import {retentionAvailability} from '@/lib/retention';
import {publicQuestion} from '@/lib/public-teaching';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){
 const user=await getChatGPTUser();if(!user)return reply({error:'请先登录。'},401);
 const context=requireAccountContext(request,user.userId);if(context)return context;
 const id=new URL(request.url).searchParams.get('lesson')??'',lesson=selfStudyLesson(id);
 if(!lesson)return reply({error:'未找到这节课。'},404);
 try{
  const availability=await retentionAvailability(user.userId,id);
  if(!availability.available)return reply({error:availability.completed?'本课延迟复测已通过。':'新版深化首次通过满7天后开放；补弱重做须在上次提交满24小时后。',...availability},409);
  return reply({lessonId:id,version:SELF_STUDY_VERSION,questions:lesson.transfer.map(publicQuestion)});
 }catch{return reply({error:'复测暂时无法读取，请稍后重试。'},503)}
}
