# syntax=docker/dockerfile:1
# Build this executor separately. The HTTP orchestrator runs on a trusted host.
FROM python:3.12.10-slim-bookworm
ARG PROXY_CA=/run/secrets/proxy_ca
WORKDIR /opt/runner
COPY requirements.txt ./
# The optional secret is required for builds in the managed cloud environment.
# Elsewhere, the image's normal CA roots apply when this secret is absent.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f "$PROXY_CA" ]; then PIP_CERT="$PROXY_CA" python -m pip install --no-cache-dir -r requirements.txt; \
    else python -m pip install --no-cache-dir -r requirements.txt; fi
COPY task_runner.py job_exec.py ./
RUN chmod 0555 /opt/runner /opt/runner/task_runner.py /opt/runner/job_exec.py
USER 65534:65534
WORKDIR /tmp
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1
ENTRYPOINT ["python", "-I", "/opt/runner/task_runner.py"]
