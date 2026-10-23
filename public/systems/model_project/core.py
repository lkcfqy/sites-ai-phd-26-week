"""Tiny synthetic binary classifier. Pure Python CPU; no network or third-party dependencies."""
import math, random, statistics
FEATURES = 8

def dataset(n, seed):
    rng=random.Random(seed)
    xs=[[rng.uniform(-1,1) for _ in range(FEATURES)] for _ in range(n)]
    # Synthetic known decision boundary, not industrial or language data.
    ys=[int(1.7*x[0]-1.2*x[1]+.8*x[2]+.3*x[3]>0) for x in xs]
    return xs,ys

def validate(xs):
    if not isinstance(xs,list) or not 1<=len(xs)<=64: raise ValueError('batch must be 1..64')
    if any(not isinstance(x,list) or len(x)!=FEATURES or any(type(v) not in (int,float) or not math.isfinite(v) or abs(v)>4 for v in x) for x in xs): raise ValueError('each row needs 8 finite numbers in [-4,4]')

def predict(model,xs):
    validate(xs)
    w,b=model['weights'],model['bias']
    return [sum(a*v for a,v in zip(w,x))+b for x in xs]

def train(steps=180):
    xs,ys=dataset(256,41);w=[0.0]*FEATURES;b=0.0
    for _ in range(steps):
        dw=[0.0]*FEATURES;db=0.0
        for x,y in zip(xs,ys):
            z=sum(a*v for a,v in zip(w,x))+b
            error=1/(1+math.exp(-max(-30,min(30,z))))-y
            for j in range(FEATURES):dw[j]+=error*x[j]
            db+=error
        w=[v-.5*g/len(xs) for v,g in zip(w,dw)];b-=.5*db/len(xs)
    return {'schema':'tiny-linear-v1','weights':w,'bias':b,'train_seed':41,'features':FEATURES}

def quantize(model):
    scale=max(abs(w) for w in model['weights'])/127 or 1.0
    return {'weights':[max(-127,min(127,round(w/scale))) for w in model['weights']],'scale':scale,'bias':model['bias']}

def predict_quantized(model,xs):
    """Actual integer dot products; per-row dynamic activation scale. Python overhead may make this slower."""
    validate(xs);out=[]
    for x in xs:
        scale=max(map(abs,x))/127 or 1.0
        qx=[max(-127,min(127,round(v/scale))) for v in x]
        acc=sum(a*b for a,b in zip(model['weights'],qx))
        out.append(acc*model['scale']*scale+model['bias'])
    return out

def accuracy(scores,ys):return sum((z>=0)==bool(y) for z,y in zip(scores,ys))/len(ys)
def percentile(v,p):return sorted(v)[max(0,math.ceil(p*len(v))-1)]
def summarize(v):return {'n':len(v),'median_ms':statistics.median(v),'p95_ms':percentile(v,.95),'raw_latency_ms':v}
