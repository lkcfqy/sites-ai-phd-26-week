"""Regression fixture for the teaching checker. Excluded from the learner download.

Executing this reference verifies the checker, never a learner's independent ability.
"""
import numpy as np


def _real(value, rank):
    try:
        raw = np.asarray(value, dtype=object)
        if raw.ndim != rank or any(n < 1 or n > 8 for n in raw.shape):
            raise ValueError("shape contract")
        for item in raw.flat:
            if isinstance(item, (bool, np.bool_)) or not isinstance(item, (int, float, np.integer, np.floating)) or not np.isfinite(float(item)):
                raise ValueError("real finite values required")
        return np.array(raw, dtype=np.float64, copy=True)
    except (TypeError, OverflowError) as exc:
        raise ValueError("invalid numeric input") from exc


def as_tokens(rows):
    return _real(rows, 2)


def linear(x, weights, bias):
    x, weights, bias = as_tokens(x), as_tokens(weights), _real(bias, 1)
    if x.shape[1] != weights.shape[0] or bias.shape != (weights.shape[1],):
        raise ValueError("linear shape mismatch")
    return x @ weights + bias


def linear_backward(x, weights, upstream):
    x, weights, upstream = as_tokens(x), as_tokens(weights), as_tokens(upstream)
    if x.shape[1] != weights.shape[0] or upstream.shape != (x.shape[0], weights.shape[1]):
        raise ValueError("gradient shape mismatch")
    return upstream @ weights.T, x.T @ upstream, upstream.sum(axis=0)


def attention(query, key, value, allowed):
    query, key, value = as_tokens(query), as_tokens(key), as_tokens(value)
    allowed = np.asarray(allowed)
    if query.shape[1] != key.shape[1] or key.shape[0] != value.shape[0] or allowed.shape != (len(query), len(key)) or allowed.dtype != np.dtype(bool) or not allowed.any(axis=1).all():
        raise ValueError("attention shape/mask mismatch")
    scores = query @ key.T / np.sqrt(query.shape[1])
    masked = np.where(allowed, scores, -np.inf)
    numerators = np.exp(masked - masked.max(axis=1, keepdims=True))
    probabilities = numerators / numerators.sum(axis=1, keepdims=True)
    return scores, probabilities, probabilities @ value
