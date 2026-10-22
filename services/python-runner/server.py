"""Authenticated HTTP -> one constrained Linux Docker container per request.

Run on a dedicated trusted worker host. This orchestrator has Docker authority;
untrusted execution containers receive neither the socket nor this token.
"""
import hashlib
import hmac
import json
import math
import os
from pathlib import Path
import selectors
import subprocess
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BODY_LIMIT = 250000
OUTPUT_LIMIT = 262144
ALLOWED_REQUIREMENTS = {"stdlib", "numpy", "numpy==2.2.6", "scipy", "scipy==1.15.3", "sklearn", "scikit-learn", "scikit-learn==1.6.1", "pandas", "pandas==2.2.3"}
RUNNER_DIR = Path(__file__).resolve().parent


def strict_loads(value):
    def reject(value):
        raise ValueError(f"Non-finite JSON constant {value} is forbidden.")
    return json.loads(value, parse_constant=reject)


def validate_value(value, depth=0):
    if depth > 24:
        raise ValueError("JSON nesting exceeds 24 levels.")
    if value is None or isinstance(value, (str, bool, int)):
        return
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("All numbers must be finite.")
        return
    if isinstance(value, list):
        for item in value:
            validate_value(item, depth + 1)
        return
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                raise ValueError("JSON keys must be strings.")
            validate_value(item, depth + 1)
        return
    raise ValueError("Input must be strict JSON.")


def validate_request(payload):
    if not isinstance(payload, dict) or set(payload) - {"code", "inputs", "requirements"}:
        raise ValueError("Only code, inputs, requirements are accepted; expected answers are not accepted.")
    code = payload.get("code")
    if not isinstance(code, str) or not code.strip() or len(code.encode("utf-8")) > 100000 or "\x00" in code:
        raise ValueError("code must contain 1–100000 UTF-8 bytes, without NUL.")
    inputs = payload.get("inputs")
    if not isinstance(inputs, list) or not 1 <= len(inputs) <= 10:
        raise ValueError("inputs must contain 1–10 values.")
    validate_value(inputs)
    requirements = payload.get("requirements", [])
    if not isinstance(requirements, list) or len(requirements) > 8 or any(not isinstance(x, str) or x not in ALLOWED_REQUIREMENTS for x in requirements):
        raise ValueError("requirements must use the preinstalled stdlib/numpy/scipy/scikit-learn/pandas allowlist.")
    normalized = {"code": code, "inputs": inputs, "requirements": requirements}
    if len(json.dumps(normalized, ensure_ascii=False, allow_nan=False).encode()) > BODY_LIMIT:
        raise ValueError("Normalized request exceeds 250000 bytes.")
    return normalized


