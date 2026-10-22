#!/usr/bin/env python3
"""实际运行三个模板并审计可重跑产物、信息边界和考核计分。
运行：.sites-runtime/course-venv/bin/python scripts/check-research.py
可选 --offline-zip PATH 使用已核验的UCI下载，不隐式改用合成数据。
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--offline-zip', type=Path)
parser.add_argument('--track', choices=['vision','timeseries','language'], help='只重验改变的模板')
parser.add_argument('--assessment-only', action='store_true', help='只在考核代码改变后验证计分与硬门槛，不重复已通过模板')
args = parser.parse_args()
outputs = ROOT/'.sites-runtime'/'research-validation'
outputs.mkdir(parents=True, exist_ok=True)
run_root = Path(tempfile.mkdtemp(prefix='run-', dir=outputs))
templates = json.loads((ROOT/'data/research-templates.json').read_text())
assert [t['id'] for t in templates] == ['vision', 'timeseries', 'language']
results = []
for template in ([] if args.assessment_only else [t for t in templates if not args.track or t['id']==args.track]):
    name = template['id']
    run_dir = run_root/name
    run_dir.mkdir()
    code = template['code']
    source = ROOT.parent/'content-drafts'/f'research-template-{name}.py'
    assert source.read_text() == code, f'{name} app与脚本内容不一致'
    assert len(template['concepts']) >= 4 and template['objectives'] and template['practice']['checks']
    code_file = run_dir/'template.py'
    code_file.write_text(code)
    env = dict(os.environ, OMP_NUM_THREADS='1', OPENBLAS_NUM_THREADS='1', MKL_NUM_THREADS='1')
    if args.offline_zip:
        env['SMS_ZIP'] = str(args.offline_zip.resolve())
    started = time.perf_counter()
    try:
        process = subprocess.run([sys.executable, str(code_file)], cwd=run_dir, env=env,
                                 capture_output=True, text=True, timeout=120)
        (run_dir/'stdout.log').write_text(process.stdout)
        (run_dir/'stderr.log').write_text(process.stderr)
        assert process.returncode == 0, process.stderr[-4000:]
        directories = [line.split('ARTIFACT_DIR ', 1)[1] for line in process.stdout.splitlines() if line.startswith('ARTIFACT_DIR ')]
        assert len(directories) == 1
        artifact_dir = Path(directories[0])
        payload = json.loads((artifact_dir/'results.json').read_text())
        assert payload['track'] == name and payload['protocol_version'] == 'research-v2'
        assert payload['environment']['python'] and payload['environment']['sklearn']
        assert payload['data_sha256'] and payload['code_sha256'] == hashlib.sha256(code.encode()).hexdigest()
        assert (artifact_dir/'source.py').read_text() == code
        assert payload['validation'] and payload['predictions']
        if name in ['vision', 'language']:
            assert len(payload['runs']) == 3 and payload['config']['seeds'] == [11, 29, 47]
            for run in payload['runs']:
                train, val, test = map(set, [run['train_ids'], run['validation_ids'], run['test_ids']])
                assert train.isdisjoint(val) and (train|val).isdisjoint(test)
                if name == 'language':
                    train, val, test = map(set, [run['train_groups'], run['validation_groups'], run['test_groups']])
                    assert train.isdisjoint(val) and (train|val).isdisjoint(test)
                    assert math.isfinite(run['metrics']['macro_f1'])
                else:
                    assert math.isfinite(run['metrics']['True']['macro_f1'])
            if name == 'vision':
                assert sum(map(sum, payload['reproduction']['confusion_matrix'])) == 899
            else:
                assert payload['raw_rows'] == 5574 and payload['normalized_groups'] > 1000
        else:
            assert len(payload['test_years']) == 59 and max(payload['development_years']) < min(payload['test_years'])
            for fold in payload['folds']:
                assert max(fold['train_years']) < min(fold['validation_years'])
            assert payload['summary']['bootstrap_replicates'] == 1000
            assert payload['config']['refit_test'] is False
            assert math.isfinite(payload['metrics']['Ridge']['MAE'])
        results.append({'id': name, 'passed': True, 'seconds': round(time.perf_counter()-started, 3),
                        'code_sha256': payload['code_sha256'], 'data_sha256': payload['data_sha256'],
                        'artifact_dir': str(artifact_dir), 'stdout': str(run_dir/'stdout.log'),
                        'stderr': str(run_dir/'stderr.log')})
    except Exception as error:
        results.append({'id': name, 'passed': False, 'seconds': round(time.perf_counter()-started, 3), 'error': str(error)})
    print(name, 'PASS' if results[-1]['passed'] else 'FAIL', results[-1]['seconds'], flush=True)
# 使用项目TypeScript编译器加载真实模块，不用正则猜题库结构。
node_script = r'''
import ts from 'typescript';
import {readFileSync} from 'node:fs';
async function load(path) {
 const output=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 return import('data:text/javascript;base64,'+Buffer.from(output).toString('base64'));
}
const cp=await load('lib/checkpoints.ts'),diag=await load('lib/diagnostic.ts');
const stages=cp.checkpoints.map(stage=>({week:stage.week,counts:['vision','timeseries','language'].map(track=>cp.checkpointQuestions(stage,track).length)}));
for(const stage of cp.checkpoints)for(const track of ['vision','timeseries','language'])for(const q of cp.checkpointQuestions(stage,track)) {
 if(q.options.length!==4||!Number.isInteger(q.answer)||q.answer<0||q.answer>3||!q.explanation)throw Error('invalid checkpoint question');
}
const base={ratings:[3,3,3,3],conceptScore:100,criticalFailures:[],mode:'independent',reviewed:true};
const cases=[['pass',base,true],['unreviewed',{...base,reviewed:false},false],['hinted',{...base,mode:'hinted'},false],['solution',{...base,mode:'solution'},false],['forgery',{...base,criticalFailures:['伪造证据']},false],['leak',{...base,criticalFailures:['核心数据泄漏']},false],['nonreproducible',{...base,criticalFailures:['不可复现']},false],['weak_dimension',{...base,ratings:[1,3,3,3]},false],['concept_failure',{...base,conceptScore:67},false],['invalid_ratings',{...base,ratings:[9,9,9,9]},false],['invalid_score',{...base,conceptScore:NaN},false],['out_of_range_score',{...base,conceptScore:999},false]];
for(const [name,input,expected]of cases)if(cp.practicalReviewDecision(input).passed!==expected)throw Error('review gate failed: '+name);
console.log(JSON.stringify({stages,policy:cp.checkpointPolicy,diagnosticCount:diag.diagnostics.length,areas:Object.keys(diag.diagnosticGuide),reviewCases:cases.length}));
'''
try:
    node = subprocess.run(['node', '--input-type=module', '-e', node_script], cwd=ROOT, capture_output=True, text=True, timeout=30)
    assert node.returncode == 0, node.stderr
    assessment = json.loads(node.stdout)
    assert [s['week'] for s in assessment['stages']] == [4,8,12,16,20,24,26]
    assert all(count == 6 for s in assessment['stages'] for count in s['counts'])
    assert assessment['diagnosticCount'] == 12
    assert assessment['policy']['conceptMinimumCorrect'] == math.ceil(6*.8) == 5
    assessment['passed'] = True
except Exception as error:
    assessment = {'passed': False, 'error': str(error)}
manifest = {'checked_at': time.strftime('%Y-%m-%dT%H:%M:%S%z'), 'python': sys.executable,
            'run_root': str(run_root), 'scope': 'assessment-only' if args.assessment_only else 'template-'+args.track+'-and-assessment' if args.track else 'templates-and-assessment', 'templates': results, 'assessment': assessment,
            'boundary': '实际模板运行和计分/门槛程序审计；未认证真实研究能力、导师评价、论文数值或新域泛化。'}
(run_root/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
print('MANIFEST', run_root/'manifest.json')
print('assessment', 'PASS' if assessment['passed'] else 'FAIL')
sys.exit(0 if assessment['passed'] and all(r['passed'] for r in results) else 1)
