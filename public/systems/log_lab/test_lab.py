"""公开检查，不是保密考试。包含变式，但不能证明独立完成。"""
import argparse
import contextlib
import importlib
import json
import pathlib
import sys
import unittest

FIXTURE = json.loads(pathlib.Path(__file__).with_name("cases.json").read_text())
VARIANT = "practice"


class MeanChecks(unittest.TestCase):
    def setUp(self):
        self.fn = importlib.import_module("learner").mean_ms

    def test_hand_calculation(self):
        """核对手算；不能把三个数的答案写死。"""
        values = FIXTURE["mean_values"] if VARIANT == "practice" else [8, 15, 22]
        self.assertEqual(self.fn(values), 20 if VARIANT == "practice" else 15)

    def test_count_and_zero(self):
        """分母是实际个数；0 不能被当成空值删除。"""
        for values, expected in [([0], 0), ([0, 100, 101], 67), ([2, 4], 3)]:
            with self.subTest(values=values):
                self.assertEqual(self.fn(values), expected)

    def test_fractions(self):
        """平均值可以是小数；不能整数截断。"""
        self.assertEqual(self.fn([0.25, 0.75]), 0.5)

    def test_empty(self):
        """空列表没有平均数，应明确 ValueError。"""
        with self.assertRaises(ValueError):
            self.fn([])

    def test_invalid_values(self):
        """拒绝负数、字符串、bool、NaN 与 Infinity。"""
        for value in [-1, "12", True, None, float("nan"), float("inf")]:
            with self.subTest(value=str(value)), self.assertRaises(ValueError):
                self.fn([1, value])


class RecordChecks(unittest.TestCase):
    def setUp(self):
        self.fn = importlib.import_module("learner").summarize

    def test_fixture(self):
        """非法日志与合法失败请求分开计数；失败率分母是合法请求。"""
        transfer = VARIANT == "transfer"
        records = FIXTURE["transfer_records" if transfer else "records"]
        expected = dict(rows_total=8 if transfer else 10, valid_count=4 if transfer else 7,
                        invalid_count=4 if transfer else 3, success_count=3 if transfer else 6,
                        error_count=1, error_rate=0.25 if transfer else 1/7,
                        success_latencies_ms=[0, 100, 200] if transfer else [12, 18, 30, 0, 100, 101],
                        mean_ms=100 if transfer else 43.5, over_threshold_count=1)
        self.assertEqual(self.fn(records), expected)

    def test_strict_threshold(self):
        """超过指 >，不是 >=；不要把阈值写死为 100。"""
        records = [dict(status="ok", latency_ms=x) for x in [0, 30, 31]]
        self.assertEqual(self.fn(records, 30)["over_threshold_count"], 1)
        self.assertEqual(self.fn(records, 0)["over_threshold_count"], 2)

    def test_empty_and_no_success(self):
        """没有数据应显示不适用，不能把缺测写成 0 ms。"""
        empty = self.fn([])
        self.assertEqual(empty, dict(rows_total=0, valid_count=0, invalid_count=0,
                                    success_count=0, error_count=0, error_rate=None,
                                    success_latencies_ms=[], mean_ms=None, over_threshold_count=0))
        errors = self.fn([dict(status="error", latency_ms=0)])
        self.assertIsNone(errors["mean_ms"])
        self.assertEqual(errors["error_rate"], 1)
        self.assertEqual(errors["success_latencies_ms"], [])

    def test_malformed_rows(self):
        """缺字段、错误类型与未知状态均为非法行；不能吞掉整个文件。"""
        bad = [None, [], {}, dict(status="ok", latency_ms=True),
               dict(status="ok", latency_ms=float("nan")), dict(status="cancelled", latency_ms=1)]
        summary = self.fn(bad)
        self.assertEqual(summary["invalid_count"], 6)
        self.assertEqual(summary["valid_count"], 0)
        self.assertIsNone(summary["error_rate"])

    def test_invalid_threshold(self):
        """非法阈值应报错，不能悄悄过滤所有数据。"""
        for threshold in [-1, True, "100", float("inf"), float("nan")]:
            with self.subTest(threshold=str(threshold)), self.assertRaises(ValueError):
                self.fn([], threshold)


