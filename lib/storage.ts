import {env} from 'cloudflare:workers';
import {CONTENT_VERSION,CURRICULUM_REVISION} from './content-version';
import {DEPTH_VERSION} from './depth-types';
import {SELF_STUDY_VERSION,type RetentionScore} from './self-study-types';
import {retentionSchedule} from './retention-policy';
export function database(){if(!env.DB)throw new Error('学习记录暂时不可用');return env.DB;}
type StateRow=Record<string,unknown>;
type LearningState={userId:string;profile:StateRow|null;progress:StateRow[];attemptCount:number;checkpoints:StateRow[];depthScores:StateRow[];previousDepthScores:StateRow[];retentionScores:StateRow[];retentionDue:ReturnType<typeof retentionSchedule>;contentVersion:string;curriculumRevision:string};
type BackupState=LearningState&{projects:StateRow[];codeArtifacts:StateRow[];practiceRuns:StateRow[];learningSessions:StateRow[];tutorReviews:StateRow[];researchRecords:StateRow[];attempts:StateRow[]};
export function readState(user:string,includeAttempts:true):Promise<BackupState>;
export function readState(user:string,includeAttempts?:false):Promise<LearningState>;
export function readState(user:string,includeAttempts:boolean):Promise<LearningState|BackupState>;
export async function readState(user:string,includeAttempts=false):Promise<LearningState|BackupState>{
 const db=database();
 // Normal learning reads derive completion from quiz results without rewriting legacy data.
 // Full backups retain the original columns and completion flags for lossless export.
 const progressFields=includeAttempts?'lesson_id,completed,practiced,score,best_score,note,answers,review_step,next_review,updated_at,assistance,practice_evidence,content_version':'lesson_id,CASE WHEN best_score>=80 THEN 1 ELSE 0 END AS completed,score,best_score,answers,review_step,next_review,updated_at,content_version';
 const statements=[
  db.prepare('SELECT hours,track,start_date,diagnostic,updated_at FROM profiles WHERE user_id=?').bind(user),
  db.prepare('SELECT '+progressFields+' FROM progress WHERE user_id=? ORDER BY lesson_id').bind(user),
  db.prepare('SELECT COUNT(*) AS total FROM attempts WHERE user_id=?').bind(user),
  db.prepare('SELECT week,track,score,best_score,answers,updated_at,content_version FROM checkpoints WHERE user_id=? ORDER BY week,track').bind(user),
  db.prepare("SELECT lesson_id,score,best_score,attempts,created_at AS updated_at FROM (SELECT substr(lesson_id,7) AS lesson_id,score,MAX(score) OVER(PARTITION BY lesson_id) AS best_score,COUNT(*) OVER(PARTITION BY lesson_id) AS attempts,created_at,ROW_NUMBER() OVER(PARTITION BY lesson_id ORDER BY created_at DESC,id DESC) AS rn FROM attempts WHERE user_id=? AND mode='depth' AND content_version=?) WHERE rn=1 ORDER BY lesson_id").bind(user,DEPTH_VERSION),
  db.prepare("SELECT lesson_id,score,best_score,attempts,created_at AS updated_at FROM (SELECT substr(lesson_id,7) AS lesson_id,score,MAX(score) OVER(PARTITION BY lesson_id) AS best_score,COUNT(*) OVER(PARTITION BY lesson_id) AS attempts,created_at,ROW_NUMBER() OVER(PARTITION BY lesson_id ORDER BY created_at DESC,id DESC) AS rn FROM attempts WHERE user_id=? AND mode='depth' AND content_version='depth-v1') WHERE rn=1 ORDER BY lesson_id").bind(user),
  db.prepare("SELECT lesson_id,score,first_score,best_score,attempts,created_at AS updated_at FROM (SELECT substr(lesson_id,11) AS lesson_id,score,FIRST_VALUE(score) OVER(PARTITION BY lesson_id ORDER BY created_at,id) AS first_score,MAX(score) OVER(PARTITION BY lesson_id) AS best_score,COUNT(*) OVER(PARTITION BY lesson_id) AS attempts,created_at,ROW_NUMBER() OVER(PARTITION BY lesson_id ORDER BY created_at DESC,id DESC) AS rn FROM attempts WHERE user_id=? AND mode='retention' AND content_version=?) WHERE rn=1 ORDER BY lesson_id").bind(user,SELF_STUDY_VERSION),
  db.prepare("SELECT substr(lesson_id,7) AS lesson_id,MIN(created_at) AS passed_at FROM attempts WHERE user_id=? AND mode='depth' AND content_version=? AND score>=80 GROUP BY lesson_id").bind(user,DEPTH_VERSION)
 ];
 if(includeAttempts)statements.push(
  db.prepare('SELECT week,body,checks,submitted,updated_at,assistance FROM projects WHERE user_id=? ORDER BY week').bind(user),
  db.prepare('SELECT lesson_id,purpose,code,code_sha,updated_at FROM code_artifacts WHERE user_id=? ORDER BY lesson_id,purpose').bind(user),
  db.prepare('SELECT id,lesson_id,instance_id,task_version,code_sha,code,status,provenance,score,feedback_json,result_json,created_at,next_retest FROM practice_runs WHERE user_id=? ORDER BY created_at DESC').bind(user),
  db.prepare('SELECT id,lesson_id,activity,minutes,created_at FROM learning_sessions WHERE user_id=? ORDER BY created_at DESC').bind(user),
  db.prepare('SELECT id,lesson_id,code_sha,request_json,response_json,status,created_at FROM tutor_reviews WHERE user_id=? ORDER BY created_at DESC').bind(user),
  db.prepare('SELECT id,track,protocol_json,protocol_sha,frozen_at,opened_at,report_json,created_at FROM research_records WHERE user_id=? ORDER BY created_at DESC').bind(user),
  db.prepare('SELECT id,lesson_id,score,mode,answers,created_at,content_version FROM attempts WHERE user_id=? ORDER BY created_at,id').bind(user)
 );
 // D1 batch executes statements sequentially in one transaction.
 const [profile,progress,count,checkpoints,depthScores,previousDepthScores,retentionScores,firstPasses,...legacy]=await db.batch<StateRow>(statements);
 const state:LearningState={userId:user,profile:profile.results[0]??null,progress:progress.results,attemptCount:Number(count.results[0]?.total??0),checkpoints:checkpoints.results,depthScores:depthScores.results,previousDepthScores:previousDepthScores.results,retentionScores:retentionScores.results,retentionDue:retentionSchedule(firstPasses.results.map(row=>({lesson_id:String(row.lesson_id),passed_at:Number(row.passed_at)})),retentionScores.results as unknown as RetentionScore[]),contentVersion:CONTENT_VERSION,curriculumRevision:CURRICULUM_REVISION};
 if(!includeAttempts)return state;
 const [projects,codeArtifacts,practiceRuns,learningSessions,tutorReviews,researchRecords,attempts]=legacy;
 return {...state,projects:projects.results,codeArtifacts:codeArtifacts.results,practiceRuns:practiceRuns.results,learningSessions:learningSessions.results,tutorReviews:tutorReviews.results,researchRecords:researchRecords.results,attempts:attempts.results};
}
