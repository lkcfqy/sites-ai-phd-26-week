import type {DepthQuestion} from './depth-types';

export const SELF_STUDY_VERSION='self-study-v1';
export type SelfStudyLesson={
 question:string;
 prerequisites:{term:string;explanation:string;check:string}[];
 sections:{title:string;body:string}[];
 worked:{title:string;given:string;steps:string[];table:{headers:string[];rows:string[][]};conclusion:string};
 faded:{prompt:string;options:string[];answer:number;explanation:string;steps:string[]};
 transfer:DepthQuestion[];
 recap:string[];
 readingMinutes:number;
};
export type PublicSelfStudyLesson=Omit<SelfStudyLesson,'transfer'>;
export type RetentionScore={first_score?:number;lesson_id:string;score:number;best_score:number;attempts:number;updated_at:number};
export type RetentionDue={lesson_id:string;due_at:number;attempts:number};
