import {database} from './storage';
import {DEPTH_VERSION} from './depth-types';
import {SELF_STUDY_VERSION} from './self-study-types';
const DAY=86400000;
export async function retentionAvailability(user:string,lesson:string){
 const db=database();
 const pass=await db.prepare("SELECT MIN(created_at) AS passed_at FROM attempts WHERE user_id=? AND lesson_id=? AND mode='depth' AND content_version=? AND score>=80").bind(user,'depth:'+lesson,DEPTH_VERSION).first<{passed_at:number|null}>();
 if(pass?.passed_at==null)return {available:false,due_at:null,completed:false};
 const score=await db.prepare("SELECT score,created_at,(SELECT MAX(score) FROM attempts WHERE user_id=? AND lesson_id=? AND mode='retention' AND content_version=?) AS best_score FROM attempts WHERE user_id=? AND lesson_id=? AND mode='retention' AND content_version=? ORDER BY created_at DESC,id DESC LIMIT 1").bind(user,'retention:'+lesson,SELF_STUDY_VERSION,user,'retention:'+lesson,SELF_STUDY_VERSION).first<{score:number;created_at:number;best_score:number}>();
 if(score?.best_score===100)return {available:false,due_at:null,completed:true};
 const due_at=score?score.created_at+DAY:pass.passed_at+7*DAY;
 return {available:Date.now()>=due_at,due_at,completed:false};
}
