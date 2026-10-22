# AI26 isolated Python runner — reference implementation

This directory is an engineering asset, not a deployed service. It has no
production URL or service token. The Site's Cloudflare Worker cannot run Python;
it must call this service from its server using `GRADER_URL` and `GRADER_TOKEN`.
Keep both secrets out of browser bundles. Answer comparison belongs to the Site
server, against its task-version-bound expectations. This service does not grade.

## Host requirements

- A dedicated Linux execution host with a local Docker Engine, supported cgroups
  for memory/swap/CPU/PIDs, and seccomp. The orchestrator's Docker socket access is
  privileged. Keep this host separate from application databases and credentials.
- An approved, prebuilt executor image. Jobs never pull images or install packages.
- A TLS reverse proxy in front of the HTTP orchestrator, with request/connection
  limits and access restricted to the Site backend. Bind defaults to 127.0.0.1.
- Host monitoring and cleanup for stale `ai26.executor=true` containers if the
  orchestrator or Docker daemon crashes. Every normal request removes its container.

An ordinary Railway/Render/Cloudflare service that cannot start independently
constrained per-job containers is **not** a deployment target for this design.
Do not silently replace Docker with host `exec()`, a persistent Python process,
or a Python import blocklist. Use a host or job platform with actual task isolation.
Do not mount the Docker socket into executor containers. Do not run user code in
the orchestrator. Docker shares the host kernel; a public adversarial service
needs additional isolation review, preferably a sandbox runtime or microVM.

## Build and validate

The requirements are pinned for small CPU exercises: Python 3.12.10, NumPy 2.2.6,
SciPy 1.15.3, scikit-learn 1.6.1, and pandas 2.2.3. Pandas' date/time dependencies
are pinned too. This is not a GPU/full-paper training runner.
Rebuild deliberately to update dependencies, then rerun real integration checks.

```bash
cd services/python-runner
docker --host=unix:///var/run/docker.sock build -t ai26-python-runner:2026.10.2 .
RUN_DOCKER_TESTS=1 python3 -m unittest discover -s tests -v
python3 tests/validate_corpus.py --corpus ../../data/auto-tasks.json
```

In the managed cloud environment, retain platform proxy defaults and mount the
session CA during the pip build; do not disable TLS verification:

```bash
env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS \
  -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
  docker --host=unix:///var/run/docker.sock build \
  --secret id=proxy_ca,src="$CODEX_PROXY_CERT" \
  -t ai26-python-runner:2026.10.2 .
```

Tests use only ephemeral local HTTP test servers and disposable job containers.
No test launches a production HTTP service or changes the Docker daemon/network.
Unit tests without `RUN_DOCKER_TESTS=1` skip real-engine tests explicitly; skips
are not evidence that the engine is ready.

## Runtime configuration

Set a cryptographically random `GRADER_TOKEN` of at least 32 ASCII characters in
the trusted service host's secret store; set the same token in the Site backend's
secret store. Start `python3 server.py` under the host's service manager.

| Setting | Default | Purpose |
| --- | --- | --- |
| `GRADER_TOKEN` | Required | Server-to-server Bearer authentication |
| `RUNNER_IMAGE` | `ai26-python-runner:2026.10.2` | Approved prebuilt image tag or digest |
| `RUNNER_BIND` | `127.0.0.1` | Local interface, normally behind TLS proxy |
| `PORT` | `8080` | HTTP port |
| `RUNNER_WALL_SECONDS` | `30` | Entire job wall limit; configurable 1–60 seconds |
| `RUNNER_CONCURRENCY` | `2` | Maximum active job containers |

The orchestrator explicitly targets `unix:///var/run/docker.sock`, clears remote
Docker context selectors, and requires resource controls/seccomp before each job.
The token is not passed to executor subprocess environments or containers.
Executor proxy variables are explicitly empty, and socket syscalls are denied.

## HTTP contract

Every endpoint requires `Authorization: Bearer <GRADER_TOKEN>`. There is no browser
CORS route. All responses are strict JSON with `Cache-Control: no-store`.

`POST /run`, `Content-Type: application/json`:

```json
{
  "code": "def solve(data):\n    return sum(data)",
  "inputs": [[1, 2, 3], [-2, 5]],
  "requirements": []
}
```

Each input invokes `solve(data)` in a fresh interpreter. Return a JSON value:
list/dict/string/bool/number/null. Convert NumPy arrays/scalars to normal JSON
types. NaN/Infinity fail. Only `code`, `inputs`, and `requirements` are accepted;
an `expected` field is rejected. Requirements are an allowlist declaration for
already installed libraries, never shell commands or pip inputs.

```json
{
  "status": "ok",
  "outputs": [6, 3],
  "environment": {
    "python": "3.12.10",
    "numpy": "2.2.6",
    "scikit_learn": "1.6.1",
    "pandas": "2.2.3",
    "engine": "docker",
    "image": "sha256:<actual-image-id>",
    "network": "none",
    "readOnly": true,
    "memoryMiB": 512,
    "cpus": 0.5,
    "pids": 64,
    "seccomp": "allowlist-no-network"
  },
  "durationMs": 1234,
  "logs": "",
  "codeSha256": "<sha256-of-exact-UTF8-code>",
  "inputSha256": "<sha256-of-service-canonical-inputs>"
}
```

