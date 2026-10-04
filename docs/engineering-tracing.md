# Engineering tracing：操作发起到结果交付

状态：2026-10-04 tracing 基础链路已部署生产并经真实安装客户端验证；完整产品操作与异步结果覆盖仍在推进。

## 1. 契约与部署边界

一次 GUI 业务操作或 Skill 命令拥有一个根 span。HTTP 返回、Server 持久受理、后台执行完成、结果交付是不同的里程碑。GUI 的操作成功以对应视图提交结果为准；CLI 以结果写出与退出状态为准。HTTP 子 span 的结束点当前是响应 headers 到达，不能据此声称 body 已解码或页面已呈现。

```text
GUI OTel SDK ──┐
Skill OTel SDK ├─ authenticated loopback OTLP intake in Local Core
Core OTel SDK ─┘   → bounded best-effort queue
                   → authenticated Server OTLP relay
Server OTel SDK ───────────────────→ Honeycomb OTLP
Diagnostic Skill → Honeycomb official MCP → queries / complete traces
```

独立制品边界保持：GUI/Skill 只调用 Core；Core 调用 Server；只有 Server 持有 vendor ingest credential。Electron 不新增业务能力或必需的 telemetry runtime。共享 `observability/rust` 是源码库，分别编入 Core 与 Server，不是新增本机业务进程或发行单元。

公共协议为 OTLP HTTP/protobuf。Core 和 Server 用官方 `opentelemetry-proto` 解码与重编码；入口每批最多 1 MiB/512 spans，过滤正文、未知属性、span events、schema URL、tracestate 与资源 entity refs；CLI 不上传 argv/ref/本地路径。Server 继续进行现有账号认证。**匿名 Quick Share、登录前失败的上报尚未解决；不得声称全终端覆盖。**

当前 Core telemetry queue 最多 16 batches，最多三次转发尝试；非持久队列，进程退出可能丢失观测数据。Local intake 成功只表示进入队列；`/v1/observability/config` 返回 accepted/delivered/dropped batch counters。部分拒收不算完整 delivered。该队列不替代业务 outbox。生产大规模发布前仍需 per-account rate limit、租户隔离与独立 Collector 容量验证。

SDK 选择：GUI `@opentelemetry/sdk-trace-web` + protobuf exporter；Python `opentelemetry-sdk` + 官方 OTLP HTTP exporter；Rust `opentelemetry_sdk`/`opentelemetry-otlp`，并提供 `tracing-opentelemetry` bridge。Python 的已锁定 Python 3.9 兼容依赖打入 Skill 的 `lib/vendor`，不执行用户环境 pip；移除 native extensions 后使用这些包的 Python fallback。Windows/Python 多版本实机仍待验证。

## 2. 时钟与因果

持续时间使用 `performance.now()`、`time.monotonic_ns()`、Rust `Instant`。进程内以 epoch + 单调增量生成时间，span 结束为固定 start + 单调 duration；校准更新不改变已经开始的 span 的 duration。系统墙钟回拨不能变成负耗时。

Server 是参考时钟；四时间戳估计客户端偏移 `(t2-t1+t3-t4)/2`，网络不确定度为 `((t4-t1)-(t3-t2))/2`，多次取网络延迟较小的样本。GUI/CLI 通过 Core 时钟桥接，并加上 Core 的上游 uncertainty。Core 异步校准，不阻塞业务启动，每五分钟重采样；GUI 在 online/恢复可见时重采样；CLI 每次命令重采样。

`colab.clock.quality` 区分 `estimated`、`local_only`、`uncalibrated`；`local_only` 不能当作对齐 Server。偏移与 uncertainty 是估计，不保证 UTC 绝对准确，也不能据此推算可靠的单向网络延迟。系统休眠/跨进程重启、大漂移、校准过期与时钟故障注入仍需继续加固验证。Parent IDs 和业务序列定义因果，不按跨设备 timestamp 重新编造顺序。

## 3. 已实现与未实现的覆盖

