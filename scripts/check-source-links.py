"""Availability checks are separate from semantic verification by reviewers."""
import concurrent.futures,datetime,json,time,urllib.request,urllib.error
from pathlib import Path
items=[lesson for week in json.loads(Path('data/curriculum.json').read_text()) for lesson in week['lessons']]+json.loads(Path('data/research-templates.json').read_text())
links={}
for item in items:
 for ref in item['references']:
  links.setdefault(ref['url'],{'titles':[],'lessons':[]})
  links[ref['url']]['titles'].append(ref['title']);links[ref['url']]['lessons'].append(item['id'])
def check(pair):
 url,uses=pair
 for attempt in range(2):
  try:
   request=urllib.request.Request(url,headers={'User-Agent':'AI-PhD-curriculum-source-audit/1.0'})
   with urllib.request.urlopen(request,timeout=25) as response:
    prefix=response.read(512)
    return {'url':url,'status':response.status,'finalURL':response.url,'reachable':True,'semanticReview':'separate; availability alone does not establish claim correctness',**uses}
  except Exception as error:
   if attempt: return {'url':url,'reachable':False,'error':str(error),'semanticReview':'unverified',**uses}
   time.sleep(1)
start=time.time()
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:results=list(executor.map(check,links.items()))
report={'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'count':len(results),'reachable':sum(r['reachable'] for r in results),'elapsedSeconds':round(time.time()-start,1),'results':results}
Path('verification').mkdir(exist_ok=True)
Path('verification/source-links.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='results'},ensure_ascii=False))
print(json.dumps([r for r in results if not r['reachable']],ensure_ascii=False,indent=2))