`status` is `ok`, `error`, or `timeout`. `ok` means execution returned values;
it **never** means an answer passed. Any case failure includes `error` and an
optional `errors` list with its input index, and uses null for failed case output.
Successful `solve(data) -> None` also returns null; the status disambiguates it.
Every receipt for a validated request includes both code/input hashes, including
container timeout, OOM, output-limit, busy, and engine-unavailable errors. This
lets the Site validate the submitted code before showing the specific failure.
The Site must reject failure statuses before comparing outputs. Transport/engine
errors may return an empty outputs list rather than invent results. A caller
must validate response shape/length and pin its own code/task/input snapshot.
The Site should derive its own canonical input hash rather than assuming hashes
from JavaScript and Python use identical Unicode/number serialization.

HTTP status: 200 for attempted execution (including code failures/timeouts), 400
for invalid requests, 401 for bad authentication, 413 for oversized bodies, 429
when job slots are busy, and 503 when the engine/image/protocol is unavailable.
Never turn a 503 into a passing grade. Preserve the submitted code and retry.

`GET /health` runs a real disposable container and NumPy/scikit-learn/pandas computation.
It returns 200 with `ready: true` only when the engine has all required resource
controls, the approved image starts, and the computation returns the expected
smoke-test value. Missing image/engine, unsupported limits, or failed smoke tests
return 503 and `ready: false`. Process uptime alone never means ready. A busy
engine reports unavailable rather than pretending to pass its probe.

## Limits and isolation

| Limit | Enforcement |
| --- | --- |
| Request body | 250000 bytes; explicit Content-Length; no chunked bodies |
| Code | 100000 UTF-8 bytes; NUL rejected |
| Inputs | 1–10 JSON values; nesting at most 24 |
| Libraries | stdlib, numpy, scipy, sklearn/scikit-learn, pandas; fixed installed versions |
| Per-case CPU | 2 seconds soft / 3 seconds hard via rlimit |
| Per-case wall | 4 seconds |
| Whole job wall | 30 seconds default, including Docker launch |
| Container CPU | 0.5 CPU |
| Container RAM/swap | 512 MiB RAM; swap disabled by same memory-swap limit |
| Container processes | 64 PIDs |
| Per-case output | 16 KiB combined raw stdout/stderr |
| Retained logs | 16 KiB UTF-8 total |
| Whole job output | 256 KiB |
| Filesystem | Read-only image, 32 MiB noexec/nosuid/nodev tmpfs in /tmp |
| File writes | 1 MiB maximum per file; no core dumps |
| File descriptors | 128 |
| Network | Docker network none plus seccomp denying socket/connect/accept |
| Privileges | UID/GID 65534; cap-drop ALL; no-new-privileges; no host mounts |

The seccomp policy is an explicit allowlist. Networking, ptrace, mount, bpf,
keyctl, perf events, and new namespace clone flags are absent/denied. Ordinary
interpreter I/O, fork/threads, signals, and bounded temporary-file operations
remain available. Python itself is not the security boundary. Untrusted code can
return arbitrary values; the separate Site server is the only grading authority.

Supported scope is small CPU practice tasks; heavier imports/training may exceed
the deliberate per-case limits and need a separately reviewed execution tier.

The orchestrator completes `docker create` before `docker start` so an execution
timeout always has a known container to remove. The deadline begins before engine
preparation. If creation finishes after that deadline, no learner code starts and
the request returns timeout after cleanup. Administrative creation has its own
bounded 30 second allowance, necessary on VFS-backed hosts; response latency
can therefore exceed a deliberately short job deadline while creation finishes.
Deletion is separately bounded at 5 seconds. The attach CLI is stopped before
the already-created container is removed. Daemon crashes or administrative-create
timeouts still require the host's stale-container monitor described above.

## Corpus and runtime version audit

`tests/validate_corpus.py` reads the project corpus without editing it, runs every
reference solution/input through the same Docker runner, and compares actual
outputs to corpus expectations with the Site's `compareJSON` numeric tolerance.
It also executes the authored references in the host Python runtime and compares
host and pinned-container outputs in both directions. The generated
`corpus-validation.json` records the corpus SHA-256, image digest, all per-task
results, host/container library versions, and any output differences.

Expected answers are used only by this offline harness; `/run` and execution
containers still receive only code, inputs, and declared requirements. The host
baseline is for trusted project-authored reference solutions, never arbitrary
learner submissions. Passing this audit establishes compatibility for the tested
corpus and runtime pair; it does not establish readiness of a production service.
After changing dependencies, repeat the audit before promoting a new image.

The checked-in local reports cover **126 tasks / 758 cases**, all passing against
both pinned Docker and host references. Python/NumPy/SciPy/scikit-learn versions
differed between those runtimes; all tested outputs matched under the Site's
numeric tolerance. Pandas 2.2.3 matched in both. See `corpus-validation.json` for
versions, corpus checksum, and per-task results.

`validation.json` records 23 required checks: the full run passed 22 and identified
a short-deadline administrative-create edge; after correction, both HTTP receipt
methods passed all five failure branches. Real memory-limit enforcement and the
separate controlled OOM-return branch are distinguished in the report. The final
container scan found no remaining tagged job containers. These are local test
results, not a production deployment or a guarantee about another host.
