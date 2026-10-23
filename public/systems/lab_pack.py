#!/usr/bin/env python3
"""AI Systems CPU practice pack. Stdlib only, offline, bounded inputs.
Examples: python3 lab_pack.py basics --output basics.json
          python3 lab_pack.py matrix --size 20 --repeats 7 --output matrix.json
All data is synthetic. Only matrix/compare perform real local CPU timings.
"""
import argparse
import json
import math
import platform
import random
import statistics
import time
from pathlib import Path

VERSION = 'mlsys-lab-pack-v1'

def close(a, b, tolerance=1e-9):
    return math.isclose(a, b, rel_tol=tolerance, abs_tol=tolerance)

def percentile(values, p):
    if not values or not 0 < p <= 1:
        raise ValueError('nonempty values and 0 < p <= 1 required')
    return sorted(values)[math.ceil(p * len(values)) - 1]

def mm(a, b):
    if not a or not b or not a[0] or not b[0]:
        raise ValueError('empty matrix')
    if any(len(row) != len(a[0]) for row in a) or any(len(row) != len(b[0]) for row in b):
        raise ValueError('ragged matrix')
    if len(a[0]) != len(b):
        raise ValueError('incompatible matrix dimensions')
    return [[sum(x * b[k][j] for k, x in enumerate(row)) for j in range(len(b[0]))] for row in a]

def mm_transposed(a, b):
    # Same mathematical operation, different access path; not guaranteed faster.
    if not a or not b or not a[0] or not b[0] or any(len(r) != len(a[0]) for r in a) or any(len(r) != len(b[0]) for r in b) or len(a[0]) != len(b):
        raise ValueError('invalid matrix dimensions')
    columns = list(zip(*b))
    return [[sum(x * y for x, y in zip(row, col)) for col in columns] for row in a]

def test_matrix():
    assert mm([[1, 2], [3, 4]], [[5, 6], [7, 8]]) == [[19, 22], [43, 50]]
    assert mm([[2, 3]], [[4], [5]]) == [[23]]
    a, b = [[1, 0, 2], [-1, 3, 1]], [[3, 1], [2, 1], [1, 0]]
    assert mm(a, b) == [[5, 1], [4, 2]]
    assert mm_transposed(a, b) == mm(a, b)
    try:
        mm([[1, 2]], [[3, 4]])
    except ValueError:
        pass
    else:
        raise AssertionError('incompatible shape accepted')
    return 5

def basics(_):
    values = [3, 1, 4, 1, 5]
    total = 0
    history = []
    for i, value in enumerate(values):
        total += value
        history.append({'index': i, 'value': value, 'running_sum': total})
    average = total / len(values)
    squares = [v * v for v in values]
    assert total == 14
    assert close(average, 2.8)
    assert squares == [9, 1, 16, 1, 25]
    return {'source': 'deterministic-computation', 'tests_passed': 3, 'input': values, 'loop_trace': history, 'mean': average, 'squares': squares, 'exercise': 'Change one input, predict mean before running, then update your own expected-value test.'}

def gradient(args):
    x, target, weight = 1.5, 3.0, 1.2
    def loss(w):
        return (w * x - target) ** 2
    analytic = 2 * (weight * x - target) * x
    numeric = (loss(weight + args.epsilon) - loss(weight - args.epsilon)) / (2 * args.epsilon)
    assert close(analytic, -3.6)
    assert abs(analytic - numeric) < 1e-5
    new_weight = weight - 0.05 * analytic
    assert loss(new_weight) < loss(weight)
    sweep = []
    for step in [1e-2, 1e-4, 1e-6, 1e-8]:
        estimate = (loss(weight + step) - loss(weight - step)) / (2 * step)
        sweep.append({'epsilon': step, 'finite_difference': estimate, 'absolute_error': abs(estimate - analytic)})
    return {'source': 'deterministic-computation', 'tests_passed': 3, 'formula': 'L=(w*x-target)^2; dL/dw=2*(w*x-target)*x', 'x': x, 'target': target, 'weight': weight, 'analytic': analytic, 'finite_difference': numeric, 'epsilon': args.epsilon, 'loss_before': loss(weight), 'loss_after_one_step': loss(new_weight), 'epsilon_sweep': sweep, 'limitation': 'Quadratic scalar loss only; tiny epsilon suffers floating-point cancellation; not autograd or model training.'}

def matrices(n):
    rng = random.Random(41)
    return ([[rng.random() for _ in range(n)] for _ in range(n)], [[rng.random() for _ in range(n)] for _ in range(n)])

def summary(samples):
    return {'samples_ms': samples, 'median_ms': statistics.median(samples), 'p95_ms': percentile(samples, .95), 'count': len(samples)}

