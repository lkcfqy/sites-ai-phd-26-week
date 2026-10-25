#!/usr/bin/env python3
"""Bounded, offline CPU assessment. Run only code you have read and chosen to trust.

The timeout is an operational limit, NOT a security sandbox for untrusted Python.
No network, installation, GPU, private data or hidden examination service is used.
"""
import argparse
import hashlib
import importlib.util
import json
import math
import os
import signal
import tempfile
import threading
import platform
import subprocess
import sys
from pathlib import Path

FAMILIES = ('trace', 'partition', 'decision')
CONTRACTS = {
    'trace': 'analyze(rows): validate unique integer ids, boolean ok and finite nonnegative ms; reject empty/no-success data. Return successful count, errors and nearest-rank p95_ms over successful requests only. Do not silently discard malformed rows.',
    'partition': 'partition(n, workers): nonnegative integer n, workers 1..8; reject booleans. Return [start,end) chunks covering every index exactly once, at most workers chunks, no empty chunks, balanced sizes (difference <=1); earliest chunks receive remainder elements, ordered by start. Empty n returns [].',
    'decision': 'choose(candidates, slo_ms, min_quality, memory_bytes): retain candidates satisfying all three budgets. Return the feasible name with smallest p95_ms (alphabetical tie break), or None. Reject malformed candidates and impossible numeric inputs; never change a budget to make a candidate pass.',
}
STARTER = '''"""Deliberately faulty starter. Read task.json; fix logic and add your own regressions.
These examples are not production code. Keep the original output before changes.
"""
import math

def analyze(rows):
    # Faulty: an average over every row is not successful-request p95.
    return {"successful": len(rows), "errors": 0,
            "p95_ms": sum(row["ms"] for row in rows) / len(rows)}

def partition(n, workers):
    # Faulty: remainder and empty chunks need explicit handling.
    width = n // workers
    return [[i * width, (i + 1) * width] for i in range(workers)]

def choose(candidates, slo_ms, min_quality, memory_bytes):
    # Faulty: fastest alone ignores quality and memory constraints.
    return min(candidates, key=lambda row: row["p95_ms"])["name"]
'''

def numeric(value, minimum=0):
    return type(value) in (float, int) and math.isfinite(value) and value >= minimum

def oracle(family, args):
    if family == 'trace':
        rows, = args
        if not isinstance(rows, list) or not rows: raise ValueError('nonempty rows required')
        seen = set(); values = []
        for row in rows:
            if not isinstance(row, dict) or type(row.get('id')) is not int or row['id'] in seen or type(row.get('ok')) is not bool or not numeric(row.get('ms')): raise ValueError('invalid request row')
            seen.add(row['id'])
            if row['ok']: values.append(row['ms'])
        if not values: raise ValueError('no successful requests')
        return {'successful': len(values), 'errors': len(rows)-len(values), 'p95_ms': sorted(values)[math.ceil(.95*len(values))-1]}
    if family == 'partition':
        n, workers = args
        if type(n) is not int or type(workers) is not int or n < 0 or not 1 <= workers <= 8: raise ValueError('invalid partition dimensions')
        chunks = []; start = 0
        for i in range(min(n, workers)):
            length = n // workers + (1 if i < n % workers else 0)
            chunks.append([start, start+length]); start += length
        return chunks
    candidates, slo, quality, memory = args
    if not isinstance(candidates, list) or not numeric(slo) or not numeric(quality) or quality > 1 or type(memory) is not int or memory < 0: raise ValueError('invalid budgets')
    seen = set(); feasible = []
    for row in candidates:
        if not isinstance(row, dict) or not isinstance(row.get('name'), str) or not row['name'] or row['name'] in seen or not numeric(row.get('p95_ms')) or not numeric(row.get('quality')) or row['quality'] > 1 or type(row.get('memory_bytes')) is not int or row['memory_bytes'] < 0: raise ValueError('invalid candidate')
        seen.add(row['name'])
        if row['p95_ms'] <= slo and row['quality'] >= quality and row['memory_bytes'] <= memory: feasible.append(row)
    return min(feasible, key=lambda row: (row['p95_ms'], row['name']))['name'] if feasible else None

