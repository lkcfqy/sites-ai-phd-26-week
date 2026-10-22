import type {Quiz} from './types';
import type {PublicSelfStudyLesson} from './self-study-types';

export const DEPTH_VERSION='depth-v2';
export type DepthKind='reasoning'|'calculation'|'transfer'|'boundary';
export type DepthQuestion=Quiz&{id:string;kind:DepthKind;sectionId:string};
export type DepthLesson={
 outcomes:string[];
 sections:{id:string;title:string;body:string}[];
 workedExample:{title:string;given:string;steps:string[];result:string};
 pitfalls:{mistake:string;correction:string}[];
 questions:DepthQuestion[];
 references:{title:string;url:string}[];
};
export type DepthScore={lesson_id:string;score:number;best_score:number;attempts:number;updated_at:number};
export type DepthFeedback={score:number;results:{answer:number;correct:boolean;explanation:string;kind:DepthKind;sectionId:string}[];version:string};
export type PublicDepthLesson=Omit<DepthLesson,'questions'>;
export type PublicDepthPayload={lessonId:string;version:string;content:PublicDepthLesson;selfStudy?:PublicSelfStudyLesson;questions:Omit<DepthQuestion,'answer'|'explanation'>[]};
