import {z} from 'zod';
import {gradientModel, cacheModel, rooflineModel, kvModel, quantModel, fusionModel, percentile} from './systems-simulations';

/** All time and token values in this module are model inputs, never device measurements. */
export const simulationModels = ['gradient', 'cache', 'roofline', 'batch', 'kv', 'quantization', 'fusion', 'trace'] as const;
export type SimulationModel = typeof simulationModels[number];
const bounded = (min: number, max: number) => z.number().min(min).max(max);
const integer = (min: number, max: number) => bounded(min, max).int();
const queueSchema = z.strictObject({seed: integer(1, 2147483647), rate: bounded(10, 500), batch: integer(1, 32), lanes: integer(1, 16), waitMs: bounded(0, 100), policy: z.enum(['fifo', 'shortest'])});
export type QueueParameters = z.infer<typeof queueSchema>;
const parameterSchemas = {
  gradient: z.strictObject({x: bounded(-3, 3), w: bounded(-4, 4), target: bounded(-5, 5), lr: bounded(.01, .5)}),
  cache: z.strictObject({stride: integer(1, 32)}),
  roofline: z.strictObject({ai: bounded(.5, 64), bandwidth: bounded(25, 500), peak: bounded(500, 10000), lanes: integer(1, 32), items: integer(1, 128)}),
  batch: queueSchema,
  kv: z.strictObject({layers: integer(1, 80), heads: integer(1, 32), tokens: integer(1, 32768), batch: integer(1, 32), bytes: z.union([z.literal(1), z.literal(2), z.literal(4)]), capacityGiB: bounded(1, 80), weightsGiB: bounded(0, 40), workspaceGiB: bounded(0, 16), marginGiB: bounded(0, 16)}),
  quantization: z.strictObject({bits: integer(2, 8), clip: bounded(.5, 4)}),
  fusion: z.strictObject({millionElements: integer(1, 100), bandwidth: bounded(25, 1000)}),
  trace: z.strictObject({seed: integer(1, 2147483647), scenario: z.enum(['baseline', 'more-parallel', 'larger-batch', 'short-first'])}),
};
export const simulationDefaults = {
  gradient: {x: 2, w: 3, target: 4, lr: .05}, cache: {stride: 1},
  roofline: {ai: 8, bandwidth: 100, peak: 2000, lanes: 8, items: 65},
  batch: {seed: 104729, rate: 100, batch: 4, lanes: 4, waitMs: 20, policy: 'fifo'},
  kv: {layers: 32, heads: 8, tokens: 4096, batch: 4, bytes: 2, capacityGiB: 24, weightsGiB: 8, workspaceGiB: 2, marginGiB: 2},
  quantization: {bits: 4, clip: 2}, fusion: {millionElements: 10, bandwidth: 200},
  trace: {seed: 104729, scenario: 'baseline'},
} as const;
export const simulationTitles: Record<SimulationModel, string> = {
  gradient: '张量与梯度仿真', cache: '缓存访问仿真', roofline: '并行度与 Roofline 模型',
  batch: '批处理与调度仿真', kv: 'KV 与内存预算模型', quantization: '标量量化仿真',
  fusion: '算子融合流量模型', trace: '合成请求轨迹对照',
};
export const simulationTasks: Record<SimulationModel, string[]> = {
  gradient: ['先预测梯度的方向，再改变学习率；保留一次损失上升的反例。', '用新输入解释梯度为零是否等于所有样本都已学好。'],
  cache: ['比较步长 1 和 17 的完整访问记录，解释有效数据与实际搬运字节差别。', '指出预取或缓存淘汰会推翻本模型的哪些结论。'],
  roofline: ['用 65 项工作、8 个并行槽手算最后一轮空槽数，再改变槽数。', '分别只增加并行槽或带宽，解释串行开销与 Roofline 上限为何限制收益；不能将槽映射成某型号 GPU。'],
  batch: ['固定种子，比较 batch=1 与 batch=8 的 p95、吞吐和最长等待，保留全部请求。', '比较 FIFO 与短作业优先；检查长请求是否变差。再更换种子或到达率解释局限。'],
  kv: ['在固定总预算下增加上下文或并发，找出第一次超预算的整数配置。', '把 token 数改为 4097，解释页取整碎片；指出权重、工作区和安全余量不能当作 KV 可用空间。'],
  quantization: ['固定八个原值，分别增加位宽与缩小裁剪范围，保留误差反例。', '说明重建 MSE 为何不能证明真实语言任务质量不变。'],
  fusion: ['从每个数组的读写次数重算融合前后流量，再更改元素数。', '列出寄存器压力或缓存复用使理想加速失效的条件。'],
  trace: ['同一种子导出基线与一项改动；逐请求说明排队、计算和总耗时的变化。', '从总延迟重算 p95，检查是否只改善短请求；换种子复做，不能把合成 token 计数写成模型生成能力。'],
};
const commonAssumptions = [
  '全部数值由公开公式或有种子的离散事件模型生成；没有运行 CUDA、GPU、vLLM 或语言模型。',
  'ms 和 token 数是模型题设；不是设备延迟、硬件吞吐或真实 LLM 质量。',
  '可重算只证明文件符合模型，不证明模型拟合实际系统，也不证明学习者独立完成。',
];
export const simulationProvenance = {
  kind: 'simulation', generator: 'deterministic-educational-v1', hardwareMeasured: false,
  languageModelExecuted: false, realDeviceGateSatisfied: false,
} as const;
type Metric = number | string | boolean;
export type SyntheticJob = {id: number; arrival_ms: number; assumed_output_tokens: number};
export type ScheduledJob = SyntheticJob & {batch_id: number; start_ms: number; finish_ms: number; wait_ms: number; service_ms: number; latency_ms: number};

