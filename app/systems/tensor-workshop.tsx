'use client';
import {useEffect,useState} from 'react';
import {tensorExample,tensorFixture} from '@/lib/systems-tensor-model';
import {inspectTensorReceipt,type TensorReceipt,tensorTasks} from '@/lib/systems-tensor-evidence';

const titles=['1 数组与轴','2 线性层与广播','3 梯度与有限差分','4 Attention 与 mask'];
const format=(value:number)=>Object.is(value,-0)?'0':Number(value.toFixed(6)).toString();
const fields=[['problem','失败输入与预期'],['change','根因与最小改动'],['verification','复测命令与自己的新测试'],['limits','未验证项与下一步']] as const;
type Handoff=Record<typeof fields[number][0],string>;
const blank:Handoff={problem:'',change:'',verification:'',limits:''};

function Matrix({caption,rows}:{caption:string;rows:number[][]}){
 return <div className="sys-scroll" tabIndex={0} role="region" aria-label={caption+'，可横向滚动'}><table className="sys-tensor-table"><caption>{caption}</caption><thead><tr><th scope="col">行 / 列</th>{rows[0].map((_,j)=><th scope="col" key={j}>{j}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}><th scope="row">{i}</th>{row.map((value,j)=><td key={j}>{format(value)}</td>)}</tr>)}</tbody></table></div>;
}
function Predict({question,expected,reason}:{question:string;expected:number;reason:string}){
 const [answer,setAnswer]=useState(''),[shown,setShown]=useState(false);
 const correct=answer.trim()!==''&&Number.isFinite(Number(answer))&&Math.abs(Number(answer)-expected)<1e-6;
 return <form className="sys-notice" onSubmit={event=>{event.preventDefault();setShown(true)}}>
  <label>{question}<input type="number" step="any" required value={answer} onChange={event=>{setAnswer(event.target.value);setShown(false)}}/></label>
  <button>核对张量推导</button>{shown&&<p role="status">{correct?'本步推导一致。':'尚未吻合，请核对轴与中间值。'} {reason} 例题反馈不作为独立掌握证明。</p>}
 </form>;
}

