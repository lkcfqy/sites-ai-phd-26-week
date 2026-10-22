export const diagnostics=[
 {area:'编程',question:'Python 中，print(2 + 3 * 4) 输出什么？',options:['20','14','234','我还不清楚'],answer:1,explanation:'先乘后加：3×4=12，再加2，得到14。'},
 {area:'编程',question:'要对一组数据中的每个数执行相同操作，最直接使用什么？',options:['循环','文件名','注释','我还不清楚'],answer:0,explanation:'循环逐个处理元素。后续课程会从列表和 for 循环开始练习。'},
 {area:'编程',question:'函数最主要的作用是什么？',options:['让代码变长','封装可重复调用的操作','保证程序没有错误','我还不清楚'],answer:1,explanation:'函数将操作组织成可调用、可测试的单元，但仍需要测试。'},
 {area:'数学',question:'当 y=2x+1，x 增加 1 时，y 增加多少？',options:['1','2','3','我还不清楚'],answer:1,explanation:'斜率2表示 x 每增加1，y增加2。'},
 {area:'数学',question:'向量 [1,2] 与 [3,4] 的点积是多少？',options:['[4,6]','10','11','我还不清楚'],answer:2,explanation:'对应元素相乘再相加：1×3+2×4=11。'},
 {area:'数学',question:'导数可以直观理解为什么？',options:['局部变化率','所有数据的平均数','矩阵大小','我还不清楚'],answer:0,explanation:'导数描述某一点附近，输入小幅变化引起输出变化的速度。'},
 {area:'统计',question:'数据 [1,2,3] 的平均数是多少？',options:['1','2','3','我还不清楚'],answer:1,explanation:'总和6除以3个数据，平均数为2。'},
 {area:'统计',question:'公平硬币连续两次都是正面的概率是多少？',options:['1/2','1/4','1','我还不清楚'],answer:1,explanation:'两次独立事件的概率相乘：1/2×1/2=1/4。'},
 {area:'统计',question:'重复训练得到不同结果时，应如何报告？',options:['只报告最高值','报告多次结果和波动','删除较差结果','我还不清楚'],answer:1,explanation:'多次结果及波动让读者判断结论的稳定程度。'},
 {area:'研究',question:'哪个数据集通常用于选择超参数？',options:['测试集','验证集','把所有数据混在一起','我还不清楚'],answer:1,explanation:'验证集用于选择模型；测试集保留到最终评估。'},
 {area:'研究',question:'模型在训练集很好，在新数据上很差，可能是什么问题？',options:['过拟合','模型已经精通','无需检查','我还不清楚'],answer:0,explanation:'过拟合表示模型适应训练数据，却难以泛化到新数据。'},
 {area:'研究',question:'提出改进后，最有用的证据是什么？',options:['模型名字更新','公平基线、对照实验和可重复结果','只看一张漂亮图','我还不清楚'],answer:1,explanation:'改进需要在公平比较中检验，并说明实验条件与局限。'}
];

// 保留12道诊断题的v1题序和答案；诊断只用于定位，不授予跳课资格。
export const diagnosticPolicy={version:'diagnostic-questions-v1',minutes:10,questionCount:12,
  scope:'每域3道公开基础题，分数不是能力认证或博士资格判断。',
  advancedEntry:'高分者先完成对应陌生实践任务，通过自动任务、变化条件与解释追问核对；缺证据时继续主线。跳级仅跳已证明部分，不抹除课程ID或历史记录。',
  delayedCheck:'7–14天后用不同数据和问题复测，确认保持与迁移；重复原题不能代替独立实践。'};
export const diagnosticGuide:Record<string,{weakness:string;lessons:string[];practice:string;advancedEvidence:string}>={
  '编程':{weakness:'运算、循环或函数概念有缺口。先用小输入逐行预测，再运行对照；能背定义仍可能不会处理异常。',lessons:['w01-d1','w01-d2','w02-d1','w02-d3','w02-d5'],practice:'用未见CSV读取10行，处理空值/类型，写一可复用函数并设计正常和异常输入。',advancedEvidence:'45分钟独立交付读取/清洗/汇总代码与异常测试；评审临时改字段类型，学习者能定位修复并解释。'},
  '数学':{weakness:'变化率、向量与导数需连接数值和图像。先手算低维例，标出维度，再用代码验证；不以记忆公式代替理解。',lessons:['w04-d1','w04-d2','w04-d3','w05-d1','w05-d3'],practice:'手算两个向量点积、矩阵乘法形状与一维MSE梯度，对照数值差分并解释学习率变化。',advancedEvidence:'45分钟无提示手算并编码新二维回归的一步更新；现场发现维度或梯度符号错误，说明变量、假设和限制。'},
  '统计':{weakness:'均值、独立事件与重复结果的汇总可能混淆。先说明观测单位、分母和随机来源，再计算；训练种子不等于新数据。',lessons:['w06-d1','w06-d2','w06-d3','w06-d4','w08-d4'],practice:'计算新数据的均值/样本标准差，做配对差值表，解释为何只报告最佳一次不可靠。',advancedEvidence:'45分钟独立分析含组相关的小表，选择恰当汇总单位、报告全部结果和不确定性限制，拒绝虚假的显著性结论。'},
  '研究':{weakness:'验证选择、过拟合或公平证据边界需补齐。先画信息流与划分，再做基线；漂亮曲线不能证明创新。',lessons:['w07-d4','w08-d1','w08-d2','w08-d3','w08-d5'],practice:'给出陌生任务的主指标和训练/验证/测试协议，找出主体重叠、预处理越界或测试调参。',advancedEvidence:'60分钟独立完成协议审计和小基线；评审更换独立单位后能修复，并解释旧测试已使用的影响。'},
};
