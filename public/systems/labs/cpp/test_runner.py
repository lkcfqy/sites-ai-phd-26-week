#!/usr/bin/env python3
"""Self-checks for the provided runner, not a learner proficiency examination."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
ROOT = Path(__file__).resolve().parent

def require(condition, message):
    if not condition:
        raise RuntimeError(message)

def main():
    if not __debug__:
        raise SystemExit("Do not run with -O")
    passed=[]
    with tempfile.TemporaryDirectory(prefix="mlsys-cpp-check-") as folder:
        directory=Path(folder)
        def run(*args):
            return subprocess.run([sys.executable,str(ROOT/"run.py"),*args],text=True,capture_output=True,timeout=180)
        result_file=directory/"all.json"
        result=run("all","--size","17","--tile","7","--elements","7","--workers","8","--repeats","3","--output",str(result_file))
        require(result.returncode==0, "bounded all run failed: "+result.stderr+result.stdout)
        report=json.loads(result_file.read_text())
        require(report["schema"]=="mlsys-cpp-labs-v1" and report["status"]=="passed", "schema or status")
        passed.append("real compile/link and four lab execution")
        require(report["tests_passed_total"]==55, "reference correctness checks")
        passed.append("55 correctness conditions")
        mm=next(x for x in report["labs"] if x["lab"]=="matmul")
        require(mm["shape"]==[17,17,17] and mm["max_abs_error"]<=1e-10,"non-divisible shape correctness")
        require(len(mm["baseline_samples_ms"])==len(mm["candidate_samples_ms"])==3,"raw timing sample counts")
        passed.extend(["non-divisible matmul shape", "all raw timing samples retained"])
        th=next(x for x in report["labs"] if x["lab"]=="threads")
        require([x["workers"] for x in th["scan"]]==[1,2,4,8],"worker scan")
        passed.append("workers greater than input length")
        digest=hashlib.sha256(result_file.read_bytes()).hexdigest()
        again=run("basics","--output",str(result_file))
        require(again.returncode!=0 and hashlib.sha256(result_file.read_bytes()).hexdigest()==digest,"overwrite protection")
        passed.append("existing output is not overwritten")
        for flags in [("--size","129"),("--repeats","16"),("--workers","16"),("--elements","1000001"),("--tile","0")]:
            output=directory/("invalid-"+flags[0][2:]+".json")
            invalid=run("all",*flags,"--output",str(output))
            require(invalid.returncode!=0 and not output.exists(),"invalid resource range accepted: "+repr(flags))
            passed.append("reject out-of-range "+flags[0])
        bad_ext=directory/"result.txt"
        require(run("basics","--output",str(bad_ext)).returncode!=0 and not bad_ext.exists(),"extension check")
        passed.append("reject non-JSON output")
        print(json.dumps({"status":"passed","checks":len(passed),"details":passed},ensure_ascii=False,indent=2))
    return 0
if __name__=="__main__":
    raise SystemExit(main())
