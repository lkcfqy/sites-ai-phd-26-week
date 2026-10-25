// 能力门槛与实操契约：不以课数/阅读/自报自动认证。资料核查2026-10-23。
export interface CapabilityLevel {id:string;title:string;scope:string;entry:string[];evidence:string[];notEquivalent:string[];gateLabIds:string[]}
export interface PracticeStep {title:string;body:string;commands:string[];expected:string}
export interface PracticeLab {id:string;title:string;levelId:string;prerequisites:string[];evidenceType:string;verificationStatus:string;summary:string;packageHref:string|null;guideHref:string|null;steps:PracticeStep[];deliverables:string[];acceptance:string[];transfer:string;limits:string[]}
export interface GraduationProject {id:string;title:string;requiredLabIds:string[];brief:string;deliverables:string[];rubric:string[];unseenTask:string;criticalFailures:string[]}

export const capabilityLevels:CapabilityLevel[] = [
  {
    "id": "entry",
    "title": "起步：能独立运行与解释程序",
    "scope": "从零完成文件、终端、Python与基础数学操作；这是进入实操的起点，不是岗位资格。",
    "entry": [],
    "evidence": [
      "从新目录按自己的README重跑程序",
      "修复一次路径/类型/边界错误并说明原因",
      "测试与原始结果保留，不靠点击已读"
    ],
    "notEquivalent": [
      "读完课程不等于能写程序",
      "复制参考实现成功不等于独立完成"
    ],
    "gateLabIds": [
      "cpp-build"
    ]
  },
  {
    "id": "cpu-engineering",
    "title": "CPU工程：能维护、测试和分析小项目",
    "scope": "独立修改C++/Python程序，理解生命周期与并发，完成公平CPU基准。",
    "entry": [
      "能写函数、循环、列表/字典",
      "能解释shape、单位、误差与基本统计"
    ],
    "evidence": [
      "完整C++编译与边界测试",
      "至少一个内存或并发故障的最小复现/修复/回归",
      "实际CPU计时与可解释负结果"
    ],
    "notEquivalent": [
      "Python三重循环计时不等于优化BLAS",
      "本地单机实验不等于生产运维经验"
    ],
    "gateLabIds": [
      "cpp-build",
      "cpp-memory",
      "cpp-threads",
      "cpp-matmul"
    ]
  },
  {
    "id": "model-service",
    "title": "模型工程：能交付质量受控的CPU推理服务",
    "scope": "训练/加载真实小模型，建立正确性与质量基线，用真实HTTP请求测服务；另核验实际框架路径。",
    "entry": [
      "CPU工程出口通过",
      "理解train/validation/test、线性层、激活、推理模式"
    ],
    "evidence": [
      "固定数据划分、模型与配置可重现",
      "模型输出和任务质量测试",
      "真实请求日志、延迟分布、错误/拒绝率、停止清理",
      "至少一个实际框架的导出/编译或运行时对照，不能仅交NumPy模型"
    ],
    "notEquivalent": [
      "标量量化图不是INT8运行时",
      "自写小模型HTTP服务不是vLLM",
      "可选依赖缺失不能记为通过"
    ],
    "gateLabIds": [
      "model-baseline",
      "model-quant",
      "model-service",
      "framework-runtime"
    ]
  },
  {
    "id": "simulation-systems",
    "title": "机制推理：并行、内存与调度仿真",
    "scope": "本次 GPU/LLM 学习采用机制仿真；先形成可解释、可反驳的模型结论，不声称实机性能。",
    "entry": [
      "完成基础代码与 CPU 工程练习",
      "能区分原始计时、模型题设和合成输入"
    ],
    "evidence": [
      "参数/种子/完整合成轨迹及重算结果",
      "在同一输入上改变单个条件，保留负结果",
      "模型假设、质量未验证范围、反馈和重试"
    ],
    "notEquivalent": [
      "仿真时间不是硬件吞吐",
      "假设 token 数不是语言模型生成或任务质量",
      "仿真不能替代真实 CUDA/vLLM 证据"
    ],
    "gateLabIds": [
      "simulation-systems"
    ]
  },
  {
    "id": "gpu-specialist",
    "title": "可选后续 · GPU专项：能在授权NVIDIA设备上验证与优化",
    "scope": "本次仿真学习发布不要求完成此项；真实编译与运行CUDA，处理边界、同步、访存和测量；没有实机证据时此层保持未验收。",
    "entry": [
      "C++内存/并发出口通过",
      "能读时间线、Roofline和Amdahl",
      "已获具体设备与运行预算授权；A100另问"
    ],
    "evidence": [
      "CUDA源码、编译命令、设备/驱动/工具链记录",
      "小/大/非整除shape与浮点正确性",
      "真实事件计时和原始重复样本",
      "对profile提出并验证一个优化假设"
    ],
    "notEquivalent": [
      "浏览器warp动画不能替代CUDA执行",
      "CPU参考仅证明算法，不证明GPU性能",
      "Apple MPS不是CUDA",
      "提供trace分析不等于本人采集"
    ],
    "gateLabIds": [
      "cuda-index",
      "cuda-cooperate",
      "cuda-profile"
    ]
  },
  {
    "id": "independent-role",
    "title": "岗位验收：能独立处理陌生约束与回归",
    "scope": "目标是可检验的独立工作能力，不给“学完自动精通”承诺。每项证据需有来源与核验方式。",
    "entry": [
      "按目标岗位选择相应证据；当前平台先练 CPU 工程和机制仿真，真实设备能力另行验证",
      "会写README、变更说明、实验报告与回滚方案"
    ],
    "evidence": [
      "陌生仓库或新负载下先建立基线再修改",
      "在质量/SLO/资源约束下完成优化或严谨拒绝",
      "定位一个未提前给答案的失败并提交回归测试",
      "答辩中解释反例、局限和迁移边界"
    ],
    "notEquivalent": [
      "预设选项工单只能练推理，不能替代陌生任务",
      "自报JSON只代表提交，不自动证明独立性",
      "只取得速度提升但正确性失败不合格"
    ],
    "gateLabIds": [
      "capstone-cpu",
      "capstone-serving",
      "capstone-gpu",
      "llm-serving"
    ]
  }
];