公共 Axum middleware 创建 server span，Core 的统一 reqwest middleware 创建 client span并注入 W3C headers。只记录 matched route，未知路径记作 `unmatched`，不上传 query/body/错误文本。异步 task 的上下文不会自动跨 `tokio::spawn`、outbox 或 WebSocket 业务 envelope；这些持久边界尚待逐项接入。

CLI 七个入口均通过执行包装器，保持 stdout JSON 与退出码契约；child span 覆盖 Local API 请求及 body 读取。包装器在 SDK 不可用或 Core tracing 关闭时保持业务可运行。

GUI `trackedFetch` 与 Messages transport 接入；缺少 operation 的请求明确标记 `transport_only`。首个明确业务根为 `messages.send`：与其 HTTP 子 span 同一 trace，匹配消息提交后在 React layout effect 结束，视图关闭为 cancelled。该根只说明发送消息完成，**不包含被 mention Agent 的完整执行与回复**。其余 GUI 操作的业务根、初始加载、预览 renderer、Raw fetch、silent polling 和异步结果闭环均未宣称完成。

`observability/boundary-inventory.json` 是可重建源码候选清单：184 个 GUI 事件候选、35 个 CLI parser 声明，以及 448 个结果状态候选。GUI 候选包含纯 UI 事件，不等同于 184 个业务操作；需要分类、收敛并对应结果契约。更新源码后运行 `python3 observability/tools/scan-boundaries.py`。

正式操作目录改为 `tracing/registry.yaml`，当前收敛四个试验入口；旧手工 operations.json 已移除，扫描候选仍保留在 boundary-inventory.json。后续操作目录按账号/Organization/Channel、Messages/Agent、Files、Sessions、Skills、Canvas、Quick Share、安装更新与 Agent 交接分组。每项记录 stable operation、源码入口、成功/失败/取消出口、持久结果、pending/implemented/verified 状态。Canvas 将本地保存与远端同步分开；编辑按事务/提交批次收敛。

## 4. 配置与诊断 Skill

Server 私有环境：

```text
OTEL_EXPORTER_OTLP_ENDPOINT=<provider OTLP base URL>
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_EXPORTER_OTLP_HEADERS=<provider authentication headers>
```

Core 私有环境：`COLAB_TRACING_ENABLED=1`。Core SDK 自动配置 authenticated loopback intake，不分发 Honeycomb key。关闭时无需云端依赖。GUI 与 Skill 从本地 config 获取开关；首次 GUI telemetry 初始化之前的请求尚未保证捕获。

新的独立 `skills/colab-trace` 通过官方 MCP SDK做只读诊断。私有 management key 由调用环境提供，不进入制品。已在本机 Codex skills 目录安装副本；MCP `get_workspace_context` 与 `get_trace` 实测通过。对跨端间隔必须检查 clock quality/uncertainty，对缺失出口区分业务未交付与埋点缺失。

## 5. 验证证据

`observability/tests/validate-honeycomb.py` 使用临时安装树中的真实 `colab-browser open --ref colab://`，经过两个独立 Rust 边界 fixture，使用实际公共 middleware/client 向 Honeycomb `test` 上报，不连接生产产品 DB。**这证明协议与跨进程父子关系，不等同于生产业务端到端验收。**

Honeycomb 查回 trace `589a7e616cc9bb9f2ba823be9635da3a`：5 spans，单个 CLI root → CLI HTTP client → Core HTTP server → Core HTTP client → Server HTTP server，没有 missing root；CLI 输出有效 JSON、exit 0。第一次试验的 missing-root 真实暴露了同步转发超时，已由有界异步 intake 纠正。

