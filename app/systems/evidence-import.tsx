'use client';
import {evidenceKindLabel} from '@/lib/systems-provenance';
import {useDraftConfirm} from './draft-confirm';
import {useEffect, useMemo, useState} from 'react';
import {parseArtifact, validateEvidenceSubmission, type EvidenceCheck} from '@/lib/systems-evidence';
import {importDraft, type ImportDraft, type SystemsRecord} from '@/lib/systems-records';

export default function EvidenceImport({records, onEvidence, onDirtyChange}: {
  records: SystemsRecord[]; onEvidence: (id: string, body: string) => Promise<boolean>; onDirtyChange?: (dirty: boolean) => void;
}) {
  const confirm=useDraftConfirm();
  const remote = useMemo(() => importDraft(records), [records]);
  const [local, setLocal] = useState<ImportDraft | null>(null), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [checked, setChecked] = useState<{raw: string; result: EvidenceCheck} | null>(null);
  const draft = local ?? remote, dirty = JSON.stringify(draft) !== JSON.stringify(remote);
  const check = checked?.raw === draft.raw ? checked.result : null;
  useEffect(() => { onDirtyChange?.(dirty || busy); return () => onDirtyChange?.(false); }, [dirty, busy, onDirtyChange]);
  useEffect(() => { const guard = (event: BeforeUnloadEvent) => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, [dirty, busy]);
  function update(patch: Partial<ImportDraft>) { setLocal({...draft, ...patch}); setNotice(''); }
  async function saveDraft() {
    if (busy) return; setBusy(true);
    try { const ok = await onEvidence('draft:import', JSON.stringify({schema: 'mlsys-import-draft-v1', ...draft})); setNotice(ok ? '草稿已保存到当前账号，刷新后可以继续。草稿不计入练习通过。' : '草稿未保存，当前输入仍保留。'); }
    finally { setBusy(false); }
  }
  async function inspect(save: boolean) {
    if (busy) return;
    try {
      const parsed = parseArtifact(draft.raw); setChecked({raw: draft.raw, result: parsed.check});
      if (!save) { setNotice('指标已重算。补充自己的观察和所用帮助后，可保存完整实验记录。'); return; }
      const submission = validateEvidenceSubmission({schema: 'mlsys-evidence-v2', artifact: parsed.artifact, assistance: draft.assistance, explanation: draft.explanation});
      setBusy(true);
      const ok = await onEvidence('validated:' + crypto.randomUUID(), JSON.stringify(submission));
      if (ok) {
        const saved = await onEvidence('draft:import', JSON.stringify({schema: 'mlsys-import-draft-v1', ...draft}));
        setNotice(saved ? '实验记录与当前草稿已保存。状态为内部一致性检查通过，独立完成情况仍需评阅。' : '实验记录已保存；当前草稿保存失败，请导出后重试。');
      } else setNotice('服务端未确认保存，当前输入仍保留。');
    } catch (error) { setChecked(null); setNotice(error instanceof Error ? error.message : '检查失败，原始输入已保留。'); }
    finally { setBusy(false); }
  }
  function exportDraft() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({schema: 'mlsys-import-draft-v1', ...draft}, null, 2)], {type: 'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = 'experiment-draft.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="sys-card sys-prose" aria-labelledby="import-title">
    <span className="sys-kicker">实验结果与继续练习</span><h3 id="import-title">导入原始结果，先检查，再解释</h3>
    <p>支持八个浏览器模型导出的仿真 JSON，以及起步 CPU、八实验包、模型 v2、PyTorch CPU 参考、HTTP 服务 v2 和经检查器转换的 vLLM 完整结果。vLLM 格式支持不代表本课程已实际运行 vLLM。保存的是完整原始记录与重算结果；计时、模拟和容量估算分别显示。</p>
    <label htmlFor="result-file">从本地选择 JSON 文件</label><input id="result-file" type="file" accept=".json,application/json" disabled={busy} onChange={async event => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 100000) { setNotice('文件超过 100000 字节，请保留原文件并选择有界实验结果。'); return; } try { update({raw: await file.text()}); } catch { setNotice('无法读取文件，请粘贴 JSON。'); } event.target.value = ''; }}/>
    <label htmlFor="result-json">完整 JSON 原始结果</label><textarea id="result-json" value={draft.raw} onChange={event => update({raw: event.target.value})} maxLength={50000} placeholder="粘贴脚本生成的完整 JSON，不要手改指标。"/>
    <label htmlFor="result-assistance">这次使用了哪些帮助？</label><select id="result-assistance" value={draft.assistance} onChange={event => update({assistance: event.target.value as ImportDraft['assistance']})}><option value="reference">运行课程参考实现</option><option value="guided">跟随提示或他人帮助完成</option><option value="independent">独立尝试（仍需评阅）</option></select>
    <label htmlFor="result-explanation">解释观察与限制</label><textarea id="result-explanation" maxLength={5000} value={draft.explanation} onChange={event => update({explanation: event.target.value})} placeholder="写你改变了什么、原始指标支持什么、什么条件会推翻结论，以及尚未验证什么。"/>
    <div className="sys-row"><button disabled={busy || !draft.raw.trim()} onClick={() => void inspect(false)}>重算并检查</button><button disabled={busy || !draft.raw.trim()} onClick={() => void inspect(true)}>检查并保存实验记录</button><button disabled={busy || !dirty} onClick={() => void saveDraft()}>保存草稿，稍后继续</button><button onClick={exportDraft}>导出当前草稿</button></div>
    {dirty && records.some(row=>row.item_id==='practice:draft:import') && <details><summary>比较云端已存草稿</summary><pre>{remote.raw}</pre><p>{remote.explanation}</p><button disabled={busy} onClick={async() => { if (await confirm('用上方云端草稿替换当前输入？未保存内容可先导出。')) { setLocal(null); setNotice('已恢复上方云端草稿。'); } }}>采用云端草稿</button></details>}
    {check && <div className="sys-notice"><h4>{evidenceKindLabel(check.kind)} · {check.title} · 内部一致性通过</h4><p>来源范围不会因保存或评阅改变；仿真不能成为实机记录，任何 JSON 都不自动满足真实设备能力门槛。</p><dl>{Object.entries(check.metrics).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl><ul>{check.warnings.map(text => <li key={text}>{text}</li>)}</ul></div>}
    <p role="status" aria-live="polite">{notice}</p>
  </section>;
}