export default function TensorWorkshop({onEvidence,onDirtyChange}:{onEvidence:(id:string,text:string)=>Promise<boolean>;onDirtyChange:(dirty:boolean)=>void}){
 const [step,setStep]=useState(0),[token,setToken]=useState(0),[outputFeature,setOutputFeature]=useState(0),[causal,setCausal]=useState(true),[future,setFuture]=useState(1),[query,setQuery]=useState(0);
 const [raw,setRaw]=useState(''),[handoff,setHandoff]=useState<Handoff>(blank),[receipt,setReceipt]=useState<TensorReceipt|null>(null),[message,setMessage]=useState(''),[invalid,setInvalid]=useState(false),[saving,setSaving]=useState(false);
 const [saved,setSaved]=useState(JSON.stringify({raw:'',handoff:blank}));
 const snapshot=JSON.stringify({raw,handoff}),dirty=snapshot!==saved;
 useEffect(()=>{onDirtyChange(dirty);return()=>onDirtyChange(false)},[dirty,onDirtyChange]);
 useEffect(()=>{const guard=(event:BeforeUnloadEvent)=>{if(dirty||saving){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard)},[dirty,saving]);
 const model=tensorExample(causal,future),task=tensorTasks[step];
 function inspect(){try{setReceipt(inspectTensorReceipt(raw));setInvalid(false);setMessage('格式与计数一致。请核对逐组反馈、种子与交接；未远程执行或核实源码指纹。')}catch(error){setReceipt(null);setInvalid(true);setMessage(error instanceof Error?error.message:'回执无法检查')}}
 async function save(){
  let parsed:TensorReceipt;
  try{parsed=inspectTensorReceipt(raw);if(fields.some(([key])=>!handoff[key].trim()))throw Error('请填完四项张量练习交接，包含失败和未验证项。')}
  catch(error){setInvalid(true);setMessage(error instanceof Error?error.message:'请检查输入');return}
  const body=JSON.stringify({schema:'mlsys-tensor-handoff-v1',validation:'format-and-internal-consistency-only',independence:'not-verified',receipt:parsed,handoff});
  if(body.length>20000){setInvalid(true);setMessage('交接超过 20000 字符，请精简后保存。');return}
  setSaving(true);setInvalid(false);setReceipt(parsed);
  try{if(await onEvidence('tensor-workshop:'+parsed.task+':'+Date.now(),body)){setSaved(snapshot);setMessage('已保存张量练习交接（自报证据）；失败也可记录，未认证独立掌握。')}else setMessage('云端未确认张量交接保存，草稿仍在。请查看上方错误并导出后重试。')}
  catch{setMessage('保存未确认，请保留并导出张量草稿。')}
  finally{setSaving(false)}
 }
 function exportDraft(){const url=URL.createObjectURL(new Blob([snapshot],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='mlsys-tensor-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 return <section className="sys-card sys-tensor-workshop" aria-labelledby="tensor-workshop-title">
  <span className="sys-kicker">一条连续 CPU 小项目 / NumPy 2.3.5</span>
  <h2 id="tensor-workshop-title" tabIndex={-1}>从数组到 Attention：把形状、数值与代码接起来</h2>
  <p>先会保存/运行 Python、循环、函数返回值与列表。按 s1-l3 → s2-l1/l2 → s3-l1/l3 逐步完成。每一步用同一份 <code>cases.json</code> 预测，再修改离线 <code>learner.py</code>；不用一次做完。</p>
  <p className="sys-notice">网页是合成数值演示；下载包在自己的独立环境做 NumPy CPU 正确性检查。没有训练或 GPU 性能测量，NumPy 不自动求导；后向梯度由你手工实现。参考代码与公开变式通过不能证明独立掌握。</p>
  <div className="sys-row"><a href="/systems/tensor_lab/tensor_lab.zip" download>下载数组到 Attention 项目（待完成代码）</a><a href="/systems/tensor_lab/README.md" download>下载完整中文步骤与排错指南</a></div>
  <details><summary>第一次运行：独立 Python 环境与诚实的失败</summary><p>先解压到新目录，进入该目录。以下 macOS/Linux 命令只安装固定 NumPy；Windows 路径替换见包内指南，不用修改执行策略。</p><pre>python3 -m venv .venv{'\n'}.venv/bin/python -m pip install -r requirements.txt{'\n'}.venv/bin/python run.py arrays --output arrays-before.json</pre><p>初始 0/5、needs-work、NotImplementedError 是待完成代码的预期反馈。缺 NumPy 时零组执行、dependency-unavailable；不能记为通过。只修改 learner.py，输出用新名字保留失败；8 秒超时防止误写死循环。</p></details>
  <nav className="sys-row" aria-label="数组到 Attention 步骤">{titles.map((title,index)=><button key={title} aria-pressed={step===index} onClick={()=>setStep(index)}>{title}</button>)}</nav>
  <div className="sys-log-step">
   {step===0&&<>
    <h3>先给两条轴命名：token 和 feature</h3>
    <p>三行表示三个 token，每行两个实数特征。shape=(3,2)、ndim=2、dtype=float64、共六个元素。token 暂时只是序列中的位置，尚未做文本分词。负特征与 0 合法，文字和 bool 应在转换前拒绝。</p>
    <Matrix caption="X：token × 输入特征，shape=(3,2)" rows={tensorFixture.tokens}/>
    <div className="sys-row">{tensorFixture.tokens.map((_,i)=><button key={i} aria-pressed={token===i} onClick={()=>setToken(i)}>查看 token {i}</button>)}</div>
    <p role="status">X[{token},:] = {JSON.stringify(tensorFixture.tokens[token])}，shape=(2,)；X[:,0] 的 shape=(3,)，X[:,0:1] 的 shape=(3,1)，保留轴会改变广播。</p>
    <pre>as_tokens(rows) → 新的 float64 ndarray (T,D){'\n'}# 在转换前检查：规则二维、每维 1..8、实数、有限、非 bool{'\n'}# 不要只 print；return 将数组交给后续线性层</pre>
    <Predict question="X 的元素总数是多少？" expected={6} reason="两条轴长度相乘：3×2=6；shape 不能只写成 6。"/>
   </>}
   {step===1&&<>
    <h3>一次点积怎样成为整张线性层输出</h3>
    <p>X(3,2) @ W(2,3) + b(3,) → Y(3,3)。共享的输入特征维 2 相乘累加；同一个 b 沿三个 token 重复。@ 是矩阵乘法，* 是逐元素乘法。</p>
    <div className="sys-tensor-grid"><Matrix caption="W：输入特征 × 输出特征" rows={tensorFixture.weights}/><Matrix caption="Y：token × 输出特征" rows={model.y}/></div>
    <label htmlFor="tensor-output-feature">展开哪个输出特征<select id="tensor-output-feature" value={outputFeature} onChange={event=>setOutputFeature(Number(event.target.value))}>{[0,1,2].map(i=><option key={i} value={i}>输出特征 {i}</option>)}</select></label>
    <p role="status">Y[0,{outputFeature}] = {tensorFixture.tokens[0].map((value,k)=>`${value}×${tensorFixture.weights[k][outputFeature]}`).join(' + ')} + b[{outputFeature}]({tensorFixture.bias[outputFeature]}) = {format(model.y[0][outputFeature])}。</p>
    <p className="sys-notice">T=O=3 时，b(3,1) 也能广播到 Y(3,3)，却是每个 token 加一个数。接口必须明确 b.shape==(O,)，不能只看 NumPy 是否报错。</p>
    <Predict question="Y[2,2] 是多少？" expected={10.5} reason="第三个 token [1,1] 点乘 [3,6]，再加 1.5，得到 10.5。"/>
   </>}
   {step===2&&<>
    <h3>前向广播，反向沿重复的轴求和</h3>
    <p>上游梯度 dY 是后续损失对每个 Y 的导数。本例固定 dY，令 L=Σ(Y×dY) 核对线性层局部导数；没有训练模型，也没有 NumPy autograd。</p>
    <Matrix caption="给定 dY，shape=(3,3)" rows={tensorFixture.upstream}/>
    <p>dX=dY@W.T；dW=X.T@dY；db=沿 token 轴求和。dY 已携带损失约定，不再隐式除以 token 数。</p>
    <div className="sys-tensor-grid"><Matrix caption="dX，shape=(3,2)" rows={model.dx}/><Matrix caption="dW，shape=(2,3)" rows={model.dw}/></div>
    <p>db={JSON.stringify(model.db)}；db[0]=1+2+0=3。W[0,0] 的解析梯度={model.dw[0][0]}，独立中心有限差分约={format(model.finiteDifference)}（h=0.00001）。先改变一个参数，重算标量损失；有限差分是核对，不是完整自动求导。</p>
    <Predict question="偏置 b[0] 的梯度是多少？" expected={3} reason="三个 token 的贡献 1、2、0 相加为 3；这里求平均会额外缩小梯度。"/>
   </>}
   {step===3&&<>
    <h3>QK 分数怎样变成对 V 的加权汇总</h3>
    <p>复用 linear 投影：Q=K=X（单位权重），V=X@diag(10,20)。scores=Q@K.T/√2；先 mask，再逐行减最大值、exp、归一化，最后 probabilities@V。归一化沿 key 轴，每行和为 1。</p>
    <label><input type="checkbox" checked={causal} onChange={event=>setCausal(event.target.checked)}/>因果 mask：每个 query 只看当前与之前 token</label>
    <label htmlFor="tensor-future">未来 token 2 的第 0 特征：{future}<input id="tensor-future" type="range" min={0} max={3} step={.25} value={future} onChange={event=>setFuture(Number(event.target.value))}/></label>
    <label htmlFor="tensor-query">展开 query<select id="tensor-query" value={query} onChange={event=>setQuery(Number(event.target.value))}>{[0,1,2].map(i=><option value={i} key={i}>query {i}</option>)}</select></label>
    <div className="sys-scroll" tabIndex={0} role="region" aria-label="Attention 逐 key 分数与概率，可横向滚动"><table className="sys-tensor-table"><caption>query {query} → 每个 key；float64 数学演示</caption><thead><tr><th scope="col">key</th><th scope="col">原分数</th><th scope="col">mask</th><th scope="col">概率</th></tr></thead><tbody>{model.scores[query].map((score,j)=><tr key={j}><th scope="row">{j}</th><td>{format(score)}</td><td>{model.allowed[query][j]?'可见':'屏蔽'}</td><td>{format(model.probabilities[query][j])}</td></tr>)}</tbody></table></div>
    <p role="status" id="tensor-attention-output">query {query} 输出：[{model.output[query].map(format).join(', ')}]；概率行和：{format(model.probabilities[query].reduce((sum,n)=>sum+n,0))}。</p>
    <p>默认第 0 行因果概率 [1,0,0]，输出 [10,0]。保持因果 mask、只改未来 token 时，query 0/1 输出不应变化；关闭 mask 后观察区别。全屏蔽行应明确拒绝，不能用 0 替代 NaN 掩盖错误。</p>
    <Predict key={`${query}-${future}-${causal}`} question="当前 query 对 key 2 的概率是多少？" expected={model.probabilities[query][2]} reason={`先屏蔽再按行归一化，结果约 ${format(model.probabilities[query][2])}；容差 0.000001。`}/>
   </>}
   <h4>把这一步写进自己的代码</h4>
   <pre>{`.venv/bin/python run.py ${task} --output ${task}-after.json\n.venv/bin/python run.py ${task} --variant transfer --seed 913 --output ${task}-transfer-913.json`}</pre>
   <p>每步累积重跑先前检查：5 → 10 → 15 → 20 组。transfer 输入在网页例题中未展示，生成器公开，首次失败仍须保留。换一个自选种子，再自己写一条新测试；不能把公开变式当保密资格考试。</p>
  </div>
  <h3>提交数值排障交接，保留没有通过的部分</h3>
  {dirty&&<p className="sys-pill" role="status">张量草稿有未保存修改</p>}
  <label htmlFor="tensor-receipt">粘贴 tensor_lab/run.py 的完整回执</label>
  <textarea id="tensor-receipt" value={raw} maxLength={15000} onChange={event=>{setRaw(event.target.value);setReceipt(null);setMessage('');setInvalid(false)}}/>
  <button onClick={inspect}>检查张量回执与反馈</button>
  {receipt&&<div className="sys-notice"><p>{receipt.task} / {receipt.variant} / seed {receipt.seed} · {receipt.status} · {receipt.checks.passed}/{receipt.checks.total} 组（自报回执）。NumPy {receipt.numpy??'未可用'}。</p>{receipt.diagnostic&&<p>{receipt.diagnostic}</p>}<ul>{receipt.checks.cases.map(c=><li key={c.id}><strong>{c.passed?'符合约定':'需修复'} · {c.id}</strong><p>{c.purpose} {c.feedback}</p></li>)}</ul></div>}
  {fields.map(([key,label])=><div key={key}><label htmlFor={'tensor-'+key}>{label}</label><textarea id={'tensor-'+key} maxLength={600} value={handoff[key]} onChange={event=>setHandoff(current=>({...current,[key]:event.target.value}))}/></div>)}
  <div className="sys-row"><button className="sys-primary" disabled={saving} onClick={()=>void save()}>{saving?'正在保存张量交接…':'保存张量练习交接（自报证据）'}</button><button onClick={exportDraft}>导出张量交接草稿</button></div>
  {message&&<p role={invalid?'alert':'status'}>{message}</p>}
  <p className="sys-small sys-muted">网站只核对结构与计数，不执行你的代码、不核实哈希对应的文件或运行者身份。切换模块保留草稿。下一步需真实框架、训练/任务质量、多头/批次 Attention、KV cache 与 profiling；本包未覆盖这些岗位能力。</p>
 </section>;
}
