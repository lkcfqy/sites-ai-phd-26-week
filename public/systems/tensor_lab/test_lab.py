"""公开检查与可复现参数变式。标量循环 oracle 不调用学习者实现。"""
import argparse
import contextlib
import importlib
import json
import math
import os
import pathlib
import random
import sys
import unittest

for thread_option in ["OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "MKL_NUM_THREADS"]:
    os.environ[thread_option] = "1"
import numpy as np

FIXTURE = json.loads(pathlib.Path(__file__).with_name("cases.json").read_text())
VARIANT, SEED = "practice", 137


def inputs():
    if VARIANT == "practice":
        return tuple(np.array(FIXTURE[key], dtype=np.float64) for key in ["tokens", "weights", "bias", "upstream"])
    rng = random.Random(SEED)
    t, d, o = rng.randint(2, 5), rng.randint(1, 4), rng.randint(2, 5)
    return (np.array([[rng.uniform(-2, 2) for _ in range(d)] for _ in range(t)]),
            np.array([[rng.uniform(-1, 1) for _ in range(o)] for _ in range(d)]),
            np.array([rng.uniform(-1, 1) for _ in range(o)]),
            np.array([[rng.uniform(-2, 2) for _ in range(o)] for _ in range(t)]))


def scalar_linear(x, w, b):
    return [[sum(float(x[i, k]) * float(w[k, j]) for k in range(x.shape[1])) + float(b[j])
             for j in range(w.shape[1])] for i in range(x.shape[0])]


def scalar_attention(q, k, v, allowed):
    scores, probabilities, output = [], [], []
    for row in range(len(q)):
        score = [sum(float(a)*float(b) for a, b in zip(q[row], key))/math.sqrt(q.shape[1]) for key in k]
        maximum = max(s for s, ok in zip(score, allowed[row]) if ok)
        exp = [math.exp(s-maximum) if ok else 0 for s, ok in zip(score, allowed[row])]
        probability = [e/sum(exp) for e in exp]
        scores.append(score)
        probabilities.append(probability)
        output.append([sum(p*float(v[j, feature]) for j, p in enumerate(probability)) for feature in range(v.shape[1])])
    return scores, probabilities, output


class Checks(unittest.TestCase):
    def setUp(self):
        self.code = importlib.import_module("learner")

    def array(self, actual, expected, atol=1e-8):
        self.assertIsInstance(actual, np.ndarray, "必须返回 ndarray，不能只 print 或返回列表")
        self.assertEqual(actual.dtype, np.dtype("float64"), "本实验统一 float64 便于梯度核对")
        self.assertEqual(actual.shape, np.asarray(expected).shape, "shape 不一致，不能只比较元素总数")
        self.assertTrue(np.isfinite(actual).all(), "出现 NaN/Infinity")
        np.testing.assert_allclose(actual, expected, rtol=1e-7, atol=atol)


class ArraysChecks(Checks):
    def test_fixture(self):
        """从列表到二维张量：保留 token/feature 两条轴，统一 float64。"""
        x, _, _, _ = inputs()
        self.array(self.code.as_tokens(x.tolist()), x)

    def test_copy(self):
        """返回独立副本，修改结果不能污染原始输入。"""
        original = np.array([[1., 2.]])
        result = self.code.as_tokens(original)
        result[0, 0] = 99
        self.assertEqual(original[0, 0], 1)

    def test_rank_and_empty(self):
        """拒绝一维、三维、ragged、空维和超过 8 的维度。"""
        for bad in [[], [[]], [1, 2], [[[1]]], [[1], [1, 2]], [[1]]*9]:
            with self.subTest(rows=bad), self.assertRaises(ValueError):
                self.code.as_tokens(bad)

    def test_numeric_contract(self):
        """在隐式转换前拒绝 bool、数字字符串、复数和非有限值。"""
        for bad in [True, "1", 1j, None, float("nan"), float("inf")]:
            with self.subTest(value=str(bad)), self.assertRaises(ValueError):
                self.code.as_tokens([[1, bad]])

    def test_signed_fractional(self):
        """特征可以为负或零；不要沿用日志耗时的非负约束。"""
        self.array(self.code.as_tokens([[-1.25, 0], [0.5, 2]]), [[-1.25, 0], [0.5, 2]])


class LinearChecks(Checks):
    def test_fixture(self):
        """矩阵乘法累加特征轴，再给每个 token 加同一个特征偏置。"""
        x, w, b, _ = inputs()
        self.array(self.code.linear(x, w, b), scalar_linear(x, w, b))

    def test_bias_axis(self):
        """恰能广播的 (T,1) 也不符合偏置接口；必须是 (O,)。"""
        x, w = np.ones((3, 2)), np.ones((2, 3))
        for bias in [np.ones((3, 1)), np.ones((1, 3)), np.ones(2)]:
            with self.subTest(shape=bias.shape), self.assertRaises(ValueError):
                self.code.linear(x, w, bias)

    def test_rectangular_and_one(self):
        """非方阵与单 token 仍正确；* 与 @ 不能混用。"""
        for x, w, b in [(np.array([[1., 2.]]), np.array([[1., 2., 3.], [4., 5., 6.]]), np.zeros(3)),
                        (np.array([[1.], [2.], [3.]]), np.array([[2., -1.]]), np.ones(2))]:
            with self.subTest(shape=x.shape):
                self.array(self.code.linear(x, w, b), scalar_linear(x, w, b))

    def test_invalid(self):
        """形状或数值无效时明确报错，不静默 reshape 或广播。"""
        for x, w, b in [(np.ones((2, 2)), np.ones((3, 2)), np.zeros(2)),
                        (np.array([[float("nan")]]), np.ones((1, 1)), np.zeros(1)),
                        (np.ones((1, 1)), np.ones((1, 1)), np.array([True]))]:
            with self.subTest(shape=x.shape), self.assertRaises(ValueError):
                self.code.linear(x, w, b)

    def test_inputs_unchanged(self):
        """前向运行不改 X/W/b，确保后续对照仍使用同一输入。"""
        x, w, b, _ = inputs()
        before = [a.copy() for a in [x, w, b]]
        self.code.linear(x, w, b)
        for actual, expected in zip([x, w, b], before):
            np.testing.assert_array_equal(actual, expected)


class GradientChecks(Checks):
    def test_scalar_oracle(self):
        """dX/dW/db 与独立标量循环对照，不能只让形状对上。"""
        x, w, _, dy = inputs()
        dx, dw, db = self.code.linear_backward(x, w, dy)
        self.array(dx, [[sum(float(dy[i, j])*float(w[k, j]) for j in range(w.shape[1])) for k in range(x.shape[1])] for i in range(len(x))])
        self.array(dw, [[sum(float(x[i, k])*float(dy[i, j]) for i in range(len(x))) for j in range(w.shape[1])] for k in range(x.shape[1])])
        self.array(db, [sum(float(row[j]) for row in dy) for j in range(w.shape[1])])

    def test_finite_difference(self):
        """独立标量损失做中心有限差分，不调用候选 linear 形成相互抵消的错误。"""
        x, w, b, dy = inputs()
        gradients = self.code.linear_backward(x, w, dy)
        def loss():
            y = scalar_linear(x, w, b)
            return sum(y[i][j]*float(dy[i, j]) for i in range(len(x)) for j in range(len(b)))
        for values, gradient in zip([x, w, b], gradients):
            for index in np.ndindex(values.shape):
                before = values[index]
                values[index] = before + 1e-5
                plus = loss()
                values[index] = before - 1e-5
                minus = loss()
                values[index] = before
                self.assertAlmostEqual(float(gradient[index]), (plus-minus)/2e-5, delta=1e-6)

    def test_no_extra_average(self):
        """广播的梯度沿 token 轴求和；给定 dY 后不能再除 batch 大小。"""
        x, w, dy = np.ones((3, 2)), np.ones((2, 2)), np.array([[1., 2.], [3., 4.], [5., 6.]])
        self.array(self.code.linear_backward(x, w, dy)[2], [9., 12.])

    def test_invalid(self):
        """上游梯度必须与 Y 同 shape，拒绝错轴和非有限值。"""
        for dy in [np.ones((1, 3)), np.ones((2, 1)), np.full((2, 3), float("inf"))]:
            with self.subTest(shape=dy.shape), self.assertRaises(ValueError):
                self.code.linear_backward(np.ones((2, 2)), np.ones((2, 3)), dy)

    def test_inputs_unchanged(self):
        """梯度计算不修改输入、权重或上游梯度。"""
        x, w, _, dy = inputs()
        before = [a.copy() for a in [x, w, dy]]
        self.code.linear_backward(x, w, dy)
        for actual, expected in zip([x, w, dy], before):
            np.testing.assert_array_equal(actual, expected)


class AttentionChecks(Checks):
    def example(self):
        if VARIANT == "practice":
            x = np.array(FIXTURE["tokens"], dtype=np.float64)
            return x.copy(), x.copy(), x*np.array([10., 20.]), np.tri(3, dtype=bool)
        rng = random.Random(SEED + 71)
        t, s, k, vd = rng.randint(2, 5), rng.randint(2, 5), rng.randint(1, 4), rng.randint(1, 4)
        matrix = lambda a, b: np.array([[rng.uniform(-3, 3) for _ in range(b)] for _ in range(a)])
        allowed = np.array([[j == 0 or rng.random() > .4 for j in range(s)] for _ in range(t)])
        return matrix(t, k), matrix(s, k), matrix(s, vd), allowed

    def test_scalar_oracle(self):
        """核对缩放分数、逐行 mask/softmax 和加权输出，不只检查最终 shape。"""
        q, k, v, allowed = self.example()
        before = [a.copy() for a in [q, k, v, allowed]]
        result = self.code.attention(q, k, v, allowed)
        self.assertEqual(len(result), 3)
        for actual, expected in zip(result, scalar_attention(q, k, v, allowed)):
            self.array(actual, expected)
        for actual, expected in zip([q, k, v, allowed], before):
            np.testing.assert_array_equal(actual, expected)
        # 真正连接学习者的数组→三个线性投影→Attention，而不只分别运行函数。
        x, weights, bias, _ = inputs()
        tokens = self.code.as_tokens(x.tolist())
        q = self.code.linear(tokens, weights, bias)
        k = self.code.linear(tokens, weights, np.zeros_like(bias))
        v = self.code.linear(tokens, weights, -bias)
        allowed = np.tri(len(x), dtype=bool)
        expected_q = np.array(scalar_linear(x, weights, bias))
        expected_k = np.array(scalar_linear(x, weights, np.zeros_like(bias)))
        expected_v = np.array(scalar_linear(x, weights, -bias))
        for actual, expected in zip(self.code.attention(q, k, v, allowed), scalar_attention(expected_q, expected_k, expected_v, allowed)):
            self.array(actual, expected)

    def test_mask_and_future(self):
        """禁止未来信息泄漏：改后续 V 不得改变早期因果输出。"""
        q = k = np.array([[1., 0.], [0., 1.], [1., 1.]])
        v, allowed = np.array([[10., 0.], [0., 20.], [10., 20.]]), np.tri(3, dtype=bool)
        _, probabilities, before = self.code.attention(q, k, v, allowed)
        self.assertTrue((probabilities[~allowed] == 0).all(), "屏蔽概率必须为 0")
        np.testing.assert_allclose(probabilities.sum(axis=1), 1)
        v[2] += 1000
        after = self.code.attention(q, k, v, allowed)[2]
        self.array(after[:2], before[:2])

    def test_stability(self):
        """大分数也不能 exp 溢出；减最大值后保持有限且行和为 1。"""
        q = np.array([[1000., 1000.], [-1000., -1000.]])
        k = q.copy()
        v, allowed = np.array([[1., 2.], [3., 4.]]), np.ones((2, 2), dtype=bool)
        for actual, expected in zip(self.code.attention(q, k, v, allowed), scalar_attention(q, k, v, allowed)):
            self.array(actual, expected)

    def test_cross_shapes(self):
        """Q 和 K 的 token 数可以不同；单 query、多 key、单输出特征仍正确。"""
        q, k = np.array([[1., 2.]]), np.array([[1., 0.], [0., 1.], [-1., 2.]])
        v, allowed = np.array([[10.], [20.], [30.]]), np.array([[True, False, True]])
        for actual, expected in zip(self.code.attention(q, k, v, allowed), scalar_attention(q, k, v, allowed)):
            self.array(actual, expected)

    def test_invalid(self):
        """拒绝全屏蔽行、非 bool mask、错维度/错 shape 及 NaN。"""
        q = k = v = np.ones((2, 2))
        for bad_q, bad_k, bad_v, mask in [(q, k, v, np.zeros((2, 2), dtype=bool)),
                                          (q, k, v, np.ones((2, 2))), (q, k, v, np.ones((2, 1), dtype=bool)),
                                          (q, np.ones((2, 3)), v, np.ones((2, 2), dtype=bool)),
                                          (q, k, np.ones((3, 2)), np.ones((2, 2), dtype=bool)),
                                          (q*np.nan, k, v, np.ones((2, 2), dtype=bool))]:
            with self.subTest(q=bad_q.shape, k=bad_k.shape, v=bad_v.shape), self.assertRaises(ValueError):
                self.code.attention(bad_q, bad_k, bad_v, mask)


def main():
    global VARIANT, SEED
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", choices=["arrays", "linear", "gradient", "attention"], required=True)
    parser.add_argument("--variant", choices=["practice", "transfer"], required=True)
    parser.add_argument("--seed", type=int, required=True)
    args = parser.parse_args()
    VARIANT, SEED = args.variant, args.seed
    classes = [ArraysChecks, LinearChecks, GradientChecks, AttentionChecks]
    classes = classes[:["arrays", "linear", "gradient", "attention"].index(args.task)+1]
    result = unittest.TestResult()
    suite = unittest.TestSuite(unittest.defaultTestLoader.loadTestsFromTestCase(c) for c in classes)
    with contextlib.redirect_stdout(sys.stderr):
        suite.run(result)
    failures = [(case.id(), detail.strip().splitlines()[-1][:350]) for case, detail in result.errors + result.failures]
    output = []
    for cls in classes:
        for name in unittest.defaultTestLoader.getTestCaseNames(cls):
            case = cls(name)
            related = [(identity, detail) for identity, detail in failures if identity == case.id() or identity.startswith(case.id()+" (")]
            first = related[0] if related else None
            feedback = ((first[0][len(case.id()):] + " " + first[1]).strip() if first else "符合本组数值与接口约定")
            output.append(dict(id=case.id().split(".", 1)[-1], passed=not related, feedback=feedback[:450], purpose=case.shortDescription()))
    example = None
    if result.wasSuccessful():
        # 给学习者显示自己代码的中间数值，逐步与网页同一 fixture 对照。
        learner = importlib.import_module("learner")
        x = learner.as_tokens(FIXTURE["tokens"])
        w, b, dy = [np.array(FIXTURE[key], dtype=np.float64) for key in ["weights", "bias", "upstream"]]
        example = dict(x=x.tolist(), shape=list(x.shape), dtype=str(x.dtype))
        if args.task in ["linear", "gradient", "attention"]:
            example["y"] = learner.linear(x, w, b).tolist()
        if args.task in ["gradient", "attention"]:
            dx, dw, db = learner.linear_backward(x, w, dy)
            example.update(dx=dx.tolist(), dw=dw.tolist(), db=db.tolist())
        if args.task == "attention":
            q, k, v = [learner.linear(x, np.array(FIXTURE[name], dtype=np.float64), np.zeros(2)) for name in ["query_weights", "key_weights", "value_weights"]]
            scores, probabilities, values = learner.attention(q, k, v, np.tri(len(x), dtype=bool))
            example.update(q=q.tolist(), k=k.tolist(), v=v.tolist(), scores=scores.tolist(), probabilities=probabilities.tolist(), output=values.tolist())
    print(json.dumps(dict(cases=output, example=example), ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    main()