export const practiceLabs:PracticeLab[] = [
  {
    "id": "cpp-build",
    "title": "01 从文件到可执行程序：C++与本地工具链",
    "levelId": "entry",
    "prerequisites": [],
    "evidenceType": "cpu-measured",
    "verificationStatus": "参考C++基线已g++14.2实测：55项正确性、12项runner边界、UBSan通过；ASan环境受限；学生独立变式待本人完成",
    "summary": "真正编译本地C++源码，先讲清文件、进程、类型、函数、构建和测试。",
    "packageHref": "/systems/labs/cpp/cpp_labs.zip",
    "guideHref": "/systems/labs/cpp/README.md",
    "steps": [
      {
        "title": "先会操作目录与命令",
        "body": "终端执行的是一个进程。当前目录决定相对路径；标准输出用于结果，标准错误用于诊断，退出码0通常表示成功。先在新学习目录解压，别在含密钥的目录试验。不熟悉命令先运行帮助，不粘贴未知安装脚本。",
        "commands": [
          "python3 --version",
          "g++ --version"
        ],
        "expected": "看到实际版本；缺工具时明确缺项，不继续伪造编译结果。"
      },
      {
        "title": "读懂最小C++语法",
        "body": "先把变量、类型、条件、循环和函数与已学Python逐项对照。int相除可能截断，double保存浮点近似。main是程序入口；include声明可用接口；分号结束语句。std::vector管理可变长连续元素，不要求入门就手写内存分配器。",
        "commands": [],
        "expected": "能逐行解释参考程序，并手算一组输入。"
      },
      {
        "title": "编译、链接、运行是三个环节",
        "body": "源码编译成目标代码，链接把函数定义和库接成可执行文件。找不到头文件、未定义符号和运行输出错误分属不同环节。先保留未优化正确基线，再比较发布构建；不要把-O0与-O2差异冒充算法改进。",
        "commands": [],
        "expected": "能指出一次错误发生在哪个环节以及应检查哪个文件。"
      },
      {
        "title": "从函数到多文件项目",
        "body": "将输入校验、计算、结果输出拆成函数。头文件声明接口，源文件给定义；const引用传入只读大对象，避免不必要复制。按README运行固定构建入口，记录完整命令与编译器。",
        "commands": [
          "python3 run.py --help"
        ],
        "expected": "看到包内任务与参数范围；根据README选择任务。"
      },
      {
        "title": "写测试后再改程序",
        "body": "覆盖正常、空、单元素、非法形状。修复应使原先失败输入通过，并保持原正确行为。差异记录包括改了什么、为什么和怎样验收；本地Git可用于记录，不自动对外PR。",
        "commands": [],
        "expected": "测试报告、最小diff和可重复命令。"
      },
      {
        "title": "实际包入口",
        "body": "以下运行固定本地C++源码，先编译再执行；输出必须使用新文件名。可用all/selftest集中检查，具体资源限制见README。",
        "commands": [
          "python3 run.py basics --output basics-01.json",
          "python3 run.py selftest --output selftest-01.json"
        ],
        "expected": "得到mlsys-cpp-labs-v1 JSON：环境、编译命令、源码hash、正确性与原始时间。"
      }
    ],
    "deliverables": [
      "源文件与编译命令",
      "环境记录和测试输出",
      "一份不依赖作者口述的README"
    ],
    "acceptance": [
      "能从新目录按README完成构建运行",
      "修复一处编译/链接或逻辑故障并解释",
      "不是删除断言或改需求使结果通过"
    ],
    "transfer": "把计算函数放入单独文件，新增一个错误输入；不看参考重新接通构建。",
    "limits": [
      "现有参考帮助入门，复制运行不是独立能力证明",
      "不要求安装新编译器或提升系统权限"
    ]
  },
  {
    "id": "cpp-memory",
    "title": "02 所有权、RAII、矩阵布局与边界",
    "levelId": "cpu-engineering",
    "prerequisites": [
      "cpp-build"
    ],
    "evidenceType": "cpu-measured",
    "verificationStatus": "参考C++基线已g++14.2实测：55项正确性、12项runner边界、UBSan通过；ASan环境受限；学生独立变式待本人完成",
    "summary": "从字节地址到对象生命周期，真实编译并测试矩阵容器与访问。",
    "packageHref": "/systems/labs/cpp/cpp_labs.zip",
    "guideHref": "/systems/labs/cpp/README.md",
    "steps": [
      {
        "title": "值、引用、指针与生命周期",
        "body": "值拥有自己的对象；引用是已有对象别名；指针保存地址但不保证目标有效。栈/动态存储的生命周期不同，返回局部对象地址会悬空。vector拥有元素，其扩容可能使旧指针/引用失效。先画对象出生与销毁时间线。",
        "commands": [],
        "expected": "能指出谁拥有内存，哪些别名可能失效。"
      },
      {
        "title": "RAII与异常安全",
        "body": "资源跟随对象生命周期释放。优先容器与智能拥有者，理解析构而不是先练裸new/delete。异常路径也应释放资源；不要通过忽略错误或关闭检查掩盖越界。",
        "commands": [],
        "expected": "在错误输入情况下没有继续进行无意义计算。"
      },
      {
        "title": "行主序、shape与stride",
        "body": "连续矩阵地址=base+(row×cols+col)×元素字节。shape是逻辑接口，stride是物理步长。先在2×3矩阵手算地址，再测试读写与非方阵乘法；相同元素不同访问次序可能改变cache行为。",
        "commands": [],
        "expected": "手算地址与程序索引一致；非方阵结果与参考一致。"
      },
      {
        "title": "边界与诊断构建",
        "body": "诊断构建与性能构建分开。可用时使用AddressSanitizer/UndefinedBehaviorSanitizer；权限或工具不支持时记录限制。诊断无报错不是绝对正确证明，仍需契约和边界测试。",
        "commands": [],
        "expected": "保存诊断输出、最小失败输入、修复和回归测试。"
      },
      {
        "title": "实际包入口",
        "body": "以下运行固定本地C++源码，先编译再执行；输出必须使用新文件名。可用all/selftest集中检查，具体资源限制见README。",
        "commands": [
          "python3 run.py memory --output memory-01.json",
          "python3 run.py selftest --output selftest-01.json"
        ],
        "expected": "得到mlsys-cpp-labs-v1 JSON：环境、编译命令、源码hash、正确性与原始时间。"
      }
    ],
    "deliverables": [
      "矩阵容器与布局图",
      "正常/边界/错误输入测试",
      "一次内存类故障的根因报告"
    ],
    "acceptance": [
      "不越界、不访问失效对象",
      "支持非方阵与非法维度拒绝",
      "诊断构建性能不冒充发布性能"
    ],
    "transfer": "将输入改为0、1、非整除尺寸；分析vector扩容后为何不能继续使用旧元素地址。",
    "limits": [
      "本项目不包含操作系统内存分配器的完整实现",
      "未使用诊断工具时不得写“sanitizer已通过”"
    ]
  },
  {
    "id": "cpp-threads",
    "title": "03 线程、共享状态与有界并发",
    "levelId": "cpu-engineering",
    "prerequisites": [
      "cpp-memory"
    ],
    "evidenceType": "cpu-measured",
    "verificationStatus": "参考C++基线已g++14.2实测：55项正确性、12项runner边界、UBSan通过；ASan环境受限；学生独立变式待本人完成",
    "summary": "以真实C++线程做局部归并，验证正确性并测线程开销。",
    "packageHref": "/systems/labs/cpp/cpp_labs.zip",
    "guideHref": "/systems/labs/cpp/README.md",
    "steps": [
      {
        "title": "进程、线程与资源",
        "body": "线程共享进程地址空间；并发是交错推进，并行是同时执行。线程启动、调度、同步都有成本。先明确输入分片和输出合并，不把增加线程等同加速。",
        "commands": [],
        "expected": "画出每线程读取范围及写入位置。"
      },
      {
        "title": "竞态、锁与局部结果",
        "body": "两个线程读同一个旧值后各写一次，可能丢失更新。不要运行未定义行为后用“这次没错”证明安全。可选择互斥或每线程独立累加后归并；后者减少高频共享写入。",
        "commands": [],
        "expected": "正确版本在多种分片和线程数下都等于串行参考。"
      },
      {
        "title": "线程扫描与过度订阅",
        "body": "固定输入和编译选项，扫描有限线程数。小任务可能被启动开销主导，大任务可能被带宽限制。外层请求并发乘内层线程数可能超出CPU资源；报告两层设置。",
        "commands": [],
        "expected": "所有样本与线程数保存，允许更慢结果。"
      },
      {
        "title": "调试并发不是盲目重试",
        "body": "先根据共享对象和同步点推导风险，再构造受控测试。故障报告要包含触发条件、实际结果、预期结果和修复。不能把无限重复直到成功当验收。",
        "commands": [],
        "expected": "一份含因果解释的并发修复说明。"
      },
      {
        "title": "实际包入口",
        "body": "以下运行固定本地C++源码，先编译再执行；输出必须使用新文件名。可用all/selftest集中检查，具体资源限制见README。",
        "commands": [
          "python3 run.py threads --output threads-01.json",
          "python3 run.py selftest --output selftest-01.json"
        ],
        "expected": "得到mlsys-cpp-labs-v1 JSON：环境、编译命令、源码hash、正确性与原始时间。"
      }
    ],
    "deliverables": [
      "串行与并行源码",
      "分片覆盖/正确性测试",
      "有限线程扫描原始数据"
    ],
    "acceptance": [
      "每元素恰好处理一次，结果正确",
      "并发上限与停止条件生效",
      "未把单次计时或偶然正确当证据"
    ],
    "transfer": "换成非整除分片、线程数大于元素数、并发请求叠加三种情况重新验证。",
    "limits": [
      "CPU线程知识不是CUDA同步知识",
      "不修改系统调度或安全权限"
    ]
  },
  {
    "id": "cpp-matmul",
    "title": "04 真正的C++性能实验：朴素与分块矩阵乘",
    "levelId": "cpu-engineering",
    "prerequisites": [
      "cpp-memory",
      "cpp-threads"
    ],
    "evidenceType": "cpu-measured",
    "verificationStatus": "参考C++基线已g++14.2实测：55项正确性、12项runner边界、UBSan通过；ASan环境受限；学生独立变式待本人完成",
    "summary": "以正确性oracle、实际编译器、原始计时和新shape验证优化假设。",
    "packageHref": "/systems/labs/cpp/cpp_labs.zip",
    "guideHref": "/systems/labs/cpp/README.md",
    "steps": [
      {
        "title": "先写工作量和数据量",
        "body": "矩阵M×K乘K×N，经典计算约2MKN FLOPs；实际读写取决于重用和实现。不要把源代码行数当成本。用小尺寸手算，确保两版计算同一结果。",
        "commands": [],
        "expected": "shape、dtype、误差阈值与工作量写入报告。"
      },
      {
        "title": "朴素顺序与分块复用",
        "body": "分块把子矩阵保留更久以增加复用，但tile过大可能超出cache，过小也可能带来循环开销。改变循环顺序后浮点归并顺序可能不同，要用合理误差检查。",
        "commands": [],
        "expected": "每个测试shape先正确性通过，再允许计时。"
      },
      {
        "title": "公平计时",
        "body": "同编译选项、同数据、预热、交替顺序、重复原始样本。若只测计算，注明不含分配和输入生成；若比较端到端，两版都包括相同必要步骤。结果必须被使用，避免被编译器删除。",
        "commands": [],
        "expected": "基线/候选每次时间、统计方法、环境与限制齐全。"
      },
      {
        "title": "负结果与迁移",
        "body": "加速比=基线时间/候选时间，耗时下降=1-候选/基线。允许分块更慢；报告原因候选与下一实验。不要求初学代码击败成熟BLAS。",
        "commands": [],
        "expected": "至少两种规模、一种非方阵、一个负结果或反证条件。"
      },
      {
        "title": "实际包入口",
        "body": "以下运行固定本地C++源码，先编译再执行；输出必须使用新文件名。可用all/selftest集中检查，具体资源限制见README。",
        "commands": [
          "python3 run.py matmul --output matmul-01.json",
          "python3 run.py selftest --output selftest-01.json"
        ],
        "expected": "得到mlsys-cpp-labs-v1 JSON：环境、编译命令、源码hash、正确性与原始时间。"
      }
    ],
    "deliverables": [
      "可重跑C++基准",
      "全部正确性与计时记录",
      "一页优化评审"
    ],
    "acceptance": [
      "比较公平、没有遗漏必要工作",
      "证据支持或否定明确假设",
      "新shape不依赖写死尺寸"
    ],
    "transfer": "交给别人新生成的M/K/N与tile组合，在不查看预设结论的情况下解释性能。",
    "limits": [
      "微基准不是完整LLM推理",
      "本机结果不可自动推广到其他CPU或GPU"
    ]
  },
  {
    "id": "model-baseline",
    "title": "05 从训练到推理：真实CPU小模型基线",
    "levelId": "model-service",
    "prerequisites": [
      "cpp-build"
    ],
    "evidenceType": "cpu-measured",
    "verificationStatus": "参考基线已CPU实测：float/int8质量与HTTP并发1/4通过；学习者独立改动尚需本人完成",
    "summary": "不再只有标量示意：用固定合成数据训练二分类模型，独立测试并记录原始CPU推理时间。",
    "packageHref": "/systems/model_project/model_project.zip",
    "guideHref": "/systems/model_project/README.md",
    "steps": [
      {
        "title": "先定义任务与切分",
        "body": "输入是8个数值特征，输出为二分类分数。数据为明确生成的教学样本，不是生产文本。训练集拟合权重，验证/测试用独立seed生成；不能反复看测试集挑最好方案。先写朴素基线再评价训练结果。",
        "commands": [],
        "expected": "知道每个输入轴、输出含义与切分来源。"
      },
      {
        "title": "跟踪损失与更新",
        "body": "线性分数z=w·x+b，sigmoid转换成概率，交叉熵梯度驱动权重更新。阅读训练循环后，改学习率或特征并先预测变化。推理只需已训练参数与前向计算，不能每个请求重新训练。",
        "commands": [],
        "expected": "能逐项解释权重、偏置、损失与学习率。"
      },
      {
        "title": "真实基线与正确性",
        "body": "先执行测试，再运行实验。记录Python、模型设置、数据seed、batch、预热和全部时间。慢的结果正常保存，不挑最好一次。",
        "commands": [
          "python3 test_project.py",
          "python3 experiment.py --batch 16 --repeats 100 --output baseline-01.json"
        ],
        "expected": "生成实际CPU时间和模型质量；输出文件应为新名字。"
      },
      {
        "title": "从参考到独立实现",
        "body": "在learner文件按指南独立完成要求，不先看参考。加入空batch、坏字段、非法数值和新batch测试，解释每个失败原因。",
        "commands": [],
        "expected": "独立代码diff、测试输出和新输入对照。"
      }
    ],
    "deliverables": [
      "训练与数据协议",
      "实际模型输出/质量报告",
      "原始CPU时间与独立代码修改"
    ],
    "acceptance": [
      "训练/测试来源隔离",
      "模型输出正确，非法输入明确拒绝",
      "输入与计时边界一致"
    ],
    "transfer": "改变数据生成边界或特征尺度，重新建立基线并解释原参数为何可能失效。",
    "limits": [
      "教学线性模型不是Transformer或LLM",
      "CPU实测证明该任务实际运行，不自动证明作者独立性"
    ]
  },
  {
    "id": "model-quant",
    "title": "06 模型级量化：整数点积、质量与开销",
    "levelId": "model-service",
    "prerequisites": [
      "model-baseline"
    ],
    "evidenceType": "cpu-measured",
    "verificationStatus": "参考基线已CPU实测：float/int8质量与HTTP并发1/4通过；学习者独立改动尚需本人完成",
    "summary": "让量化作用在完整模型输出与任务质量上，同时区分Python整数实现和真实低精度后端。",
    "packageHref": "/systems/model_project/model_project.zip",
    "guideHref": "/systems/model_project/README.md",
    "steps": [
      {
        "title": "把scale带进模型",
        "body": "权重按范围映射到整数，输入可按行动态量化，整数点积后按权重scale×输入scale重构并加偏置。逐行检查量化误差传到logit和分类结果的关系。",
        "commands": [],
        "expected": "能手算至少一个样本，并说明零向量与离群值处理。"
      },
      {
        "title": "相同任务的公平比较",
        "body": "float与量化版用相同测试样本、batch和计时边界。报告任务准确率、logit误差、所有延迟样本。Python整数对象不是硬件打包int8，所以不能从本实现推出Tensor Core或VNNI收益。",
        "commands": [
          "python3 experiment.py --batch 16 --repeats 100 --output quant-compare-01.json"
        ],
        "expected": "实际执行两种路径，候选可能更慢。"
      },
      {
        "title": "单独走真实框架路径",
        "body": "可选torch脚本使用CPU框架动态量化，必须记录实际引擎和版本。未安装或不支持时明确退出，不回退为模拟再报告成功。先阅读指南并选择适合本机的官方CPU安装，避免污染科研环境。",
        "commands": [
          "python3 torch_optional.py --output torch-quant-01.json"
        ],
        "expected": "有依赖时产生实际框架CPU结果；无依赖时清楚失败，能力证据仍待补。"
      }
    ],
    "deliverables": [
      "浮点/量化任务质量与数值误差",
      "同负载原始性能数据",
      "若执行框架路径，保存版本/引擎/错误或成功记录"
    ],
    "acceptance": [
      "没有将文件大小或位宽替代速度",
      "质量先验收再比较性能",
      "标准库与框架证据类别区分"
    ],
    "transfer": "增加离群输入和不同分布，找出量化不收益或质量失败的条件。",
    "limits": [
      "Mac CPU / PyTorch 2.14.1 / qnnpack 参考已实测；INT8 在本次小负载更慢，不能推广为加速",
      "量化API会变化，按指南和实际版本核验"
    ]
  },
  {
    "id": "model-service",
    "title": "07 真实localhost服务、负载与故障",
    "levelId": "model-service",
    "prerequisites": [
      "model-baseline",
      "cpp-threads"
    ],
    "evidenceType": "cpu-measured",
    "verificationStatus": "参考基线已CPU实测：float/int8质量与HTTP并发1/4通过；学习者独立改动尚需本人完成",
    "summary": "启动真实本地推理服务并发送HTTP请求，分析客户端端到端与服务器计算耗时，而不是模拟队列动画。",
    "packageHref": "/systems/model_project/model_project.zip",
    "guideHref": "/systems/model_project/README.md",
    "steps": [
      {
        "title": "HTTP与模型接口",
        "body": "客户端构造请求，服务端先校验再推理并返回JSON。批大小、特征数、有限数值与请求体大小都是契约。仅绑定127.0.0.1；本包不是生产加固服务器，不能开放公网。",
        "commands": [],
        "expected": "能说清请求、响应、状态码和服务生命周期。"
      },
      {
        "title": "在两个终端真实运行",
        "body": "终端A启动服务，终端B运行固定有界负载。端口占用先停止自己启动的旧服务或选择其他非特权端口，不杀不明进程。",
        "commands": [
          "python3 server.py --port 8765 --mode float",
          "python3 load.py --port 8765 --requests 60 --concurrency 1 --batch 8 --output service-c1-01.json"
        ],
        "expected": "真实请求结果与原始延迟保存；结束后Ctrl-C关闭服务。"
      },
      {
        "title": "端到端与计算边界",
        "body": "客户端耗时包含连接、协议、排队、计算与响应；服务返回的compute_ms只是前向计算，不等于请求总延迟。并发升高后观察尾部、失败和总吞吐，不能将未成功请求悄悄删除。",
        "commands": [
          "python3 load.py --port 8765 --requests 60 --concurrency 4 --batch 8 --output service-c4-01.json"
        ],
        "expected": "同样本协议的并发对照，允许过载导致失败。"
      },
      {
        "title": "故障与恢复",
        "body": "依次测试错误字段、超大batch、NaN/Inf、错误路径、停止服务后的客户端行为。写清输入验证与过载机制的边界，不能把单线程教学服务器当已实现生产级动态batch。",
        "commands": [
          "python3 test_project.py"
        ],
        "expected": "错误明确、进程可清理、没有无限请求或残留后台服务。"
      }
    ],
    "deliverables": [
      "服务与客户端代码diff",
      "每请求原始状态/时间和聚合方法",
      "故障报告、恢复及交接"
    ],
    "acceptance": [
      "真实HTTP而非sleep模拟",
      "成功/失败/超时都报告",
      "停止后端口释放，输入边界有效"
    ],
    "transfer": "评审给新batch、突发并发、错误输入或进程终止；独立区分模型、服务与负载器问题。",
    "limits": [
      "不是vLLM或真实LLM benchmark",
      "仅本地教学服务器；认证、TLS、完整背压/生产调度需要进一步实现与评审"
    ]
  },
  {
    "id": "framework-runtime",
    "title": "08 真实框架：导出、运行时与编译摊销",
    "levelId": "model-service",
    "prerequisites": [
      "model-baseline",
      "cpp-matmul"
    ],
    "evidenceType": "cpu-measured",
    "verificationStatus": "Mac CPU 参考通过：ONNX 随机模型五个 batch、已有训练模型六个 batch 与留出质量一致；torch.compile 五个 batch 一致但更慢，结果不代表学习者独立能力",
    "summary": "单列真实框架门槛，不能用标准库模型或阅读文章抵扣。",
    "packageHref": "/systems/framework_project/framework_project.zip",
    "guideHref": "/systems/framework_project/README.md",
    "steps": [
      {
        "title": "模型、图与运行时",
        "body": "PyTorch定义模块和参数，ONNX表达计算图，ONNX Runtime在实际执行提供者上运行。导出成功不是数值正确，更不是所有shape都支持。先用随机小MLP核验部署链路，再接已训练模型补任务质量。",
        "commands": [],
        "expected": "能区分源模型、导出制品、运行时和provider。"
      },
      {
        "title": "真实导出与跨batch一致性",
        "body": "先建立独立CPU环境，按官方说明安装所需依赖并记录版本。脚本不自动下载模型或使用GPU。依赖缺失退出2时保留错误，不能填成功。",
        "commands": [
          "python deploy.py --mode onnx --output-dir result-onnx-01"
        ],
        "expected": "Mac CPU 参考已生成 ONNX 并通过对照；自己复跑需保存实际环境、完整原始样本与失败输入。"
      },
      {
        "title": "编译与冷启动",
        "body": "分别量化eager、首次编译调用、稳态和新shape。只有稳态存在收益时才讨论摊销；还要考虑导出、初始化和进程生命周期。",
        "commands": [
          "python deploy.py --mode compile --output-dir result-compile-01"
        ],
        "expected": "原始热态样本、首次成本、逐shape正确性与局限。"
      },
      {
        "title": "负向接口与回退",
        "body": "加入错误特征维、dtype、边界外batch和一个新层。遇到导出失败先最小复现；明确回退路径及其性能，而非偷偷绕过检查。",
        "commands": [],
        "expected": "失败测试与可执行回退说明。"
      }
    ],
    "deliverables": [
      "环境版本/CPU提供者",
      "模型制品、导出/编译日志、数值对照",
      "原始时间、冷/热成本与错误输入测试"
    ],
    "acceptance": [
      "真实依赖环境执行而非只语法检查",
      "所有支持shape正确，失败范围说明",
      "随机权重一致性不被宣传为任务质量无损"
    ],
    "transfer": "把随机模型替换为实际训练模型，在新batch与短生命周期请求下重新选择部署方案。",
    "limits": [
      "ONNX 原始 Runtime 不强制 batch 上限或拒绝 NaN，服务入口必须显式校验；本次没有 ONNX HTTP 后端验收",
      "框架/操作系统支持需要实际环境核验；不锁未经测试的组合"
    ]
  },
  {
    "id": "simulation-systems",
    "title": "GPU / LLM 机制仿真：并行、内存与调度",
    "levelId": "simulation-systems",
    "prerequisites": [
      "model-service"
    ],
    "evidenceType": "simulation-not-device-measurement",
    "verificationStatus": "确定性模型与来源流程需按本轮回归验收；不运行 GPU 或语言模型",
    "summary": "复用八个可视化模型，形成有种子、假设、完整轨迹和反证的报告。当前学习主线使用仿真；不会用它声称实机通过。",
    "packageHref": null,
    "guideHref": "/systems/SIMULATION_GUIDE.md",
    "steps": [
      {
        "title": "固定条件，先做预测",
        "body": "进入并行、KV、Batch 和 Trace 页，先按指南手算小例子；记录题设与未覆盖条件。",
        "commands": [],
        "expected": "能区分并行槽、实际设备、逻辑 KV、页分配和预算。"
      },
      {
        "title": "保留完整仿真对照",
        "body": "同一种子仅改 batch、并行槽或调度策略，分别下载 JSON；检查最长等待、p95 与有限窗口吞吐。",
        "commands": [],
        "expected": "完整请求不被删除，负结果可复现。"
      },
      {
        "title": "重算、解释和变式",
        "body": "在真实动手页导入仿真文件，补充解释并保存；再用另一种子或约束复做，记录反馈与修订。",
        "commands": [],
        "expected": "保存和导出仍为 simulation，不能变成 GPU / LLM 实测。"
      }
    ],
    "deliverables": [
      "两个条件的仿真原件与参数/种子",
      "对照表、模型假设、失败条件与反证",
      "变式代码练习、评阅和重试记录"
    ],
    "acceptance": [
      "参数与完整轨迹能被服务端重建",
      "并行/容量/排队的手算小例子与程序一致",
      "解释收益失效或长请求变差的条件",
      "全过程保留仿真来源，不宣称设备、vLLM 或真实模型质量通过"
    ],
    "transfer": "更改种子和内存预算，保留无收益或不可行结果，说明还需要什么实际测量才能推广。",
    "limits": [
      "仿真不执行 CUDA 或 vLLM，不生成真实语言模型输出",
      "仿真通过不满足真实设备证据门槛，也不自动证明个人独立能力"
    ]
  },
  {
    "id": "cuda-index",
    "title": "可选实机 · 09 真正的CUDA起步：编译、设备内存与边界",
    "levelId": "gpu-specialist",
    "prerequisites": [
      "cpp-memory",
      "cpp-matmul"
    ],
    "evidenceType": "cuda-measured",
    "verificationStatus": "完整源码可用；当前无nvcc/NVIDIA，未编译或实测",
    "summary": "本次仿真学习发布不要求完成此项。下载两kernel基线，只有在授权NVIDIA环境真实执行后才形成GPU证据。",
    "packageHref": "/systems/cuda_project/cuda_project.zip",
    "guideHref": "/systems/cuda_project/README.md",
    "steps": [
      {
        "title": "先验环境与授权",
        "body": "理解CPU host与GPU device，kernel launch、设备内存与传输。先确认具体设备、驱动、工具链、预算和停止条件；使用A100必须另外询问用户。MPS不替代CUDA。",
        "commands": [
          "nvcc --version",
          "nvidia-smi"
        ],
        "expected": "有真实环境记录；没有设备/工具链时保留待验证，不生成假日志。"
      },
      {
        "title": "线程映射与内存生命周期",
        "body": "索引i=blockIdx.x×blockDim.x+threadIdx.x，向上取整grid后必须判断i<n。设备buffer用RAII清理；检查每个CUDA调用的错误。写出N=1、257和非整除长度映射。",
        "commands": [],
        "expected": "每个合法元素覆盖一次，CPU参考确定预期值。"
      },
      {
        "title": "编译并先正确性",
        "body": "按实际设备配置构建，不复制别人的sm编号。先跑CPU对照和边界，再做性能。日志文件用新名字，避免重定向覆盖旧证据。",
        "commands": [
          "nvcc -O2 -std=c++17 affine.cu -o affine",
          "./affine > baseline-new.jsonl",
          "compute-sanitizer --tool memcheck --error-exitcode 1 ./affine"
        ],
        "expected": "实际环境中得到逐规模结果与工具诊断；当前构建环境尚未核验。"
      }
    ],
    "deliverables": [
      "设备/驱动/nvcc与编译命令",
      "源码和CPU参考测试",
      "实际JSONL及sanitizer结果"
    ],
    "acceptance": [
      "不是浏览器或CPU模拟",
      "多shape正确，越界/错误路径检查",
      "未通过工具步骤如实标记而非省略"
    ],
    "transfer": "评审给未见长度、block、系数与非法参数，独立修复失败。",
    "limits": [
      "包为完整待验证基线；本站未GPU执行",
      "运行前需用户硬件授权；A100另问"
    ]
  },
  {
    "id": "cuda-cooperate",
    "title": "可选实机 · 10 CUDA独立改动：融合与资源取舍",
    "levelId": "gpu-specialist",
    "prerequisites": [
      "cuda-index"
    ],
    "evidenceType": "cuda-measured",
    "verificationStatus": "独立实现任务；基线源可用，优化结果需学习者实测",
    "summary": "本次仿真学习发布不要求完成此项。不提供可复制的优化结论；学习者写融合kernel并用同协议验证。",
    "packageHref": "/systems/cuda_project/cuda_project.zip",
    "guideHref": "/systems/cuda_project/README.md",
    "steps": [
      {
        "title": "建立基线机制",
        "body": "原任务y=max(0,a*x+b)，先affine后relu，存在额外中间读写与launch。理想字节减少是预测，不是实测加速。先算总服务中这部分占比，避免局部优化过度宣传。",
        "commands": [],
        "expected": "给出FLOPs、理论读写及假设。"
      },
      {
        "title": "自己写融合kernel",
        "body": "新建affine_fused.cu或加入明确候选路径，保持原基线、CPU对照与错误检查。每线程一次读取直接输出。不要通过删边界或删同步计时条件“加速”。",
        "commands": [],
        "expected": "完整候选源码、差异说明和正确性结果。"
      },
      {
        "title": "同时看设备与端到端",
        "body": "相同输入/编译/规模/预热下比较event与含传输端到端；保留所有规模和负结果。更快kernel不保证更快服务。",
        "commands": [],
        "expected": "原始设备与端到端样本、统计、误差和适用区间。"
      },
      {
        "title": "再向协作算子迁移",
        "body": "另附reduction.cu共享内存归并基线与barrier讲解：每block部分和最后由CPU合并，尚未在GPU编译执行，不包含性能结论。先手画8线程树形归并，解释越界线程装0且仍到达同步点；再独立实现多轮GPU归并、添加计时。GEMM则以CPU矩阵基线为oracle另做迁移。未真实完成不能宣称掌握协作kernel。",
        "commands": [],
        "expected": "迁移任务的源码、同步解释与新shape测试；不是单纯读懂伪代码。"
      }
    ],
    "deliverables": [
      "基线与候选diff",
      "设备/端到端公平对照",
      "一个无收益案例及协作算子迁移证据"
    ],
    "acceptance": [
      "数值正确先于性能",
      "同工作量且不挑选有利数据",
      "协作kernel能力需另交真实实现不能由融合代替"
    ],
    "transfer": "评审换为reduction或非方阵GEMM，要求画数据依赖并实现；仍缺此项则只通过“融合入门”。",
    "limits": [
      "融合包不等于完整CUDA课程",
      "迁移算子需要学习者独立实现与真实评审，不能用源可读代替完成"
    ]
  },
  {
    "id": "cuda-profile",
    "title": "可选实机 · 11 GPU诊断：从profile到可证伪优化",
    "levelId": "gpu-specialist",
    "prerequisites": [
      "cuda-index",
      "cuda-cooperate"
    ],
    "evidenceType": "cuda-measured",
    "verificationStatus": "需授权硬件与可用计数器；当前未实测",
    "summary": "本次仿真学习发布不要求完成此项。采集本人真实GPU证据，解释访存、launch、同步和瓶颈迁移。",
    "packageHref": "/systems/cuda_project/cuda_project.zip",
    "guideHref": "/systems/cuda_project/README.md",
    "steps": [
      {
        "title": "明确要回答的问题",
        "body": "先提出候选原因：launch开销、数据搬运、计算、低并行度或同步；对应需要的时间线/计数器。工具采集有开销，profile不能直接替代稳态benchmark。",
        "commands": [],
        "expected": "一张假设—所需证据—反证条件表。"
      },
      {
        "title": "合法采集与降级",
        "body": "根据已安装Nsight版本官方帮助配置采集。无计数器权限时记录限制，使用允许的时间线/事件数据，不绕过安全设置。提供的trace只能证明分析能力。",
        "commands": [],
        "expected": "实际工具命令、版本、原始trace与已知采集限制。"
      },
      {
        "title": "验证而不是命名瓶颈",
        "body": "将理论字节、实测时间与可得指标结合。若只看到时间变快而没有访存证据，应写“与减少访存解释相容”，不能宣布已证明。修改后再采一次，因为瓶颈可能转移。",
        "commands": [],
        "expected": "对照实验、原始数据及结论边界。"
      }
    ],
    "deliverables": [
      "本人profile与原始benchmark",
      "至少两个假设及反证",
      "可复现诊断报告"
    ],
    "acceptance": [
      "数据确为本人授权设备",
      "不把峰值上界当预期实测",
      "解释工具开销与权限限制"
    ],
    "transfer": "给一份不同shape或不同设备trace，说明哪些结论可迁移、哪些必须重测。",
    "limits": [
      "无GPU/计数器条件则该能力未验收",
      "不为完成课程修改安全权限或扩大预算"
    ]
  },
  {
    "id": "llm-serving",
    "title": "可选实机 · 12 真实LLM服务专项：vLLM与token级测量",
    "levelId": "gpu-specialist",
    "prerequisites": [
      "model-service",
      "framework-runtime",
      "cuda-index"
    ],
    "evidenceType": "cuda-measured",
    "verificationStatus": "计划/解析工具CPU自测通过；没有vLLM/GPU实测",
    "summary": "本次仿真学习发布不要求完成此项。补齐小模型服务无法检验的prefill/decode、KV、token延迟与真实LLM负载。",
    "packageHref": "/systems/labs/llm-serving/llm_serving.zip",
    "guideHref": "/systems/labs/llm-serving/README.md",
    "steps": [
      {
        "title": "已授权本地模型与版本",
        "body": "只使用有许可且已在本地的兼容模型，先核对硬件/工具链/模型许可和预算。代码不下载模型、不启动GPU。A100必须另外询问。小模型HTTP服务或随机张量不能替代此门槛。",
        "commands": [],
        "expected": "真实环境与许可记录；缺条件时保留未验收。"
      },
      {
        "title": "生成有界计划",
        "body": "计划器只写文件，限制请求数、速率和并发，不执行服务。使用已有本地目录和新输出目录。",
        "commands": [
          "python3 test_tools.py",
          "python3 prepare.py --model-dir /你的已授权本地模型目录 --output-dir run-plan-01 --requests 32 --rate 1 --concurrency 1"
        ],
        "expected": "plan.json状态prepared-not-executed；没有虚构benchmark结果。"
      },
      {
        "title": "在授权设备手动执行",
        "body": "检查实际vLLM --help与指南中的命令，手动在两个终端运行localhost服务和负载。记录启动、warmup、测量、失败与关闭。没有兼容环境就不能称已运行。",
        "commands": [],
        "expected": "真实每请求结果、输入输出长度和设备日志。"
      },
      {
        "title": "分析并做陌生负载迁移",
        "body": "结构检查不证明真实性或质量。增加独立任务质量集，改变一个负载变量，观察TTFT/ITL/吞吐/KV及错误；新长度分布由评审在代码冻结后给出。",
        "commands": [
          "python3 inspect_result.py run-plan-01/benchmark.json --expected-requests 32 --output artifact-check-01.json"
        ],
        "expected": "只给artifact-consistency检查，最终结论由完整证据与评审决定。"
      }
    ],
    "deliverables": [
      "模型与环境/授权边界",
      "真实vLLM原始结果与质量协议",
      "至少一次新负载实验和回滚记录"
    ],
    "acceptance": [
      "确实执行LLM引擎，不用小模型代替",
      "分开性能随机负载与任务质量",
      "硬件/失败/长度/尾延迟/资源约束均明确"
    ],
    "transfer": "评审更换长短混合分布或SLO，在既定预算内定位新瓶颈并给决策。",
    "limits": [
      "此环境无vLLM/GPU，真实运行待授权环境验收",
      "32条初始测量只验证流程，不能稳定声称生产P99"
    ]
  }
];

