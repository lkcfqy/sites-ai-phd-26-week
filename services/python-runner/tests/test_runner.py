import http.client
import hashlib
from contextlib import ExitStack
import json
import os
from pathlib import Path
import sys
import threading
import unittest
from unittest import mock
from http.server import ThreadingHTTPServer

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import Runner, make_handler, strict_loads, validate_request


class ValidationTests(unittest.TestCase):
    def test_normal_request(self):
        request = {"code": "def solve(x): return x", "inputs": [[1, 2]], "requirements": ["numpy"]}
        self.assertEqual(validate_request(request), request)

    def test_rejects_answer_and_packages(self):
        for extra in ({"expected": [1]}, {"requirements": ["requests"]}):
            with self.subTest(extra=extra), self.assertRaises(ValueError):
                validate_request({"code": "def solve(x): return x", "inputs": [1], **extra})

    def test_limits(self):
        for inputs, code in (([], "pass"), ([1] * 11, "pass"), ([1], "x" * 100001), ([1], "pass\x00")):
            with self.subTest(inputs=inputs), self.assertRaises(ValueError):
                validate_request({"code": code, "inputs": inputs})

    def test_strict_json(self):
        for value in ("NaN", "Infinity", "-Infinity"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                strict_loads('{"input":' + value + '}')
        with self.assertRaises(ValueError):
            validate_request({"code": "pass", "inputs": [float("nan")]})


class FakeRunner:
    def execute(self, body):
        return {"outputs": body["inputs"], "status": "ok", "environment": {}}, 200

    def health(self):
        return {"ready": False, "status": "unavailable", "environment": {}}, 503


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(FakeRunner(), "t" * 32))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=1)

    def request(self, path, payload=None, token="t" * 32, **headers):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        body = json.dumps(payload) if payload is not None else None
        connection.request("POST" if payload is not None else "GET", path, body=body, headers={"Authorization": "Bearer " + token, "Content-Type": "application/json", **headers})
        response = connection.getresponse()
        result = response.status, strict_loads(response.read())
        connection.close()
        return result

    def test_requires_auth_before_execution(self):
        status, _ = self.request("/run", {"code": "pass", "inputs": [1]}, token="wrong")
        self.assertEqual(status, 401)

    def test_run_contract(self):
        status, body = self.request("/run", {"code": "def solve(x): return x", "inputs": [1]})
        self.assertEqual(status, 200)
        self.assertEqual(body["outputs"], [1])

    def test_unready_health_not_success(self):
        self.assertEqual(self.request("/health")[0], 503)

    def test_bad_request(self):
        self.assertEqual(self.request("/run", {"code": "pass", "inputs": [1], "expected": [1]})[0], 400)

    def test_body_size(self):
        self.assertEqual(self.request("/run", {"code": "pass", "inputs": [1]}, **{"Content-Length": "250001"})[0], 413)


