import {learningBridges} from '@/data/systems-learning-bridges';
export default function FoundationBridge({stageId,lessonIndex}:{stageId:string;lessonIndex:number}){
 const bridge=learningBridges[stageId];if(!bridge)return null;
 const command=stageId==='s4'?'c++ --version\nc++ -std=c++17 -Wall -Wextra -pedantic -c foundation_raii.cpp -o foundation_raii.o\nc++ foundation_raii.o -o foundation_raii\n./foundation_raii\nc++ -std=c++17 -Wall -Wextra -pedantic -pthread foundation_threads.cpp -o foundation_threads\n./foundation_threads':`python3 foundation_lab.py ${stageId} --output ${stageId}-first.json`;
 return <section className="sys-bridge" aria-labelledby={'bridge-'+stageId}>
  <h3 id={'bridge-'+stageId}>本课预备练习：先预测，再运行</h3><p><strong>本课重点：</strong>{bridge.focus[lessonIndex]}</p>
  <details><summary>开始前，先回答两个问题</summary>{bridge.readiness.map(item=><div key={item.question}><p>{item.question}</p><details><summary>核对解释</summary><p>{item.answer}</p></details></div>)}<p>答不出时先回到本阶段先修课。核对答案是学习帮助，不计为独立测评。</p></details>
  <details><summary>从概念到可运行例子</summary><p>{bridge.explanation}</p><p>{bridge.example}</p><p><strong>环境：</strong>{bridge.hardware}</p><a href="/systems/foundation_lab.py" download>下载 11 阶段 CPU 预备练习</a>{stageId==='s4'&&<div className="sys-row"><a href="/systems/foundation_raii.cpp" download>下载 RAII 例子</a><a href="/systems/foundation_threads.cpp" download>下载线程例子</a></div>}{stageId==='s1'&&<div className="sys-row"><a href="/systems/log_cli.py" download>下载完整日志 CLI 例子</a><a href="/systems/CLI_LINUX_BRIDGE.md" download>下载终端、进程与输出练习</a></div>}<p>把源码放到新的学习目录，先阅读再运行。结果文件不覆盖旧文件；重复练习时换新输出名。</p><pre>{command}</pre></details>
  <details><summary>跟着做，再修复一个失败</summary><ol>{bridge.guided.map(step=><li key={step}>{step}</li>)}</ol><h4>失败例与排查</h4><p><strong>现象：</strong>{bridge.failure.symptom}</p><p><strong>为什么：</strong>{bridge.failure.reason}</p><p><strong>修复与回归：</strong>{bridge.failure.repair}</p></details>
  <p><strong>保留材料：</strong>{bridge.artifact}</p><p>{bridge.next}</p><p className="sys-small sys-muted">预备练习是参考示范；完成后再做下方本课独立任务与换条件练习。结果保存本地，在反思中记录命令和证据位置；不能把参考检查转为个人通过。</p>
 </section>
}
