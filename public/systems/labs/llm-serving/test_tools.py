import unittest,tempfile,subprocess,sys,json
from pathlib import Path
from inspect_result import inspect
class Tools(unittest.TestCase):
 def test_synthetic_structure_not_measurement(self):
  r=inspect({'completed':30,'duration':10.0,'total_output_tokens':1200},32)
  self.assertEqual(r['incomplete'],2);self.assertEqual(r['verification'],'artifact-consistency-only')
 def test_invalid(self):
  for d in [{'completed':33,'duration':1},{'completed':1,'duration':0},{'completed':True,'duration':1},{'completed':1,'duration':float('nan')}]:
   with self.assertRaises(ValueError):inspect(d,32)
 def test_prepare_no_execution(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);model=root/'model';model.mkdir();(model/'config.json').write_text('{}')
   out=root/'plan';cmd=[sys.executable,str(Path(__file__).with_name('prepare.py')),'--model-dir',str(model),'--output-dir',str(out)]
   r=subprocess.run(cmd,capture_output=True,text=True,timeout=5);self.assertEqual(r.returncode,0,r.stderr)
   p=json.loads((out/'plan.json').read_text());self.assertEqual(p['status'],'prepared-not-executed');self.assertEqual(p['request_count'],32)
   self.assertFalse((out/'benchmark.json').exists())
   r=subprocess.run(cmd,capture_output=True,text=True,timeout=5);self.assertNotEqual(r.returncode,0)
if __name__=='__main__':unittest.main()
