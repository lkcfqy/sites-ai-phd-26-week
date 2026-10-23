'use client';
import {useEffect,useState} from 'react';
import fixture from '@/public/systems/log_lab/cases.json';
import {inspectLogReceipt,type LogReceipt} from '@/lib/systems-log-evidence';

const handoffFields=[
  ['problem','触发问题与失败检查','哪条输入暴露了什么错误？记录预期与实际。'],
  ['change','根因与代码改动','解释错误的分母、边界或控制流，以及最小修复。'],
  ['verification','复测命令与新增测试','保留修改前后回执，写出命令和自己新增的输入。'],
  ['limits','结论限制与下一步','哪些检查还失败？样本/过滤规则有什么限制？下一步如何反证？'],
] as const;
type Handoff=Record<typeof handoffFields[number][0],string>;
const blank:Handoff={problem:'',change:'',verification:'',limits:''};
const lessonLinks='s0-l1～l3 → s1-l1～l5 → s2-l3 → s5-l3';

function Prediction({label,expected,explain}:{label:string;expected:number;explain:string}){
  const [value,setValue]=useState(''),[shown,setShown]=useState(false);
  const correct=value.trim()!==''&&Number.isFinite(Number(value))&&Math.abs(Number(value)-expected)<1e-8;
  return <form className="sys-notice" onSubmit={e=>{e.preventDefault();setShown(true)}}>
    <label>{label}<input type="number" step="any" required value={value} onChange={e=>{setValue(e.target.value);setShown(false)}}/></label>
    <button type="submit">核对这一步</button>
    {shown&&<p role="status">{correct?'这一步与约定一致。':'还没吻合，请回看中间状态。'} {explain} 这里只反馈例题推导，不计为独立能力通过。</p>}
  </form>;
}

