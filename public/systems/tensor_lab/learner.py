"""依次完成四个任务。NumPy 表示 N 维张量，但不自动计算梯度。

所有非法输入用 ValueError。输入不被原地修改；只使用本地 NumPy 与标准库。
详细契约、形状表、提示与排错步骤在 README.md；先运行 arrays 观察失败。
"""
import numpy as np


def as_tokens(rows):
    """转为新的 float64 二维数组，shape=(T,D)，1<=T,D<=8。

    接受实数列表或 ndarray，拒绝 bool、文字、复数、ragged、空或非有限值。
    提示：先核对原输入类型/dtype，避免 np.array 的隐式字符串/布尔转换。
    """
    raise NotImplementedError("arrays：检查 dtype/ndim/shape/有限值，再返回副本")


def linear(x, weights, bias):
    """X(T,D) @ W(D,O) + b(O,) -> Y(T,O)，返回 float64。

    使用与 as_tokens 一致的实数/有限/大小约束；bias 必须一维且恰有 O 项。
    不接受 (T,1) 或 (O,1) 偏置，即使 NumPy 恰好能广播。
    提示：@ 做矩阵乘法，* 逐元素乘法；偏置沿最后的特征轴广播。
    """
    raise NotImplementedError("linear：先检查接口形状，再矩阵乘法与逐行偏置")


def linear_backward(x, weights, upstream):
    """给定 dY(T,O)，返回 (dX(T,D), dW(D,O), db(O,))。

    上游梯度已经代表损失导数，不要再隐式平均。
    提示：用转置理清每个矩阵乘法；广播出去的偏置导数沿 token 轴求和。
    此函数是手工链式法则，不是 NumPy autograd。
    """
    raise NotImplementedError("gradient：推导 dX、dW 和去广播的 db")


def attention(query, key, value, allowed):
    """Q(T,K), K(S,K), V(S,Vd), allowed(T,S) 布尔 mask。

    返回 (scores, probabilities, output)：未屏蔽的缩放分数(T,S)、
    mask 后沿 key 轴归一化的概率(T,S)、加权结果(T,Vd)。
    每维 1..8，输入 float64 实数有限值；不改输入。
    allowed=True 表示可见，False 表示屏蔽；每行至少一个 True。
    提示：除以 sqrt(K)，先屏蔽，再减每行最大值，exp，按行求和。
    不要将 -inf 写入返回 scores，另建 masked_scores。
    """
    raise NotImplementedError("attention：score → mask → 稳定 softmax → 加权 V")
