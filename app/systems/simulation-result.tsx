'use client';
import {makeSimulationArtifact, simulationTitles, type SimulationModel} from '@/lib/systems-simulation-evidence';

export default function SimulationResult({model, parameters}: {model: SimulationModel; parameters: unknown}) {
  const artifact = makeSimulationArtifact(model, parameters);
  const json = JSON.stringify(artifact, null, 2);
  function download() {
    const url = URL.createObjectURL(new Blob([json], {type: 'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = `simulation-${model}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="sys-sim-check" aria-labelledby={`simulation-result-${model}`}>
    <h4 id={`simulation-result-${model}`}>{simulationTitles[model]} · 仿真证据</h4>
    <p><strong>没有设备实测、没有真实语言模型执行；不能满足真实 GPU / vLLM 证据门槛。</strong></p>
    <ol>{artifact.tasks.map(task => <li key={task}>{task}</li>)}</ol>
    <details><summary>模型假设与未覆盖条件</summary><ul>{artifact.assumptions.map(text => <li key={text}>{text}</li>)}</ul></details>
    <button onClick={download}>下载当前仿真 JSON</button>
    <p>换一个条件再导出；到“真实动手”的结果导入区选择文件，重算后写出你的观察。保存、评阅与备份始终保留仿真来源，参考结果不代表个人成绩。</p>
    <details><summary>查看完整参数与合成轨迹 JSON</summary><label htmlFor={`simulation-json-${model}`}>仿真原件（只读，可选择复制）</label><textarea id={`simulation-json-${model}`} readOnly rows={10} value={json}/></details>
  </section>;
}
