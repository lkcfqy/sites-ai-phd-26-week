import {z} from 'zod';

export const assessmentFamilies = ['trace', 'partition', 'decision'] as const;
export type AssessmentFamily = typeof assessmentFamilies[number];
type Args = unknown[];
type Outcome = {value: unknown; error: string | null};
const outcomeSchema = z.object({value: z.unknown(), error: z.string().max(100).nullable()});
const executionSchema=z.object({status:z.enum(['completed','failed','timeout','invalid-result']),message:z.string().max(2000),stdout:z.string().max(5000),stderr:z.string().max(5000),stdout_truncated:z.boolean(),stderr_truncated:z.boolean()});
const artifactSchema = z.object({schema: z.literal('mlsys-assessment-v1'), family: z.enum(assessmentFamilies), case_version:z.union([z.literal(1),z.literal(2)]).default(1), execution:executionSchema.optional(), seed: z.number().int().min(1).max(2147483647), source_kind: z.enum(['reference', 'learner']), source_sha256: z.string().regex(/^[a-f0-9]{64}$/), input_provenance: z.literal('synthetic-task-inputs').optional(), hardwareExecutionVerified: z.literal(false).optional(), realDeviceGateSatisfied: z.literal(false).optional(), python: z.string().min(1).max(100), platform: z.string().min(1).max(500), tests: z.array(z.object({id: z.number().int(), args: z.array(z.unknown()).max(4), actual: outcomeSchema})).min(0).max(12)});
function invalid(): never { throw new Error('invalid input'); }
const numeric = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const integer = (x: unknown): x is number => numeric(x) && Number.isSafeInteger(x);
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value) ?? 'undefined';
}
function expected(family: AssessmentFamily, args: Args): Outcome {
  try {
    if (family === 'trace') {
      const rows = args[0]; if (!Array.isArray(rows) || !rows.length) invalid();
      const values: number[] = [], seen = new Set<number>();
      for (const row of rows) {
        if (!object(row) || typeof row.id !== 'number' || !Number.isSafeInteger(row.id) || seen.has(row.id) || typeof row.ok !== 'boolean' || !numeric(row.ms)) invalid();
        seen.add(row.id); if (row.ok) values.push(row.ms);
      }
      if (!values.length) invalid(); values.sort((a,b)=>a-b);
      return {value: {successful: values.length, errors: rows.length-values.length, p95_ms: values[Math.ceil(.95*values.length)-1]}, error: null};
    }
    if (family === 'partition') {
      const [n, workers] = args; if (!integer(n) || !integer(workers) || workers < 1 || workers > 8) invalid();
      const chunks: number[][] = []; let start = 0;
      for (let i=0; i<Math.min(n, workers); i++) { const length=Math.floor(n/workers)+(i<n%workers?1:0); chunks.push([start,start+length]); start+=length; }
      return {value: chunks, error: null};
    }
    const [candidates,slo,quality,memory]=args;
    if (!Array.isArray(candidates) || !numeric(slo) || !numeric(quality) || quality>1 || !integer(memory)) invalid();
    const seen=new Set<string>(), feasible: {name:string;p95_ms:number}[]=[];
    for (const row of candidates) {
      if (!object(row) || typeof row.name!=='string' || !row.name || seen.has(row.name) || !numeric(row.p95_ms) || !numeric(row.quality) || row.quality>1 || !integer(row.memory_bytes)) invalid();
      seen.add(row.name); if(row.p95_ms<=slo&&row.quality>=quality&&row.memory_bytes<=memory)feasible.push({name:row.name,p95_ms:row.p95_ms});
    }
    feasible.sort((a,b)=>a.p95_ms-b.p95_ms||(a.name<b.name?-1:a.name>b.name?1:0));
    return {value:feasible[0]?.name??null,error:null};
  } catch { return {value:null,error:'ValueError'}; }
}
export function assessmentCases(family: AssessmentFamily, seed: number, caseVersion: 1 | 2 = 2): Args[] {
  let value=seed; const draw=(limit:number)=>{value=(1664525*value+1013904223)%2**32;return value%limit};
  if(family==='trace') {
    const rows=Array.from({length:caseVersion===1?23:31},(_,i)=>({id:i,ok:i%7!==0,ms:3+draw(70)})); rows[caseVersion===1?21:29].ms=180+draw(200);
    return [[rows],[[{id:0,ok:true,ms:0}]],[[]],[[{id:0,ok:false,ms:5}]],[[{id:0,ok:true,ms:-1}]],[[{id:0,ok:true,ms:true}]],[[{id:1,ok:true,ms:3},{id:1,ok:false,ms:4}]]];
  }
  if(family==='partition') return [[17+draw(29),2+draw(6)],[0,4],[1,8],[7,3],[-1,2],[4,0],[true,2],[10,9]];
  const candidates=[{name:'fast-risky',p95_ms:2+draw(10),quality:.7,memory_bytes:caseVersion===1?300:128},{name:'baseline',p95_ms:30+draw(10),quality:.94,memory_bytes:200},{name:'balanced',p95_ms:15+draw(10),quality:.93,memory_bytes:160},{name:'oversized',p95_ms:10,quality:.99,memory_bytes:1000}];
  return [[candidates,45,.9,256],[candidates,1,.9,256],[[],10,.9,256],[[{name:'a',p95_ms:1,quality:.95,memory_bytes:16},{name:'b',p95_ms:1,quality:.95,memory_bytes:16}],1,.95,16],[candidates,45,1.1,256],[candidates,true,.9,256],[[{name:'broken',p95_ms:-1,quality:.95,memory_bytes:16}],10,.9,256]];
}
export function checkAssessmentArtifact(value: unknown) {
  // Validate resource bounds before recursively comparing arbitrary submitted values.
  const pending: {value: unknown; depth: number}[] = [{value, depth: 0}];
  let visited = 0;
  while (pending.length) {
    const next = pending.pop()!;
    if (++visited > 12000 || next.depth > 24) throw new Error('评测结构过深或过大，请保留有界任务的原始结果。');
    if (next.value && typeof next.value === 'object') {
      for (const child of Object.values(next.value)) pending.push({value: child, depth: next.depth + 1});
    }
  }
  const parsed=artifactSchema.safeParse(value);
  if(!parsed.success) throw new Error('评测文件字段缺失或越界，请使用 assessment.py 生成的完整结果。');
  const data=parsed.data,cases=assessmentCases(data.family,data.seed,data.case_version);
  const execution=data.execution??{status:'completed' as const,message:'',stdout:'',stderr:'',stdout_truncated:false,stderr_truncated:false};
  const provenance={input_provenance:'synthetic-task-inputs' as const,hardwareExecutionVerified:false as const,realDeviceGateSatisfied:false as const,currentCaseCoverage:data.case_version===2,execution};
  if(execution.status!=='completed'){if(data.tests.length)throw new Error('执行未完成的报告不能附带伪造通过用例。');return {...data,...provenance,tests:[],passed:false,verification:'execution-failure-reported-not-reproduced' as const};}
  if(data.tests.length!==cases.length)throw new Error('tests：缺少测试记录，不能只导入通过项。');
  const tests=data.tests.map((row,i)=>{
    if(row.id!==i||canonical(row.args)!==canonical(cases[i]))throw new Error(`tests[${i}]：输入与任务种子不一致。`);
    const oracle=expected(data.family,cases[i]);
    return {id:i,args:cases[i],actual:row.actual,expected:oracle,passed:canonical(row.actual)===canonical(oracle)};
  });
  return {...data,...provenance,tests,passed:tests.every(row=>row.passed),verification:'test-output-consistency-only' as const};
}
const text=(min:number,max=5000)=>z.string().trim().min(min).max(max);
const assistance=z.enum(['reference','guided','independent']);
export const assessmentDraftSchema=z.object({schema:z.literal('mlsys-assessment-draft-v1'),family:z.enum(assessmentFamilies).default('trace'),seed:z.string().max(12).default('104729'),raw:z.string().max(35000),assistance,diagnosis:z.string().max(5000),change:z.string().max(5000),transfer:z.string().max(5000),english:z.string().max(1000),previousId:z.string().max(100)});
export type AssessmentDraft=z.infer<typeof assessmentDraftSchema>;
export const blankAssessment=():AssessmentDraft=>({schema:'mlsys-assessment-draft-v1',family:'trace',seed:'104729',raw:'',assistance:'guided',diagnosis:'',change:'',transfer:'',english:'',previousId:''});
const attemptSchema=z.object({schema:z.literal('mlsys-attempt-v1'),artifact:z.unknown(),assistance,diagnosis:text(20),change:text(20),transfer:text(20),english:text(10,1000),previousId:z.string().regex(/^assessment:attempt:[a-z0-9-]+$/).or(z.literal(''))});
export function normalizeAttempt(value:unknown){
  const data=attemptSchema.parse(value),artifact=checkAssessmentArtifact(data.artifact);
  if(artifact.source_kind==='reference'&&data.assistance!=='reference')throw new Error('参考运行必须保留“参考实现”帮助标记，不能记为独立作业。');
  return {...data,artifact,evidenceScope:'synthetic-input-code-assessment' as const,realDeviceGateSatisfied:false as const,status:artifact.passed?'tests-consistent-awaiting-review' as const:'needs-revision' as const,competencyCertified:false as const};
}
export type AssessmentAttempt=ReturnType<typeof normalizeAttempt>;
export const rubricKeys=['correctness','reproduction','diagnosis','transfer'] as const;
const rubricItem=z.object({rating:z.enum(['needs-work','adequate','not-reviewed']),evidence:text(10,2000)});
const reviewSchema=z.object({schema:z.literal('mlsys-review-v1'),attemptId:z.string().regex(/^assessment:attempt:[a-z0-9-]+$/),reviewerRole:z.enum(['self','peer']),reviewerAlias:text(2,60),rubric:z.object({correctness:rubricItem,reproduction:rubricItem,diagnosis:rubricItem,transfer:rubricItem}),feedback:text(20),nextAction:text(20),decision:z.enum(['revise','new-variant'])});
export function normalizeReview(value:unknown){
  const data=reviewSchema.parse(value);
  if(data.decision==='new-variant'&&rubricKeys.some(key=>data.rubric[key].rating!=='adequate'))throw new Error('仍有未评阅或待改进项，请选择修订，不能跳到新变式。');
  return {...data,provenance:'owner-recorded-review' as const,evidenceScope:'synthetic-task-review' as const,realDeviceGateSatisfied:false as const,reviewerIdentityVerified:false as const,competencyCertified:false as const};
}
export type AssessmentReview=ReturnType<typeof normalizeReview>;
const draftRubric=z.object({rating:z.enum(['needs-work','adequate','not-reviewed']),evidence:z.string().max(2000)});
export const reviewDraftSchema=z.object({schema:z.literal('mlsys-review-draft-v1'),attemptId:z.string().max(100),reviewerRole:z.enum(['self','peer']),reviewerAlias:z.string().max(60),rubric:z.object({correctness:draftRubric,reproduction:draftRubric,diagnosis:draftRubric,transfer:draftRubric}),feedback:z.string().max(5000),nextAction:z.string().max(5000),decision:z.enum(['revise','new-variant'])});
export type ReviewDraft=z.infer<typeof reviewDraftSchema>;
export const blankReview=():ReviewDraft=>({schema:'mlsys-review-draft-v1',attemptId:'',reviewerRole:'self',reviewerAlias:'',rubric:{correctness:{rating:'not-reviewed',evidence:''},reproduction:{rating:'not-reviewed',evidence:''},diagnosis:{rating:'not-reviewed',evidence:''},transfer:{rating:'not-reviewed',evidence:''}},feedback:'',nextAction:'',decision:'revise'});
