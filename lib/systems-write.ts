import {validateEvidenceSubmission} from './systems-evidence';
import {assessmentDraftSchema,reviewDraftSchema,normalizeAttempt,normalizeReview} from './systems-assessment';

/** Keep ordinary notes bounded; structured imports may contain complete raw records. */
export function normalizeSystemsWrite(itemId: string, kind: string, body: string): string {
  if (itemId.startsWith('assessment:')) {
    if(kind!=='practice')throw new Error('评测与评阅需要 practice 类型');
    const data=JSON.parse(body);
    const normalized=itemId==='assessment:draft:workbench'?assessmentDraftSchema.parse(data):itemId==='assessment:draft:review'?reviewDraftSchema.parse(data):itemId.startsWith('assessment:attempt:')?normalizeAttempt(data):itemId.startsWith('assessment:review:')?normalizeReview(data):null;
    if(!normalized)throw new Error('未知评测记录类型');
    const text=JSON.stringify(normalized);if(text.length>60000)throw new Error('评测记录超过保存上限，请缩短说明并保留本地原始文件');
    return text;
  }
  if (itemId.startsWith('practice:validated:')) {
    if (kind !== 'practice') throw new Error('实验结果需要 practice 类型');
    const normalized = JSON.stringify(validateEvidenceSubmission(JSON.parse(body)));
    if (normalized.length > 60000) throw new Error('完整实验结果超过保存上限，请保留本地原文件并减小有界实验规模');
    return normalized;
  }
  if (itemId === 'practice:draft:import') {
    const data = JSON.parse(body);
    if (kind !== 'practice' || data?.schema !== 'mlsys-import-draft-v1' || typeof data.raw !== 'string' || data.raw.length > 50000 || typeof data.explanation !== 'string' || data.explanation.length > 5000 || !['reference', 'guided', 'independent'].includes(data.assistance)) throw new Error('实验草稿格式不正确');
    return JSON.stringify({schema: data.schema, raw: data.raw, explanation: data.explanation, assistance: data.assistance});
  }
  if (body.length > 20000) throw new Error('文字或旧格式记录超过保存上限');
  return body;
}
