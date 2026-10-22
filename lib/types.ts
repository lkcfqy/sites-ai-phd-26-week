import type {CodeArtifact,PracticeRun} from './autonomous-types';
import type {DepthScore} from './depth-types';
import type {RetentionScore,RetentionDue} from './self-study-types';
export type Track = 'undecided' | 'vision' | 'timeseries' | 'language';
export type Quiz = {question:string;options:string[];answer:number;explanation:string};
export type Lesson = {id:string;day:number;track:'common'|Exclude<Track,'undecided'>;title:string;summary:string;minutes:number;objectives:string[];concepts:{title:string;body:string}[];formula?:string;code:string;requirements:string[];practice:{task:string;hints:string[];solution:string;checks:string[]};quiz:Quiz[];references:{title:string;url:string}[]};
export type Week = {number:number;title:string;phase:string;focus:string;goals:string[];challenge:{title:string;brief:string;deliverables:string[];rubric:string[];defense:string[]};lessons:Lesson[]};
export type Assistance = 'unrecorded'|'independent'|'hinted'|'solution';
export type Progress = {assistance?:Assistance;practice_evidence?:string;content_version?:string;lesson_id:string;completed:number;practiced:number;score:number;best_score:number;note:string;answers:string;review_step:number;next_review:number;updated_at:number};
export type Project = {assistance?:Assistance;week:number;body:string;checks:string;submitted:number;updated_at:number};
export type Profile = {hours:number;track:Track;start_date:string;diagnostic:string;updated_at:number};
export type StudyState = {previousDepthScores?:DepthScore[];retentionScores?:RetentionScore[];retentionDue?:RetentionDue[];depthScores?:DepthScore[];tutorReviews?:{id:string;lesson_id:string;code_sha:string;request_json:string;response_json:string;status:string;created_at:number}[];researchRecords?:{id:string;track:string;protocol_json:string;protocol_sha:string;frozen_at:number;opened_at:number;report_json:string;created_at:number}[];userId?:string;codeArtifacts?:CodeArtifact[];practiceRuns?:PracticeRun[];learningSessions?:{id:string;lesson_id:string;activity:string;minutes:number;created_at:number}[];contentVersion?:string;profile:Profile;progress:Progress[];projects:Project[];attemptCount:number;checkpoints:{week:number;track:string;score:number;best_score:number;answers:string;updated_at:number}[]};
export const trackNames: Record<Track,string> = {undecided:'第 8 周再选方向',vision:'计算机视觉',timeseries:'工业数据与时间序列',language:'自然语言处理'};
export function pathLessons(week:Week,track:Track){return week.lessons.filter(l=>l.track==='common'||l.track===track)}
export function lessonList(weeks:Week[],track:Track){return weeks.flatMap(w=>pathLessons(w,track));}
export const todaySeoul=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
