"""Untrusted-code child. This process has no authority to grade an answer.

The container, seccomp profile, and host enforce the security boundary; Python
AST checks or import restrictions are deliberately not used as a sandbox.
"""
import contextlib
import io
import json
import os
import resource
import sys


class LimitedText(io.TextIOBase):
    def __init__(self):
        self.parts = []
        self.remaining = 2048

    def write(self, value):
        value = str(value)
        if self.remaining:
            self.parts.append(value[: self.remaining])
            self.remaining -= min(len(value), self.remaining)
        return len(value)

    def flush(self):
        pass

    def getvalue(self):
        return "".join(self.parts)


def main():
    resource.setrlimit(resource.RLIMIT_CPU, (2, 3))
    resource.setrlimit(resource.RLIMIT_FSIZE, (1048576, 1048576))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    payload = json.loads(sys.stdin.buffer.read(250001))
    output_file = os.fdopen(os.dup(1), "w", encoding="utf-8")
    captured = LimitedText()
    try:
        namespace = {"__name__": "__learner__"}
        with contextlib.redirect_stdout(captured), contextlib.redirect_stderr(captured):
            exec(compile(payload["code"], "learner.py", "exec"), namespace)
            solve = namespace.get("solve")
            if not callable(solve):
                raise ValueError("Define solve(value), returning a JSON-compatible value.")
            output = solve(payload["input"])
            # Strict JSON output: NaN/Infinity and non-JSON Python objects fail.
            encoded = json.dumps({"output": output, "error": None, "stdout": captured.getvalue()}, allow_nan=False, ensure_ascii=True)
            if len(encoded.encode("utf-8")) > 16384:
                raise ValueError("Output exceeds 16 KiB.")
    except BaseException as exc:
        encoded = json.dumps({"output": None, "error": {"code": "EXECUTION_ERROR", "type": type(exc).__name__, "message": str(exc)[:1000]}, "stdout": captured.getvalue()}, allow_nan=False, ensure_ascii=True)
    output_file.write(encoded)
    output_file.flush()


if __name__ == "__main__":
    main()
