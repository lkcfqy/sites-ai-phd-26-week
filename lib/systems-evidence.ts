import {checkSimulationArtifact, simulationTitles} from './systems-simulation-evidence';

/** Recompute submitted artifacts. This establishes consistency, never authorship. */
export type EvidenceKind = 'cpu-measurement' | 'numeric-experiment' | 'simulation' | 'memory-model' | 'llm-measurement';
export type EvidenceCheck = {
  schema: 'mlsys-check-v2'; status: 'consistency-checked'; kind: EvidenceKind;
  title: string; metrics: Record<string, number | string | boolean>; warnings: string[];
  provenance: {basis: 'simulation' | 'numerical-model' | 'submitted-measurement'; hardwareExecutionVerified: false; realDeviceGateSatisfied: false};
};
export type EvidenceSubmission = {
  schema: 'mlsys-evidence-v2'; artifact: unknown; assistance: 'reference' | 'guided' | 'independent';
  explanation: string; check: EvidenceCheck;
};
type ObjectValue = Record<string, unknown>;
function fail(path: string, message: string): never { throw new Error(`${path}：${message}`); }
function object(value: unknown, path: string): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(path, '需要 JSON 对象');
  return value as ObjectValue;
}
function list(value: unknown, path: string, min = 1, max = 1000): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) return fail(path, `需要 ${min}–${max} 条原始记录`);
  return value;
}
function number(value: unknown, path: string, min = -1e15, max = 1e15): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return fail(path, '需要范围内的有限数值');
  return value;
}
function integer(value: unknown, path: string, min: number, max: number): number {
  const n = number(value, path, min, max);
  if (!Number.isSafeInteger(n)) return fail(path, '需要安全整数');
  return n;
}
function equal(actual: unknown, expected: unknown, path: string) {
  if (actual !== expected) fail(path, `与原始记录不一致，重算应为 ${String(expected)}`);
}
function close(actual: unknown, expected: number, path: string, tolerance = 1e-6) {
  const n = number(actual, path);
  if (!Number.isFinite(expected) || Math.abs(n - expected) > tolerance * Math.max(1, Math.abs(expected))) fail(path, `与重算值 ${expected} 不一致`);
}
export function percentile(values: number[], p: number): number {
  if (!values.length || p <= 0 || p > 1) return fail('percentile', '需要非空样本与有效分位数');
  return [...values].sort((a, b) => a - b)[Math.ceil(p * values.length) - 1];
}
function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function linearPercentile(values: number[], p: number) {
  const sorted=[...values].sort((a,b)=>a-b), index=(sorted.length-1)*p, lower=Math.floor(index);
  return sorted[lower]+(sorted[Math.min(lower+1,sorted.length-1)]-sorted[lower])*(index-lower);
}
function rawTiming(value:unknown,path:string) {
  const data=object(value,path),values=samples(data.raw_latency_ms,path+'.raw_latency_ms',1);
  equal(data.n,values.length,path+'.n');close(data.median_ms,median(values),path+'.median_ms');close(data.p95_ms,percentile(values,.95),path+'.p95_ms');
  return values;
}
function samples(value: unknown, path: string, min = 5, max = 1000) {
  return list(value, path, min, max).map((v, i) => number(v, `${path}[${i}]`, 0, 86400000));
}
function timing(value: unknown, path: string) {
  const data = object(value, path), values = samples(data.samples_ms, `${path}.samples_ms`);
  equal(data.count, values.length, `${path}.count`);
  close(data.median_ms, median(values), `${path}.median_ms`);
  close(data.p95_ms, percentile(values, .95), `${path}.p95_ms`);
  return {count: values.length, median_ms: median(values), p95_ms: percentile(values, .95)};
}
function environment(data: ObjectValue) {
  for (const key of ['python', 'platform']) if (typeof data[key] !== 'string' || !data[key] || String(data[key]).length > 500) fail(key, '缺少运行环境记录');
}
function pyRound(value: number) {
  const floor = Math.floor(value), remainder = value - floor;
  return remainder === .5 ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(value);
}
const boundary = '校验只证明提交文件内部一致，不证明实际运行、独立完成或岗位能力。';

