import {getChatGPTUser} from '@/app/chatgpt-auth';
import {readState} from '@/lib/storage';
import {requireAccountContext} from '@/lib/account-context';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const u=await getChatGPTUser();if(!u)return Response.json({error:'请先登录。'},{status:401,headers:{'Cache-Control':'no-store'}});
 const contextError=requireAccountContext(request,u.userId);if(contextError)return contextError;
 try{
  // Read-only snapshot; every attempt is included, not just the latest answer.
  const state=await readState(u.userId,true);
  return new Response(JSON.stringify({format:'ai-phd-backup-v3',exportedAt:new Date().toISOString(),...state,limitations:['当前站点仅提供学习与选择题考查；旧导入和材料提交流程已停用。','基础题与深化题按各自版本保存全部历史作答；汇总成绩可以从作答记录重新计算。','备份保留旧记录，但不含外部数据集、模型权重或附件。']},null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="ai-phd-learning-records.json"','Cache-Control':'no-store'}});
 }catch{return Response.json({error:'导出失败，请稍后重试。'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