class Runner:
    def __init__(self, image="ai26-python-runner:2026.10.2", wall_seconds=30, docker_socket="unix:///var/run/docker.sock", concurrency=2):
        if not 1 <= wall_seconds <= 60:
            raise ValueError("Runner wall time must be 1–60 seconds.")
        # Refuse remote daemons and arbitrary endpoints. No service fallback to exec.
        if docker_socket != "unix:///var/run/docker.sock":
            raise ValueError("Only the dedicated local Docker socket is supported.")
        self.image = image
        self.wall_seconds = wall_seconds
        self.slots = threading.BoundedSemaphore(concurrency)
        self.docker = ["docker", "--host=" + docker_socket]
        self.env = {k: v for k, v in os.environ.items() if k not in {"DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH", "GRADER_TOKEN"}}

    def command(self, args, timeout=5):
        return subprocess.run(self.docker + args, stdin=subprocess.DEVNULL, capture_output=True, timeout=timeout, env=self.env, check=False)

    def image_id(self):
        info = self.command(["image", "inspect", "--format", "{{.Id}}", self.image])
        value = info.stdout.decode().strip()
        if info.returncode or not value.startswith("sha256:"):
            raise RuntimeError("Execution image is unavailable. Prebuild the approved image; jobs do not pull images.")
        return value

    def verify_engine(self):
        result = self.command(["info", "--format", "{{json .}}"])
        if result.returncode:
            raise RuntimeError("Docker engine unavailable.")
        info = strict_loads(result.stdout)
        # Reject Docker installations that silently ignore resource controls.
        required = ("MemoryLimit", "SwapLimit", "CpuCfsQuota", "CpuCfsPeriod", "PidsLimit")
        if not all(info.get(key) is True for key in required) or not any("seccomp" in str(x) for x in info.get("SecurityOptions", [])):
            raise RuntimeError("Required kernel resource controls or seccomp are unavailable.")

    def container_arguments(self, name, image_id):
        result = ["create", "--name", name, "-i", "--pull=never", "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--security-opt=seccomp=" + str(RUNNER_DIR / "seccomp.json"), "--user=65534:65534", "--cpus=0.5", "--memory=512m", "--memory-swap=512m", "--pids-limit=64", "--ulimit=nofile=128:128", "--ulimit=core=0:0", "--ulimit=fsize=1048576:1048576", "--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=32m,mode=1777", "--workdir=/tmp", "--log-driver=none", "--label=ai26.executor=true"]
        for key in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "all_proxy", "no_proxy"):
            result += ["--env", key + "="]
        result += ["--env", "OPENBLAS_NUM_THREADS=1", "--env", "OMP_NUM_THREADS=1", "--env", "MKL_NUM_THREADS=1", image_id]
        return result

    def inspect_state(self, name):
        result = self.command(["inspect", "--format", "{{json .State}}", name])
        return strict_loads(result.stdout) if result.returncode == 0 else {}

    def execute(self, payload):
        payload = validate_request(payload)
        response, status = self._execute_validated(payload)
        # Every execution receipt is bound to exactly what was submitted, even
        # when timeout/OOM/output-limit/engine failures return early. The Site
        # validates code identity before interpreting any execution error.
        response["codeSha256"] = hashlib.sha256(payload["code"].encode()).hexdigest()
        response["inputSha256"] = hashlib.sha256(json.dumps(payload["inputs"], sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()
        return response, status

    def _execute_validated(self, payload):
        if not self.slots.acquire(blocking=False):
            return {"status": "error", "outputs": [], "error": "RUNNER_BUSY: retry later", "environment": {"engine": "docker"}}, 429
        name = "ai26-job-" + uuid.uuid4().hex
        process = None
        started = time.monotonic()
        deadline = started + self.wall_seconds
        try:
            self.verify_engine()
            image_id = self.image_id()
            environment = {"engine": "docker", "image": image_id, "network": "none", "readOnly": True, "memoryMiB": 512, "cpus": 0.5, "pids": 64, "seccomp": "allowlist-no-network"}
            if time.monotonic() >= deadline:
                return {"status": "timeout", "outputs": [], "error": "Execution wall time exceeded during engine preparation.", "environment": environment}, 200
            # A docker run killed during create can leave a late-created orphan.
            # Complete the bounded administrative create first, so every normal
            # execution timeout has a known container to remove.
            # VFS-backed hosts may need several seconds to copy an image. Allow
            # bounded cleanup-safe creation even when a test uses a 1s job limit;
            # check the job deadline immediately after create completes.
            created = self.command(self.container_arguments(name, image_id), timeout=30)
            if created.returncode:
                raise RuntimeError("Isolated container creation failed.")
            if time.monotonic() >= deadline:
                return {"status": "timeout", "outputs": [], "error": "Execution wall time exceeded during container creation.", "environment": environment}, 200
            process = subprocess.Popen(self.docker + ["start", "-a", "-i", name], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=self.env)
            body = json.dumps(payload, allow_nan=False, ensure_ascii=False).encode()
            # Nonblocking pipes keep both input/output and the wall timeout bounded.
            selector = selectors.DefaultSelector()
            for pipe in (process.stdin, process.stdout, process.stderr):
                os.set_blocking(pipe.fileno(), False)
            selector.register(process.stdin, selectors.EVENT_WRITE, "stdin")
            selector.register(process.stdout, selectors.EVENT_READ, "stdout")
            selector.register(process.stderr, selectors.EVENT_READ, "stderr")
            buffers = {"stdout": bytearray(), "stderr": bytearray()}
            written, problem = 0, None
            try:
                while selector.get_map():
                    if time.monotonic() >= deadline:
                        problem = "timeout"
                        break
                    for key, _ in selector.select(0.05):
                        if key.data == "stdin":
                            try:
                                written += os.write(key.fileobj.fileno(), body[written:written + 8192])
                            except BrokenPipeError:
                                written = len(body)
                            if written == len(body):
                                selector.unregister(key.fileobj)
                                key.fileobj.close()
                        else:
                            chunk = os.read(key.fileobj.fileno(), 8192)
                            if not chunk:
                                selector.unregister(key.fileobj)
                            else:
                                buffers[key.data].extend(chunk)
                            if sum(map(len, buffers.values())) > OUTPUT_LIMIT:
                                problem = "output_limit"
                                break
                    if problem:
                        break
            finally:
                selector.close()
            if problem:
                return {"status": "timeout" if problem == "timeout" else "error", "outputs": [], "error": "Execution wall time exceeded." if problem == "timeout" else "Execution output limit exceeded.", "environment": environment}, 200
            process.wait(timeout=1)
            state = self.inspect_state(name)
            if state.get("OOMKilled"):
                return {"status": "error", "outputs": [], "error": "Container memory limit exceeded.", "environment": environment}, 200
            if process.returncode:
                # Docker diagnostics can reveal host internals. Keep these out of HTTP.
                return {"status": "error", "outputs": [], "error": "Isolated execution failed. Check trusted host engine logs.", "environment": environment}, 503
            response = strict_loads(buffers["stdout"])
            if not isinstance(response, dict) or response.get("status") not in {"ok", "error", "timeout"} or not isinstance(response.get("outputs"), list) or len(response["outputs"]) != len(payload["inputs"]):
                raise ValueError("Execution returned an invalid envelope.")
            validate_value(response)
            if not isinstance(response.get("environment"), dict) or not isinstance(response.get("logs", ""), str) or len(response.get("logs", "").encode()) > 16384:
                raise ValueError("Execution returned invalid metadata.")
            response["environment"] = {**response.get("environment", {}), **environment}
            response["durationMs"] = round((time.monotonic() - started) * 1000)
            # A hostile child can emit arbitrary output. It still cannot mark any
            # answer as correct: comparison belongs to the authenticated Site.
            return response, 200
        except (OSError, RuntimeError, ValueError, subprocess.TimeoutExpired, UnicodeError):
            return {"status": "error", "outputs": [], "error": "Execution engine unavailable or returned invalid JSON.", "environment": {"engine": "docker"}}, 503
        finally:
            # Stop launch/attach requests first, then remove the already-created
            # container. OOM status was inspected before reaching this cleanup.
            if process:
                try:
                    if process.poll() is None:
                        process.kill()
                    process.wait(timeout=2)
                except (OSError, subprocess.TimeoutExpired):
                    print("runner attach process cleanup failed for " + name, flush=True)
                for pipe in (process.stdin, process.stdout, process.stderr):
                    if pipe and not pipe.closed:
                        pipe.close()
            try:
                removed = self.command(["rm", "-f", name], timeout=5)
                if removed.returncode and b"No such container" not in removed.stderr:
                    print("runner cleanup failed for " + name, flush=True)
            except (OSError, subprocess.TimeoutExpired):
                # Host operators must alert on stale ai26.executor containers.
                print("runner cleanup failed for " + name, flush=True)
            self.slots.release()

    def health(self):
        # Real execution, every time. Docker info / process uptime is insufficient.
        result, status = self.execute({"code": "import numpy as np\nimport pandas as pd\nfrom sklearn.metrics import mean_squared_error\ndef solve(data):\n return float(mean_squared_error(data, np.asarray(pd.Series(data))))", "inputs": [[1, 2, 3]], "requirements": ["numpy", "scikit-learn", "pandas"]})
        ready = status == 200 and result["status"] == "ok" and result["outputs"] == [0.0]
        return {"ready": ready, "status": "ready" if ready else "unavailable", "environment": result.get("environment", {}), **({"error": result.get("error", "Engine smoke test failed.")} if not ready else {})}, 200 if ready else 503


def make_handler(runner, token):
    class Handler(BaseHTTPRequestHandler):
        server_version = "AI26Runner/1"

        def setup(self):
            super().setup()
            self.connection.settimeout(10)

        def log_message(self, *_):
            pass

        def send_error(self, code, message=None, explain=None):
            self.close_connection = True
            self.send_json({"status": "error", "outputs": [], "error": "HTTP request rejected.", "environment": {}}, code)

        def send_json(self, body, status):
            value = json.dumps(body, allow_nan=False, ensure_ascii=True).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(value)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(value)

        def authorized(self):
            headers = self.headers.get_all("Authorization", [])
            return len(headers) == 1 and hmac.compare_digest(headers[0].encode(), ("Bearer " + token).encode())

        def handle_authorization(self):
            if self.authorized():
                return True
            self.close_connection = True
            self.send_json({"status": "error", "outputs": [], "error": "Unauthorized.", "environment": {}}, 401)
            return False

        def do_GET(self):
            if not self.handle_authorization():
                return
            if self.path != "/health":
                self.send_json({"error": "Not found."}, 404)
                return
            result, status = runner.health()
            self.send_json(result, status)

        def do_POST(self):
            if not self.handle_authorization():
                return
            if self.path != "/run":
                self.send_json({"error": "Not found."}, 404)
                return
            try:
                if self.headers.get("Transfer-Encoding"):
                    raise ValueError("Chunked request bodies are not accepted.")
                lengths = self.headers.get_all("Content-Length", [])
                if len(lengths) != 1 or not lengths[0].isdigit():
                    raise ValueError("One Content-Length header is required.")
                length = int(lengths[0])
                if not 1 <= length <= BODY_LIMIT:
                    self.close_connection = True
                    self.send_json({"status": "error", "outputs": [], "error": "Body must contain 1–250000 bytes.", "environment": {}}, 413)
                    return
                if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
                    raise ValueError("Content-Type must be application/json.")
                raw = self.rfile.read(length)
                if len(raw) != length:
                    raise ValueError("Incomplete request body.")
                payload = validate_request(strict_loads(raw))
                result, status = runner.execute(payload)
                self.send_json(result, status)
            except (ValueError, UnicodeError, RecursionError):
                self.close_connection = True
                self.send_json({"status": "error", "outputs": [], "error": "Invalid request. Use bounded code, inputs, and approved requirements with strict JSON.", "environment": {}}, 400)
            except (TimeoutError, OSError):
                self.close_connection = True
    return Handler


def main():
    token = os.environ.get("GRADER_TOKEN", "")
    if len(token) < 32 or not token.isascii():
        raise SystemExit("Set a secret GRADER_TOKEN with at least 32 ASCII characters.")
    runner = Runner(image=os.environ.get("RUNNER_IMAGE", "ai26-python-runner:2026.10.2"), wall_seconds=int(os.environ.get("RUNNER_WALL_SECONDS", "30")), concurrency=int(os.environ.get("RUNNER_CONCURRENCY", "2")))
    server = ThreadingHTTPServer((os.environ.get("RUNNER_BIND", "127.0.0.1"), int(os.environ.get("PORT", "8080"))), make_handler(runner, token))
    server.daemon_threads = True
    print("AI26 runner listening; readiness requires authenticated /health execution.", flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
