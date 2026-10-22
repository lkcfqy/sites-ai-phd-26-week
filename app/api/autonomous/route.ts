import {autoUser,autoReply} from '@/lib/auto-api';
export const dynamic='force-dynamic';
async function retired(request:Request){
 const auth=await autoUser(request);if(auth.error)return auth.error;
 return autoReply({error:'此入口已停用，请返回学习页面阅读课程，或进入考查完成选择题。',code:'learning-and-assessment-only'},410);
}
export const GET=retired;
export const POST=retired;
