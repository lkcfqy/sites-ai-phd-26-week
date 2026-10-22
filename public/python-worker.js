// A dedicated worker per run keeps the UI responsive and discards all Python state on completion/stop.
self.onmessage=async({data})=>{
 if(data.type!=='run'||typeof data.code!=='string'||data.code.length>100000)return;
 const runId=data.runId;
 const send=(type,text)=>self.postMessage({type,text,runId});
 let outputCharacters=0,imageCount=0;
 try{
  send('status','首次加载 Python 环境，请稍候…');
  importScripts('/api/python/pyodide.js');
  const runtime=await loadPyodide({indexURL:new URL('/api/python/',self.location.origin).href});
  const print=text=>{if(text.startsWith('__PLOT__')){if(++imageCount>6||text.length>6000000)throw new Error('绘图超过 6 张或单图过大，请减少图像或使用 Notebook。');send('image',text.slice(8));return}outputCharacters+=text.length;if(outputCharacters>256000)throw new Error('文本输出超过 256,000 字符，请减少打印量。');send('stdout',text.startsWith('__AUTO_RESULTS__')?text:text.slice(0,16384))};
  runtime.setStdout({batched:print});runtime.setStderr({batched:print});
  send('status','正在加载所需包并运行…');
  await runtime.loadPackagesFromImports(data.code);
  if(data.code.includes('matplotlib'))await runtime.runPythonAsync(`import matplotlib\nmatplotlib.use('Agg')\nimport matplotlib.pyplot as plt\nimport io, base64\ndef _show(*args, **kwargs):\n    for n in plt.get_fignums():\n        b=io.BytesIO()\n        plt.figure(n).savefig(b, format='png', bbox_inches='tight', dpi=110)\n        print('__PLOT__'+base64.b64encode(b.getvalue()).decode())\n    plt.close('all')\nplt.show=_show\nplt.close('all')`);
  const globals=runtime.toPy({});
  try{const result=await runtime.runPythonAsync(data.code,{globals});try{if(result!==undefined&&result!==null)print(String(result))}finally{if(result?.destroy)result.destroy()}}finally{globals.destroy()}
  send('done');
 }catch(error){send('error',String(error).slice(0,16384))}
};
