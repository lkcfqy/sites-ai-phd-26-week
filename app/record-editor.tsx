'use client';
import {useState} from 'react';

export type Column={key:string;label:string;type?:'text'|'number'|'select'|'checkbox';options?:{value:string;label:string}[]};
export default function RecordEditor({label,columns,rows,onChange,emptyRow,maxRows=10000,pageSize=10}:{label:string;columns:Column[];rows:Record<string,string|boolean>[];onChange:(rows:Record<string,string|boolean>[])=>void;emptyRow:Record<string,string|boolean>;maxRows?:number;pageSize?:number}){
 const [page,setPage]=useState(0),last=Math.max(0,Math.ceil(rows.length/pageSize)-1),current=Math.min(page,last),start=current*pageSize;
 function update(index:number,key:string,value:string|boolean){onChange(rows.map((row,i)=>i===index?{...row,[key]:value}:row));}
 return <fieldset className="record-editor"><legend>{label} · {rows.length} 项</legend>
  {rows.slice(start,start+pageSize).map((row,offset)=>{const index=start+offset;return <div className="record-row" key={index}><div className="section-title"><strong>第 {index+1} 项</strong><button type="button" className="text-button" onClick={()=>onChange(rows.filter((_,i)=>i!==index))} aria-label={'删除'+label+'第'+(index+1)+'项'}>删除</button></div><div className="form-grid">{columns.map(column=><label className="evidence-field" key={column.key}>{column.label}{column.type==='checkbox'?<input aria-label={column.label} type="checkbox" checked={row[column.key]===true} onChange={e=>update(index,column.key,e.target.checked)}/>:column.type==='select'?<select aria-label={column.label} value={String(row[column.key]??'')} onChange={e=>update(index,column.key,e.target.value)}>{column.options?.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}</select>:<input aria-label={column.label} type={column.type==='number'?'number':'text'} step={column.type==='number'?'any':undefined} value={String(row[column.key]??'')} onChange={e=>update(index,column.key,e.target.value)}/>}</label>)}</div></div>})}
  {!rows.length&&<p className="muted">尚未填写，点击下方添加。</p>}
  <div className="row-actions"><button type="button" className="secondary compact" disabled={rows.length>=maxRows} onClick={()=>{onChange([...rows,{...emptyRow}]);setPage(Math.floor(rows.length/pageSize))}}>添加{label}</button>{last>0&&<><button type="button" className="text-button" disabled={current===0} onClick={()=>setPage(current-1)}>上一页</button><span>第 {current+1} / {last+1} 页</span><button type="button" className="text-button" disabled={current===last} onClick={()=>setPage(current+1)}>下一页</button></>}</div>
 </fieldset>;
}
