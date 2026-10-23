import {requireChatGPTUser} from '../chatgpt-auth';
import StudyApp from '../study-app';
import curriculum from '@/data/curriculum.json';
import type {Week} from '@/lib/types';
export const dynamic='force-dynamic';
export default async function Legacy({searchParams}:{searchParams:Promise<{lesson?:string}>}){const params=await searchParams;const user=await requireChatGPTUser('/legacy');const weeks=curriculum as Week[];const initialLesson=weeks.flatMap(w=>w.lessons).some(l=>l.id===params.lesson)?params.lesson:undefined;return <StudyApp weeks={weeks} userId={user.userId} userName={user.fullName??'学习者'} initialLesson={initialLesson}/>}
