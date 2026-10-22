'use client';
import {useEffect,useRef,useState} from 'react';
import Image from 'next/image';
import {Play,Square,Copy,Download,RotateCcw} from 'lucide-react';
import type {Lesson} from '@/lib/types';
import {useDraft} from './lesson-view';
import {CloudCodeSave} from './automatic-practice';
type WorkerMessage={type:'status'|'stdout'|'image'|'done'|'error';runId:number;text?:string};
export function browserSupported(code:string){
 const unavailable=new Set(['torch','torchvision','transformers','datasets','accelerate','sentence_transformers']);
 return !code.split('\n').some(line=>line.split('#',1)[0].split(';').some(statement=>{
  const from=statement.match(/^\s*from\s+([\w.]+)\s+import\b/);
  if(from)return unavailable.has(from[1].split('.')[0]);
  const imported=statement.match(/^\s*import\s+(.+)$/);
  return !!imported&&imported[1].split(',').some(module=>unavailable.has(module.trim().split(/[.\s]/)[0]));
 }));
}
export default function CodeCell({lesson,purpose='example'}:{lesson:Lesson;purpose?:'example'|'practice'}){
 const draft=useDraft<string>((purpose==='practice'?'practice-code:':'code:')+lesson.id,purpose==='practice'?'# 本课独立练习\n# 先预测，再从空白实现并核对验收条件。\n':lesson.code),code=draft.value;
 const [output,setOutput]=useState<string[]>([]),[images,setImages]=useState<string[]>([]),[running,setRunning]=useState(false),[status,setStatus]=useState(''),[copied,setCopied]=useState(false),[lastRunCode,setLastRunCode]=useState<string|null>(null);
 const worker=useRef<Worker|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),activeRun=useRef(0),outputSize=useRef(0);
 useEffect(()=>()=>{worker.current?.terminate();if(timer.current)clearTimeout(timer.current)},[]);
 const supported=browserSupported(code);
 function cleanup(){worker.current?.terminate();worker.current=null;if(timer.current)clearTimeout(timer.current);timer.current=null;}
 function stop(message='已停止。可以修改后重新运行。'){activeRun.current++;cleanup();setRunning(false);setStatus(message)}
 function run(){
  if(worker.current||running)return;
  if(code.length>100000){setStatus('代码超过 100,000 字符，请下载后在本地运行。');return}
  const runId=++activeRun.current;setLastRunCode(code);outputSize.current=0;setOutput([]);setImages([]);setRunning(true);setStatus('准备运行…');
  try{
   const current=new Worker('/python-worker.js');worker.current=current;
   current.onmessage=({data}:{data:WorkerMessage})=>{
    if(runId!==activeRun.current||data.runId!==runId)return;
    if(data.type==='status')setStatus(data.text??'');
    else if(data.type==='stdout'){
     const value=(data.text??'').slice(0,16384);outputSize.current+=value.length;
     if(outputSize.current>256000){stop('文本输出超过 256,000 字符，已停止。请减少打印量或在本地运行。');return}
     setOutput(lines=>[...lines,value].slice(-300));
    }else if(data.type==='image')setImages(list=>list.length<6?[...list,'data:image/png;base64,'+data.text]:list);
    else if(data.type==='done'||data.type==='error'){
     setRunning(false);setStatus(data.type==='done'?'运行完成。输出来自本次真实执行。':'运行失败：检查最后的错误行，修正后可重新运行。');
     if(data.type==='error')setOutput(lines=>[...lines,(data.text??'').slice(0,16384)]);cleanup();
    }
   };
   current.onerror=(event)=>{if(runId!==activeRun.current)return;setRunning(false);setStatus('Python 环境加载失败。检查网络后重试，或下载 Notebook。');setOutput([event.message]);cleanup()};
   current.postMessage({type:'run',code,runId});timer.current=setTimeout(()=>stop('运行超过 120 秒（含环境与包加载），已停止。请减少计算量或下载 Notebook。'),120000);
  }catch(error){cleanup();setRunning(false);setStatus(error instanceof Error?error.message:'此浏览器无法创建 Python Worker，请下载 Notebook。')}
 }
 function download(){const url=URL.createObjectURL(new Blob([code],{type:'text/x-python'})),a=document.createElement('a');a.href=url;a.download=lesson.id+(purpose==='practice'?'-practice':'')+'.py';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 return <div className="code-cell"><div className="code-toolbar"><span>Python {lesson.requirements.length?'· '+lesson.requirements.join(', '):'· 标准库'}{draft.dirty?' · 本地草稿':''}</span><div><button aria-label="复制代码" onClick={async()=>{try{await navigator.clipboard.writeText(code);setCopied(true);setTimeout(()=>setCopied(false),1600)}catch{setStatus('无法复制，请手动选中代码。')}}}><Copy size={16}/>{copied?'已复制':''}</button><button aria-label="重置代码" disabled={running} onClick={()=>{if(!draft.dirty||window.confirm('重置代码区？当前自改代码会被清除。'))draft.clear()}}><RotateCcw size={16}/></button><button aria-label="下载当前 Python 代码" onClick={download}><Download size={16}/></button></div></div><textarea aria-label="可编辑 Python 代码" className="code-editor" spellCheck={false} value={code} maxLength={100000} onChange={e=>draft.set(e.target.value)} rows={Math.min(20,Math.max(6,code.split('\n').length+1))}/><div className="code-actions">{running||supported?<button className="primary compact" onClick={()=>running?stop():run()}>{running?<Square size={16}/>:<Play size={16}/>} {running?'停止运行':'运行代码'}</button>:<a className="primary compact" href={'/api/notebook?id='+lesson.id}><Download size={16}/>下载 Notebook</a>}<span>{supported?'当前设备 · Worker · 120 秒上限 · 每次运行使用新的 Python 环境':'当前代码需本地或 Colab。课程 Notebook 导出原示例；自改代码请先下载 .py，再复制到 Notebook 并安装新增依赖。'}</span></div><CloudCodeSave lessonId={lesson.id} purpose={purpose} code={code} onAdopt={code=>draft.set(code)}/><p className="code-status">{draft.persisted?'自改代码保留在当前标签页，刷新可恢复；换设备前下载 .py。':'自改代码当前仅存于内存；刷新前请下载 .py。'}</p>{status&&<p className="code-status" role="status" aria-live="polite">{status}</p>}{lastRunCode!==null&&code!==lastRunCode&&(output.length>0||images.length>0)&&<p className="code-status" role="status">代码已修改，下方为上一次运行输出；重新运行才能验证当前代码。</p>}{output.length>0&&<pre className="code-output" tabIndex={0} aria-label="Python 文本输出">{output.join('\n')}</pre>}{images.map((src,i)=><Image unoptimized key={i} src={src} alt={`本次 Python 运行绘图 ${i+1}；图中轴标签来自代码`} width={900} height={600} className="python-plot"/>)}<details className="code-help"><summary>运行环境与常见错误</summary><p>首次加载需要联网，科学包加载也计入 120 秒上限。浏览器适合小规模教学计算；PyTorch、GPU、文件下载和正式训练请用本地或 Colab。它隔离于页面主线程，可终止卡住的程序；它不提供系统级沙箱或硬内存配额。</p><p>ModuleNotFoundError：检查依赖，浏览器不支持的包移至 Notebook。NameError：先定义变量。IndentationError：检查四空格缩进。图为空：在绘图末尾调用 plt.show()。停止后，所有 Python 变量都清空；再次运行会重新创建环境。</p></details></div>
}