function jsonBudget(value: unknown) {
  const pending = [{value, depth: 0}]; let visited = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    if (++visited > 20000 || entry.depth > 30) fail('artifact', '结果层级或字段数量超过有界导入限制');
    if (typeof entry.value === 'number' && !Number.isFinite(entry.value)) fail('artifact', '包含非有限数值');
    if (entry.value && typeof entry.value === 'object') for (const child of Object.values(entry.value)) pending.push({value: child, depth: entry.depth + 1});
  }
}

export function inspectArtifact(value: unknown): EvidenceCheck {
  jsonBudget(value);
  const data = object(value, 'artifact');
  const warnings = [boundary];
  const result = (kind: EvidenceKind, title: string, metrics: EvidenceCheck['metrics']): EvidenceCheck => ({schema: 'mlsys-check-v2', status: 'consistency-checked', kind, title, metrics, warnings, provenance: {basis: kind==='simulation'?'simulation':['numeric-experiment','memory-model'].includes(kind)?'numerical-model':'submitted-measurement', hardwareExecutionVerified:false, realDeviceGateSatisfied:false}});
  if(data.schema==='mlsys-simulation-v1') {
    const artifact=checkSimulationArtifact(value);
    warnings.push(...artifact.assumptions, '仿真不得满足真实 GPU/vLLM 设备证据门槛；评阅只能评估模型推理与代码。');
    return result('simulation',simulationTitles[artifact.model],artifact.metrics);
  }
  if(data.schema==='framework-cpu-v1') {
    equal(data.source,'actual-local-PyTorch-CPU','source');equal(data.source_kind,'reference','source_kind');equal(data.device,'cpu','device');equal(data.dtype,'float64','dtype');environment(data);
    if(typeof data.torch!=='string'||!data.torch)fail('torch','缺少框架版本');
    const model=object(data.weights,'weights'),weights=list(model.weights,'weights.weights',8,8).map(v=>number(v,'weight')),bias=number(model.bias,'bias');
    const infer=(features:unknown,path:string)=>{const x=list(features,path,8,8).map(v=>number(v,path,-1,1));return {x,score:weights.reduce((sum,w,i)=>sum+w*x[i],bias)}};
    const training=object(data.train,'train');equal(training.seed,41,'train.seed');equal(training.samples,256,'train.samples');equal(training.steps,180,'train.steps');close(training.learning_rate,.5,'learning_rate');samples(training.losses,'train.losses',180,180);number(training.seconds,'train.seconds',0);number(data.export_roundtrip_ms,'export_roundtrip_ms',0);
    equal(data.warmup,5,'warmup');equal(data.repeats,31,'repeats');const batches=[1,7,31,64];
    for(const[i,value]of list(data.shapes,'shapes',4,4).entries()){
      const row=object(value,`shapes[${i}]`),batch=batches[i];equal(row.batch,batch,'batch');
      const inputs=list(row.features,'features',batch,batch),reference=list(row.reference_logits,'reference_logits',batch,batch),output=list(row.export_logits,'export_logits',batch,batch);
      inputs.forEach((x,j)=>{const {score}=infer(x,'features');close(reference[j],score,`shapes[${i}].reference_logits[${j}]`);close(output[j],score,`shapes[${i}].export_logits[${j}]`)});
      equal(rawTiming(row.timing,`shapes[${i}].timing`).length,31,'repeats');
    }
    let correct=0,negative=0;
    for(const[i,value]of list(data.holdout,'holdout',64,64).entries()){
      const row=object(value,`holdout[${i}]`),{x,score}=infer(row.features,'holdout.features'),label=1.7*x[0]-1.2*x[1]+.8*x[2]+.3*x[3]>0?1:0;
      equal(row.label,label,`holdout[${i}].label`);close(row.logit,score,`holdout[${i}].logit`);correct+=Number(Number(score>=0)===label);negative+=Number(Number(-score>=0)===label);
    }
    close(data.accuracy,correct/64,'accuracy');close(data.negative_control_accuracy,negative/64,'negative_control_accuracy');
    warnings.push('参考实现：已重算合成分类质量、导出输出和原始计时；训练过程、框架执行及导出制品需独立复跑核验。不是学习者成绩、CUDA 或 ONNX 验证。');
    return result('cpu-measurement','PyTorch CPU 训练与导出参考',{holdout_count:64,accuracy:correct/64,negative_control_accuracy:negative/64,shape_count:4,repeats_each:31});
  }
  if(data.schema==='model-project-v2') {
    equal(data.provenance,'actual-local-CPU-measurement','provenance');environment(data);
    integer(data.batch,'batch',1,64);equal(data.warmup,10,'warmup');const repeats=integer(data.repeats,'repeats',20,1000);
    const timings=object(data.results,'results');for(const key of ['float_python','int8_python'])equal(rawTiming(timings[key],'results.'+key).length,repeats,'repeats');
    const model=object(data.weights,'weights');equal(model.features,8,'weights.features');equal(model.train_seed,41,'weights.train_seed');
    const weights=list(model.weights,'weights.weights',8,8).map((v,i)=>number(v,`weights[${i}]`)),bias=number(model.bias,'bias'),weightScale=Math.max(...weights.map(Math.abs))/127||1;
    const quantized=weights.map(v=>Math.max(-127,Math.min(127,pyRound(v/weightScale))));
    let correctFloat=0,correctInt=0,maxDifference=0;
    const rows=list(data.holdout,'holdout',64,64);
    for(const [i,value] of rows.entries()){
      const row=object(value,`holdout[${i}]`),x=list(row.features,'features',8,8).map((v,j)=>number(v,`holdout[${i}].features[${j}]`,-1,1));
      const label=1.7*x[0]-1.2*x[1]+.8*x[2]+.3*x[3]>0?1:0;equal(row.label,label,`holdout[${i}].label`);
      const float=weights.reduce((sum,w,j)=>sum+w*x[j],bias),scale=Math.max(...x.map(Math.abs))/127||1;
      const reduced=quantized.reduce((sum,w,j)=>sum+w*Math.max(-127,Math.min(127,pyRound(x[j]/scale))),0)*weightScale*scale+bias;
      close(row.float_logit,float,`holdout[${i}].float_logit`);close(row.int8_logit,reduced,`holdout[${i}].int8_logit`);
      correctFloat+=Number(Number(float>=0)===label);correctInt+=Number(Number(reduced>=0)===label);maxDifference=Math.max(maxDifference,Math.abs(float-reduced));
    }
    const quality=object(data.quality,'quality');close(quality.float_accuracy,correctFloat/64,'quality.float_accuracy');close(quality.int8_accuracy,correctInt/64,'quality.int8_accuracy');close(quality.max_logit_difference,maxDifference,'quality.max_logit_difference');
    warnings.push('已重算 64 条合成留出样本的模型输出与准确率；不能外推到生产数据或 LLM 质量。计时真实性与训练过程仍需复跑。');
    return result('cpu-measurement','CPU 小模型质量与推理计时',{holdout_count:64,float_accuracy:correctFloat/64,int8_accuracy:correctInt/64,max_logit_difference:maxDifference,repeats});
  }
  if(data.schema==='model-service-v2') {
    equal(data.provenance,'actual-loopback-HTTP-measurement','provenance');const count=integer(data.planned_requests,'planned_requests',20,300),duration=number(data.elapsed_s,'elapsed_s',1e-12),batch=integer(data.batch,'batch',1,64);
    integer(data.concurrency,'concurrency',1,4);equal(data.warmup_requests,5,'warmup_requests');list(data.warmup,'warmup',5,5);
    const expected=list(data.reference_logits,'reference_logits',batch,batch).map((v,i)=>number(v,`reference_logits[${i}]`));
    const rows=list(data.requests,'requests',count,count),latencies:number[]=[];
    for(const [i,value] of rows.entries()){
      const row=object(value,`requests[${i}]`);equal(row.id,i,`requests[${i}].id`);const latency=number(row.e2e_ms,'e2e_ms',0,duration*1000+1);
      if(typeof row.ok!=='boolean')fail(`requests[${i}].ok`,'需要成功/失败标记');
      if(row.ok){number(row.compute_ms,'compute_ms',0,latency+1);integer(row.server_peak_rss_bytes,'server_peak_rss_bytes',1,2**50);const logits=list(row.logits,`requests[${i}].logits`,batch,batch).map((v,j)=>number(v,`logits[${j}]`));
        for(let j=0;j<batch;j++)if(Math.abs(logits[j]-expected[j])>.1)fail(`requests[${i}].logits[${j}]`,'超过预定误差门槛，不能算成功请求');
        latencies.push(latency);
      }else if(typeof row.error!=='string'||!row.error)fail(`requests[${i}].error`,'失败必须保留错误类别');
    }
    equal(data.errors,count-latencies.length,'errors');close(data.successful_requests_per_s,latencies.length/duration,'successful_requests_per_s');
    if(latencies.length){const timed=rawTiming(data.latency,'latency');equal(timed.length,latencies.length,'latency.n');timed.forEach((v,i)=>close(v,latencies[i],`latency.raw_latency_ms[${i}]`))}else equal(data.latency,null,'latency');
    warnings.push('成功请求已按参考输出的固定误差门槛检查；参考输出与真实执行仍需复跑。闭环回环 HTTP 不代表生产网络或真实到达率。');
    return result('cpu-measurement','本地 HTTP 模型服务',{planned:count,successful:latencies.length,errors:count-latencies.length,requests_per_s:latencies.length/duration,p95_ms:latencies.length?percentile(latencies,.95):'无成功请求'});
  }
  if(data.schema==='mlsys-llm-v2') {
    equal(data.source,'submitted-vllm-detailed-artifact','source');const count=integer(data.expected_requests,'expected_requests',16,128),duration=number(data.duration_s,'duration_s',1e-12),rows=list(data.requests,'requests',count,count);
    const ttft:number[]=[],tpot:number[]=[],itl:number[]=[],e2el:number[]=[];let completed=0,input=0,output=0;
    for(const [i,value]of rows.entries()){
      const row=object(value,`requests[${i}]`);equal(row.id,i,`requests[${i}].id`);if(typeof row.ok!=='boolean'||typeof row.error!=='string'||row.error.length>2000)fail(`requests[${i}]`,'缺少明确状态/错误记录');
      equal(row.ok,row.error==='','ok/error');const tokensIn=integer(row.input_tokens,'input_tokens',0,10000000),tokensOut=integer(row.output_tokens,'output_tokens',0,10000000),first=number(row.ttft_s,'ttft_s',0,duration),latency=number(row.latency_s,'latency_s',first-1e-8,duration+1e-6);
      const intervals=list(row.itl_s,'itl_s',0,4096).map(v=>number(v,'itl_s',0,duration));if(intervals.reduce((a,b)=>a+b,0)>latency+1e-6)fail('itl_s','总间隔超过请求耗时');
      if(row.ok){completed++;input+=tokensIn;output+=tokensOut;ttft.push(first);e2el.push(latency);itl.push(...intervals);if(tokensOut>1)tpot.push((latency-first)/(tokensOut-1))}else equal(tokensOut,0,'failed output_tokens');
    }
    const metrics=object(data.metrics,'metrics'),core={completed,failed:count-completed,total_input_tokens:input,total_output_tokens:output,request_throughput:completed/duration,output_throughput:output/duration,total_token_throughput:(input+output)/duration};
    for(const [key,value] of Object.entries(core))close(metrics[key],value,'metrics.'+key);
    for(const [name,raw]of Object.entries({ttft,tpot,itl,e2el})){const values=raw.length?raw:[0],mean=values.reduce((a,b)=>a+b,0)/values.length,std=Math.sqrt(values.reduce((sum,v)=>sum+(v-mean)**2,0)/values.length);for(const[key,value]of Object.entries({mean,median:median(values),std,p95:linearPercentile(values,.95),p99:linearPercentile(values,.99)}))close(metrics[`${key}_${name}_ms`],value*1000,`metrics.${key}_${name}_ms`);}
    warnings.push('基于完整逐请求记录重算 token 总量、吞吐、TTFT/TPOT/ITL；未验证 tokenizer、硬件、真实执行、任务质量或显存。失败请求不被丢弃。');
    return result('llm-measurement','提交的 vLLM 逐请求记录',{...core,mean_ttft_ms:ttft.length?ttft.reduce((a,b)=>a+b,0)/ttft.length*1000:0,mean_tpot_ms:tpot.length?tpot.reduce((a,b)=>a+b,0)/tpot.length*1000:0});
  }
  if (data.schema === 'mlsys-local-v1') {
    equal(data.source, 'real-local-CPU-measurement', 'source'); environment(data);
    integer(data.size, 'size', 2, 96); equal(data.tests_passed, 5, 'tests_passed'); equal(data.warmup, 1, 'warmup');
    const values = samples(data.latency_ms, 'latency_ms', 5, 100);
    equal(data.repeats, values.length, 'repeats'); close(data.median_ms, median(values), 'median_ms'); close(data.p95_ms, percentile(values, .95), 'p95_ms');
    const gradient = object(data.gradient, 'gradient'); close(gradient.analytic, -3.6, 'gradient.analytic'); close(gradient.finite_difference, -3.6, 'gradient.finite_difference');
    number(data.quantization_max_error, 'quantization_max_error', 0, 1 / 254 + 1e-10); number(data.checksum, 'checksum');
    warnings.push('测试通过数是脚本声明；文件不含完整矩阵，不能重新验证矩阵输出。有限样本不证明稳定生产尾延迟。');
    return result('cpu-measurement', '起步 CPU 矩阵实验', {count: values.length, median_ms: median(values), p95_ms: percentile(values, .95)});
  }
  if (data.schema === 'mlsys-lab-pack-v1') {
    environment(data);
    const command = data.command;
    if (command === 'basics') {
      equal(data.source, 'deterministic-computation', 'source'); equal(data.tests_passed, 3, 'tests_passed');
      const input = list(data.input, 'input', 1, 100).map((v, i) => number(v, `input[${i}]`));
      const rows = list(data.loop_trace, 'loop_trace', input.length, input.length), squares = list(data.squares, 'squares', input.length, input.length);
      let sum = 0;
      input.forEach((v, i) => { const row = object(rows[i], `loop_trace[${i}]`); sum += v; equal(row.index, i, `loop_trace[${i}].index`); close(row.value, v, `loop_trace[${i}].value`); close(row.running_sum, sum, `loop_trace[${i}].running_sum`); close(squares[i], v * v, `squares[${i}]`); });
      close(data.mean, sum / input.length, 'mean');
      return result('numeric-experiment', '变量、循环与断言', {count: input.length, sum, mean: sum / input.length});
    }
    if (command === 'gradient') {
      equal(data.source, 'deterministic-computation', 'source'); equal(data.tests_passed, 3, 'tests_passed');
      const x = number(data.x, 'x'), w = number(data.weight, 'weight'), target = number(data.target, 'target'), epsilon = number(data.epsilon, 'epsilon', 1e-7, .01);
      const loss = (weight: number) => (weight * x - target) ** 2, derivative = 2 * (w * x - target) * x;
      close(data.analytic, derivative, 'analytic'); close(data.finite_difference, (loss(w + epsilon) - loss(w - epsilon)) / (2 * epsilon), 'finite_difference');
      close(data.loss_before, loss(w), 'loss_before'); close(data.loss_after_one_step, loss(w - .05 * derivative), 'loss_after_one_step');
      for (const [i, raw] of list(data.epsilon_sweep, 'epsilon_sweep', 4, 4).entries()) { const row = object(raw, `epsilon_sweep[${i}]`), h = number(row.epsilon, 'epsilon', 1e-10, .1), estimate = (loss(w + h) - loss(w - h)) / (2 * h); close(row.finite_difference, estimate, `epsilon_sweep[${i}].finite_difference`); close(row.absolute_error, Math.abs(estimate - derivative), `epsilon_sweep[${i}].absolute_error`); }
      return result('numeric-experiment', '梯度与有限差分', {analytic: derivative, loss_before: loss(w), loss_after: loss(w - .05 * derivative)});
    }
    if (command === 'matrix' || command === 'compare') {
      equal(data.source, 'real-local-CPU-measurement', 'source'); integer(data.size, 'size', 2, 64);
      warnings.push('原始计时可重算；输入矩阵与输出未包含在文件中，正确性测试数仍是提交者声明。');
      if (command === 'matrix') { equal(data.tests_passed, 6, 'tests_passed'); equal(data.warmup, 1, 'warmup'); number(data.checksum, 'checksum'); return result('cpu-measurement', '矩阵 CPU 计时', timing(data.timing, 'timing')); }
      equal(data.tests_passed, 7, 'tests_passed'); const baseline = timing(data.baseline, 'baseline'), candidate = timing(data.candidate, 'candidate');
      equal(baseline.count, candidate.count, 'paired count'); if (baseline.median_ms <= 0 || candidate.median_ms <= 0) fail('median', '速度比要求正的计时');
      number(data.maximum_absolute_difference, 'maximum_absolute_difference', 0, 1e-10);
      const speedup = baseline.median_ms / candidate.median_ms;
      close(data.median_speedup_ratio, speedup, 'median_speedup_ratio'); close(data.median_time_reduction_fraction, 1 - 1 / speedup, 'median_time_reduction_fraction'); equal(data.candidate_faster_in_this_run, candidate.median_ms < baseline.median_ms, 'candidate_faster_in_this_run');
      return result('cpu-measurement', '两种矩阵实现对照', {count_each: baseline.count, baseline_median_ms: baseline.median_ms, candidate_median_ms: candidate.median_ms, speedup});
    }
    if (command === 'trace') {
      equal(data.source, 'synthetic-trace-statistics', 'source'); equal(data.tests_passed, 2, 'tests_passed');
      const rows = list(data.traces, 'traces', 20, 20).map((raw, i) => { const r = object(raw, `traces[${i}]`); equal(r.id, i + 1, `traces[${i}].id`); const queue = number(r.queue_ms, 'queue_ms', 0), compute = number(r.compute_ms, 'compute_ms', 0), post = number(r.post_ms, 'post_ms', 0); close(r.total_ms, queue + compute + post, `traces[${i}].total_ms`); return {queue, compute, post, total: queue + compute + post}; });
      const values = rows.map(r => r.total), p95 = percentile(values, .95);
      close(data.p50_ms, percentile(values, .5), 'p50_ms'); close(data.p95_ms, p95, 'p95_ms'); close(data.maximum_ms, Math.max(...values), 'maximum_ms');
      close(data.sum_of_component_p95_ms, percentile(rows.map(r => r.queue), .95) + percentile(rows.map(r => r.compute), .95) + percentile(rows.map(r => r.post), .95), 'sum_of_component_p95_ms');
      return result('simulation', '合成逐请求日志分析', {requests: rows.length, p50_ms: percentile(values, .5), p95_ms: p95});
    }
    if (command === 'quantization') {
      equal(data.source, 'deterministic-computation', 'source'); equal(data.tests_passed, 3, 'tests_passed'); equal(data.rounding, 'Python round: ties to even', 'rounding');
      const bits = integer(data.bits, 'bits', 2, 8), clip = number(data.clip, 'clip', .1, 10), qmax = 2 ** (bits - 1) - 1, scale = clip / qmax;
      close(data.scale, scale, 'scale');
      const errors = list(data.rows, 'rows', 1, 1000).map((raw, i) => { const row = object(raw, `rows[${i}]`), original = number(row.original, 'original'), q = Math.max(-qmax, Math.min(qmax, pyRound(original / scale))), restored = q * scale; equal(row.integer, q, `rows[${i}].integer`); close(row.restored, restored, `rows[${i}].restored`); close(row.error, restored - original, `rows[${i}].error`); equal(row.clipped, Math.abs(original) > clip, `rows[${i}].clipped`); return (restored - original) ** 2; });
      const mse = errors.reduce((a, b) => a + b, 0) / errors.length; close(data.mse, mse, 'mse');
      warnings.push('标量重建误差不能替代模型任务质量。'); return result('numeric-experiment', '量化数值实验', {bits, scale, mse});
    }
    if (command === 'memory') {
      equal(data.source, 'analytical-memory-budget-not-measurement', 'source'); equal(data.tests_passed, 2, 'tests_passed');
      const model = object(data.model, 'model');
      const bytes = 2 * integer(model.layers, 'layers', 1, 1000) * integer(model.kv_heads, 'kv_heads', 1, 1024) * integer(model.head_dim, 'head_dim', 1, 4096) * integer(model.element_bytes, 'element_bytes', 1, 8) * integer(data.tokens, 'tokens', 1, 65536) * integer(data.batch, 'batch', 1, 24);
      const budget = number(data.capacity_GiB, 'capacity_GiB', 0) - number(data.weights_GiB, 'weights_GiB', 0) - number(data.workspace_GiB, 'workspace_GiB', 0) - number(data.margin_GiB, 'margin_GiB', 0);
      close(data.kv_bytes, bytes, 'kv_bytes'); close(data.kv_GiB, bytes / 2 ** 30, 'kv_GiB'); close(data.available_KV_GiB, budget, 'available_KV_GiB'); equal(data.payload_fits_budget, bytes / 2 ** 30 <= budget, 'payload_fits_budget');
      warnings.push('这是容量估算，未查询显卡，也不证明真实模型可装入显存。'); return result('memory-model', 'KV 容量预算', {kv_GiB: bytes / 2 ** 30, available_KV_GiB: budget, fits: bytes / 2 ** 30 <= budget});
    }
    if (command === 'queue') {
      equal(data.source, 'discrete-event-simulation-not-measurement', 'source'); equal(data.tests_passed, 3, 'tests_passed');
      const rate = number(data.rate_requests_per_s, 'rate', 1, 1000), batch = integer(data.batch, 'batch', 1, 24), rows = list(data.traces, 'traces', 120, 120), latencies: number[] = [];
      let finish = 0, lastWait = 0;
      for (let offset = 0; offset < rows.length; offset += batch) {
        const length = Math.min(batch, rows.length - offset), start = Math.max((offset + length - 1) * 1000 / rate, finish); finish = start + 8 + 2 * length;
        for (let j = 0; j < length; j++) { const i = offset + j, row = object(rows[i], `traces[${i}]`), arrival = i * 1000 / rate; equal(row.id, i, `traces[${i}].id`); close(row.arrival_ms, arrival, `traces[${i}].arrival_ms`); close(row.start_ms, start, `traces[${i}].start_ms`); close(row.finish_ms, finish, `traces[${i}].finish_ms`); close(row.wait_ms, start - arrival, `traces[${i}].wait_ms`); close(row.latency_ms, finish - arrival, `traces[${i}].latency_ms`); latencies.push(finish - arrival); lastWait = start - arrival; }
      }
      const capacity = 1000 * batch / (8 + 2 * batch), p95 = percentile(latencies, .95);
      close(data.service_ms_per_batch, 8 + 2 * batch, 'service_ms_per_batch'); close(data.theoretical_capacity_requests_per_s, capacity, 'theoretical_capacity_requests_per_s'); equal(data.positive_capacity_margin, rate < capacity, 'positive_capacity_margin'); close(data.finite_run_p95_ms, p95, 'finite_run_p95_ms'); close(data.last_wait_ms, lastWait, 'last_wait_ms');
      return result('simulation', '批处理离散事件模拟', {requests: rows.length, p95_ms: p95, capacity_requests_per_s: capacity, positive_margin: rate < capacity});
    }
    return fail('command', '尚不支持这个实验包命令');
  }
  return fail('schema', '未识别的实验格式；请保留原始文件，不能改 schema 冒充受支持实验');
}

