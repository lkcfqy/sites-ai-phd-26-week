"""Check declared lesson dependencies against actual example/reference imports."""
import ast, datetime, json, re, sys
from pathlib import Path

curriculum=json.loads(Path('data/curriculum.json').read_text())
results=[]
for lesson in [lesson for week in curriculum for lesson in week['lessons']]:
    code=lesson['code']+'\n'+'\n'.join(re.findall(r'```python\s*\n(.*?)```',lesson['practice']['solution'],re.S))
    tree=ast.parse(code)
    imports=set()
    for node in ast.walk(tree):
        if isinstance(node,ast.Import): imports.update(alias.name.split('.')[0] for alias in node.names)
        if isinstance(node,ast.ImportFrom) and node.module: imports.add(node.module.split('.')[0])
    external=imports-sys.stdlib_module_names-{'__future__'}
    declared=set(lesson['requirements'])
    distributions={'sklearn':'scikit-learn','PIL':'pillow','cv2':'opencv-python'}
    missing=sorted(module for module in external if distributions.get(module,module) not in declared)
    results.append({'id':lesson['id'],'imports':sorted(external),'declared':sorted(declared),'missing':missing,'passed':not missing})
report={'verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'static imports in example + fenced Python reference solutions; dynamic imports require manual review','lessons':len(results),'passed':sum(r['passed'] for r in results),'results':results}
Path('verification/dependency-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='results'},ensure_ascii=False))
for result in results:
    if not result['passed']: print(json.dumps(result,ensure_ascii=False))
sys.exit(0 if all(r['passed'] for r in results) else 1)
