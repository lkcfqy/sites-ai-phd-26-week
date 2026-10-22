import {researchManifest,type ResearchManifest} from './research-schema';

export type PredictionRow={sampleId:string;truth:string;prediction:string;truthType:string;predictionType:string};
export type CandidateRow={id:string;status:string;validationScore:string;selected:boolean};
export type ReportDraft={scope:ResearchManifest['scope'];codeSha256:string;dataSha256:string;trainIds:string;validationIds:string;trainingValues:string;predictions:PredictionRow[];candidates:CandidateRow[];limits:string};
export const blankReport=(dataSha256=''):ReportDraft=>({scope:'method-adaptation',codeSha256:'',dataSha256,trainIds:'',validationIds:'',trainingValues:'',predictions:[],candidates:[],limits:''});
const lines=(value:string)=>value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
const number=(value:string,label:string)=>{if(!value.trim()||!Number.isFinite(Number(value)))throw new Error(label+'需要有效数值。');return Number(value)};
const fieldLabels:Record<string,string>={scope:'复现范围',codeSha256:'代码校验值',dataSha256:'数据校验值',trainIds:'训练样本编号',validationIds:'验证样本编号',predictions:'测试预测',candidates:'候选方案',limits:'局限说明',trainingValues:'训练段原值',sampleId:'样本编号',truth:'真实值',prediction:'预测值',id:'方案编号',status:'状态',validationScore:'验证分数',selected:'最终选定'};
export function checkedManifest(value:unknown):ResearchManifest{
 const parsed=researchManifest.safeParse(value);
 if(!parsed.success)throw new Error(parsed.error.issues.slice(0,4).map(issue=>{const field=issue.path.map(key=>typeof key==='number'?`第${key+1}项`:fieldLabels[key]??key).join(' · ');return field+'：'+(issue.code==='too_small'?'内容或条数不足。':issue.code==='too_big'?'内容或条数超出限制。':issue.code==='invalid_string'?'格式不正确，校验值需要64位十六进制字符。':'请检查填写格式。')}).join(' '));
 return parsed.data;
}
export function reportManifest(draft:ReportDraft,metric:string):ResearchManifest{
 return checkedManifest({...draft,codeSha256:draft.codeSha256.trim().toLowerCase(),dataSha256:draft.dataSha256.trim().toLowerCase(),trainIds:lines(draft.trainIds),validationIds:lines(draft.validationIds),trainingValues:metric==='MASE'?lines(draft.trainingValues).map(value=>number(value,'训练段原值')):undefined,predictions:draft.predictions.map((row,index)=>({sampleId:row.sampleId.trim(),truth:row.truthType==='number'?number(row.truth,`测试预测第${index+1}项真实值`):row.truth,prediction:row.predictionType==='number'?number(row.prediction,`测试预测第${index+1}项预测值`):row.prediction})),candidates:draft.candidates.map((row,index)=>({id:row.id.trim(),status:row.status,validationScore:row.validationScore.trim()?number(row.validationScore,`候选方案第${index+1}项验证分数`):null,selected:row.selected}))});
}
export function manifestDraft(manifest:ResearchManifest):ReportDraft{
 return {...manifest,trainIds:manifest.trainIds.join('\n'),validationIds:manifest.validationIds.join('\n'),trainingValues:manifest.trainingValues?.join('\n')??'',predictions:manifest.predictions.map(row=>({sampleId:row.sampleId,truth:String(row.truth),prediction:String(row.prediction),truthType:typeof row.truth==='number'?'number':'text',predictionType:typeof row.prediction==='number'?'number':'text'})),candidates:manifest.candidates.map(row=>({...row,validationScore:row.validationScore===null?'':String(row.validationScore)}))};
}
export function importManifest(text:string):ReportDraft{
 const raw:unknown=JSON.parse(text),value=raw&&typeof raw==='object'&&'manifest' in raw?raw.manifest:raw;
 return manifestDraft(checkedManifest(value));
}

// RFC 4180 quoting, including commas and newlines inside a quoted cell.
export function csvRows(text:string):string[][]{
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}}else cell+=c;continue;}
  if(c==='"'){if(cell||closed)throw new Error('CSV 引号位置不正确。');quoted=true;}
  else if(c===','||c==='\n'||c==='\r'){row.push(cell);cell='';closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(v=>v.trim()))rows.push(row);row=[];}}
  else{if(closed)throw new Error('CSV 引号结束后需使用逗号或换行。');cell+=c;}
  if(rows.length>10001||row.length>10)throw new Error('CSV 行列数超出限制。');
 }
 if(quoted)throw new Error('CSV 引号未闭合。');row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
 return rows;
}
export function predictionCSV(text:string,type:'text'|'number'):PredictionRow[]{
 const rows=csvRows(text.replace(/^\uFEFF/,''));const header=rows.shift()?.map(value=>value.trim());
 if(!header||header.length!==3||!['sampleId','truth','prediction'].every(key=>header.includes(key)))throw new Error('CSV 第一行需要 sampleId,truth,prediction 三列。');
 if(!rows.length||rows.length>10000)throw new Error('预测文件需要 1–10000 行结果。');
 const result=rows.map((row,index)=>{if(row.length!==3)throw new Error(`CSV 第${index+2}行需要三列。`);const sampleId=row[header.indexOf('sampleId')].trim(),truth=row[header.indexOf('truth')],prediction=row[header.indexOf('prediction')];if(!sampleId||sampleId.length>150)throw new Error(`CSV 第${index+2}行样本编号无效。`);if(type==='number'){number(truth,`CSV 第${index+2}行真实值`);number(prediction,`CSV 第${index+2}行预测值`);}else if(!truth||!prediction||truth.length>100||prediction.length>100)throw new Error(`CSV 第${index+2}行类别需要1–100个字符。`);return {sampleId,truth,prediction,truthType:type,predictionType:type};});
 if(new Set(result.map(row=>row.sampleId)).size!==result.length)throw new Error('CSV 存在重复样本编号，请先修复。');
 return result;
}
