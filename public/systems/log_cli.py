#!/usr/bin/env python3
"""Small standard-library log reader. Input statistics are not device measurements."""
import argparse
import json
import math
from pathlib import Path
import sys


def summarize(value, threshold_ms):
    if not isinstance(value, list) or not 1 <= len(value) <= 100:
        raise ValueError('input must contain 1..100 request records')
    records = []; seen = set()
    for index, row in enumerate(value):
        if not isinstance(row, dict): raise ValueError(f'row {index}: expected object')
        identity, elapsed, ok = row.get('id'), row.get('ms'), row.get('ok')
        if type(identity) is not int or identity in seen: raise ValueError(f'row {index}: id must be unique integer')
        if type(ok) is not bool: raise ValueError(f'row {index}: ok must be boolean')
        if type(elapsed) not in (int, float) or not math.isfinite(elapsed) or elapsed < 0:
            raise ValueError(f'row {index}: ms must be finite nonnegative number, not boolean/string')
        records.append({'id': identity, 'ms': elapsed, 'ok': ok}); seen.add(identity)
    times = sorted(row['ms'] for row in records if row['ok'])
    return {'schema': 'learning-log-summary-v1', 'source': 'provided-input-statistics-not-device-measurement',
            'records': records, 'successful': len(times), 'failed': len(records)-len(times),
            'mean_success_ms': sum(times)/len(times) if times else None,
            'p95_success_ms': times[math.ceil(.95*len(times))-1] if times else None,
            'threshold_ms': threshold_ms, 'over_budget': sum(value > threshold_ms for value in times),
            'limits': 'Statistics of supplied input only; no timer, model, GPU or proof of real execution.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--threshold-ms', type=float, default=100)
    args = parser.parse_args()
    try:
        if not math.isfinite(args.threshold_ms) or args.threshold_ms < 0:
            raise ValueError('threshold-ms must be finite and nonnegative')
        if args.input.stat().st_size > 64000: raise ValueError('input exceeds 64000 bytes')
        with args.input.open(encoding='utf-8') as source: data = json.load(source)
        report = summarize(data, args.threshold_ms)
        # Exclusive creation preserves the first failed/successful experiment file.
        with args.output.open('x', encoding='utf-8') as target:
            json.dump(report, target, ensure_ascii=False, indent=2, allow_nan=False)
        print(f'Read {len(report["records"])} records; input statistics only.', file=sys.stderr)
        print(json.dumps({'status': 'completed', 'output': str(args.output), 'successful': report['successful'], 'failed': report['failed']}))
        return 0
    except (OSError, ValueError, TypeError) as error:
        print(type(error).__name__ + ': ' + str(error), file=sys.stderr)
        return 2


if __name__ == '__main__':
    try: raise SystemExit(main())
    except KeyboardInterrupt: raise SystemExit(130)
