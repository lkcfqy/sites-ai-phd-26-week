#!/usr/bin/env python3
"""Fixed-source, CPU-only C++ teaching runner. No network, pip, shell, or GPU calls."""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import shutil
import statistics
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parent
COMMANDS = {"basics": "basics", "memory": "layout", "threads": "threads", "matmul": "matmul", "selftest": "selftest"}
MAX_LOG = 64_000

def bounded_int(low: int, high: int):
    def parse(value: str) -> int:
        number = int(value)
        if not low <= number <= high:
            raise argparse.ArgumentTypeError(f"must be {low}..{high}")
        return number
    return parse

def run_process(command: list[str], timeout: int) -> dict:
    start = time.monotonic()
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, timeout=timeout, shell=False)
    return {"argv": command, "exit_code": result.returncode,
            "elapsed_seconds": time.monotonic() - start,
            "stdout": result.stdout[:MAX_LOG], "stderr": result.stderr[:MAX_LOG],
            "log_truncated": len(result.stdout) > MAX_LOG or len(result.stderr) > MAX_LOG}

def summarize(values: list[float]) -> dict:
    if not values or any(not math.isfinite(x) or x < 0 for x in values):
        raise ValueError("invalid timing samples")
    ordered = sorted(values)
    return {"count": len(values), "median_ms": statistics.median(values),
            "p95_nearest_rank_ms": ordered[math.ceil(.95*len(ordered))-1],
            "small_sample_warning": "3..15 samples do not estimate a production P95 reliably"}

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=[*COMMANDS, "all"])
    parser.add_argument("--output", required=True, type=Path, help="New .json path; refuses overwrite; parent must exist")
    parser.add_argument("--size", type=bounded_int(2, 128), default=64)
    parser.add_argument("--repeats", type=bounded_int(3, 15), default=7)
    parser.add_argument("--workers", type=int, choices=[1, 2, 4, 8], default=4)
    parser.add_argument("--elements", type=bounded_int(1, 1_000_000), default=100_000)
    parser.add_argument("--tile", type=bounded_int(1, 64), default=8)
    parser.add_argument("--sanitize", nargs="?", const="undefined", choices=["undefined", "address-undefined"], help="Diagnostic build: default UBSan, or combined ASan+UBSan; not comparable performance")
    args = parser.parse_args()
    if not __debug__:
        parser.error("do not use python -O; validation must remain enabled")
    if args.output.suffix.lower() != ".json":
        parser.error("--output must end in .json")
    if not args.output.parent.is_dir():
        parser.error("output parent directory does not exist")
    if args.output.exists() or args.output.is_symlink():
        parser.error("output already exists; use a new name")
    compiler = shutil.which("g++")
    if not compiler:
        parser.error("g++ not found. This runner does not install a compiler. Use an already approved C++17 environment.")
    sources = [ROOT/"src"/name for name in ["basics.cpp", "matrix.cpp", "parallel.cpp", "main.cpp"]]
    for source in [*sources, ROOT/"include/lab.hpp"]:
        if not source.is_file():
            parser.error(f"missing bundle file: {source.relative_to(ROOT)}; extract the entire ZIP")
    report = {
        "schema": "mlsys-cpp-labs-v1", "status": "running", "evidence_kind": "cpu-diagnostic" if args.sanitize else "cpu-measured",
        "verification": "local-reference-tests-not-independent-authorship",
        "environment": {"python": sys.version, "platform": platform.platform(), "machine": platform.machine(),
                        "processor": platform.processor(), "logical_cpu_count": os.cpu_count(), "compiler": compiler},
        "generated_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "parameters": {k: v for k,v in vars(args).items() if k != "output"},
        "source_sha256": {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in [*sources, ROOT/"include/lab.hpp", ROOT/"run.py"]},
        "processes": [], "labs": [],
        "limits": {"compile_step_timeout_seconds": 30, "execution_step_timeout_seconds": 30,
                   "max_compile_steps": 5, "max_execution_steps": 4, "max_matrix_side": 128, "max_elements": 1_000_000, "max_threads": 8},
        "limitations": ["Reference implementations are included; passing does not prove independent authorship or job readiness.",
                        "CPU microbenchmarks on synthetic numeric data; no BLAS, PyTorch, real LLM, CUDA or production service.",
                        "Matrix timing includes checked access, output allocation, checksum and destruction. Thread timing includes thread creation and joining.",
                        "No cache flush or affinity control; thermal state, VM scheduling and background load may affect results.",
                        "Sanitizer results are diagnostic only; small-sample P95 is not a production tail estimate."]
    }
    # Exclusive creation provides a second check against races or symlink replacement.
    try:
        output = args.output.open("x", encoding="utf-8")
    except FileExistsError:
        parser.error("output exists; no file was overwritten")
    exit_code = 1
    with output:
        try:
            version = run_process([compiler, "--version"], 10)
            report["processes"].append(version)
            if version["exit_code"] != 0:
                raise RuntimeError("could not query compiler")
            report["environment"]["compiler_version"] = version["stdout"].splitlines()[0]
            with tempfile.TemporaryDirectory(prefix="mlsys-cpp-") as build_dir:
                build = Path(build_dir)
                flags = ["-std=c++17", "-Wall", "-Wextra", "-Wpedantic", "-pthread"]
                if args.sanitize:
                    kind = "undefined" if args.sanitize == "undefined" else "address,undefined"
                    flags += ["-O1", "-g", f"-fsanitize={kind}", "-fno-sanitize-recover=all", "-fno-omit-frame-pointer"]
                else:
                    flags += ["-O2"]
                objects = []
                for source in sources:
                    obj = build/(source.stem+".o")
                    command = [compiler, *flags, "-I", str(ROOT/"include"), "-c", str(source), "-o", str(obj)]
                    result = run_process(command, 30)
                    report["processes"].append(result)
                    if result["exit_code"] != 0: raise RuntimeError(f"compile failed: {source.name}; see stderr")
                    objects.append(str(obj))
                binary = build/"lab"
                result = run_process([compiler, *flags, *objects, "-o", str(binary)], 30)
                report["processes"].append(result)
                if result["exit_code"] != 0: raise RuntimeError("link failed; see stderr")
                requested = ["basics", "memory", "threads", "matmul"] if args.command == "all" else [args.command]
                for label in requested:
                    result = run_process([str(binary), COMMANDS[label], str(args.size), str(args.repeats),
                                          str(args.workers), str(args.elements), str(args.tile)], 30)
                    report["processes"].append(result)
                    if result["exit_code"] != 0: raise RuntimeError(f"lab failed: {label}; see stderr")
                    data = json.loads(result["stdout"])
                    data["requested_lab"] = label
                    if "baseline_samples_ms" in data:
                        data["baseline_summary"] = summarize(data["baseline_samples_ms"])
                        data["candidate_summary"] = summarize(data["candidate_samples_ms"])
                        base, candidate = data["baseline_summary"]["median_ms"], data["candidate_summary"]["median_ms"]
                        data["speedup_baseline_over_candidate"] = base/candidate if candidate else None
                        data["latency_reduction_fraction"] = 1-candidate/base if base else None
                    if "serial_samples_ms" in data:
                        data["serial_summary"] = summarize(data["serial_samples_ms"])
                        for scan in data["scan"]:
                            scan["summary"] = summarize(scan["samples_ms"])
                    report["labs"].append(data)
            report["status"] = "passed"
            report["tests_passed_total"] = sum(x["tests_passed"] for x in report["labs"])
            exit_code = 0
        except (OSError, RuntimeError, ValueError, subprocess.TimeoutExpired) as error:
            report["status"] = "failed"
            report["error"] = f"{type(error).__name__}: {error}"
            if isinstance(error, subprocess.TimeoutExpired):
                report["timeout_command"] = list(error.cmd)
                report["timeout_seconds"] = error.timeout
        finally:
            json.dump(report, output, ensure_ascii=False, indent=2, allow_nan=False)
            output.write("\n")
    print(json.dumps({"status": report["status"], "output": str(args.output),
                      "labs": len(report["labs"]), "tests_passed": report.get("tests_passed_total", 0)}, ensure_ascii=False))
    return exit_code

if __name__ == "__main__":
    raise SystemExit(main())
