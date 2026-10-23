export const tensorTasks=['arrays','linear','gradient','attention'] as const;
export type TensorTask=typeof tensorTasks[number];
const groupNames=['ArraysChecks','LinearChecks','GradientChecks','AttentionChecks'];
const tests=[['fixture','copy','rank_and_empty','numeric_contract','signed_fractional'],
 ['fixture','bias_axis','rectangular_and_one','invalid','inputs_unchanged'],
 ['scalar_oracle','finite_difference','no_extra_average','invalid','inputs_unchanged'],
 ['scalar_oracle','mask_and_future','stability','cross_shapes','invalid']];
export interface TensorCheck {id:string;passed:boolean;feedback:string;purpose:string}
export interface TensorReceipt {
 schema:'mlsys-tensor-lab-v1';source:'numpy-cpu-correctness-on-synthetic-data';fixture_schema:'mlsys-tensor-cases-v1';dtype:'float64';
 task:TensorTask;variant:'practice'|'transfer';seed:number;python:string;numpy:string|null;
 status:'passed'|'needs-work'|'timed-out'|'dependency-unavailable';learner_sha256:string;fixture_sha256:string;limitations:string;diagnostic?:string;
 checks:{total:number;passed:number;failed:number;cases:TensorCheck[]};
}
function object(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value)}
function text(value:unknown,max=1000):value is string{return typeof value==='string'&&value.trim().length>0&&value.length<=max}
export function inspectTensorReceipt(raw:string):TensorReceipt {
 if(raw.length>15000)throw Error('回执超过 15000 字符；请只复制 run.py 的 JSON。');
 let r:unknown;try{r=JSON.parse(raw)}catch{throw Error('JSON 无法解析；请复制完整文件和花括号。')}
 if(!object(r)||r.schema!=='mlsys-tensor-lab-v1'||r.source!=='numpy-cpu-correctness-on-synthetic-data'||r.fixture_schema!=='mlsys-tensor-cases-v1'||r.dtype!=='float64')throw Error('需要 tensor_lab/run.py 生成的数值检查回执；不接受其他实验或 GPU 来源标签。');
 const index=tensorTasks.findIndex(task=>task===r.task);
 if(index<0||!['practice','transfer'].includes(String(r.variant))||!Number.isInteger(r.seed)||Number(r.seed)<0||Number(r.seed)>1000000||!['passed','needs-work','timed-out','dependency-unavailable'].includes(String(r.status)))throw Error('任务、变式、种子或状态字段不正确。');
 if(!text(r.python,30)||!text(r.limitations)||!['learner_sha256','fixture_sha256'].every(key=>typeof r[key]==='string'&&/^[a-f0-9]{64}$/.test(r[key] as string)))throw Error('缺少环境、限制或源码/输入指纹。');
 if(r.status==='dependency-unavailable'?r.numpy!==null:!text(r.numpy,30))throw Error('NumPy 版本与执行状态矛盾；缺依赖不能记为执行通过。');
 const checks=r.checks;
 if(!object(checks)||!Array.isArray(checks.cases)||checks.cases.length>20)throw Error('缺少逐组检查反馈。');
 const cases:TensorCheck[]=checks.cases.map(c=>{
  if(!object(c)||!text(c.id,100)||typeof c.passed!=='boolean'||!text(c.purpose)||!text(c.feedback))throw Error('逐组检查字段不完整。');
  return {id:c.id,passed:c.passed,purpose:c.purpose,feedback:c.feedback};
 });
 const passed=cases.filter(c=>c.passed).length,failed=cases.length-passed;
 if(checks.total!==cases.length||checks.passed!==passed||checks.failed!==failed)throw Error('计数与逐组反馈不一致；不要修改 passed 或分母。');
 if(cases.length){
  const expected=tests.slice(0,index+1).flatMap((names,i)=>names.map(name=>groupNames[i]+'.test_'+name));
  if(cases.length!==expected.length||new Set(cases.map(c=>c.id)).size!==cases.length||!cases.every(c=>expected.includes(c.id)))throw Error('累积检查缺组或重复；请保留原检查器重跑。');
  if(r.status!==(failed?'needs-work':'passed'))throw Error('状态与失败数量矛盾。');
 }else if(r.status==='passed'||!text(r.diagnostic))throw Error('零组执行不能通过；缺依赖、失败或超时需诊断。');
 return {schema:r.schema,source:r.source,fixture_schema:r.fixture_schema,dtype:r.dtype,task:tensorTasks[index],variant:r.variant as TensorReceipt['variant'],seed:Number(r.seed),python:r.python,numpy:r.numpy as string|null,status:r.status as TensorReceipt['status'],learner_sha256:r.learner_sha256 as string,fixture_sha256:r.fixture_sha256 as string,limitations:r.limitations,...(text(r.diagnostic)?{diagnostic:r.diagnostic}:{}),checks:{total:cases.length,passed,failed,cases}};
}
