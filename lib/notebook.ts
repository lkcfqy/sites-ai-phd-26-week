import type {Lesson} from './types';
import environment from '@/data/runtime-environment.json';
import {CONTENT_VERSION,CURRICULUM_REVISION} from './content-version';
type Cell={cell_type:'markdown'|'code';metadata:Record<string,unknown>;source:string[];execution_count?:null;outputs?:unknown[]};
const lines=(s:string)=>s.split('\n').map(line=>line+'\n');
const md=(s:string):Cell=>({cell_type:'markdown',metadata:{},source:lines(s)});
const code=(s:string,tags:string[]=[]):Cell=>({cell_type:'code',execution_count:null,metadata:{tags},outputs:[],source:lines(s)});
export function buildNotebook(lesson:Lesson,includeSolution=false){
 const versions=environment.packages as Record<string,string>;
 const install=lesson.requirements.map(p=>versions[p]?`${p}==${versions[p]}`:p);
 const cells:Cell[]=[md(`# ${lesson.title}\n\n${lesson.summary}\n\n## 运行与证据\n本 Notebook 不含预制输出。先用 Python ${environment.python} 建立独立环境，或上传至 Colab；按顺序 Shift+Enter。浏览器运行使用 Pyodide ${environment.browser.pyodide}，其包版本不同。以下固定依赖是 ${environment.verifiedAt} 本机实际验收版本，其他平台需重新核对。\n科研模板可能下载公开数据；先核对许可、网络与磁盘预算。教学小样本或合成实验不能作为正式科研结论。\n\n## 学习目标\n${lesson.objectives.map(o=>'- '+o).join('\n')}\n\n${lesson.concepts.map(s=>`## ${s.title}\n${s.body}`).join('\n\n')}\n\n${lesson.formula?'## 核心公式\n'+lesson.formula+'\n\n':''}## 独立练习\n${lesson.practice.task}\n\n## 自查要求\n${lesson.practice.checks.map(c=>'- '+c).join('\n')}\n\n## 参考资料\n${lesson.references.map(r=>`- [${r.title}](${r.url})`).join('\n')}`)];
 if(install.length)cells.push(code(`%pip install ${install.join(' ')}`,['environment']));
 cells.push(code("import sys, platform, importlib.metadata\nprint('Python:', sys.version.split()[0], 'Platform:', platform.platform())\n"+JSON.stringify(lesson.requirements).replace(/^/,'packages = ')+'\nfor package in packages:\n    print(package, importlib.metadata.version(package))\n',['environment-evidence']));
 const source=lesson.code;const runnable=lesson.id==='vision'||lesson.id==='timeseries'||lesson.id==='language'?`_notebook_source = ${JSON.stringify(source)}\n`+source:source;
 cells.push(code(runnable,['example']),md('## 你的实验记录\n先写预测，再独立完成；记录独立 / 提示后 / 参考解法后完成。\n保存数据来源、划分、配置、种子、完整结果、错误与局限，保留负结果。\n'),code('# 在此独立完成练习\n',['independent-practice']));
 cells.push(md('## 渐进提示（先独立尝试，再逐项展开）\n'+lesson.practice.hints.map((h,i)=>`<details><summary>提示 ${i+1}</summary>\n\n${h}\n\n</details>`).join('\n\n')));
 if(includeSolution){cells.push(md('## 参考解法：查看后将完成等级记为“参考解法后”\n'+lesson.practice.solution));const blocks=[...lesson.practice.solution.matchAll(/```python\s*\n([\s\S]*?)```/g)].map(m=>m[1]);for(const block of blocks)cells.push(code(block,['reference-solution']));}
 return {nbformat:4,nbformat_minor:5,metadata:{kernelspec:{display_name:'Python 3',language:'python',name:'python3'},language_info:{name:'python',version:environment.python},ai_phd:{lessonId:lesson.id,contentVersion:CONTENT_VERSION,curriculumRevision:CURRICULUM_REVISION,environmentVerifiedAt:environment.verifiedAt,includesReferenceSolution:includeSolution}},cells:cells.map((cell,index)=>({...cell,id:lesson.id+'-'+index.toString(36)}))};
}