export function syntheticRequests(seed: number, rate: number): SyntheticJob[] {
  let state = seed;
  const draw = (limit: number) => {state = (1664525 * state + 1013904223) % 2 ** 32; return state % limit;};
  let arrival = 0;
  return Array.from({length: 32}, (_, id) => {
    if (id) arrival += 1000 / rate * (.5 + draw(101) / 100);
    return {id, arrival_ms: arrival, assumed_output_tokens: 8 + draw(57)};
  });
}

/** One non-preemptive server; no continuous decoding or hardware scheduler is modeled. */
export function scheduleRequests(jobs: SyntheticJob[], input: QueueParameters): ScheduledJob[] {
  const parameters = queueSchema.parse(input);
  const checked = z.array(z.strictObject({id: integer(0, 1000), arrival_ms: bounded(0, 100000), assumed_output_tokens: integer(1, 1024)})).min(1).max(64).parse(jobs);
  if (new Set(checked.map(row => row.id)).size !== checked.length) throw new Error('请求 id 重复');
  const incoming = [...checked].sort((a, b) => a.arrival_ms - b.arrival_ms || a.id - b.id);
  let cursor = 0, now = 0, batchId = 0;
  const waiting: SyntheticJob[] = [], result: ScheduledJob[] = [];
  const enqueue = () => {while (cursor < incoming.length && incoming[cursor].arrival_ms <= now) waiting.push(incoming[cursor++]);};
  while (cursor < incoming.length || waiting.length) {
    if (!waiting.length) now = Math.max(now, incoming[cursor].arrival_ms);
    enqueue();
    const deadline = Math.min(...waiting.map(row => row.arrival_ms)) + parameters.waitMs;
    while (waiting.length < parameters.batch && now < deadline) {
      const next = cursor < incoming.length ? incoming[cursor].arrival_ms : Infinity;
      now = Math.min(deadline, next);
      enqueue();
    }
    waiting.sort((a, b) => (parameters.policy === 'shortest' ? a.assumed_output_tokens - b.assumed_output_tokens : 0) || a.arrival_ms - b.arrival_ms || a.id - b.id);
    const selected = waiting.splice(0, parameters.batch);
    // Assumed padded work: 8 ms launch + 0.25 ms per longest token count per wave.
    const service = 8 + .25 * Math.max(...selected.map(row => row.assumed_output_tokens)) * Math.ceil(selected.length / parameters.lanes);
    const finish = now + service;
    for (const row of selected) result.push({...row, batch_id: batchId, start_ms: now, finish_ms: finish, wait_ms: now - row.arrival_ms, service_ms: service, latency_ms: finish - row.arrival_ms});
    now = finish; batchId++;
  }
  return result.sort((a, b) => a.id - b.id);
}