[查看已验证 trace](https://ui.honeycomb.io/yuzhyuan-gettingstarted/environments/test/result/3axNN7ZN1kx/trace?trace_id=589a7e616cc9bb9f2ba823be9635da3a)

下一阶段验收：真实 GUI/CLI + 产品 Core/Server 的只读操作；全部操作的入口/结果配对；Agent durable request context、command/ACK/receipt/Agent reply；Canvas outbox/retry/repair；匿名采集认证；休眠/重启/时钟偏移故障注入；完整操作覆盖。生产 rollout 已完成，独立 Core/GUI/Skill 版本已推进，Electron 保持原版本。

## 6. 双提供商切换

私有配置 `~/.config/agent-colab/observability/providers.json` 包含 `activeProvider` 和 `providers.honeycomb/grafana`。公开模板为 `observability/providers.example.json`；`credentialsFile` 指向 0600 的私有 JSON。Honeycomb 使用 `{ "key": "..." }`，Grafana 使用 `{ "token": "..." }`，实例 ID 和 OTLP base endpoint 从 stack 接入页读取。工具生成 Basic authentication，并设置 base 与 traces-specific env，避免旧 traces endpoint/header 覆盖切换。

```sh
python3 observability/tools/configure-server.py --config ~/.config/agent-colab/observability/providers.json --provider grafana --output ~/.config/agent-colab/observability/server-exporter.env
```

`--provider` 只覆盖本次生成；持久选择修改 `activeProvider`。Server 必须加载生成 env 并重启才生效，已有 span 不迁移；客户端仍上报 Core。2026-10-04：已选择 Grafana，保存 private token，OTLP HTTP 200、Tempo authenticated read HTTP 200；Grafana UI 显示隔离 trace 的 3 services/5 spans。用户明确要求完整权限，现有 policy 页面显示全部 16 个表格权限（含 traces:read/write）。真实 GUI/Skill 只读预览数据已发送并查回，生产 Server 已部署并重启加载 env，真实安装 GUI/Skill 到 Core/Server 的 trace 已查回。查询租户与 OTLP 租户不同，分别配置 queryInstanceId/instanceId。

## 7. 安装态 tracing 开关

Core 从 protected discovery 文件所在目录的 `config/observability.env` 加载 `COLAB_TRACING_ENABLED=1`。该文件独立于安装制品，正式 updater 替换 supervisor 后仍保留开关；外部环境变量优先。Server 的 exporter 配置由部署脚本安装到 `/etc/agent-colab/observability.env`，systemd drop-in 加载。客户端无云端 key。

### Tracing production rollout — 2026-10-04

- [x] Server 0.1.121-dev 激活于 `/opt/agent-colab/releases/0.1.121-dev`，systemd active，公网 readiness 为 ok；远端与本地 Linux binary SHA-256 一致（4aef58016e76b6574d5017bddfb5227ce48d510ce20805ff3fc5c79e9c4f49e6）。私有 Grafana exporter env 已由独立 systemd drop-in 加载。
- [x] R2 signed stable channel 0.1.122-dev 发布并执行全部新增制品公网 size/SHA-256 readback。本机正式 updater 成功安装 Core 0.1.78-dev、GUI 0.1.76-dev、Skill 0.1.46-dev；Electron 与 Windows Core 保留原版本。修复 publisher 平台筛选遗漏通用 GUI/Skill 制品的问题。
- [x] V-TRACE-PRODUCTION-SKILL-01：`observability/tests/validate-production.py` 使用已安装 Skill 查询真实生产 Channel，exit 0、4 channels；Tempo 查回 `46636876e384c1999a3e4be29acc1b23`，7 spans，Skill → Core → Server 父子链完整。
- [x] V-TRACE-PRODUCTION-GUI-01：已安装 GUI 实际加载并点击 Files/Sessions，页面返回真实文件与会话。Tempo 查回 `0a9d6f4ebba91daff2d87a4129c3354a`，4 spans，GUI 0.1.76-dev → Core 0.1.78-dev → Server 0.1.121-dev。该 span 是 transport_only，不代表页面全部业务完成或 Agent 回复闭环。
- [x] 实机跨端校准：VPS NTPSynchronized=yes；Core reference=server-estimated，偏移约67 ms、不确定度134–139 ms；GUI/Skill trace quality=estimated，保留各自累积 uncertainty。单端 duration 使用单调时钟。没有执行人工时钟跳变、休眠、漂移注入，不能声称消除所有误差或支持毫秒级跨端排序。
- [x] 回归：GUI 34 tests 与 production build、Skill 24 tests、Rust Core/Server workspace tests/check、Linux release build 均通过；部署脚本 bash syntax 与 git diff whitespace check 通过。
- [ ] 全部业务入口/页面结果配对、Agent durable command/ACK/receipt/reply、Canvas outbox/retry/repair、匿名上报、时钟故障注入与生产限流仍待完成。

### Trace Skill / MCP App foundation — 2026-10-04

- [x] `skills/trace` 新通用 Skill：任务指令与开发 AGENTS.md 分离；init/generate/check/operations/locate/source/executions/performance/trace/app/mcp 脚手架。init 可植入注册目录、OTel JS adapter、校准 adapter 与配置示例。安装副本在 ~/.codex/skills/trace，Codex stdio MCP trace 已注册。
- [x] `tracing/registry.yaml` 四入口为唯一维护源，包含 description、entry、completion、owner、source；生成 GUI TS 与 Skill JSON snapshots，digest stale 检查覆盖各目标。移除旧手工 operations.json 与 trial entries.json；trial 清单动态派生。
- [x] GUI messages.send 与控件绑定消费生成定义；Skill browser.open 消费 snapshot source/description 对应定义。trace.entry.id 经批准的 baggage 跨 Rust Core/Server HTTP 边界传播，传输 span 记录代码路径；intake 白名单保留新增字段。代码通过 GUI 47 tests/build、Skill 29 tests、Rust observability tests/check。
- [x] CLI 与 MCP 使用同一 dispatch；真实 stdio Client 验证 catalog 相同、MCP App HTML resource/mime/meta 有效；通用模块 3 tests（含 clock 过期/非对称样本与 registry 漂移/路径约束）。Skill validator 通过。
- [x] Browser fallback http://127.0.0.1:53481 展示同源清单。查询生产 browser.open `1bf8cec6f3f3fbc46a4a35ff743c0fa5` 并展开 7 spans / 3 services，Grafana 深链接已生成；从清单定位试验 GUI Files 并高亮真实 Share files 成功。
- [ ] MCP host 内实际 iframe 渲染尚未验证（本轮用协议测试与普通浏览器 fallback）；GUI locator 仍是 .trial adapter；查询是独立本地工具读取私有 Grafana 配置，尚未实现 Colab Core→Server 查询代理。
- [ ] 新入口传播/源码字段/校准失效代码尚未发布生产；旧生产 trace 缺源码字段会明确标记。全量入口收敛、异步 outbox/WS 上下文、精确源码 revision 注入、历史 registry 存储与全量 metrics 仍待后续实现。性能结果是最多100条 search sample，不能当总体吞吐量/分位数。

### Trace capability reorganization — 2026-10-04

- [x] 通用 trace 的唯一开发源移至 `~/.codex/skills/trace`；仓库内 skills/trace 副本移除。instrumentation、analysis、catalog 三个能力分别提供 SKILL.md 与 AGENTS.md，公共 dispatch 留在 lib。
- [x] colab-trace 旧查询脚本曾用于云端验证；通用 Honeycomb adapter 移入 trace/analysis，去除 Colab 默认配置路径，随后移除仓库和 Codex 的旧 colab-trace。
- [x] MCP 启动配置与 trial adapter 改为引用个人 Skill；独立 repo fixture 的 MCP/catalog 测试与 registry/clock 测试通过，当前项目 snapshot check 通过。

### Unit-owned tracing registries — 2026-10-04

- [x] 总 tracing/registry.yaml 只引用 GUI、Skill、Core、Server 的 tracing/registry.json。操作定义由所属单元维护，Core/Server 尚无注册业务操作，保持空清单而不编造覆盖。
- [x] GUI 直接 import 本单元 JSON，Skill 使用相同源码/制品相对路径读取 JSON；Skill 打包原样携带 tracing/。移除 targets.json、generated snapshots 和生成命令。
- [x] 通用 trace loader 实时遍历引用，校验重复 ID、重复引用、循环及 repo 外路径；CLI/MCP/trial 同源。相关 loader/MCP tests、GUI build/tests 与 Skill tests 验证，当前正式生产制品未更新。
