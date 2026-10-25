import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as researchSchemas from '../lib/research-schema.ts';
import {backupSchema, backupSummary} from '../lib/backup.ts';
import {researchManifest, researchProtocol} from '../lib/research-schema.ts';
import {parsePracticeFeedback} from '../lib/practice-feedback.ts';
import {connectorResponse} from '../lib/connector-errors.mts';
import {invocationSchema, driverMessageSchema, sessionOptionsSchema, grantSchema} from './connector-preview/protocol.mjs';
import {createPreviewBinding} from './connector-preview/host-binding.mjs';

const progress = {
  lesson_id: 'w01-d1', note: '保留旧笔记', score: 60, best_score: 80,
  practiced: 1, completed: 1, answers: '[0,1]', review_step: 1,
  next_review: 1700000000000, updated_at: 1700000000000,
};
const oldBackup = () => ({
  format: 'ai-phd-backup-v2',
  profile: {hours: 4, track: 'undecided', start_date: '2026-10-24', diagnostic: '{}', updated_at: 1700000000000},
  progress: [{...progress}], projects: [], checkpoints: [], attempts: [],
});

test('v2 backup keeps learning data and supplies v3 defaults without changing the input', () => {
  const input = oldBackup(), before = structuredClone(input), parsed = backupSchema.parse(input);
  assert.equal(parsed.progress[0].note, progress.note);
  assert.equal(parsed.progress[0].assistance, 'unrecorded');
  assert.equal(parsed.progress[0].practice_evidence, '');
  assert.equal(parsed.progress[0].content_version, 'v1');
  assert.deepEqual(backupSummary(parsed), {notes: 1, projects: 0, attempts: 0, checkpoints: 0, codes: 0, runs: 0, sessions: 0, tutorReviews: 0, researchVersions: 0});
  assert.deepEqual(input, before);
  const current = {...parsed, format: 'ai-phd-backup-v3', unexpected: 'not persisted'};
  assert.deepEqual(backupSchema.parse(current), {...parsed, format: 'ai-phd-backup-v3'});
});

test('backup rejects corrupt JSON, absent required fields, invalid enums and unsafe timestamps', () => {
  const corrupt = oldBackup(); corrupt.profile.diagnostic = '{';
  const result = backupSchema.safeParse(corrupt);
  assert.equal(result.success, false);
  assert.ok(result.error.issues.some(issue => issue.message === '无效JSON'));
  for (const patch of [{hours: 6}, {track: 'invented'}, {updated_at: 1.5}, {updated_at: Number.MAX_SAFE_INTEGER + 1}]) {
    const candidate = oldBackup(); Object.assign(candidate.profile, patch);
    assert.equal(backupSchema.safeParse(candidate).success, false);
  }
  const missing = oldBackup(); delete missing.profile;
  assert.equal(backupSchema.safeParse(missing).success, false);
  const oversized = oldBackup(); oversized.progress = Array.from({length: 171}, () => null);
  assert.equal(backupSchema.safeParse(oversized).success, false);
});

const protocol = () => ({
  track: 'vision', question: 'Compare two reproducible baselines.', sourceUrl: 'https://example.org/paper',
  dataSha256: 'a'.repeat(64), splitRule: 'Split by subject, before fitting.', primaryMetric: 'accuracy',
  selectionRule: 'Select only using validation data.', budgetMinutes: 60,
  testPolicy: 'Open the test set only once.', deviations: 'Record every change before running.',
});
const manifest = () => ({
  scope: 'formula-reproduction', codeSha256: 'b'.repeat(64), dataSha256: 'a'.repeat(64),
  trainIds: ['train-1'], validationIds: ['validation-1'],
  predictions: [{sampleId: 'test-1', truth: 1, prediction: 1}],
  candidates: [{id: 'baseline', status: 'completed', validationScore: 0.8, selected: true}, {id: 'failed-run', status: 'failed', validationScore: null, selected: false}],
  limits: 'This fixture checks evidence shape, not scientific validity.',
});

test('research protocol and manifest preserve valid evidence, nullable failed runs and optional values', () => {
  assert.deepEqual(researchProtocol.parse(protocol()), protocol());
  assert.deepEqual(researchManifest.parse(manifest()), manifest());
  const categorical = manifest(); categorical.predictions = [{sampleId: 'test-1', truth: 'cat', prediction: 'dog'}];
  assert.deepEqual(researchManifest.parse(categorical), categorical);
});

test('research forms reject missing hashes, invalid URLs, nonfinite values and oversized evidence', () => {
  assert.equal(researchProtocol.safeParse({...protocol(), sourceUrl: 'not a URL'}).success, false);
  assert.equal(researchManifest.safeParse({...manifest(), codeSha256: 'wrong'}).success, false);
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.equal(researchManifest.safeParse({...manifest(), trainingValues: [value]}).success, false);
  }
  assert.equal(researchManifest.safeParse({...manifest(), candidates: Array(101).fill(null)}).success, false);
});

