"""Complete before opening core.py reference. Tests reveal mismatches, never silently solve TODOs."""
def linear_batch(weights,bias,rows):
    # TODO: validate feature dimension, support any nonempty batch, return logits.
    raise NotImplementedError('Implement row dot products + bias')

def quantized_batch(qweights,weight_scale,bias,rows):
    # TODO: each row gets max(abs(x))/127 scale; handle all-zero rows;
    # quantize, integer dot, restore scale, add bias. Explain clipping/rounding.
    raise NotImplementedError('Implement dynamic activation quantization')
