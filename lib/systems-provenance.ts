import {inspectArtifact, validateEvidenceSubmission, type EvidenceKind} from './systems-evidence';
import {normalizeAttempt, normalizeReview} from './systems-assessment';

export function evidenceKindLabel(kind: EvidenceKind): string {
  return {'cpu-measurement': '提交的 CPU 实测记录', 'numeric-experiment': '数值练习', simulation: '教学仿真', 'memory-model': '解析内存模型', 'llm-measurement': '提交的 LLM 实测记录'}[kind];
}
type Row = {item_id: string; body: string; kind: string; updated_at: number};
export function recordEvidenceScope(row: Row): string {
  try {
    const data = JSON.parse(row.body);
    if (row.item_id.startsWith('assessment:attempt:')) {normalizeAttempt(data); return '合成输入的代码评测 · 不是设备测量或真实模型质量';}
    if (row.item_id.startsWith('assessment:review:')) {normalizeReview(data); return '合成任务的自评或账号记录的同伴反馈 · 不认证设备结果';}
    if (data.schema === 'mlsys-evidence-v2' && row.item_id.startsWith('practice:validated:')) return evidenceKindLabel(inspectArtifact(data.artifact).kind);
    if (data.kind === 'simulation-self-report' || row.kind === 'simulation') return '模拟情境自述 · 未独立验证';
  } catch { /* Preserve old/unstructured notes without inventing a source. */ }
  return row.kind === 'simulation' ? '教学仿真 · 未重算' : '文字或旧记录 · 来源待复核';
}
/** Canonicalize supported records again on export; retain raw legacy records with an explicit scope. */
export function buildSystemsBackup(rows: Row[], exportedAt: string) {
  return {version: 'mlsys-v1', exportedAt, provenance: 'mixed-explicit-per-record', validation: 'consistency-only', realDeviceGatesAutomaticallySatisfied: false,
    limitations: ['仿真、解析模型、合成题设和提交的实测记录不能互换。', '任何上传 JSON 都不能单独证明真实执行、作者身份或独立能力。'],
    records: rows.map(row => {
      let body = row.body;
      try {
        const data = JSON.parse(body);
        if (row.item_id.startsWith('practice:validated:')) body = JSON.stringify(validateEvidenceSubmission(data));
        else if (row.item_id.startsWith('assessment:attempt:')) body = JSON.stringify(normalizeAttempt(data));
        else if (row.item_id.startsWith('assessment:review:')) body = JSON.stringify(normalizeReview(data));
      } catch { /* Never rewrite or discard an incompatible old record. */ }
      const normalized = {...row, body};
      return {...normalized, evidenceScope: recordEvidenceScope(normalized), realDeviceGateSatisfied: false};
    })};
}
