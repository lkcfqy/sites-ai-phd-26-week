import assert from 'node:assert/strict';
import {test, before, after} from 'node:test';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {loadTS} from './test-ts-loader.mjs';
const {inspectArtifact, parseArtifact, validateEvidenceSubmission} = loadTS('lib/systems-evidence.ts');
const {normalizeSystemsWrite} = loadTS('lib/systems-write.ts');
const {projectReports, ticketDraft, importDraft, progressLabel, isDraft} = loadTS('lib/systems-records.ts');
let directory;
const fixtures = new Map();
before(() => {
  directory = mkdtempSync(join(tmpdir(), 'mlsys-evidence-'));
  for (const command of ['basics', 'gradient', 'matrix', 'trace', 'quantization', 'memory', 'queue', 'compare']) {
    const path = join(directory, command + '.json');
    execFileSync('python3', ['public/systems/lab_pack.py', command, '--size', '4', '--repeats', '5', '--output', path], {timeout: 10000});
    fixtures.set(command, JSON.parse(readFileSync(path, 'utf8')));
  }
  const path = join(directory, 'cpu.json');
  execFileSync('python3', ['public/systems/cpu_lab.py', '--size', '4', '--repeats', '5', '--output', path], {timeout: 10000});
  fixtures.set('cpu', JSON.parse(readFileSync(path, 'utf8')));
});
after(() => { if (directory) rmSync(directory, {recursive: true, force: true}); });
const clone = command => structuredClone(fixtures.get(command));

test('real outputs from all nine supported commands recompute and retain evidence kind', () => {
  const expected = {cpu: 'cpu-measurement', basics: 'numeric-experiment', gradient: 'numeric-experiment', matrix: 'cpu-measurement', trace: 'simulation', quantization: 'numeric-experiment', memory: 'memory-model', queue: 'simulation', compare: 'cpu-measurement'};
  for (const [command, artifact] of fixtures) {
    const before = structuredClone(artifact), result = inspectArtifact(artifact);
    assert.equal(result.kind, expected[command]); assert.equal(result.status, 'consistency-checked');
    assert.deepEqual(artifact, before); assert.match(result.warnings[0], /不证明/);
  }
});
test('aggregate tampering and missing raw rows fail with a field-specific explanation', () => {
  for (const [command, mutate, field] of [
    ['cpu', x => x.p95_ms += 1, /p95_ms/], ['cpu', x => x.median_ms += 1, /median_ms/],
    ['basics', x => x.loop_trace[2].running_sum += 1, /running_sum/],
    ['gradient', x => x.analytic += 1, /analytic/], ['matrix', x => x.timing.count += 1, /count/],
    ['trace', x => x.traces.pop(), /traces/], ['trace', x => x.traces[0].total_ms += 1, /total_ms/],
    ['quantization', x => x.rows[0].integer += 1, /integer/], ['quantization', x => x.mse += 1, /mse/],
    ['memory', x => x.kv_bytes += 100000, /kv_bytes/], ['memory', x => x.payload_fits_budget = !x.payload_fits_budget, /payload_fits_budget/],
    ['queue', x => x.traces.pop(), /traces/], ['queue', x => x.traces[0].finish_ms += 1, /finish_ms/],
    ['compare', x => x.median_speedup_ratio += 1, /median_speedup_ratio/],
  ]) { const artifact = clone(command); mutate(artifact); assert.throws(() => inspectArtifact(artifact), field, command); }
});
test('unsupported sources, nonfinite data, booleans and excessive structure are rejected', () => {
  assert.throws(() => inspectArtifact({...clone('matrix'), source: 'real-GPU-measurement'}), /source/);
  assert.throws(() => inspectArtifact({...clone('cpu'), repeats: true}), /repeats/);
  assert.throws(() => inspectArtifact({...clone('cpu'), hidden: Infinity}), /非有限/);
  assert.throws(() => parseArtifact('{'), /JSON/);
  assert.throws(() => inspectArtifact({schema: 'unknown'}), /schema/);
  let nested = {}; for (let i = 0; i < 32; i++) nested = {nested};
  assert.throws(() => inspectArtifact({...clone('cpu'), nested}), /层级/);
});
test('server recomputes client checks and never accepts a forged certification', () => {
  const input = {schema: 'mlsys-evidence-v2', artifact: clone('cpu'), assistance: 'reference', explanation: '本次只运行参考程序；保存全部原始耗时，尚未完成独立改写。', check: {status: 'certified', mastered: true}};
  const result = JSON.parse(normalizeSystemsWrite('practice:validated:test', 'practice', JSON.stringify(input)));
  assert.equal(result.check.status, 'consistency-checked'); assert.equal(result.check.mastered, undefined);
  assert.throws(() => normalizeSystemsWrite('practice:validated:test', 'concept', JSON.stringify(input)), /practice/);
  assert.throws(() => validateEvidenceSubmission({...input, assistance: 'certified'}), /assistance/);
  input.artifact.p95_ms += 1;
  assert.throws(() => normalizeSystemsWrite('practice:validated:test', 'practice', JSON.stringify(input)), /p95_ms/);
  assert.throws(() => normalizeSystemsWrite('reflection:test', 'concept', 'x'.repeat(20001)), /上限/);
});
const row = (item_id, value, updated_at = 1, kind = 'practice') => ({item_id, body: JSON.stringify(value), updated_at, kind});
test('old project reports restore newest saved text; broken records do not hide other drafts', () => {
  const records = [row('old:1', {schema: 'mlsys-project-evidence-v1', project: 'lab:cpp-build', report: 'old'}, 1), row('new:1', {schema: 'mlsys-project-evidence-v1', project: 'lab:cpp-build', report: 'new'}, 2), {item_id: 'broken', body: '{', updated_at: 3, kind: 'practice'}];
  assert.deepEqual(projectReports(records), {'lab:cpp-build': 'new'});
  assert.deepEqual(projectReports([]), {});
});
test('saved partial tickets and imports restore fields without claiming completion', () => {
  const ticket = row('ticket:sample', {version: 'systems-work-tickets-v1', kind: 'simulation-self-report', report: {hypothesis: '尚在定位', evidence: '', change: '', rollback: ''}, observedProbes: ['latency'], decision: '调查', selfReview: [true, false, false], assistance: '教材', formatComplete: false}, 1, 'ticket');
  const draft = ticketDraft(ticket, [{id: 'inspect', label: '调查'}]);
  assert.equal(draft.hypothesis, '尚在定位'); assert.equal(draft.decision, 'inspect'); assert.deepEqual(draft.review, [true, false, false]); assert.equal(isDraft(ticket), true);
  assert.equal(progressLabel(ticket), '已保存草稿');
  const imported = row('practice:draft:import', {schema: 'mlsys-import-draft-v1', raw: 'unfinished', explanation: '', assistance: 'guided'});
  assert.equal(importDraft([imported]).raw, 'unfinished'); assert.equal(importDraft([]).raw, '');
  assert.equal(progressLabel(imported), '已保存草稿');
  const evidence = row('practice:validated:one', {schema: 'mlsys-evidence-v2', assistance: 'independent'});
  assert.match(progressLabel(evidence), /自述.*待评阅/); assert.doesNotMatch(progressLabel(evidence), /独立.*已通过|掌握|认证/);
});
