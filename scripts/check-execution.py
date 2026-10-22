"""Execute reference implementations and real exported Notebook code, with evidence."""
import argparse,ast,concurrent.futures,datetime,hashlib,json,os,re,subprocess,sys,tempfile,time
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--notebooks');parser.add_argument('--solutions',action='store_true');parser.add_argument('--report');args=parser.parse_args()
items=[];manual=[]
if args.solutions:
 curriculum=json.loads(Path('data/curriculum.json').read_text())
 for lesson in [l for w in curriculum for l in w['lessons']]:
  blocks=re.findall(r'```python\s*\n(.*?)```',lesson['practice']['solution'],re.S)
  if blocks:
   for i,code in enumerate(blocks):items.append((lesson['id']+'-solution-'+str(i+1),code,45))
  else:manual.append(lesson['id'])
if args.notebooks:
 import nbformat
 for path in sorted(Path(args.notebooks).glob('*.ipynb')):
  notebook=nbformat.read(path,as_version=4);nbformat.validate(notebook)
  code='\n\n'.join(cell.source for cell in notebook.cells if cell.cell_type=='code' and 'environment' not in cell.metadata.get('tags',[]))
  items.append((path.stem+'-notebook',code,180 if path.stem.startswith('template-') else 45))
if not items:parser.error('No executable inputs selected')
cache=Path('.sites-runtime/mpl-cache').resolve();cache.mkdir(parents=True,exist_ok=True)
def run(item):
 name,code,timeout=item;digest=hashlib.sha256(code.encode()).hexdigest()
 try:ast.parse(code)
 except SyntaxError as error:return {'id':name,'passed':False,'error':str(error),'sha256':digest}
 with tempfile.TemporaryDirectory(prefix='ai-phd-acceptance-') as directory:
  try:
   result=subprocess.run([sys.executable,'-c',code],cwd=directory,env=dict(os.environ,MPLBACKEND='Agg',MPLCONFIGDIR=str(cache),OMP_NUM_THREADS='1',OPENBLAS_NUM_THREADS='1',MKL_NUM_THREADS='1'),capture_output=True,text=True,timeout=timeout)
   outputs=[str(p.relative_to(directory)) for p in Path(directory).rglob('*') if p.is_file()]
   return {'id':name,'passed':result.returncode==0,'sha256':digest,'stdout':result.stdout[-2500:],'stderr':result.stderr[-2500:],'generatedFiles':outputs}
  except subprocess.TimeoutExpired:return {'id':name,'passed':False,'sha256':digest,'error':f'timeout after {timeout} seconds'}
start=time.time()
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 results=[]
 for result in pool.map(run,items):
  results.append(result)
  if len(results)%25==0:print(f'Executed {len(results)}/{len(items)}',flush=True)
report={'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'interpreter':sys.executable,'inputs':len(items),'passed':sum(r['passed'] for r in results),'manualReviewLessons':manual,'manualReviewBoundary':'Written literature/protocol/defense work requires reviewed artifacts; these are not execution passes.','elapsedSeconds':round(time.time()-start,1),'results':results}
name=args.report or ('solutions-validation.json' if args.solutions else 'notebooks-validation.json')
if Path(name).name!=name or not name.endswith('.json'): parser.error('report must be a JSON filename')
Path('verification',name).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ['results','manualReviewLessons']},ensure_ascii=False))
failed=[r for r in results if not r['passed']]
if failed:print(json.dumps(failed,ensure_ascii=False,indent=2));sys.exit(1)
