export const AUTO_VERSION='auto-practice-v1';
export type JSONValue=null|boolean|number|string|JSONValue[]|{[key:string]:JSONValue};
export type AutoTask={lessonId:string;title:string;prompt:string;starter:string;referenceCode:string;requirements:string[];tests:{input:JSONValue;expected:JSONValue;label:string}[];misconceptions:{code:string;error:string;recoveryLessonIds:string[];hint:string}[];topic:string};
export type EvidenceField={key:string;label:string;type:string;requirement:string;itemKeys?:string[];minItems?:number;choices?:string[];suggestions?:string[];optional?:boolean};
export type EvidenceTask={lessonId:string;prompt:string;fields:EvidenceField[];rules:unknown[];feedbackHints:string[]};
export type CodeArtifact={lesson_id:string;purpose:string;code:string;code_sha:string;updated_at:number};
export type PracticeRun={id:string;lesson_id:string;instance_id:string;code_sha:string;code:string;status:string;provenance:string;score:number;feedback_json:string;result_json:string;created_at:number;next_retest:number;task_version:string};
export type TaskInstance={id:string;lessonId:string;taskVersion:string;mode:'practice'|'retest';title:string;prompt:string;starter:string;requirements:string[];tests:{input:JSONValue;label:string}[];expiresAt:number;kind?:'code'|'evidence';fields?:EvidenceTask['fields']};
export type TeachingUpgrade={hook:string;steps:string[];pitfalls:string[];quickCheck:string;readingGuide:unknown;coreDeliverable:string};
export async function sha256(text:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(n=>n.toString(16).padStart(2,'0')).join('');}
export function compareJSON(actual:unknown,expected:JSONValue,path='result'):string[]{
 if(typeof expected==='number')return typeof actual==='number'&&Number.isFinite(actual)&&Math.abs(actual-expected)<=1e-6*Math.max(1,Math.abs(expected))?[]:[`${path} 的数值或类型不符合要求。`];
 if(Array.isArray(expected)){if(!Array.isArray(actual)||actual.length!==expected.length)return [`${path} 的列表长度不符合要求。`];return expected.flatMap((v,i)=>compareJSON(actual[i],v,`${path}[${i}]`));}
 if(expected!==null&&typeof expected==='object'){if(actual===null||typeof actual!=='object'||Array.isArray(actual))return [`${path} 应返回对象。`];const a=actual as Record<string,unknown>;if(Object.keys(a).length!==Object.keys(expected).length)return [`${path} 的对象字段不符合要求。`];return Object.entries(expected).flatMap(([k,v])=>compareJSON(a[k],v,`${path}.${k}`));}
 return actual===expected?[]:[`${path} 的值或类型不符合要求。`];
}
