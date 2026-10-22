"""Disposable integration-test bridge. Never deploy this file as an HTTP service."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'services/python-runner'))
from server import Runner
payload = json.load(sys.stdin)
result = Runner(wall_seconds=30).execute(payload)
# Runner includes code/input hashes on successful and failing receipts.
print(json.dumps(result[0] if isinstance(result,tuple) else result, allow_nan=False))