export const graduationProjects:GraduationProject[] = [
  {
    "id": "capstone-cpu",
    "title": "毕业作品A：陌生CPU代码库的正确性与性能修复",
    "requiredLabIds": [
      "cpp-build",
      "cpp-memory",
      "cpp-threads",
      "cpp-matmul"
    ],
    "brief": "先冻结自己的代码。由评审给出新的矩阵/日志任务、至少一种边界错误和有限CPU预算；独立建立基线，修复，提出优化假设并提交可重跑变更。没有速度提升也可通过，但测量与因果必须严谨。",
    "deliverables": [
      "项目README、构建/运行命令与依赖",
      "源码diff、最小失败输入与回归测试",
      "全部原始样本、环境与统计脚本",
      "一页中英文摘要、负结果与下一步"
    ],
    "rubric": [
      "正确性：正常、边界、非法输入均符合契约",
      "复现性：另一人按README从新目录重跑",
      "测量：同工作量/编译/输入，原始分布与开销完整",
      "诊断：至少一个假设有明确反证并实际检查",
      "迁移：新shape/线程条件不靠写死结果通过"
    ],
    "unseenTask": "评审在提交后生成未见的非方阵尺寸、空/单元素、线程数大于元素数或新工作集。没有评审时只记自主变式完成，不冒充外部盲测。",
    "criticalFailures": [
      "删除测试或改变任务来制造通过",
      "伪造/挑选时间、漏掉必要工作",
      "内存未定义行为或竞态未解决却宣称完成"
    ]
  },
  {
    "id": "capstone-serving",
    "title": "毕业作品B：质量受控的真实模型服务与回归",
    "requiredLabIds": [
      "model-baseline",
      "model-quant",
      "model-service",
      "framework-runtime"
    ],
    "brief": "在真实本地服务上接受质量、延迟、资源约束。需要有训练/测试协议、一个实际框架路径、真实请求和完整失败日志；构造并修复一个服务或部署回归。",
    "deliverables": [
      "训练模型、数据切分与质量协议",
      "实际框架环境、导出/编译/运行时制品",
      "服务/负载器代码、每请求原始数据",
      "发布评审、监控定义、回滚和事故复盘"
    ],
    "rubric": [
      "质量与数值一致性先于性能",
      "客户端/服务器边界和失败请求定义清楚",
      "真实HTTP与实际框架执行，不以模拟抵扣",
      "新batch/dtype/坏输入/停止恢复得到验证",
      "能解释初始化、冷启动、稳态和短生命周期取舍"
    ],
    "unseenTask": "评审新增一个输入分布、并发限制、错误模型制品或运行时不兼容；学习者在预算内定位并写恢复步骤。",
    "criticalFailures": [
      "随机模型输出一致就声称任务质量合格",
      "依赖不可用/导出失败仍标已实测",
      "把敏感数据对外上传或将教学服务开放公网"
    ]
  },
  {
    "id": "capstone-gpu",
    "title": "可选后续实机 · 毕业作品C：真实CUDA优化与陌生kernel",
    "requiredLabIds": [
      "cuda-index",
      "cuda-cooperate",
      "cuda-profile"
    ],
    "brief": "这是长期专项，不是本次仿真学习发布的前置条件。在明确授权设备上独立修改kernel，真实编译、验证边界、采集计时/profile，再迁移到一个未预给最终代码的协作算子。CUDA缺硬件时该作品不能通过。",
    "deliverables": [
      "授权设备/版本/构建命令及源码",
      "CPU oracle、边界/随机输入、sanitizer记录",
      "原始event/端到端样本与本人trace",
      "优化取舍、反例、失败/回滚记录"
    ],
    "rubric": [
      "正确处理索引、生命周期、同步与错误",
      "计时确实覆盖设备完成，冷/热与传输口径清楚",
      "访存/计算解释受证据支持而不是背概念",
      "至少一个reduction或tiled-GEMM等协作迁移独立实现",
      "在新尺寸/资源约束下仍能解释正确性与性能"
    ],
    "unseenTask": "评审提交一个非整除shape、新系数、资源约束或含同步缺陷的版本；学习者先证明正确再比较速度。",
    "criticalFailures": [
      "模拟/MPS/他人trace冒充本人CUDA",
      "未授权GPU或A100实验",
      "为了速度删除同步、边界或误差检查"
    ]
  },
  {
    "id": "capstone-llm",
    "title": "可选后续实机 · 岗位专项作品D：LLM推理服务的真实容量与SLO决策",
    "requiredLabIds": [
      "llm-serving",
      "framework-runtime",
      "cuda-profile"
    ],
    "brief": "这是长期专项，不是本次仿真学习发布的前置条件。用授权本地LLM引擎完成长短输入/输出与并发对照，设定质量/SLO/资源门槛，定位至少一个瓶颈或回归，给出可复查上线或拒绝建议。",
    "deliverables": [
      "模型来源/许可、版本、硬件与预算",
      "固定负载和质量数据协议",
      "token级原始记录、错误率、内存与吞吐",
      "变更diff、两种解释的验证、容量边界与回滚"
    ],
    "rubric": [
      "真实LLM而非分类器或预设工单",
      "TTFT/ITL/TPOT/长度/并发/失败定义清楚",
      "吞吐改善不以违背质量或尾延迟为代价",
      "至少一个未见负载的独立分析",
      "知道尚未验证的多GPU/生产风险并给下一实验"
    ],
    "unseenTask": "在代码冻结后改变长短请求比例或上下文预算，要求在不买卡、不增加预算下诊断并做取舍。",
    "criticalFailures": [
      "只报告总tokens/s或平均延迟",
      "忽略失败/拒绝和输出长度差异",
      "把未经实际验证的生产容量或GPU收益当事实"
    ]
  },
  {
    "id": "capstone-research",
    "title": "可选后续实机 · 研究深化作品E：软硬协同/PIM可证伪提案",
    "requiredLabIds": [
      "cpp-matmul",
      "cuda-profile",
      "llm-serving"
    ],
    "brief": "这是长期专项，不是本次仿真学习发布的前置条件。从真实软件基线出发，选择一个数据移动或计算瓶颈，构建包含主机通信、同步和不支持算子的架构模型；不以玩具模型收益冒充真实PIM。",
    "deliverables": [
      "工作负载画像与基线",
      "参数来源、量纲检查、模型代码和敏感性",
      "至少一个不收益区域/替代解释",
      "复现协议、局限和最小下一实验"
    ],
    "rubric": [
      "每项数据标实测/估算/模拟",
      "端到端收益受占比和新开销约束",
      "参数不确定性与反例可见",
      "研究问题与已有机制的比较可复查"
    ],
    "unseenTask": "评审改变带宽、传输频率或输入分布，学习者重新评估提案是否仍成立。",
    "criticalFailures": [
      "未有真实基线便宣布硬件提升",
      "忽略主机往返与同步",
      "混淆模拟器输出与真实芯片测量"
    ]
  }
];