@unittest.skipUnless(os.environ.get("RUN_DOCKER_TESTS") == "1", "Set RUN_DOCKER_TESTS=1 for real container validation.")
class DockerTests(unittest.TestCase):
    def setUp(self):
        self.runner = Runner()

    def run_code(self, code, inputs=(1,), requirements=()):
        response, status = self.runner.execute({"code": code, "inputs": list(inputs), "requirements": list(requirements)})
        self.assertEqual(status, 200, response)
        return response

    def test_valid_numpy_and_independent_cases(self):
        result = self.run_code("import numpy as np\ncounter=0\ndef solve(x):\n global counter\n counter+=1\n return {'sum':int(np.sum(x)), 'counter':counter}", inputs=([1, 2], [3, 4]), requirements=("numpy",))
        self.assertEqual(result["status"], "ok", result)
        self.assertEqual(result["outputs"], [{"sum": 3, "counter": 1}, {"sum": 7, "counter": 1}])

    def test_valid_pandas(self):
        result = self.run_code("import pandas as pd\ndef solve(x):\n return {'sum':int(pd.Series(x).sum()),'count':len(x)}", inputs=([1, 2, 3], [4]), requirements=("pandas==2.2.3",))
        self.assertEqual(result["status"], "ok", result)
        self.assertEqual(result["outputs"], [{"sum": 6, "count": 3}, {"sum": 4, "count": 1}])
        self.assertEqual(result["environment"]["pandas"], "2.2.3")

    def test_exception(self):
        result = self.run_code("def solve(x): raise ValueError('bad input')")
        self.assertEqual(result["status"], "error", result)
        self.assertIn("bad input", result["error"])

    def test_infinite_loop(self):
        result = self.run_code("def solve(x):\n while True: pass")
        self.assertIn(result["status"], ("timeout", "error"), result)
        # Includes VFS image-copy/creation time; use the configured job budget
        # plus bounded cleanup, not a hardware-specific 12s benchmark.
        self.assertLess(result["durationMs"], (self.runner.wall_seconds + 5) * 1000)

    def test_network_syscall_blocked(self):
        result = self.run_code("import socket\ndef solve(x):\n try:\n  socket.socket()\n except PermissionError:\n  return {'networkBlocked':True}\n return {'networkBlocked':False}")
        self.assertEqual(result["outputs"], [{"networkBlocked": True}], result)

    def test_filesystem_read_only(self):
        result = self.run_code("def solve(x):\n open('/opt/runner/injected.py','w').write('bad')\n return True")
        self.assertEqual(result["status"], "error", result)
        self.assertIn("Read-only", result["error"])

    def test_memory_limit(self):
        result = self.run_code("def solve(x):\n a=bytearray(900*1024*1024)\n return len(a)")
        self.assertEqual(result["status"], "error", result)

    def test_pid_limit(self):
        result = self.run_code("import os,time\ndef solve(x):\n for i in range(160):\n  try:\n   pid=os.fork()\n  except BlockingIOError:\n   return {'pidsBlocked':True}\n  if pid==0:\n   time.sleep(20)\n   os._exit(0)\n return {'pidsBlocked':False}")
        self.assertEqual(result["outputs"], [{"pidsBlocked": True}], result)

    def test_stdout_limit(self):
        result = self.run_code("import os\ndef solve(x):\n os.write(1,b'x'*70000)\n return x")
        self.assertEqual(result["status"], "error", result)

    def test_nan_output_rejected(self):
        result = self.run_code("def solve(x): return float('nan')")
        self.assertEqual(result["status"], "error", result)

    def test_real_health(self):
        response, status = self.runner.health()
        self.assertEqual(status, 200, response)
        self.assertTrue(response["ready"], response)

    def test_missing_image_is_unready(self):
        response, status = Runner(image="ai26-image-that-does-not-exist:test").health()
        self.assertEqual(status, 503)
        self.assertFalse(response["ready"])

    def test_http_error_and_timeout_receipts_bound_to_submission(self):
        for kind, wall_seconds, code, expected_status in (
            ("exception", 30, "def solve(x): raise ValueError('receipt check')", "error"),
            ("timeout", 1, "import time\ndef solve(x):\n time.sleep(20)\n return x", "timeout"),
            ("memory", 30, "def solve(x):\n a=bytearray(900*1024*1024)\n return len(a)", "error"),
        ):
            with self.subTest(kind=kind):
                runner = Runner(wall_seconds=wall_seconds)
                token = "h" * 32
                server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(runner, token))
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                try:
                    payload = {"code": code, "inputs": [{"x": 2}], "requirements": []}
                    connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=45)
                    connection.request("POST", "/run", body=json.dumps(payload), headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
                    response = connection.getresponse()
                    body = strict_loads(response.read())
                    connection.close()
                    self.assertEqual(response.status, 200, body)
                    self.assertEqual(body["status"], expected_status, body)
                    self.assertIn("error", body)
                    self.assertEqual(body["codeSha256"], hashlib.sha256(code.encode()).hexdigest())
                    self.assertEqual(body["inputSha256"], hashlib.sha256(json.dumps(payload["inputs"], sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest())
                finally:
                    server.shutdown()
                    server.server_close()
                    thread.join(timeout=1)

    def test_http_early_oom_and_output_limit_receipts_bound_to_submission(self):
        # The memory test above verifies real cgroup enforcement. Force the
        # container-state flag here to reach the distinct early OOM HTTP branch;
        # lower only the host output cap to reach its early-return branch too.
        for kind in ("container-oom", "container-output-limit"):
            with self.subTest(kind=kind), ExitStack() as patches:
                runner = Runner()
                if kind == "container-oom":
                    patches.enter_context(mock.patch.object(runner, "inspect_state", return_value={"OOMKilled": True}))
                else:
                    patches.enter_context(mock.patch("server.OUTPUT_LIMIT", 1))
                token = "b" * 32
                server = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(runner, token))
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                try:
                    payload = {"code": "def solve(x): return x", "inputs": [3], "requirements": []}
                    connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=40)
                    connection.request("POST", "/run", body=json.dumps(payload), headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
                    response = connection.getresponse()
                    body = strict_loads(response.read())
                    connection.close()
                    self.assertEqual(response.status, 200, body)
                    self.assertEqual(body["status"], "error", body)
                    self.assertEqual(body["outputs"], [], body)
                    self.assertIn("memory" if kind == "container-oom" else "output", body["error"])
                    self.assertEqual(body["codeSha256"], hashlib.sha256(payload["code"].encode()).hexdigest())
                    self.assertEqual(body["inputSha256"], hashlib.sha256(b"[3]").hexdigest())
                finally:
                    server.shutdown()
                    server.server_close()
                    thread.join(timeout=1)


if __name__ == "__main__":
    unittest.main()
