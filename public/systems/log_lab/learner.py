"""你的工作文件。只用 Python 标准库；先读 README，对照网页逐步完成。

值的契约：耗时必须是有限、非负的 int/float，拒绝 bool 和数字字符串。
所有输入校验用 ValueError，不能靠可以被 -O 关闭的 assert。
"""


def mean_ms(values):
    """任务一：非空耗时列表的平均数；空/非法输入抛 ValueError。

    提示：先检查，再用 total 逐项累加，最后用实际元素数作分母。
    不要把例子里的 3 写成固定分母。0 ms 是合法数据。
    """
    raise NotImplementedError("请实现 mean_ms：累加、计数、相除")


def summarize(records, threshold_ms=100):
    """任务二：逐条检查记录；非法行计数并跳过，不把它当服务失败。

    合法行是 dict，含 status（ok/error）与合法 latency_ms。
    只对 ok 行计算平均数、超过阈值的数量和保留原顺序的耗时列表。
    error_rate = error_count / valid_count；没有合法行时为 None。
    没有成功行时 mean_ms 为 None。阈值也须为有限非负数且非 bool。
    返回的字段（包括空输入）见 README 的接口表；不要改字段名。
    """
    raise NotImplementedError("请实现 summarize：验证、分组、保留分母")


def nearest_rank(values, probability):
    """任务三：先验证非空耗时，排序，取 ceil(p*n)-1 的元素。

    p 必须为有限数，0 < p <= 1，拒绝 bool；不要修改调用者的列表。
    这是最近秩约定，未必等于统计库默认插值结果。
    """
    raise NotImplementedError("请实现 nearest_rank：排序、秩、下标")