export default function LogWorkshop({onEvidence,onDirtyChange}:{onEvidence:(id:string,text:string)=>Promise<boolean>;onDirtyChange:(dirty:boolean)=>void}){
  const [step,setStep]=useState(0),[processed,setProcessed]=useState(0);
  const [raw,setRaw]=useState(''),[handoff,setHandoff]=useState<Handoff>(blank);
  const [saved,setSaved]=useState(JSON.stringify({raw:'',handoff:blank}));
  const [receipt,setReceipt]=useState<LogReceipt|null>(null),[message,setMessage]=useState(''),[invalid,setInvalid]=useState(false),[saving,setSaving]=useState(false);
  const snapshot=JSON.stringify({raw,handoff}),dirty=snapshot!==saved;
  useEffect(()=>{onDirtyChange(dirty);return()=>onDirtyChange(false)},[dirty,onDirtyChange]);
  useEffect(()=>{const guard=(event:BeforeUnloadEvent)=>{if(dirty||saving){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard)},[dirty,saving]);
  const values=fixture.mean_values,total=values.slice(0,processed).reduce((sum,n)=>sum+n,0);
  const sorted=fixture.records.filter(row=>row.status==='ok'&&typeof row.latency_ms==='number'&&row.latency_ms>=0).map(row=>row.latency_ms as number).sort((a,b)=>a-b);
  const rank=Math.ceil(.95*sorted.length);
  function inspect(){try{setReceipt(inspectLogReceipt(raw));setInvalid(false);setMessage('回执结构与计数一致。请查看逐组反馈并完成交接；这不是远程执行验证。')}catch(error){setReceipt(null);setInvalid(true);setMessage(error instanceof Error?error.message:'回执无法检查')}}
  async function save(){
    let parsed:LogReceipt;
    try{
      parsed=inspectLogReceipt(raw);
      if(handoffFields.some(([key])=>!handoff[key].trim()))throw Error('请填完四项交接，包括失败或未验证项；只有 passed 不足以交接。');
    }catch(error){setInvalid(true);setMessage(error instanceof Error?error.message:'请检查回执和交接');return}
    setSaving(true);setInvalid(false);setReceipt(parsed);
    const body=JSON.stringify({schema:'mlsys-log-handoff-v1',validation:'format-and-internal-consistency-only',independence:'not-verified',receipt:parsed,handoff});
    try{
      if(body.length>20000)throw Error('交接总长度超过存储上限，请精简说明后再保存。');
      const ok=await onEvidence('log-workshop:'+parsed.task+':'+Date.now(),body);
      if(ok){setSaved(snapshot);setMessage('已保存本次排障交接（自报证据）。失败也可记录，未授予掌握或岗位认证。')}
      else setMessage('云端未确认保存，草稿仍在。请查看页面上方错误，导出后比较或重试。');
    }catch(error){setInvalid(true);setMessage(error instanceof Error?error.message:'保存未确认，请保留草稿。')}
    finally{setSaving(false)}
  }
  function exportDraft(){const url=URL.createObjectURL(new Blob([snapshot],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='mlsys-log-handoff-draft.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  return <section className="sys-card sys-log-workshop" aria-labelledby="log-workshop-title">
    <span className="sys-kicker">第一张代码排障工单 / Python 标准库</span>
    <h2 id="log-workshop-title" tabIndex={-1}>日志排障工作台：自己写、看反馈、再交接</h2>
    <p>先修：会保存文件、打开终端、识别报错。按 {lessonLinks} 逐步使用。先在这里预测中间状态，再修改离线包的 <code>learner.py</code>；不要一次实现全部任务。</p>
    <p className="sys-notice">所有请求数据均为教学合成。网页只演示确定性计算，本地包执行你写的 Python 检查，不测 GPU 或请求性能。公开测试通过不证明独立完成。</p>
    <div className="sys-row"><a href="/systems/log_lab/log_lab.zip" download>下载日志排障练习包（含待完成代码）</a><a href="/systems/log_lab/README.md" download>下载逐步中文指南</a></div>
    <nav className="sys-row" aria-label="日志练习步骤">{['1 累加与平均数','2 记录与过滤规则','3 排序与 p95'].map((name,index)=><button type="button" key={name} aria-pressed={step===index} onClick={()=>setStep(index)}>{name}</button>)}</nav>
    <div className="sys-log-step">
      {step===0&&<>
        <h3>一次循环只处理一个值</h3>
        <p>输入来自包内 <code>cases.json → mean_values</code>：[12, 18, 30] ms。<code>total += value</code> 是旧总和加当前值；返回平均数时，分母用实际个数。对应工作文件：<code>learner.mean_ms</code>。</p>
        <div className="sys-row"><button disabled={processed===values.length} onClick={()=>setProcessed(n=>n+1)}>执行下一次循环</button><button onClick={()=>setProcessed(0)}>从 total = 0 重来</button></div>
        <p role="status" aria-live="polite">已处理 {processed}/{values.length} 个值；total = {total} ms；{processed===values.length?`循环结束，平均数 = ${total} / ${processed} = ${total/processed} ms。`:`下一项：${values[processed]} ms。循环尚未结束。`}</p>
        <div className="sys-log-bars" aria-label="输入耗时条形图">{values.map((value,index)=><div key={index}><span>第 {index+1} 项：{value} ms · {index<processed?'已累加':'待处理'}</span><div style={{width:`${value/30*100}%`}}/></div>)}</div>
        <Prediction label="换成 [8,15,22]，平均数是多少 ms？" expected={15} explain="总和是 45，实际个数 3，所以 45 / 3 = 15 ms。再用不同长度的列表检查固定分母错误。"/>
        <pre>python3 run.py mean --output mean-before.json{'\n'}# 第一次应提示 NotImplementedError；修改 learner.py 后换新文件名{'\n'}python3 run.py mean --output mean-after.json</pre>
        <p>0 ms 仍是有效值；空列表没有平均数。不要用“删除 0”或“空时返回 0”让结果看起来更好。Windows 可将 python3 换成 py -3，目录与语法操作见包内指南。</p>
      </>}
      {step===1&&<>
        <h3>先写清分母，再写过滤代码</h3>
        <p>对应 <code>cases.json → records</code> 与 <code>learner.summarize</code>。合法行需有 ok/error 状态及非负、有限的数字耗时。失败请求仍进合法请求分母；非法日志单列。这里只对成功请求算延迟，必须同时报告失败率和过滤规则。</p>
        <div className="sys-scroll" tabIndex={0} role="region" aria-label="可横向滚动的日志与过滤说明"><table><caption>10 行原始输入：7 合法，3 非法；其中 6 成功、1 失败</caption><thead><tr><th scope="col">行 ID</th><th scope="col">原始状态</th><th scope="col">latency_ms</th><th scope="col">计数理由</th></tr></thead><tbody>{fixture.records.map(row=>{
          const valid=typeof row.latency_ms==='number'&&row.latency_ms>=0;
          return <tr key={row.id}><th scope="row">{row.id}</th><td>{row.status}</td><td>{JSON.stringify(row.latency_ms)??'字段缺失'}</td><td>{!valid?'非法：缺值、类型错误或负数':row.status==='error'?'合法失败：计入失败率，不计成功延迟':'合法成功：0 与恰等 100 均保留'}</td></tr>;
        })}</tbody></table></div>
        <p>失败率 = 1 / 7，约 14.29%；成功延迟均值 = 261 / 6 = 43.5 ms。<code>&quot;20&quot;</code> 是文字，不能默默转换；Python 的 True 也必须单独拒绝。没有合法行时失败率不适用，没有成功行时均值不适用。</p>
        <Prediction label="严格超过 100 ms 的成功请求有几个？" expected={1} explain="只有 g=101；d 是失败请求，f=100 恰等阈值，均不计入此项。"/>
        <pre>python3 run.py records --output records-after.json{'\n'}python3 run.py records --variant transfer --output records-transfer.json</pre>
        <p>records 会连同平均数检查一起重跑。若改动破坏旧行为，应先修回归；不要删检查。</p>
      </>}
      {step===2&&<>
        <h3>排序名次从 1 开始，Python 下标从 0 开始</h3>
        <p>成功耗时排序：{JSON.stringify(sorted)} ms。p95 最近秩 = ceil(0.95 × {sorted.length}) = 第 {rank} 名；下标 {rank-1}。对应 <code>learner.nearest_rank</code>。下面用编号展示秩，不用颜色传达唯一信息。</p>
        <ol className="sys-log-ranks">{sorted.map((value,index)=><li key={index} className={index===rank-1?'sys-log-selected':''}>第 {index+1} 名 / 下标 {index}<strong>{value} ms{index===rank-1?' ← p95':''}</strong></li>)}</ol>
        <Prediction label="换成 1～20 ms 共 20 个值，p95 是多少 ms？" expected={19} explain="ceil(0.95 × 20) = 19，取第 19 名，即 19 ms。不能因为六样本例子而总取最大值。"/>
        <pre>python3 run.py tail --output tail-after.json{'\n'}python3 run.py tail --variant transfer --output tail-transfer.json</pre>
        <p>tail 会重跑前三项，共 15 组公开检查。六个成功样本不足以估计生产长尾；最近秩与库的默认插值可能不同。不要相加各阶段 p95，也不要丢掉慢请求来“达标”。</p>
      </>}
    </div>
    <h3>保留失败，完成一次岗位交接</h3>
    <p>先保存修改前回执，再补修改后与变式。也可提交 needs-work 或 timed-out，写清未解决项。只粘贴本练习的合成数据回执。</p>
    {dirty&&<p className="sys-pill" role="status">当前草稿有未保存修改</p>}
    <label htmlFor="log-receipt">粘贴 run.py 生成的完整 JSON 回执</label>
    <textarea id="log-receipt" value={raw} maxLength={15000} onChange={e=>{setRaw(e.target.value);setReceipt(null);setMessage('');setInvalid(false)}} placeholder="从 mean-before.json 或后续新回执复制"/>
    <button onClick={inspect}>检查日志回执与逐组反馈</button>
    {receipt&&<div className="sys-notice"><p>{receipt.task} / {receipt.variant} · {receipt.status} · {receipt.checks.passed}/{receipt.checks.total} 组符合约定（回执自报）。</p>{receipt.diagnostic&&<p>{receipt.diagnostic}</p>}<ul>{receipt.checks.cases.map(check=><li key={check.id}><strong>{check.passed?'符合约定':'需修复'} · {check.id}</strong><p>{check.purpose} {check.feedback}</p></li>)}</ul></div>}
    {handoffFields.map(([key,label,placeholder])=><div key={key}><label htmlFor={'log-'+key}>{label}</label><textarea id={'log-'+key} maxLength={600} value={handoff[key]} onChange={e=>setHandoff(current=>({...current,[key]:e.target.value}))} placeholder={placeholder}/></div>)}
    <div className="sys-row"><button className="sys-primary" disabled={saving} onClick={()=>void save()}>{saving?'正在保存排障交接…':'保存日志排障交接（自报证据）'}</button><button onClick={exportDraft}>导出日志交接草稿</button></div>
    {message&&<p role={invalid?'alert':'status'}>{message}</p>}
    <p className="sys-small sys-muted">回执哈希用于关联版本；网页未核验它对应的源码，也不证明运行者身份或独立性。切换模块保留当前草稿，离开页面前请保存或导出。新增本地测试、自己的代码与 diff 另行保留，s1-l5 仍须自己交付日志 CLI。</p>
  </section>;
}
