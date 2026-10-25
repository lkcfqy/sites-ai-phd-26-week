import {recordEvidenceScope} from './systems-provenance';
export type SystemsRecord = {item_id: string; body: string; kind: string; updated_at: number};
export type TicketDraft = {hypothesis: string; evidence: string; change: string; rollback: string; review: boolean[]; probes: string[]; decision: string; assistance: string};
export const blankTicket = (): TicketDraft => ({hypothesis: '', evidence: '', change: '', rollback: '', review: [false, false, false], probes: [], decision: '', assistance: '尚未说明'});
export type ImportDraft = {raw: string; explanation: string; assistance: 'reference' | 'guided' | 'independent'};
export const blankImport = (): ImportDraft => ({raw: '', explanation: '', assistance: 'reference'});
export function recordJSON(row: SystemsRecord): Record<string, unknown> | null {
  try { const data: unknown = JSON.parse(row.body); return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : null; } catch { return null; }
}
export function isDraft(row: SystemsRecord) {
  if (row.item_id.startsWith('assessment:draft:')) return true;
  if (row.item_id.startsWith('practice:draft:') || row.item_id.startsWith('practice:engineering-draft:')) return true;
  const data = recordJSON(row);
  return data?.kind === 'simulation-self-report' && data.formatComplete === false;
}
export function projectReports(rows: SystemsRecord[]): Record<string, string> {
  const reports: Record<string, string> = {};
  for (const row of [...rows].sort((a, b) => a.updated_at - b.updated_at)) {
    const data = recordJSON(row);
    if (data?.schema === 'mlsys-project-evidence-v1' && typeof data.project === 'string' && /^(lab|graduation):[a-z0-9-]+$/.test(data.project) && typeof data.report === 'string') reports[data.project] = data.report;
  }
  return reports;
}
export function importDraft(rows: SystemsRecord[]): ImportDraft {
  const row = rows.find(r => r.item_id === 'practice:draft:import');
  const data = row && recordJSON(row);
  if (data?.schema !== 'mlsys-import-draft-v1' || typeof data.raw !== 'string' || typeof data.explanation !== 'string' || !['reference', 'guided', 'independent'].includes(String(data.assistance))) return blankImport();
  return {raw: data.raw, explanation: data.explanation, assistance: data.assistance as ImportDraft['assistance']};
}
export function ticketDraft(row: SystemsRecord | undefined, decisions: {id: string; label: string}[]): TicketDraft {
  if (!row) return blankTicket();
  const data = recordJSON(row), report = data?.report;
  if (data?.version !== 'systems-work-tickets-v1' || !report || typeof report !== 'object' || Array.isArray(report)) return blankTicket();
  const r = report as Record<string, unknown>, draft = blankTicket();
  for (const key of ['hypothesis', 'evidence', 'change', 'rollback'] as const) if (typeof r[key] === 'string') draft[key] = r[key];
  draft.probes = Array.isArray(data.observedProbes) ? data.observedProbes.filter((v): v is string => typeof v === 'string') : [];
  draft.review = Array.isArray(data.selfReview) && data.selfReview.length === 3 ? data.selfReview.map(v => v === true) : draft.review;
  draft.assistance = typeof data.assistance === 'string' ? data.assistance : draft.assistance;
  draft.decision = decisions.find(d => d.label === data.decision)?.id ?? '';
  return draft;
}
export function progressLabel(row: SystemsRecord): string {
  if (isDraft(row)) return '已保存草稿';
  if (row.kind === 'reading') return '标记已读';
  const data = recordJSON(row);
  if (row.item_id.startsWith('assessment:attempt:') && data?.schema==='mlsys-attempt-v1') return data.assistance==='reference'?'合成题设参考评测 · 不能计为个人成绩':data.status==='needs-revision'?'合成题设变式尝试 · 有失败，待修订':'合成题设变式尝试 · 测试输出一致，待评阅';
  if (row.item_id.startsWith('assessment:review:') && data?.schema==='mlsys-review-v1') return data.reviewerRole==='self'?'已记录自评':'已记录同伴反馈 · 身份未核实';
  if (data?.schema === 'mlsys-evidence-v2' && row.item_id.startsWith('practice:validated:')) return recordEvidenceScope(row)+' · '+(data.assistance === 'reference' ? '参考实现 · 内部一致性通过' : data.assistance === 'guided' ? '引导练习 · 内部一致性通过' : '独立尝试自述 · 内部一致性通过，待评阅');
  if (data?.kind === 'simulation-self-report') return '模拟工单 · 已提交自述';
  return '已提交 · 尚无独立评阅';
}
