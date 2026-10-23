import type {DepthQuestion} from './depth-types';
import type {PublicSelfStudyLesson,SelfStudyLesson} from './self-study-types';

// Explicit public projections keep answers and held-back transfer questions off public routes.
export function publicQuestion({id,kind,sectionId,question,options}:DepthQuestion):Omit<DepthQuestion,'answer'|'explanation'>{
 return {id,kind,sectionId,question,options};
}
export function publicStudy({question,prerequisites,sections,worked,faded,recap,readingMinutes}:SelfStudyLesson):PublicSelfStudyLesson{
 return {question,prerequisites,sections,worked,faded,recap,readingMinutes};
}