def matrix(args):
    tests = test_matrix()
    a, b = matrices(args.size)
    mm(a, b)
    times = []
    result = None
    for _ in range(args.repeats):
        start = time.perf_counter()
        result = mm(a, b)
        times.append((time.perf_counter() - start) * 1000)
    assert result is not None and math.isfinite(sum(map(sum, result)))
    return {'source': 'real-local-CPU-measurement', 'tests_passed': tests + 1, 'size': args.size, 'seed': 41, 'warmup': 1, 'timing': summary(times), 'checksum': sum(map(sum, result)), 'limitation': 'Python list loops, not optimized BLAS/CUDA. Small samples do not establish a reliable production tail latency.'}

def trace(_):
    rows = [{'id': i, 'queue_ms': (90 if i == 19 else 5 + i % 4), 'compute_ms': (1 if i == 19 else 10 + i % 5), 'post_ms': 2} for i in range(1, 21)]
    for row in rows:
        row['total_ms'] = row['queue_ms'] + row['compute_ms'] + row['post_ms']
    values = [r['total_ms'] for r in rows]
    assert percentile([1, 2, 3, 4, 100], .95) == 100
    assert all(r['total_ms'] >= r['queue_ms'] for r in rows)
    p95 = percentile(values, .95)
    component_sum = sum(percentile([r[key] for r in rows], .95) for key in ('queue_ms', 'compute_ms', 'post_ms'))
    return {'source': 'synthetic-trace-statistics', 'tests_passed': 2, 'traces': rows, 'p50_ms': percentile(values, .5), 'p95_ms': p95, 'maximum_ms': max(values), 'sum_of_component_p95_ms': component_sum, 'limitation': 'These are generated records, not real request measurements. Component percentiles cannot generally be added; equality in one dataset would be accidental. Nearest-rank p95 uses ceil(.95*n).'}

def quantize(values, bits, clip):
    qmax = 2 ** (bits - 1) - 1
    scale = clip / qmax
    rows = []
    for value in values:
        q = max(-qmax, min(qmax, round(value / scale)))
        restored = q * scale
        rows.append({'original': value, 'integer': q, 'restored': restored, 'error': restored - value, 'clipped': abs(value) > clip})
    return scale, rows

def quantization(args):
    values = [-3., -1.7, -.6, -.1, .2, .8, 1.4, 2.6]
    scale, rows = quantize(values, args.bits, args.clip)
    assert all(abs(r['integer']) <= 2 ** (args.bits - 1) - 1 for r in rows)
    assert all(abs(r['error']) <= scale / 2 + 1e-10 for r in rows if not r['clipped'])
    assert close(quantize([0.], 8, 1.)[1][0]['restored'], 0.)
    mse = sum(r['error'] ** 2 for r in rows) / len(rows)
    return {'source': 'deterministic-computation', 'tests_passed': 3, 'bits': args.bits, 'clip': args.clip, 'scale': scale, 'rounding': 'Python round: ties to even', 'rows': rows, 'mse': mse, 'limitation': 'Scalar symmetric quantization, not complete model quantization. Clipped values need not satisfy half-step error bound. Lower MSE need not imply better task quality.'}

def memory(args):
    layers, kv_heads, head_dim, element_bytes = 32, 8, 128, 2
    kv_bytes = 2 * layers * kv_heads * head_dim * args.tokens * args.batch * element_bytes
    kv_gib = kv_bytes / 2 ** 30
    capacity, weights, workspace, margin = 24, 8, 4, 2
    budget = capacity - weights - workspace - margin
    assert 2 * 32 * 8 * 128 * 4096 * 4 * 2 / 2 ** 30 == 2
    assert budget == 10
    return {'source': 'analytical-memory-budget-not-measurement', 'tests_passed': 2, 'formula': '2*layers*KV_heads*head_dim*tokens*batch*element_bytes', 'model': {'layers': layers, 'kv_heads': kv_heads, 'head_dim': head_dim, 'element_bytes': element_bytes}, 'tokens': args.tokens, 'batch': args.batch, 'kv_bytes': kv_bytes, 'kv_GiB': kv_gib, 'capacity_GiB': capacity, 'weights_GiB': weights, 'workspace_GiB': workspace, 'margin_GiB': margin, 'available_KV_GiB': budget, 'payload_fits_budget': kv_gib <= budget, 'limitation': 'Equal-length requests; ignores page fragmentation and dynamic workspaces. Passing this estimate is NOT proof that a model fits on a GPU. No GPU queried or allocated.'}

def queue_sim(rate, batch, requests=120):
    arrival = [i * 1000 / rate for i in range(requests)]
    finish_previous = 0.
    output = []
    for offset in range(0, requests, batch):
        group = arrival[offset:offset + batch]
        start = max(group[-1], finish_previous)
        service = 8 + 2 * len(group)
        finish_previous = start + service
        for i, arrived in enumerate(group):
            output.append({'id': offset + i, 'arrival_ms': arrived, 'start_ms': start, 'finish_ms': finish_previous, 'wait_ms': start - arrived, 'latency_ms': finish_previous - arrived})
    return output