export function parseArtifact(text: string): {artifact: unknown; check: EvidenceCheck} {
  if (text.length > 100000) fail('file', '结果超过 100000 字符，请保留原文件并选择有界实验');
  let artifact: unknown;
  try { artifact = JSON.parse(text); } catch { return fail('JSON', '格式不正确，请使用脚本生成的完整结果'); }
  return {artifact, check: inspectArtifact(artifact)};
}

/** Recompute server-side; never trust a submitted check, certification or status. */
export function validateEvidenceSubmission(value: unknown): EvidenceSubmission {
  const data = object(value, 'submission'); equal(data.schema, 'mlsys-evidence-v2', 'schema');
  if (!['reference', 'guided', 'independent'].includes(String(data.assistance))) fail('assistance', '请说明参考实现、引导完成或独立尝试');
  if(object(data.artifact,'artifact').source_kind==='reference'&&data.assistance!=='reference')fail('assistance','明确标记的参考实现不能保存为学习者独立成绩');
  if (typeof data.explanation !== 'string' || data.explanation.trim().length < 20 || data.explanation.length > 5000) fail('explanation', '请用 20–5000 字记录观察、失败条件和所用帮助');
  return {schema: 'mlsys-evidence-v2', artifact: data.artifact, assistance: data.assistance as EvidenceSubmission['assistance'], explanation: data.explanation, check: inspectArtifact(data.artifact)};
}
