#!/usr/bin/env python3
"""固定小输入、单线程数值检查、8 秒子进程超时；不是代码沙箱或性能测试。"""
import argparse
import hashlib
import json
import os
import pathlib
import platform
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent
for thread_option in ["OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"]:
    os.environ[thread_option] = "1"


def main():
    parser = argparse.ArgumentParser(description="NumPy → 线性层 → 手工梯度 → 单头 Attention；只用 CPU 合成小输入")
    parser.add_argument("task", choices=["arrays", "linear", "gradient", "attention"])
    parser.add_argument("--variant", choices=["practice", "transfer"], default="practice")
    parser.add_argument("--seed", type=int, default=137)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    args = parser.parse_args()
    if not 0 <= args.seed <= 1000000:
        parser.error("seed 必须在 0..1000000")
    if args.output.exists():
        parser.error("输出已存在；换新文件名保留修改前证据")
    report = dict(schema="mlsys-tensor-lab-v1", source="numpy-cpu-correctness-on-synthetic-data",
                  fixture_schema="mlsys-tensor-cases-v1", dtype="float64", task=args.task,
                  variant=args.variant, seed=args.seed, python=platform.python_version(), numpy=None,
                  learner_sha256=hashlib.sha256((ROOT/"learner.py").read_bytes()).hexdigest(),
                  fixture_sha256=hashlib.sha256((ROOT/"cases.json").read_bytes()).hexdigest(),
                  limitations="本地数值正确性回执，不是训练/性能/GPU测量；公开变式不证明独立掌握。")
    cases = []
    try:
        import numpy as np
        report["numpy"] = np.__version__
    except ImportError:
        report.update(status="dependency-unavailable", diagnostic="本解释器缺 NumPy；按指南检查独立环境。没有执行检查，不能记通过。")
    if report["numpy"]:
        with tempfile.TemporaryFile() as stdout, tempfile.TemporaryFile() as stderr:
            try:
                result = subprocess.run([sys.executable, "-B", str(ROOT/"test_lab.py"), "--task", args.task,
                                         "--variant", args.variant, "--seed", str(args.seed)],
                                        cwd=ROOT, stdout=stdout, stderr=stderr, timeout=8)
                stdout.seek(0)
                encoded = stdout.read(40001)
                payload = json.loads(encoded) if result.returncode == 0 and len(encoded) <= 40000 else {}
                cases = payload.get("cases", [])
                if not cases:
                    raise ValueError("检查进程未产生有效回执；先检查导入、语法与诊断")
                report["status"] = "passed" if all(c["passed"] for c in cases) else "needs-work"
                if report["status"] == "passed":
                    report.update(example_source="cases.json presented example, not the transfer input", example=payload["example"])
            except subprocess.TimeoutExpired:
                report.update(status="timed-out", diagnostic="超过 8 秒；检查是否有不推进的循环。没有完成检查。")
            except (ValueError, KeyError) as exc:
                report.update(status="needs-work", diagnostic=str(exc))
            stderr.seek(0)
            diagnostic = stderr.read(1500).decode("utf-8", errors="replace")
            if diagnostic:
                print(diagnostic, file=sys.stderr)
    report["checks"] = dict(total=len(cases), passed=sum(c["passed"] for c in cases),
                            failed=sum(not c["passed"] for c in cases), cases=cases)
    try:
        with args.output.open("x", encoding="utf-8") as handle:
            json.dump(report, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.write("\n")
    except OSError as exc:
        parser.error(f"无法创建新回执：{exc}")
    for case in cases:
        print(f"{'OK' if case['passed'] else '需修复'} {case['id']}: {case['purpose']} {case['feedback']}")
    print(f"{report['status']}: {report['checks']['passed']}/{len(cases)} 组；公开检查不认证独立性。")
    return 0 if report["status"] == "passed" else 2 if report["status"] == "dependency-unavailable" else 1


if __name__ == "__main__":
    raise SystemExit(main())