class TailChecks(unittest.TestCase):
    def setUp(self):
        self.fn = importlib.import_module("learner").nearest_rank

    def test_fixture_tail(self):
        """成功请求的 p95 单独计算；不能偷偷丢掉慢请求。"""
        values = [0, 100, 200] if VARIANT == "transfer" else [12, 18, 30, 0, 100, 101]
        self.assertEqual(self.fn(values, .95), 200 if VARIANT == "transfer" else 101)

    def test_nearest_rank(self):
        """最近秩 ceil(0.95*20)=19，从 1 计数；不是插值或最大值。"""
        values = list(range(20, 0, -1))
        self.assertEqual(self.fn(values, .95), 19)
        self.assertEqual(self.fn(values, .5), 10)
        self.assertEqual(values, list(range(20, 0, -1)), "不应修改原列表")

    def test_edges_and_ties(self):
        """支持单元素、并列值及 p=1。"""
        for values, p, expected in [([0], .95, 0), ([3, 0, 3, 8], .5, 3),
                                    ([3, 0, 3, 8], .01, 0), ([3, 0, 3, 8], 1, 8)]:
            with self.subTest(values=values, p=p):
                self.assertEqual(self.fn(values, p), expected)

    def test_invalid_probability(self):
        """p 必须在 (0,1] 且有限；拒绝 bool 和字符串。"""
        for p in [0, -1, 1.1, True, "0.95", float("nan"), float("inf")]:
            with self.subTest(p=str(p)), self.assertRaises(ValueError):
                self.fn([1], p)

    def test_invalid_samples(self):
        """空、负数、bool 与非有限耗时不能生成分位数。"""
        for values in [[], [-1], [True], ["1"], [float("nan")], [float("inf")]]:
            with self.subTest(values=str(values)), self.assertRaises(ValueError):
                self.fn(values, .95)


def main():
    global VARIANT
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", choices=["mean", "records", "tail"], required=True)
    parser.add_argument("--variant", choices=["practice", "transfer"], default="practice")
    args = parser.parse_args()
    VARIANT = args.variant
    classes = [MeanChecks]
    if args.task in ["records", "tail"]:
        classes.append(RecordChecks)
    if args.task == "tail":
        classes.append(TailChecks)
    suite = unittest.TestSuite(unittest.defaultTestLoader.loadTestsFromTestCase(c) for c in classes)
    cases = list(unittest.defaultTestLoader.getTestCaseNames(c) for c in classes)
    result = unittest.TestResult()
    # 学习代码里的 print 留在诊断流，不污染 JSON 协议。
    with contextlib.redirect_stdout(sys.stderr):
        suite.run(result)
    failures = [(case.id(), detail.strip().splitlines()[-1][:500]) for case, detail in result.errors + result.failures]
    output = []
    for cls, names in zip(classes, cases):
        for name in names:
            case = cls(name)
            # unittest 的 subTest 有自己的 id；任一子例失败就必须让所属组失败。
            related = [(identity, detail) for identity, detail in failures
                       if identity == case.id() or identity.startswith(case.id() + " (")]
            messages, seen = [], set()
            for identity, detail in related:
                if detail not in seen:
                    # 保留首个反例参数，并折叠重复异常，避免初学者被整屏重复信息淹没。
                    messages.append((identity[len(case.id()):].strip() + " " + detail).strip())
                    seen.add(detail)
            output.append(dict(id=case.id().split(".", 1)[-1], passed=not messages,
                               feedback="; ".join(messages)[:800] if messages else "检查符合约定", purpose=case.shortDescription()))
    print(json.dumps(output, ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    main()