def cases(family, seed, case_version=2):
    # Fixed boundary cases plus new deterministic conditions. Open source, not secret tests.
    value = seed
    def draw(limit):
        nonlocal value
        value = (1664525*value+1013904223) % (2**32)
        return value % limit
    if family == 'trace':
        rows = [{'id': i, 'ok': i % 7 != 0, 'ms': 3+draw(70)} for i in range(23 if case_version == 1 else 31)]
        rows[21 if case_version == 1 else 29]['ms'] = 180+draw(200)
        return [[rows], [[{'id': 0, 'ok': True, 'ms': 0}]], [[]], [[{'id': 0, 'ok': False, 'ms': 5}]], [[{'id': 0, 'ok': True, 'ms': -1}]], [[{'id': 0, 'ok': True, 'ms': True}]], [[{'id': 1, 'ok': True, 'ms': 3}, {'id': 1, 'ok': False, 'ms': 4}]]]
    if family == 'partition':
        return [[17+draw(29), 2+draw(6)], [0, 4], [1, 8], [7, 3], [-1, 2], [4, 0], [True, 2], [10, 9]]
    candidates = [{'name': 'fast-risky', 'p95_ms': 2+draw(10), 'quality': .7, 'memory_bytes': 300 if case_version == 1 else 128}, {'name': 'baseline', 'p95_ms': 30+draw(10), 'quality': .94, 'memory_bytes': 200}, {'name': 'balanced', 'p95_ms': 15+draw(10), 'quality': .93, 'memory_bytes': 160}, {'name': 'oversized', 'p95_ms': 10, 'quality': .99, 'memory_bytes': 1000}]
    return [[candidates, 45, .9, 256], [candidates, 1, .9, 256], [[], 10, .9, 256], [[{'name': 'a', 'p95_ms': 1, 'quality': .95, 'memory_bytes': 16}, {'name': 'b', 'p95_ms': 1, 'quality': .95, 'memory_bytes': 16}], 1, .95, 16], [candidates, 45, 1.1, 256], [candidates, True, .9, 256], [[{'name': 'broken', 'p95_ms': -1, 'quality': .95, 'memory_bytes': 16}], 10, .9, 256]]

def outcome(call):
    try: return {'value': call(), 'error': None}
    except Exception as error: return {'value': None, 'error': type(error).__name__}

def evaluate(directory, reference):
    task = json.loads((directory/'task.json').read_text())
    seed = task['seed']; family = task['family']; case_version = task.get('case_version', 1)
    if type(seed) is not int or not 1 <= seed <= 2147483647 or family not in FAMILIES or case_version not in (1, 2): raise ValueError('invalid task')
    source = Path(__file__) if reference else directory/'learner.py'
    if source.stat().st_size > 100000: raise ValueError('source too large')
    if reference: function = lambda *args: oracle(family, args)
    else:
        spec = importlib.util.spec_from_file_location('assessment_learner', source)
        learner = importlib.util.module_from_spec(spec); spec.loader.exec_module(learner)
        function = getattr(learner, {'trace': 'analyze', 'partition': 'partition', 'decision': 'choose'}[family])
    rows = []
    for i, args in enumerate(cases(family, seed, case_version)):
        # Fresh input for each side, so a learner mutation cannot change the oracle.
        expected = outcome(lambda: oracle(family, json.loads(json.dumps(args))))
        actual = outcome(lambda: function(*json.loads(json.dumps(args))))
        rows.append({'id': i, 'args': args, 'actual': actual, 'expected': expected, 'passed': actual == expected})
    return {'schema': 'mlsys-assessment-v1', 'family': family, 'seed': seed, 'case_version': case_version, 'source_kind': 'reference' if reference else 'learner', 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'input_provenance': 'synthetic-task-inputs', 'hardwareExecutionVerified': False, 'realDeviceGateSatisfied': False, 'python': platform.python_version(), 'platform': platform.platform(), 'tests': rows, 'passed': all(row['passed'] for row in rows), 'limits': 'Open deterministic tests; no proof of authorship, independence, runtime isolation or job competence.'}

