#!/usr/bin/env python3
"""有界的本地练习入口：固定测试、5 秒子进程超时、独占结果文件。不是代码沙箱。"""
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


def main():
    parser = argparse.ArgumentParser(description="离线日志排障练习；只检查你本地的 learner.py，不联网、不计 GPU 性能。")
    parser.add_argument("task", choices=["mean", "records", "tail"], help="累积检查：records 包含 mean，tail 包含前两项")
    parser.add_argument("--variant", choices=["practice", "transfer"], default="practice")
    parser.add_argument("--output", type=pathlib.Path, required=True, help="新 JSON 路径；拒绝覆盖")
    args = parser.parse_args()
    if args.output.exists():
        parser.error("输出已存在，请换文件名以保留旧证据")
    report = dict(schema="mlsys-log-lab-v1", source="local-python-checks-on-synthetic-data",
                  fixture_schema="mlsys-log-cases-v1", unit="ms", task=args.task, variant=args.variant,
                  python=platform.python_version(), learner_sha256=hashlib.sha256((ROOT / "learner.py").read_bytes()).hexdigest(),
                  fixture_sha256=hashlib.sha256((ROOT / "cases.json").read_bytes()).hexdigest(),
                  limitations="公开测试对本地代码的检查回执；非硬件测量，不证明独立完成或岗位胜任。")
    # 临时文件避免把学习代码的意外大量打印全部读入内存。
    with tempfile.TemporaryFile() as stdout, tempfile.TemporaryFile() as stderr:
        try:
            result = subprocess.run([sys.executable, "-B", str(ROOT / "test_lab.py"), "--task", args.task,
                                     "--variant", args.variant], cwd=ROOT, stdout=stdout, stderr=stderr,
                                    timeout=5, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
            stdout.seek(0)
            encoded = stdout.read(20001)
            checks = json.loads(encoded) if result.returncode == 0 and len(encoded) <= 20000 else []
            if not checks:
                raise ValueError("检查进程没有产生有效回执；检查语法或导入错误")
            report["status"] = "passed" if all(c["passed"] for c in checks) else "needs-work"
        except subprocess.TimeoutExpired:
            checks = []
            report["status"] = "timed-out"
            report["diagnostic"] = "超过 5 秒；先检查循环是否推进或递归是否有出口，再重跑。"
        except (ValueError, KeyError) as exc:
            checks = []
            report["status"] = "needs-work"
            report["diagnostic"] = str(exc)
        stderr.seek(0)
        diagnostic = stderr.read(1500).decode("utf-8", errors="replace")
        if diagnostic:
            print(diagnostic, file=sys.stderr)
    report["checks"] = dict(total=len(checks), passed=sum(c["passed"] for c in checks),
                            failed=sum(not c["passed"] for c in checks), cases=checks)
    try:
        with args.output.open("x", encoding="utf-8") as handle:
            json.dump(report, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.write("\n")
    except OSError as exc:
        parser.error(f"无法创建新结果文件：{exc}")
    for case in checks:
        print(f"{'OK' if case['passed'] else '需修复'} {case['id']}: {case['purpose']} {case['feedback']}")
    print(f"{report['status']}: {report['checks']['passed']}/{len(checks)} 组；结果已保存。失败回执也是证据。")
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
