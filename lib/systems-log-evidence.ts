/** Receipt consistency checks only. Never treats learner-supplied JSON as execution attestation. */
export type LogTask = 'mean' | 'records' | 'tail';
export interface LogCheck {id:string;passed:boolean;feedback:string;purpose:string}
export interface LogReceipt {
  schema:'mlsys-log-lab-v1';source:'local-python-checks-on-synthetic-data';
  fixture_schema:'mlsys-log-cases-v1';unit:'ms';task:LogTask;variant:'practice'|'transfer';
  status:'passed'|'needs-work'|'timed-out';python:string;learner_sha256:string;fixture_sha256:string;
  limitations:string;diagnostic?:string;checks:{total:number;passed:number;failed:number;cases:LogCheck[]};
}
const groups = {
  mean:['MeanChecks.test_hand_calculation','MeanChecks.test_count_and_zero','MeanChecks.test_fractions','MeanChecks.test_empty','MeanChecks.test_invalid_values'],
  records:['RecordChecks.test_fixture','RecordChecks.test_strict_threshold','RecordChecks.test_empty_and_no_success','RecordChecks.test_malformed_rows','RecordChecks.test_invalid_threshold'],
  tail:['TailChecks.test_fixture_tail','TailChecks.test_nearest_rank','TailChecks.test_edges_and_ties','TailChecks.test_invalid_probability','TailChecks.test_invalid_samples'],
};
function object(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value)}
function shortText(value:unknown,max=1000):value is string{return typeof value==='string'&&value.trim().length>0&&value.length<=max}
export function inspectLogReceipt(raw:string):LogReceipt {
  if(raw.length>15000)throw Error('回执超过 15000 字符，请只粘贴 run.py 生成的 JSON。');
  let r:unknown;try{r=JSON.parse(raw)}catch{throw Error('JSON 无法解析：请复制完整文件，包含开头与结尾的花括号。')}
  if(!object(r)||r.schema!=='mlsys-log-lab-v1'||r.source!=='local-python-checks-on-synthetic-data'||r.fixture_schema!=='mlsys-log-cases-v1'||r.unit!=='ms')throw Error('需要日志练习 run.py 的回执；其他实验或模拟结果格式不同。');
  if(!['mean','records','tail'].includes(String(r.task))||!['practice','transfer'].includes(String(r.variant))||!['passed','needs-work','timed-out'].includes(String(r.status)))throw Error('任务、变式或状态字段不符合本版本。');
  if(!shortText(r.python,30)||!shortText(r.limitations)||!['learner_sha256','fixture_sha256'].every(k=>typeof r[k]==='string'&&/^[a-f0-9]{64}$/.test(r[k] as string)))throw Error('缺少版本、来源限制或源码/输入指纹；请重新生成完整回执。');
  const checks=r.checks;
  if(!object(checks)||!Array.isArray(checks.cases)||checks.cases.length>15)throw Error('缺少逐组检查反馈。');
  const cases:LogCheck[]=checks.cases.map(c=>{
    if(!object(c)||!shortText(c.id,100)||typeof c.passed!=='boolean'||!shortText(c.feedback)||!shortText(c.purpose))throw Error('逐组检查的名称、布尔状态或反馈不完整。');
    return {id:c.id,passed:c.passed,feedback:c.feedback,purpose:c.purpose};
  });
  const passed=cases.filter(c=>c.passed).length,failed=cases.length-passed;
  if(checks.total!==cases.length||checks.passed!==passed||checks.failed!==failed)throw Error('汇总计数与逐组反馈不一致；不要手改 passed 或分母。');
  const task=r.task as LogTask;
  const expected=[...groups.mean,...(task!=='mean'?groups.records:[]),...(task==='tail'?groups.tail:[])];
  if(cases.length){
    if(cases.length!==expected.length||new Set(cases.map(c=>c.id)).size!==cases.length||!cases.every(c=>expected.includes(c.id)))throw Error('缺少本任务的累积检查或存在重复组；请用原 test_lab.py 重跑。');
    if(r.status!==(failed?'needs-work':'passed'))throw Error('回执状态与失败组数量矛盾。');
  }else if(r.status==='passed'||!shortText(r.diagnostic))throw Error('零组检查不能记为通过；失败或超时必须保留诊断。');
  return {schema:r.schema,source:r.source,fixture_schema:r.fixture_schema,unit:r.unit,task,
    variant:r.variant as LogReceipt['variant'],status:r.status as LogReceipt['status'],python:r.python,
    learner_sha256:r.learner_sha256 as string,fixture_sha256:r.fixture_sha256 as string,
    limitations:r.limitations,...(shortText(r.diagnostic)?{diagnostic:r.diagnostic}:{}),checks:{total:cases.length,passed,failed,cases}};
}