test('history feedback keeps valid fields and tolerates corrupt or old optional fields', () => {
  const valid = {summary: '保留反馈', checks: [{label: '边界条件', passed: false, issues: ['需重试']}], taskSnapshot: {mode: 'retest', inputs: [null, {n: 2}]} };
  assert.deepEqual(parsePracticeFeedback(JSON.stringify(valid)), valid);
  assert.deepEqual(parsePracticeFeedback('{'), {});
  assert.deepEqual(parsePracticeFeedback('null'), {});
  const partial = parsePracticeFeedback(JSON.stringify({summary: '仍可阅读', checks: 'old invalid shape', hints: [{hint: 42}], unexpected: true}));
  assert.equal(partial.summary, '仍可阅读');
  assert.equal(partial.checks, undefined);
  assert.equal(partial.hints, undefined);
  assert.equal('unexpected' in partial, false);
});

test('connector maps preserve arbitrary JSON values while rejecting extra envelope fields', () => {
  const call = {connectorId: 'fixture', actionName: 'read', arguments: {query: 'x', empty: null, nested: {items: [1, true]}}};
  assert.deepEqual(invocationSchema.parse(call), call);
  assert.equal(invocationSchema.safeParse({...call, account: 'injected'}).success, false);
  assert.equal(invocationSchema.safeParse({...call, arguments: []}).success, false);
  assert.equal(invocationSchema.safeParse({connectorId: 'fixture', actionName: 'read'}).success, false);
  assert.equal(grantSchema.safeParse({connectorId: 'fixture', actionName: 'read', readOnly: false}).success, false);
});

test('connector RPC UUIDs, optional error data, defaults and numeric limits remain valid', () => {
  const id = '12345678-1234-4123-8123-123456789abc';
  const response = {jsonrpc: '2.0', id, result: {content: [], structuredContent: null}};
  assert.deepEqual(driverMessageSchema.parse(response), response);
  const error = {jsonrpc: '2.0', id, error: {code: -32600, message: 'Invalid request'}};
  assert.deepEqual(driverMessageSchema.parse(error), error);
  assert.equal(driverMessageSchema.safeParse({...response, id: 'not-a-uuid'}).success, false);
  assert.deepEqual(sessionOptionsSchema.parse({}), {timeoutMs: 120000, maxConcurrent: 64});
  assert.equal(sessionOptionsSchema.safeParse({maxCalls: Number.MAX_SAFE_INTEGER + 1}).success, false);
  assert.equal(sessionOptionsSchema.safeParse({timeoutMs: 2 ** 31}).success, false);
});

test('public connector responses keep JSON null and drop invalid optional request IDs', async () => {
  const result = {status: 'success', requestId: 'not a valid id', result: {content: [{type: 'text', text: 'ok'}], structuredContent: null}};
  const response = connectorResponse(result);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await response.json(), {status: 'success', result: result.result});
  assert.equal(connectorResponse({...result, error: 'must not be accepted'}).status, 502);
  assert.equal(connectorResponse({status: 'success', result: {structuredContent: null}}).status, 502);
  const failure = {status: 'rate_limited', message: 'Wait', retryAfterMs: 1000};
  assert.deepEqual(await connectorResponse(failure).json(), failure);
  assert.equal(connectorResponse({...failure, retryAfterMs: -1}).status, 502);
});

test('preview invocation validates both map schemas without contacting a real connector', async () => {
  let calls = 0;
  const binding = createPreviewBinding({tools: [{connectorId: 'fixture', actionName: 'read', readOnly: true, invoke: async args => {calls++; return {content: [{type: 'text', text: args.query}], structuredContent: null};}}], timeoutMs: 1000});
  const invoke = data => binding.fetch(new Request('https://fixture.invalid/invoke', {method: 'POST', body: JSON.stringify(data)})).then(response => response.json());
  try {
    const call = {connectorId: 'fixture', actionName: 'read', arguments: {query: 'ok'}};
    assert.deepEqual(await invoke(call), {status: 'success', result: {content: [{type: 'text', text: 'ok'}], structuredContent: null}});
    assert.equal((await invoke({...call, arguments: []})).status, 'invalid_request');
    assert.equal(calls, 1);
  } finally { binding.close(); }
});

// Test the real form adapter; its extensionless import is normally resolved by Vite.
const formModule = {exports: {}};
const formSource = ts.transpileModule(readFileSync(new URL('../lib/report-form.ts', import.meta.url), 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
new Function('require', 'module', 'exports', formSource)(id => {assert.equal(id, './research-schema'); return researchSchemas;}, formModule, formModule.exports);
const {checkedManifest, manifestDraft, reportManifest, importManifest} = formModule.exports;

test('research form round trips evidence and keeps actionable Chinese validation errors', () => {
  const original = manifest(), draft = manifestDraft(original);
  assert.deepEqual(importManifest(JSON.stringify({manifest: original})), draft);
  const restored = reportManifest(draft, 'accuracy');
  assert.deepEqual(restored.predictions, original.predictions);
  assert.deepEqual(restored.candidates, original.candidates);
  assert.equal(restored.trainingValues, undefined);
  assert.throws(() => checkedManifest({...original, codeSha256: 'wrong'}), /代码校验值：格式不正确，校验值需要64位十六进制字符/);
  assert.throws(() => checkedManifest({...original, predictions: []}), /测试预测：内容或条数不足/);
  assert.throws(() => checkedManifest({...original, candidates: [{...original.candidates[0], id: ''}]}), /候选方案/);
});