class BoundedCapture:
    """Drain a pipe fully while retaining a bounded head/tail for ordinary debugging."""
    def __init__(self, stream, limit=4096):
        self.stream = stream; self.limit = limit; self.head = b''; self.tail = b''; self.total = 0

    def collect(self):
        while True:
            chunk = self.stream.read(4096)
            if not chunk: break
            self.total += len(chunk)
            missing = self.limit // 2 - len(self.head)
            if missing > 0: self.head += chunk[:missing]
            self.tail = (self.tail + chunk)[-self.limit // 2:]

    def value(self):
        if self.total <= self.limit // 2: data = self.head
        elif self.total <= self.limit: data = self.head + self.tail[-(self.total-len(self.head)):]
        else: data = self.head + b'\n... diagnostic output truncated ...\n' + self.tail
        return {'text': data.decode('utf-8', errors='replace'), 'bytes': self.total, 'truncated': self.total > self.limit}


def run_evaluation(directory, reference, timeout_seconds):
    task = json.loads((directory/'task.json').read_text())
    family, seed, case_version = task['family'], task['seed'], task.get('case_version', 1)
    if family not in FAMILIES or type(seed) is not int or not 1 <= seed <= 2147483647 or case_version not in (1, 2):
        raise ValueError('invalid task metadata')
    source = Path(__file__) if reference else directory/'learner.py'
    if source.stat().st_size > 100000: raise ValueError('source too large')
    metadata = {'schema': 'mlsys-assessment-v1', 'family': family, 'seed': seed, 'case_version': case_version,
                'source_kind': 'reference' if reference else 'learner',
                'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                'input_provenance': 'synthetic-task-inputs', 'hardwareExecutionVerified': False,
                'realDeviceGateSatisfied': False, 'python': platform.python_version(), 'platform': platform.platform()}
    status = 'completed'; message = ''; report = None
    with tempfile.TemporaryDirectory(prefix='mlsys-assessment-protocol-') as temporary:
        machine = Path(temporary)/'report.json'
        command = [sys.executable, '-B', str(Path(__file__).resolve()), '_evaluate',
                   '--directory', str(directory), '--report-file', str(machine)]
        if reference: command.append('--reference')
        child = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
        captures = [BoundedCapture(child.stdout), BoundedCapture(child.stderr)]
        readers = [threading.Thread(target=capture.collect, daemon=True) for capture in captures]
        for reader in readers: reader.start()
        try:
            code = child.wait(timeout=timeout_seconds)
        except subprocess.TimeoutExpired:
            status = 'timeout'; message = f'Execution exceeded {timeout_seconds:g} seconds. Inspect loops or blocking calls; this is not a security sandbox.'
            if hasattr(os, 'killpg'): os.killpg(child.pid, signal.SIGKILL)
            else: child.kill()
            child.wait(timeout=3)
            code = child.returncode
        for reader in readers: reader.join(timeout=1)
        if status == 'completed' and code != 0:
            status = 'failed'; message = f'Python worker exited {code}; inspect the bounded stderr traceback and learner.py line number.'
        if status == 'completed':
            try:
                if machine.stat().st_size > 100000: raise ValueError('machine result exceeds 100000 bytes')
                report = json.loads(machine.read_text())
                if not isinstance(report, dict) or any(report.get(key) != metadata[key] for key in ['schema', 'family', 'seed', 'case_version']):
                    raise ValueError('machine result metadata does not match the task')
                if not isinstance(report.get('tests'), list) or type(report.get('passed')) is not bool:
                    raise ValueError('machine result is missing tests/passed')
            except (OSError, ValueError, TypeError) as error:
                status = 'invalid-result'; message = type(error).__name__ + ': ' + str(error)[:1800]
        stdout, stderr = [capture.value() for capture in captures]
    if report is None or status != 'completed':
        report = {**metadata, 'tests': [], 'passed': False,
                  'limits': 'Execution did not complete. No test success is inferred; keep diagnostics and create a new retry artifact.'}
    report['execution'] = {'status': status, 'message': message[:2000], 'stdout': stdout['text'], 'stderr': stderr['text'],
                           'stdout_truncated': stdout['truncated'], 'stderr_truncated': stderr['truncated']}
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    create = sub.add_parser('create'); create.add_argument('--seed', type=int, required=True); create.add_argument('--family', choices=FAMILIES, required=True); create.add_argument('--directory', required=True)
    create.add_argument('--case-version', type=int, choices=[1, 2], default=2, help='2 is current; 1 is for reproducing saved historical tasks')
    check = sub.add_parser('check'); check.add_argument('--directory', required=True); check.add_argument('--output', required=True); check.add_argument('--reference', action='store_true')
    check.add_argument('--timeout-seconds', type=float, default=10, help='0.1..10 seconds; an operational limit, not a sandbox')
    internal = sub.add_parser('_evaluate'); internal.add_argument('--directory', required=True); internal.add_argument('--reference', action='store_true'); internal.add_argument('--report-file', required=True)
    args = parser.parse_args(); directory = Path(args.directory).resolve()
    if args.command == 'create':
        if not 1 <= args.seed <= 2147483647: parser.error('seed must be 1..2147483647')
        directory.mkdir(parents=True, exist_ok=False)
        (directory/'task.json').write_text(json.dumps({'schema': 'mlsys-task-v1', 'family': args.family, 'seed': args.seed, 'case_version': args.case_version, 'contract': CONTRACTS[args.family], 'budget': 'one CPU process, at most 10 seconds; no network, GPU or packages needed'}, indent=2))
        (directory/'learner.py').write_text(STARTER)
        print('Created a new exercise. Read task.json and learner.py before check. Keep the first failure artifact.'); return
    if args.command == '_evaluate':
        payload = json.dumps(evaluate(directory, args.reference), allow_nan=False)
        if len(payload) > 100000: raise ValueError('machine result exceeds 100000 characters')
        Path(args.report_file).write_text(payload)
        return
    output = Path(args.output)
    if output.exists(): parser.error('refusing overwrite; use a new attempt filename')
    if not .1 <= args.timeout_seconds <= 10: parser.error('timeout-seconds must be 0.1..10')
    report = run_evaluation(directory, args.reference, args.timeout_seconds)
    with output.open('x') as file: json.dump(report, file, ensure_ascii=False, indent=2, allow_nan=False)
    print(json.dumps({'passed': report['passed'], 'tests': len(report['tests']), 'execution': report['execution']['status'], 'source_kind': report['source_kind'], 'output': str(output)}))
    if report['execution']['status'] != 'completed':
        print(report['execution']['message'], file=sys.stderr)
        print(report['execution']['stderr'], file=sys.stderr)
        raise SystemExit(2)


if __name__ == '__main__': main()