export function schedulingSummary(rows: ScheduledJob[]): Record<string, Metric> {
  const duration = Math.max(...rows.map(row => row.finish_ms)) - Math.min(...rows.map(row => row.arrival_ms));
  const latencies = rows.map(row => row.latency_ms), tokens = rows.reduce((sum, row) => sum + row.assumed_output_tokens, 0);
  return {requests: rows.length, modeled_duration_ms: duration, modeled_p50_ms: percentile(latencies, .5), modeled_p95_ms: percentile(latencies, .95), modeled_max_wait_ms: Math.max(...rows.map(row => row.wait_ms)), modeled_requests_per_s: rows.length / duration * 1000, assumed_output_tokens: tokens, modeled_tokens_per_s: tokens / duration * 1000, real_model_quality: 'not evaluated; no language model executed'};
}

export function makeSimulationArtifact(model: SimulationModel, rawParameters: unknown) {
  const parameters = parameterSchemas[model].parse(rawParameters);
  let trace: object[] = [], metrics: Record<string, Metric> = {}, assumptions: string[] = [];
  switch (model) {
    case 'gradient': {
      const p = parameterSchemas.gradient.parse(parameters), before = gradientModel(p.x, p.w, p.target), next = p.w - p.lr * before.dw, after = gradientModel(p.x, next, p.target);
      trace = [{step: 0, weight: p.w, ...before}, {step: 1, weight: next, ...after}];
      metrics = {gradient: before.dw, loss_before: before.loss, loss_after: after.loss}; assumptions = ['单样本、单参数、平方误差；不是模型训练性能。']; break;
    }
    case 'cache': {
      const p = parameterSchemas.cache.parse(parameters), result = cacheModel(p.stride);
      trace = result.trace; metrics = {hits: result.hits, misses: result.misses, transferred_bytes: result.bytes}; assumptions = ['64 次访问、4 B 元素、64 B 行；初始为空、无限容量、无预取和组冲突。']; break;
    }
    case 'roofline': {
      const p = parameterSchemas.roofline.parse(parameters), result = rooflineModel(p.ai, p.bandwidth, p.peak), waves = Math.ceil(p.items / p.lanes);
      trace = Array.from({length: p.items}, (_, i) => ({item: i, slot: i % p.lanes, wave: Math.floor(i / p.lanes), modeled_start_ms: 4 + Math.floor(i / p.lanes), modeled_finish_ms: 5 + Math.floor(i / p.lanes)}));
      metrics = {ideal_gflops_upper_bound: result.attainable, ridge_flop_per_byte: result.ridge, bound: result.bound, waves, last_wave_idle_slots: waves * p.lanes - p.items, modeled_parallel_ms: 4 + waves, modeled_serial_ms: 4 + p.items, modeled_speedup: (4 + p.items) / (4 + waves)};
      assumptions = ['Roofline 带宽/峰值是输入的理想上限。', '并行小模型另设 4 ms 串行准备、每项工作 1 ms、同速有限槽、无同步/传输开销；槽不是 CUDA warp/SM，两个模型不拼成实机预测。']; break;
    }
    case 'batch': case 'trace': {
      const p = model === 'batch' ? queueSchema.parse(parameters) : (() => {
        const p = parameterSchemas.trace.parse(parameters);
        return {...simulationDefaults.batch, seed: p.seed, lanes: p.scenario === 'more-parallel' ? 8 : 4, batch: p.scenario === 'larger-batch' ? 8 : 4, policy: p.scenario === 'short-first' ? 'shortest' as const : 'fifo' as const};
      })();
      const rows = scheduleRequests(syntheticRequests(p.seed, p.rate), p); trace = rows; metrics = schedulingSummary(rows);
      assumptions = [`LCG 种子 ${p.seed}；32 个请求，均值间隔约 1000/rate，间隔扰动 0.5–1.5 倍；假设输出长度 8–64。`, '单个非抢占执行器；服务时间=8+0.25×批内最长假设输出长度×ceil(批大小/并行槽) ms。', '到达后等待至满批或最老请求的超时；FIFO 或在已到达请求中选短作业，最后部分批次正常发车。', '无真实生成/质量、tokenizer、prefill/decode 流水、连续 batching、KV 动态释放、多 GPU 或取消；有限窗口吞吐不是稳定容量。']; break;
    }
    case 'kv': {
      const p = parameterSchemas.kv.parse(parameters), logical = kvModel(p.layers, p.heads, 128, p.tokens, p.batch, p.bytes), allocatedTokens = Math.ceil(p.tokens / 16) * 16, allocated = kvModel(p.layers, p.heads, 128, allocatedTokens, p.batch, p.bytes), available = (p.capacityGiB - p.weightsGiB - p.workspaceGiB - p.marginGiB) * 2 ** 30;
      trace = Array.from({length: p.batch}, (_, request) => ({request, logical_tokens: p.tokens, allocated_tokens: allocatedTokens, logical_bytes: logical / p.batch, allocated_bytes: allocated / p.batch}));
      metrics = {logical_kv_bytes: logical, allocated_kv_bytes: allocated, fragmentation_bytes: allocated - logical, available_kv_bytes: available, payload_fits_assumed_budget: allocated <= available, max_concurrency_in_model: Math.max(0, Math.floor(available / (allocated / p.batch)))};
      assumptions = ['等长请求；D=128，KV heads 不等于 query heads；固定 16 token 页，页面元数据和量化 scale 未包含。', '总容量扣除输入的权重、工作区和余量；这些都是题设，不查询 GPU，也不保证真实模型可以装入。']; break;
    }
    case 'quantization': {
      const p = parameterSchemas.quantization.parse(parameters), result = quantModel([-3, -1.7, -.6, -.1, .2, .8, 1.4, 2.6], p.bits, p.clip);
      trace = result.rows; metrics = {scale: result.scale, mse: result.mse}; assumptions = ['八个固定标量、对称整数范围、JavaScript Math.round；无真实模型、量化内核或任务质量。']; break;
    }
    case 'fusion': {
      const p = parameterSchemas.fusion.parse(parameters), result = fusionModel(p.millionElements * 1e6, 4, p.bandwidth);
      trace = [{variant: 'unfused', bytes: result.unfused, modeled_lower_bound_ms: result.unfusedMs}, {variant: 'fused', bytes: result.fused, modeled_lower_bound_ms: result.fusedMs}];
      metrics = {bytes_saved: result.unfused - result.fused, unfused_lower_bound_ms: result.unfusedMs, fused_lower_bound_ms: result.fusedMs}; assumptions = ['FP32、无缓存复用；只计算规定数组读写，带宽为题设；不包含启动、寄存器和占用率影响。']; break;
    }
  }
  return {schema: 'mlsys-simulation-v1' as const, source: 'deterministic-educational-simulation' as const, model, provenance: simulationProvenance, parameters, assumptions: [...commonAssumptions, ...assumptions], trace, metrics, tasks: simulationTasks[model]};
}
export type SimulationArtifact = ReturnType<typeof makeSimulationArtifact>;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => JSON.stringify(key) + ':' + canonical(value)).join(',') + '}';
  return JSON.stringify(value) ?? 'undefined';
}
export function checkSimulationArtifact(value: unknown): SimulationArtifact {
  const header = z.object({schema: z.literal('mlsys-simulation-v1'), source: z.literal('deterministic-educational-simulation'), model: z.enum(simulationModels), parameters: z.unknown()}).parse(value);
  const expected = makeSimulationArtifact(header.model, header.parameters);
  if (canonical(value) !== canonical(expected)) throw new Error('仿真来源、参数、完整轨迹或汇总与重算不一致；不能改标签冒充真实设备结果。');
  return expected;
}
