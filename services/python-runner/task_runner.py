"""Trusted container entry point, with one fresh subprocess per test input."""
import importlib.metadata
import json
import os
import platform
import selectors
import signal
import subprocess
import sys
import time


def run_case(code, value):
    payload = json.dumps({"code": code, "input": value}, allow_nan=False, ensure_ascii=False).encode()
    # Each input starts in a new interpreter, so globals cannot leak across cases.
    child = subprocess.Popen([sys.executable, "-I", "/opt/runner/job_exec.py"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    child.stdin.write(payload)
    child.stdin.close()
    limit = 16384
    streams = {"stdout": bytearray(), "stderr": bytearray()}
    selector = selectors.DefaultSelector()
    selector.register(child.stdout, selectors.EVENT_READ, "stdout")
    selector.register(child.stderr, selectors.EVENT_READ, "stderr")
    deadline = time.monotonic() + 4
    problem = None
    try:
        while selector.get_map():
            if child.poll() is not None:
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            if time.monotonic() >= deadline:
                problem = {"code": "CASE_TIMEOUT", "message": "Test exceeded 4 seconds wall time."}
                break
            for key, _ in selector.select(timeout=0.05):
                chunk = os.read(key.fileobj.fileno(), 4096)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                streams[key.data].extend(chunk)
                if sum(map(len, streams.values())) > limit:
                    problem = {"code": "OUTPUT_LIMIT", "message": "Test output exceeded 16 KiB."}
                    break
            if problem:
                break
    finally:
        selector.close()
        # Kill this process group; the host removes the entire container too.
        try:
            os.killpg(child.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        child.wait(timeout=1)
        child.stdout.close()
        child.stderr.close()
    if problem:
        return {"output": None, "error": problem, "stdout": ""}
    if child.returncode:
        return {"output": None, "error": {"code": "PROCESS_EXIT", "message": f"Interpreter exited with status {child.returncode}."}, "stdout": ""}
    try:
        result = json.loads(streams["stdout"])
        if not isinstance(result, dict) or set(result) != {"output", "error", "stdout"} or not isinstance(result["stdout"], str):
            raise ValueError("Invalid output envelope")
        if result["error"] is not None and not isinstance(result["error"], dict):
            raise ValueError("Invalid error envelope")
        # Re-encoding also rejects non-finite results emitted by untrusted code.
        json.dumps(result, allow_nan=False)
        return result
    except (ValueError, TypeError, UnicodeError):
        return {"output": None, "error": {"code": "INVALID_OUTPUT", "message": "Interpreter did not return strict JSON."}, "stdout": ""}


def main():
    started = time.monotonic()
    request = json.loads(sys.stdin.buffer.read(250001))
    environment = {"python": platform.python_version(), "numpy": importlib.metadata.version("numpy"), "scipy": importlib.metadata.version("scipy"), "scikit_learn": importlib.metadata.version("scikit-learn"), "pandas": importlib.metadata.version("pandas")}
    outputs, errors, logs = [], [], []
    for index, value in enumerate(request["inputs"]):
        result = run_case(request["code"], value)
        outputs.append(result["output"])
        if result["error"]:
            errors.append({"inputIndex": index, **result["error"]})
        if result["stdout"]:
            logs.append(f"Input {index}: {result['stdout']}")
    bounded_logs = "\n".join(logs).encode("utf-8")[:16384].decode("utf-8", errors="ignore")
    response = {"status": "ok" if not errors else "error", "outputs": outputs, "environment": environment, "durationMs": round((time.monotonic() - started) * 1000), "logs": bounded_logs}
    if errors:
        response["error"] = "; ".join(f"Input {e['inputIndex']}: {e['code']} {e.get('message', '')}" for e in errors)[:4096]
        response["errors"] = errors
        if any(e["code"] == "CASE_TIMEOUT" for e in errors):
            response["status"] = "timeout"
    print(json.dumps(response, allow_nan=False))


if __name__ == "__main__":
    main()
