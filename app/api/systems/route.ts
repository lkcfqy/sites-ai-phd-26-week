import {getChatGPTUser} from '@/app/chatgpt-auth';
import {database} from '@/lib/storage';
import {requireAccountContext} from '@/lib/account-context';
import {z} from 'zod';
import {normalizeSystemsWrite} from '@/lib/systems-write';
import {normalizeAttempt} from '@/lib/systems-assessment';
export const dynamic='force-dynamic';
const version='mlsys-v1';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function ensure(){await database().prepare(`CREATE TABLE IF NOT EXISTS systems_evidence (user_id TEXT NOT NULL, item_id TEXT NOT NULL, version TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(user_id,item_id,version))`).run()}
const schema=z.object({itemId:z.string().regex(/^[a-z0-9:_-]{1,100}$/),kind:z.enum(['reading','concept','simulation','practice','ticket']),body:z.string().max(60000),expectedUpdatedAt:z.number().int().nonnegative()});
export async function GET(request:Request){const u=await getChatGPTUser();if(!u)return reply({error:'请登录'},401);const guard=requireAccountContext(request,u.userId);if(guard)return guard;try{await ensure();const result=await database().prepare('SELECT item_id,body,kind,updated_at FROM systems_evidence WHERE user_id=? AND version=? ORDER BY item_id').bind(u.userId,version).all();return reply({version,userId:u.userId,records:result.results})}catch{return reply({error:'云端记录暂不可用；不会覆盖原课程进度。'},503)}}
export async function POST(request:Request){const u=await getChatGPTUser();if(!u)return reply({error:'请登录'},401);const guard=requireAccountContext(request,u.userId);if(guard)return guard;if(request.headers.get('sec-fetch-site')==='cross-site'||(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin))return reply({error:'请求来源不匹配'},403);if(!request.headers.get('content-type')?.includes('application/json'))return reply({error:'需要JSON'},415);
 let raw:unknown;try{const reader=request.body?.getReader();if(!reader)return reply({error:'请求为空'},400);let text='',bytes=0;const decoder=new TextDecoder();for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>100000){await reader.cancel();return reply({error:'内容过大'},413)}text+=decoder.decode(value,{stream:true})}text+=decoder.decode();raw=JSON.parse(text)}catch{return reply({error:'格式错误'},400)}const parsed=schema.safeParse(raw);if(!parsed.success)return reply({error:'字段或长度不正确'},400);
 let body:string;try{body=normalizeSystemsWrite(parsed.data.itemId,parsed.data.kind,parsed.data.body)}catch(error){return reply({error:error instanceof Error?error.message:'实验格式不正确'},400)}
 try{await ensure();const b={...parsed.data,body},now=Date.now(),db=database();
 if(b.itemId.startsWith('assessment:attempt:')||b.itemId.startsWith('assessment:review:')){
  if(b.expectedUpdatedAt!==0)return reply({error:'尝试和评阅保留历史；请新建重试或反馈，不覆盖旧记录。'},400);
  const data=JSON.parse(b.body),reference=b.itemId.startsWith('assessment:review:')?data.attemptId:data.previousId;
  if(reference){
   const previous=await db.prepare('SELECT body FROM systems_evidence WHERE user_id=? AND item_id=? AND version=?').bind(u.userId,reference,version).first<{body:string}>();
   if(!previous)return reply({error:'关联尝试不在当前账号，请先保存对应尝试。'},400);
   let prior;try{prior=normalizeAttempt(JSON.parse(previous.body))}catch{return reply({error:'关联对象必须是有效的评测尝试。'},400)}
   if(b.itemId.startsWith('assessment:attempt:')&&prior.artifact.family!==data.artifact.family)return reply({error:'不同主题请另建尝试；重试需关联同一主题。'},400);
   if(b.itemId.startsWith('assessment:review:')&&data.decision==='new-variant'&&!prior.artifact.passed)return reply({error:'仍有失败测试，先修订再进行下一次变式。'},400);
  }
 }
 const result=b.expectedUpdatedAt===0?await db.prepare('INSERT OR IGNORE INTO systems_evidence(user_id,item_id,version,body,kind,updated_at) VALUES(?,?,?,?,?,?) RETURNING item_id,body,kind,updated_at').bind(u.userId,b.itemId,version,b.body,b.kind,now).first():await db.prepare('UPDATE systems_evidence SET body=?,kind=?,updated_at=MAX(updated_at+1,?) WHERE user_id=? AND item_id=? AND version=? AND updated_at=? RETURNING item_id,body,kind,updated_at').bind(b.body,b.kind,now,u.userId,b.itemId,version,b.expectedUpdatedAt).first();if(!result)return reply({error:'另一页面已更新本条记录。草稿未提交，请先导出草稿，再刷新比较；不会静默覆盖。'},409);return reply({record:result})}catch{return reply({error:'保存失败，输入仍在当前页面，请导出草稿后重试。'},503)}}