def queue(args):
    rows = queue_sim(args.rate, args.batch)
    assert len(rows) == 120
    assert all(r['start_ms'] >= r['arrival_ms'] and r['finish_ms'] > r['start_ms'] for r in rows)
    assert close(queue_sim(10, 1, 1)[0]['latency_ms'], 10.)
    capacity = 1000 * args.batch / (8 + 2 * args.batch)
    return {'source': 'discrete-event-simulation-not-measurement', 'tests_passed': 3, 'rate_requests_per_s': args.rate, 'batch': args.batch, 'service_ms_per_batch': 8 + 2 * args.batch, 'theoretical_capacity_requests_per_s': capacity, 'positive_capacity_margin': args.rate < capacity, 'finite_run_p95_ms': percentile([r['latency_ms'] for r in rows], .95), 'last_wait_ms': rows[-1]['wait_ms'], 'traces': rows, 'limitation': 'Uniform arrivals, FIFO batching, single server, no timeout, no randomness. The final incomplete batch is flushed at the end of this finite trace. Finite 120-request p95 is not steady-state production p95. Rate >= capacity has no positive capacity margin; rate > capacity grows backlog if continued.'}

def compare(args):
    tests = test_matrix()
    a, b = matrices(args.size)
    reference, candidate = mm(a, b), mm_transposed(a, b)
    max_difference = max(abs(x - y) for ar, br in zip(reference, candidate) for x, y in zip(ar, br))
    assert max_difference <= 1e-10
    samples = {'baseline': [], 'transposed': []}
    functions = {'baseline': mm, 'transposed': mm_transposed}
    # Alternate order so one implementation is not always the first timed run.
    for trial in range(args.repeats):
        order = ['baseline', 'transposed'] if trial % 2 == 0 else ['transposed', 'baseline']
        for name in order:
            start = time.perf_counter()
            functions[name](a, b)
            samples[name].append((time.perf_counter() - start) * 1000)
    base, opt = summary(samples['baseline']), summary(samples['transposed'])
    assert base['median_ms'] > 0 and opt['median_ms'] > 0
    return {'source': 'real-local-CPU-measurement', 'tests_passed': tests + 2, 'size': args.size, 'seed': 41, 'warmup': 'one full evaluation per implementation, excluded', 'baseline': base, 'candidate': opt, 'maximum_absolute_difference': max_difference, 'median_speedup_ratio': base['median_ms'] / opt['median_ms'], 'median_time_reduction_fraction': 1 - opt['median_ms'] / base['median_ms'], 'candidate_faster_in_this_run': opt['median_ms'] < base['median_ms'], 'limitation': 'Includes transpose cost; same synthetic matrices and CPU. No claim of significance, GPU benefit or universal speedup. Repeat at other sizes and report slower outcomes too.'}

def main():
    if not __debug__:
        raise SystemExit('Do not use python -O: assertions must remain enabled.')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['basics', 'gradient', 'matrix', 'trace', 'quantization', 'memory', 'queue', 'compare'])
    parser.add_argument('--output', required=True, help='new output JSON; refuses existing files')
    parser.add_argument('--size', type=int, default=20)
    parser.add_argument('--repeats', type=int, default=7)
    parser.add_argument('--epsilon', type=float, default=1e-5)
    parser.add_argument('--bits', type=int, default=4)
    parser.add_argument('--clip', type=float, default=2.)
    parser.add_argument('--tokens', type=int, default=4096)
    parser.add_argument('--batch', type=int, default=4)
    parser.add_argument('--rate', type=float, default=50.)
    args = parser.parse_args()
    if not (2 <= args.size <= 64 and 5 <= args.repeats <= 30 and 1e-7 <= args.epsilon <= 1e-2 and 2 <= args.bits <= 8 and .1 <= args.clip <= 10 and 1 <= args.tokens <= 65536 and 1 <= args.batch <= 24 and 1 <= args.rate <= 1000):
        parser.error('limits: size 2..64, repeats 5..30, epsilon 1e-7..1e-2, bits 2..8, clip .1..10, tokens 1..65536, batch 1..24, rate 1..1000')
    target = Path(args.output)
    if target.exists():
        parser.error('Output exists. Choose another filename; preserve previous evidence.')
    handlers = {'basics': basics, 'gradient': gradient, 'matrix': matrix, 'trace': trace, 'quantization': quantization, 'memory': memory, 'queue': queue, 'compare': compare}
    result = handlers[args.command](args)
    result.update({'schema': VERSION, 'command': args.command, 'python': platform.python_version(), 'platform': platform.platform(), 'provenance': 'synthetic input; source field distinguishes computation, simulation and real CPU timing'})
    # Exclusive creation protects against a file appearing between initial check and write.
    try:
        with target.open('x', encoding='utf-8') as stream:
            json.dump(result, stream, ensure_ascii=False, indent=2, allow_nan=False)
    except FileExistsError:
        parser.error('Output appeared while running; not overwritten.')
    print(json.dumps({'output': str(target), 'command': args.command, 'source': result['source'], 'tests_passed': result['tests_passed']}, ensure_ascii=False))

if __name__ == '__main__':
    main()
