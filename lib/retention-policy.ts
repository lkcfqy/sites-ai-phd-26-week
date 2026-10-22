import type {RetentionDue,RetentionScore} from './self-study-types';
const DAY=86400000;
export function retentionSchedule(passes:{lesson_id:string;passed_at:number}[],scores:RetentionScore[]):RetentionDue[]{
 const records=new Map(scores.map(score=>[score.lesson_id,score]));
 return passes.flatMap(pass=>{const record=records.get(pass.lesson_id);return record?.best_score===100?[]:[{lesson_id:pass.lesson_id,due_at:record?record.updated_at+DAY:pass.passed_at+7*DAY,attempts:record?.attempts??0}]}).sort((a,b)=>a.due_at-b.due_at);
}
