import tasks from '@/data/auto-tasks.json';
import evidence from '@/data/auto-evidence.json';
import teaching from '@/data/teaching-upgrade.json';
import {type AutoTask,type EvidenceTask,type TeachingUpgrade} from './autonomous-types';
export const autoTasks=new Map((tasks as unknown as AutoTask[]).map(t=>[t.lessonId,t]));
export const evidenceTasks=new Map((evidence as unknown as EvidenceTask[]).map(t=>[t.lessonId,t]));
export const teachingUpgrades=teaching as unknown as Record<string,TeachingUpgrade>;
