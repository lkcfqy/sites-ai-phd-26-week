import {requireChatGPTUser} from './chatgpt-auth';
import {redirect} from 'next/navigation';
import SystemsApp from './systems/systems-app';
export const dynamic='force-dynamic';
export default async function Home({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const params=await searchParams;if(params.view||params.lesson){const legacy=new URLSearchParams();for(const key of ['view','lesson','mode','week','tab'])if(typeof params[key]==='string')legacy.set(key,params[key] as string);redirect('/legacy?'+legacy.toString())}const user=await requireChatGPTUser('/');return <SystemsApp key={user.userId} userId={user.userId}/>}
