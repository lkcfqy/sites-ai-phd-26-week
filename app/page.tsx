import {requireChatGPTUser} from './chatgpt-auth';
import StudyApp from './study-app';
import curriculum from '@/data/curriculum.json';
import type {Week} from '@/lib/types';
export const dynamic='force-dynamic';
export default async function Home(){const user=await requireChatGPTUser('/');return <StudyApp weeks={curriculum as Week[]} userId={user.userId} userName={user.fullName??'博士学习者'}/>}
