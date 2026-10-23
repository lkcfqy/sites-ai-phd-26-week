import {depthLesson} from '@/lib/depth-content';
import {DEPTH_VERSION} from '@/lib/depth-types';
import {selfStudyLesson} from '@/lib/self-study-content';
import {publicQuestion,publicStudy} from '@/lib/public-teaching';
export const dynamic='force-dynamic';

export function GET(request:Request){
 const id=new URL(request.url).searchParams.get('lesson')??'';
 const lesson=depthLesson(id);
 if(!lesson)return Response.json({error:'未找到这节课的深化讲解。'},{status:404,headers:{'Cache-Control':'no-store'}});
 const {questions,...content}=lesson;
 const study=selfStudyLesson(id),selfStudy=study?publicStudy(study):undefined;
 return Response.json({lessonId:id,version:DEPTH_VERSION,content,selfStudy,questions:questions.map(publicQuestion)},{headers:{'Cache-Control':'public, max-age=300'}});
}
