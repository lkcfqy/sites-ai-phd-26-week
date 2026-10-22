"""Validate curriculum structure and execute every example in isolated directories."""
import argparse,ast,concurrent.futures,json,os,re,subprocess,sys,tempfile,time
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--draft',action='store_true');parser.add_argument('--file',default='data/curriculum.json');args=parser.parse_args()
weeks=json.loads(Path(args.file).read_text());lessons=[l for w in weeks for l in w['lessons']];errors=[];ids=set()
if not args.draft and [w['number'] for w in weeks]!=list(range(1,27)):errors.append('must contain weeks 1–26 in order')
for w in weeks:
 expected=15 if 13<=w['number']<=16 else 5
 if len(w['lessons'])!=expected:errors.append(f"week {w['number']}: expected {expected} lessons")
 if not w['challenge']['rubric'] or not w['challenge']['deliverables'] or not w['challenge']['defense']:errors.append(f"week {w['number']}: missing project criteria")
 for l in w['lessons']:
  if l['id'] in ids:errors.append('duplicate '+l['id'])
  ids.add(l['id'])
  expected_id=f"w{w['number']:02d}-"+(l['track']+'-' if l['track']!='common' else '')+f"d{l['day']}"
  if l['id']!=expected_id:errors.append('bad id '+l['id'])
  body=''.join(c['body'] for c in l['concepts']);chars=len(re.findall(r'[\u4e00-\u9fff]',body))
  if chars<350:errors.append(f"{l['id']}: only {chars} Chinese characters")
  if len(l['quiz'])!=3 or any(len(q['options'])!=4 or not isinstance(q['answer'],int) or q['answer'] not in range(4) or not q['explanation'] for q in l['quiz']):errors.append(l['id']+': invalid quiz')
  if not l['practice']['hints'] or not l['practice']['checks'] or not l['practice']['solution']:errors.append(l['id']+': missing practice')
  if not l['references'] or any(not r['url'].startswith('https://') for r in l['references']):errors.append(l['id']+': invalid references')
  try:ast.parse(l['code'])
  except SyntaxError as e:errors.append(l['id']+': syntax '+str(e))
if errors:print(json.dumps({'errors':errors},ensure_ascii=False,indent=2));sys.exit(1)
cache=Path('.sites-runtime/mpl-cache').resolve();cache.mkdir(parents=True,exist_ok=True)
def run(l):
 with tempfile.TemporaryDirectory(prefix='ai-phd-example-') as d:
  env=dict(os.environ,MPLBACKEND='Agg',MPLCONFIGDIR=str(cache),OMP_NUM_THREADS='1',OPENBLAS_NUM_THREADS='1',MKL_NUM_THREADS='1')
  try:
   result=subprocess.run([sys.executable,'-c',l['code']],cwd=d,env=env,capture_output=True,text=True,timeout=45)
   return {'id':l['id'],'passed':result.returncode==0,'output':result.stdout[-1500:],'error':result.stderr[-2500:] if result.returncode else ''}
  except subprocess.TimeoutExpired:return {'id':l['id'],'passed':False,'error':'timeout after 45s'}
results=[];start=time.time()
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 for result in pool.map(run,lessons):
  results.append(result)
  if len(results)%20==0:print(f'Executed {len(results)}/{len(lessons)} examples',flush=True)
report={'weeks':len(weeks),'lessons':len(lessons),'questions':sum(len(l['quiz']) for l in lessons),'minChineseCharacters':min(len(re.findall(r'[\u4e00-\u9fff]',''.join(c['body'] for c in l['concepts']))) for l in lessons),'passed':sum(r['passed'] for r in results),'elapsedSeconds':round(time.time()-start,1),'results':results}
Path('.sites-runtime/curriculum-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in report.items() if k!='results'},ensure_ascii=False),flush=True)
failed=[r for r in results if not r['passed']]
if failed:print(json.dumps(failed,ensure_ascii=False,indent=2));sys.exit(1)
