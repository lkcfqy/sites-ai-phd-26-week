import {z} from 'zod';

export type PracticeFeedback={summary?:string;boundary?:string;checks?:{label:string;passed:boolean;issues:string[]}[];missing?:string[];hints?:{hint:string;recoveryLessonIds:string[]}[];executionError?:string;taskSnapshot?:{mode?:string;inputs?:unknown[]}};
const feedbackSchema=z.object({summary:z.string().optional().catch(undefined),boundary:z.string().optional().catch(undefined),checks:z.array(z.object({label:z.string(),passed:z.boolean(),issues:z.array(z.string())})).optional().catch(undefined),missing:z.array(z.string()).optional().catch(undefined),hints:z.array(z.object({hint:z.string(),recoveryLessonIds:z.array(z.string())})).optional().catch(undefined),executionError:z.string().optional().catch(undefined),taskSnapshot:z.object({mode:z.string().optional(),inputs:z.array(z.unknown()).optional()}).optional().catch(undefined)}).catch({});

/** Historical feedback is optional: a malformed field must not hide valid feedback. */
export function parsePracticeFeedback(json:string):PracticeFeedback{
 try{return feedbackSchema.parse(JSON.parse(json))}catch{return {}}
}
