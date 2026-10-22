import type {EvidenceField,EvidenceTask,JSONValue} from './autonomous-types';
import type {EvidenceRule} from './evidence-check';

export function evidenceFields(task:EvidenceTask):EvidenceField[]{
 return task.fields.map(field=>{
  const rules=(task.rules as EvidenceRule[]).filter(rule=>rule.field===field.key);
  return {...field,itemKeys:rules.find(r=>r.type==='itemKeys')?.keys??(field.key==='runRefs'?['runId','artifactPath','codeSha256']:undefined),minItems:rules.find(r=>r.type==='minItems')?.min,choices:rules.find(r=>r.type==='enum')?.values as string[]|undefined,suggestions:rules.find(r=>r.type==='containsValues')?.values as string[]|undefined,optional:field.key==='runRefs'};
 });
}

export function evidenceValues(fields:EvidenceField[],draft:Record<string,string>):Record<string,JSONValue>{
 const values:Record<string,JSONValue>={};
 for(const field of fields){
  const value=draft[field.key]??'';
  if(field.type==='number'){
   if(!value.trim()||!Number.isFinite(Number(value)))throw new Error('请填写“'+field.label+'”的有效数值。');
   values[field.key]=Number(value);
  }else if(field.type==='list'){
   try{const list:unknown=JSON.parse(value||'[]');if(!Array.isArray(list))throw new Error();values[field.key]=list as JSONValue[];}
   catch{throw new Error('“'+field.label+'”的旧列表草稿格式不正确，请修复后再提交。');}
  }else values[field.key]=value;
 }
 return values;
}
