"""Run every trusted reference through Docker; compare host/runtime drift too.

This offline harness alone reads expected answers. Neither the HTTP request nor
the executor receives them. It never edits the source corpus.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path
import platform
import subprocess
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import Runner, strict_loads

MISSING = object()


def compare(actual, expected, path="result"):
    """Mirror the Site's compareJSON numeric tolerance and object semantics."""
    if isinstance(expected, (int, float)) and not isinstance(expected, bool):
        matches = isinstance(actual, (int, float)) and not isinstance(actual, bool) and math.isfinite(actual) and abs(actual - expected) <= 1e-6 * max(1, abs(expected))
        return [] if matches else [{"path": path, "actual": actual if actual is not MISSING else "<missing>", "expected": expected}]
    if isinstance(expected, list):
        if not isinstance(actual, list) or len(actual) != len(expected):
            return [{"path": path, "actual": actual if actual is not MISSING else "<missing>", "expected": expected}]
        return [issue for i, value in enumerate(expected) for issue in compare(actual[i], value, f"{path}[{i}]")]
    if isinstance(expected, dict):
        if not isinstance(actual, dict):
            return [{"path": path, "actual": actual if actual is not MISSING else "<missing>", "expected": expected}]
        return [issue for key, value in expected.items() for issue in compare(actual.get(key, MISSING), value, f"{path}.{key}")]
    return [] if type(actual) is type(expected) and actual == expected else [{"path": path, "actual": actual if actual is not MISSING else "<missing>", "expected": expected}]


def host_versions():
    versions = {"python": platform.python_version()}
    for name, key in (("numpy", "numpy"), ("scipy", "scipy"), ("scikit-learn", "scikit_learn"), ("pandas", "pandas")):
        try:
            versions[key] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            versions[key] = "not-installed"
    return versions


HOST_SCRIPT = """import json,sys
payload=json.load(sys.stdin)
outputs=[]
for value in payload['inputs']:
 namespace={'__name__':'__reference__'}
 exec(compile(payload['code'],'reference.py','exec'),namespace)
 outputs.append(namespace['solve'](value))
print(json.dumps(outputs,allow_nan=False))
"""


def run_host(payload):
    # Reference source is authored project content, not a learner submission.
    result = subprocess.run([sys.executable, "-I", "-c", HOST_SCRIPT], input=json.dumps(payload, allow_nan=False), capture_output=True, text=True, timeout=30)
    if result.returncode:
        return None, result.stderr[-3000:]
    try:
        return strict_loads(result.stdout), None
    except ValueError:
        return None, "Host reference did not produce strict JSON."


def run_task(runner, task):
    payload = {"code": task["referenceCode"], "inputs": [case["input"] for case in task["tests"]], "requirements": task["requirements"]}
    host_outputs, host_error = run_host(payload)
    response, http_status = runner.execute(payload)
    result = {"lessonId": task["lessonId"], "cases": len(task["tests"]), "requirements": task["requirements"], "httpStatus": http_status, "status": response.get("status"), "environment": response.get("environment"), "durationMs": response.get("durationMs"), "runnerError": response.get("error"), "hostError": host_error, "passedCases": 0, "hostPassedCases": 0, "driftCases": [], "mismatches": [], "hostMismatches": []}
    actual_outputs = response.get("outputs", [])
    for index, case in enumerate(task["tests"]):
        actual = actual_outputs[index] if index < len(actual_outputs) else MISSING
        issues = compare(actual, case["expected"])
        if response.get("status") == "ok" and http_status == 200 and not issues:
            result["passedCases"] += 1
        else:
            result["mismatches"].append({"caseIndex": index, "label": case["label"], "issues": issues})
        if host_outputs is not None and len(host_outputs) > index:
            host_issues = compare(host_outputs[index], case["expected"])
            if not host_issues:
                result["hostPassedCases"] += 1
            else:
                result["hostMismatches"].append({"caseIndex": index, "label": case["label"], "issues": host_issues})
            # Check both directions so extra object keys cannot hide drift.
            drift = compare(actual, host_outputs[index]) + compare(host_outputs[index], actual if actual is not MISSING else None)
            if drift:
                result["driftCases"].append({"caseIndex": index, "label": case["label"], "issues": drift})
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus", type=Path, required=True)
    parser.add_argument("--report", type=Path, default=Path(__file__).resolve().parents[1] / "corpus-validation.json")
    parser.add_argument("--image", default="ai26-python-runner:2026.10.2")
    args = parser.parse_args()
    source = args.corpus.read_bytes()
    tasks = strict_loads(source)
    started = time.monotonic()
    runner = Runner(image=args.image, concurrency=2)
    runner.verify_engine()
    image_id = runner.image_id()
    results = []
    print(f"Starting {len(tasks)} tasks / {sum(len(task['tests']) for task in tasks)} cases; image {image_id}", flush=True)
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = {pool.submit(run_task, runner, task): task["lessonId"] for task in tasks}
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            if len(results) % 10 == 0 or result["passedCases"] != result["cases"] or result["driftCases"]:
                print(f"{len(results)}/{len(tasks)} {result['lessonId']} Docker {result['passedCases']}/{result['cases']} host {result['hostPassedCases']}/{result['cases']} drift={len(result['driftCases'])} {result['runnerError'] or ''}", flush=True)
    results.sort(key=lambda r: r["lessonId"])
    case_count = sum(r["cases"] for r in results)
    summary = {"tasks": len(results), "cases": case_count, "passedTasks": sum(r["passedCases"] == r["cases"] for r in results), "passedCases": sum(r["passedCases"] for r in results), "hostPassedCases": sum(r["hostPassedCases"] for r in results), "runtimeDriftCases": sum(len(r["driftCases"]) for r in results), "runnerErrorTasks": sum(r["runnerError"] is not None for r in results), "hostErrorTasks": sum(r["hostError"] is not None for r in results)}
    versions = host_versions()
    docker_versions = {key: results[0]["environment"].get(key) for key in versions}
    report = {"validatedAtUtc": datetime.now(timezone.utc).isoformat(), "scope": "Local validation only; no production host, URL, or service credentials configured", "corpusPath": str(args.corpus.resolve()), "corpusSha256": hashlib.sha256(source).hexdigest(), "image": args.image, "imageId": image_id, "durationSeconds": round(time.monotonic() - started, 3), "comparison": "Site compareJSON: finite numeric relative tolerance 1e-6; array length/types checked; expected object fields checked", "hostRuntime": versions, "dockerRuntime": docker_versions, "runtimeVersionDifferences": {key: {"host": versions[key], "docker": docker_versions[key]} for key in versions if versions[key] != docker_versions[key]}, "summary": summary, "results": results}
    args.report.write_text(json.dumps(report, ensure_ascii=False, allow_nan=False, indent=2) + "\n")
    print(json.dumps(summary, ensure_ascii=False), flush=True)
    print(f"Report: {args.report}", flush=True)
    if summary["passedCases"] != case_count or summary["hostPassedCases"] != case_count or summary["runtimeDriftCases"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
