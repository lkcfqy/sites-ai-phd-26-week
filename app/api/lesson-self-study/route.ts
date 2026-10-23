import {selfStudyLesson} from '@/lib/self-study-content';
import {SELF_STUDY_VERSION} from '@/lib/self-study-types';
import {publicStudy} from '@/lib/public-teaching';
export const dynamic='force-dynamic';
export function GET(request:Request){
 const id=new URL(request.url).searchParams.get('lesson')??'',lesson=selfStudyLesson(id);
 if(!lesson)return Response.json({error:'未找到自学讲解。'},{status:404,headers:{'Cache-Control':'no-store'}});
 const content=publicStudy(lesson);
 return Response.json({lessonId:id,version:SELF_STUDY_VERSION,content},{headers:{'Cache-Control':'public, max-age=300'}});
}
