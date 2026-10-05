# Agent Colab 操作追踪

## 注册与埋点

项目总索引 `tracing/registry.yaml` 引用四个制品/服务拥有的 `tracing/registry.json`。文件跟所属制品原样分发；没有编译投影、路径替换或集中注册表的第二份副本。GUI 和 Skill 的业务入口读取本单元定义；Core 和 Server 的粗粒度业务 span 读取本服务的 `spans` 定义。目录 GUI、CLI、MCP 使用同一个索引加载器。

本次静态审计：GUI 92 个请求入口，Skill 39 个实际 argparse 叶命令；Core 145 个、Server 86 个业务处理定义。入口含功能 description、source、owner、entry 和成功/失败/取消边界。静态绑定通过表示代码已消费注册项，不能替代逐入口线上验收。`python3 observability/tools/audit-entries.py` 审计完整 CLI 命令路径；`audit-bindings.py` 审计定义、调用与源码文件；`scan-boundaries.py` 重建 GUI/结果候选供语义审查。239 个 GUI 事件候选中有展开、输入等纯界面事件，不能作为 239 个远端请求计数。

GUI 使用显式 OperationScope 请求闭包，复用业务 messageRequest/后台请求语义；复合提交后的刷新承接同一 parent。Messages 发送在 React layout effect 提交消息后结束；其他请求以状态提交结束，不能声称实际屏幕已完成所有渲染。Canvas 编辑在进入串行队列前开始计时。原生 img/PDF 保持流式 URL，仅通过同源 raw 请求的限定关联参数传递 traceparent/入口 ID；PDF frame load 不证明 PDF 内部渲染成功。Skill 从解析后的 group/operation 选择注册定义，stdout 与退出码保持原契约，参数、业务正文和错误详情不成为 span 属性。

## 运行时数据流

GUI / Skill → Local Core → Server 的业务请求仍保持原来的服务边界。W3C traceparent 负责父子关联，allowlisted baggage 的 trace.entry.id 负责入口检索。JS 显式传 context，Rust 用 task-local scope，不能依赖跨 await/spawn 的线程局部上下文。

GUI / Skill / Core 官方 OTel SDK → Core authenticated loopback OTLP intake → 有界队列 → Server authenticated relay → 配置的 OTLP 平台。
Server SDK → 同一配置平台。当前平台是 Grafana Cloud；Honeycomb 可通过 Server 私有 exporter 配置切换。GUI、Skill、Core 不持有云端 token。Server 的 intake 最多 1 MiB/512 spans，过滤未知属性、events、URL query、错误文本等。GUI 小批次导出以适应有界 intake。启用检查先于实际导出，GUI SDK 同步注册以覆盖首批加载；网络或 SDK 故障不能阻止业务启动。

持久化 Files job、Canvas outbox、Session 首次发布和 Agent command 与业务记录同时保存 version=1 的 trace envelope（traceparent、entryId）。重试/重启消费时恢复原上下文。Session 第一次发布成功后清除初始 share 上下文，后续持续同步不永远挂在首次分享上。Server Agent delivery span 结束于终端 ACK/持久接受，Core agent.execution 包含 provider 执行及完成回执；不能将 WebSocket 连接寿命当任务耗时。任务终态保存回执上下文，GUI 只对已观察到的 live 终态转变记录 agent.result.presented；历史任务不补造返回 span。旧任务缺 envelope 时不编造关联。

本机文件选择、缓存预览等请求可能只经过 GUI/Core；没有远端调用就没有 Server span。后台 reconciliation 与交互请求分别拥有根；不为无上下文的持续轮询伪造业务子 span。自动化测试证明传播与恢复机制，线上验收还需每种实际传输路径回读。

## 提示词审查

本项目明确请求记录组装后的业务提示词，属于正文禁止导出的例外，不是默认性能埋点权限。Server 在最终 assemble_agent_request 记录实际字符串，区分 preview/dispatch；Canvas preview 单独标记。GUI 在复制或打开 Agent 的最终交接位置记录 handoff，不改变实际发送文本。Quick Share 的 capability 等已知凭据在观测副本中遮蔽。

属性包括 prompt.kind、prompt.stage、prompt.template.version、prompt.content、prompt.bytes、prompt.truncated/redacted、colab.request_id 和 code.file.path/function/revision。UTF-8 上限 128 KiB，截断必须明确标记。只有 dispatch 能证明实际下发组装；预览不能替代。记录保存在获授权的 tracing 平台，提示词中的业务内容应按其访问权限保护。

## 时钟与分析

GUI performance.now、Python monotonic_ns 和 Rust Instant 测量持续时间，固定 start + duration 结束。Server 作为参考；四时间戳估计偏移和网络误差，GUI/CLI 经 Core 桥接并累加上游不确定度。Core 周期采样，GUI 启动/online/重新可见及约四分钟重采样，CLI 每次命令采样。超过五分钟的估计无效。首批 GUI span 可为 uncalibrated；失败不阻塞业务。reference/estimated/local_only/uncalibrated 不能混用。网络非对称时误差区间无法彻底消除；因果顺序用 parent，不能按跨主机时间戳推断单向延迟。休眠与大漂移故障注入仍需持续扩大验证。

独立通用 `trace` Skill 不属于 Colab 制品；公开安装制品见 [trace v0.1.1](https://github.com/kwgjjeffrey/trace/releases/tag/v0.1.1)，安装与配置遵循该 Skill 的 `setup/SKILL.md`。其 operations、executions、performance、trace、source、prompts 同时服务 CLI/MCP/GUI。追踪目的地与凭据由使用者在忽略的私有配置中设置，仓库只提交 provider 占位示例；未配置时不得向项目维护者的平台上报。单 trace 按 parent 组织，展示各服务入口的 inclusive 时长；下游等待、并发和重试不能相加。

提示词默认只查元数据，指定 span 再取单份正文；GUI 展开时加载。source 从 span code 属性定位，版本不匹配必须提示。构建注入源码 revision；dirty 构建带变更摘要，不能冒充干净 HEAD。凭据在 `~/.config/trace/agent-colab/`，不进入 Skill 源码或制品。

## 验证状态

本次本地验证：GUI 61 tests 与生产构建；Colab Skill 33 tests；Core 23 tests；Server 7 tests；共享 Rust observability 4 tests。覆盖并发隔离、吞掉的 HTTP 错误、复合动作 parent、延后 GUI 返回、原生 URL、首批 SDK 根、嵌套命令、队列重启/无上下文合并、最终提示词与 capability 遮蔽。线上安装/平台回读结果见 docs/validation-plan.md，本地测试成功不代表每个入口都已线上触发。

Agent-issued CLI commands use invocation-local COLAB_TRACEPARENT/COLAB_TRACE_ENTRY_ID extracted before the command span. The original trace.entry.id survives; trace.operation.id remains the executed parser leaf. Final prompt capture occurs after these non-secret fields are inserted. Enabled SDK paths must be exercised in acceptance; parser-only tests cannot prove transport behavior.

Local intake bounds queued batches to 64 and concurrent delivery to 4, retries transient failures, and reports accepted/delivered/dropped counters. Queue rejection counts as a drop. Intake acceptance is not cloud delivery; live validation checks causal completeness in the backend. GUI burst acceptance and Agent execution are tested together.
