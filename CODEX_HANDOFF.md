# Codex Cloud 开发交接

## 产品需求
零基础中文自学 → AI推理优化/MLSys性能工程 → 长期软硬件协同。无固定周数；需要可视化、真正编程/测量/排错、岗位工单与陌生任务验收。旧课不是完整性的包袱；相关知识融入主线，不让学习者跨旧课拼教材。不能承诺网页毕业即精通或保证就业。

## 当前状态
入口 `app/page.tsx`，主UI `app/systems/`；课程 `data/mlsystems-curriculum.ts`；能力契约 `data/systems-practice-contracts.ts`。当前55课、8模拟、6工单、5能力层、12工程实践、5毕业作品。实操源码在 `public/systems/`。后端 `app/api/systems/route.ts` 使用独立D1表、服务端用户ID和CAS；不得破坏账号隔离或旧记录。旧路由 `/legacy` 只兼容归档。

## 优先补强
1. 审核真正零基础到工程实操的先修厚度与教学可用性，不以增加目录/免责声明充当完整课程。
2. 在已授权适配环境验证PyTorch/ONNX/compile与CUDA/LLM项目，逐项保留成功/失败证据。当前未运行的路径不能写成通过；无GPU则继续CPU，不自动开收费算力。
3. 真实窄屏与键盘/读屏验收、长表单反复切换与保存冲突；现有桌面草稿保护已测，不可回归。
4. 增强独立变式考核、原始测量解析及交接报告；不把参考代码执行、提交次数、手动勾选认证为岗位胜任。

## 验证与运行
先查看 `.agents/skills`（如有）及相关说明。使用项目独立依赖环境。
- `npm run install:ci`，`npm run typecheck`
- `npm run check:systems`（9组，含真实C++有界编译测试）
- `npm run check:self-study`（旧教材结构兼容）
- `npm run build`
- 本地隔离API验收：构建后 `SYSTEMS_QA_TEST=1 node --import ./scripts/sites-env.mjs scripts/preview-acceptance.mjs`；仅合成账号，不指向生产数据。
- `scripts/check-systems-browser.mjs`须本地测试服务与可用浏览器，真实用户站点不得保存QA记录。

## 发布/数据约束
仓库是净化快照，不含原站数据库/凭据/完整内部审计记录。保留现有许可、仓库历史与可见性；不要force push。`.openai/hosting.json`是占位项目身份，不得凭它自动create/deploy。生产站的受众仍应保持私人；源码公开不等于允许公开用户学习数据。
不得提交 `.env`、令牌、数据库、用户报告、截图、聊天记录；新增CPU实验应有边界、超时和独占输出。A100/新增收费资源须另获明确授权，实际访问拒绝不得绕过。不要自动启用远程模型代码或公网推理服务。

## 源码快照差异
以源部署v11为依据；部署身份已去除，内部docs/verification与机器回执未导出。C++ZIP重打包仅教学源码/指南，无内部测试日志。旧教材回归改为固定哈希文件，适配本仓库历史。此交接仅包含开发事实与需求，无个人履历信息。
