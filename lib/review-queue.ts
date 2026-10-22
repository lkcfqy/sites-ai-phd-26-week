import type {Lesson,StudyState} from './types';
export type ReviewItem={lesson:Lesson;kind:'review'|'retest';dueAt:number};
export function reviewQueue(state:StudyState,lessons:Lesson[],now:number):ReviewItem[]{
 const progress=new Map(state.progress.map(row=>[row.lesson_id,row])),runs=new Map<string,NonNullable<StudyState['practiceRuns']>[number]>();
 for(const run of state.practiceRuns??[]){const previous=runs.get(run.lesson_id);if(!previous||run.created_at>previous.created_at||(run.created_at===previous.created_at&&run.id>previous.id))runs.set(run.lesson_id,run);}
 return lessons.flatMap(lesson=>{
  const items:ReviewItem[]=[],concept=progress.get(lesson.id),practice=runs.get(lesson.id);
  if(concept?.next_review&&concept.next_review<=now)items.push({lesson,kind:'review',dueAt:concept.next_review});
  if(practice&&['verified','retained','result-checked'].includes(practice.status)&&practice.next_retest>0&&practice.next_retest<=now)items.push({lesson,kind:'retest',dueAt:practice.next_retest});
  return items;
 }).sort((a,b)=>a.dueAt-b.dueAt||a.lesson.id.localeCompare(b.lesson.id)||a.kind.localeCompare(b.kind));
}
