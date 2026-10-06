# Colab 实现计划

2026-10-05 信息关联/Canvas 交互收尾（源码阶段）：@ 候选项按 Agent、成员、文件类型、Session、Canvas 区分图标；Files 行首用文件类型图标，贡献者头像缩小并跟随姓名；Messages 头像与右侧成员列表改为点击打开同一身份卡。Canvas mention 的发送改为先调用 Server 的只读 prompt 预览，再通过共享 Give to Agent 弹层复制或下发，附加 User query 独立输入且实际发送复用同一 prompt builder。Canvas 引用当前用户蓝色高亮、quote/code 样式、文档拖拽排序/移入目录及软删除已实现。代码验证：GUI 23 文件/56 测试及生产构建、Local Core/Server cargo check、Server Canvas prompt 定向测试通过；数据库迁移、安装态和真实跨端下发尚未验收，不标记完成发布。

2026-10-04 信息关联主线：独立契约见 `docs/information-association.md`。已实现 Channel 内 Agent/User 身份卡关联 tasks/共享资产；Files、Sessions、Canvas 与 Messages 均可复制上下文提示词或经带用户指令的 Forward to Agent 弹层派发；Messages/Canvas 资源胶囊保存稳定 kind/ID，详情卡可跳至目标；消息操作提供 Copy to use in my agent 与 Tooltip。Server 对跨 Channel/失权引用重新授权，Canvas projection codec 保护胶囊身份。代码级验证：GUI 20 文件/51 测试、Server 6 测试、Skill 30 测试、Canvas codec 11 测试、Local Core cargo check 已通过。安装态、线上派发与视觉验收仍在验证，不据此宣称用户已收到制品。

2026-10-04 GUI 0.1.82-dev：修复新增头像触发按钮造成 inline 相框碎裂的回归，
相框自身与按钮使用 inline-flex，保留原圆形紫色相框及角标。

2026-10-04 Messages Agent 头像详情入口：复用 shadcn HoverCard 和 AgentIdentityCard，
支持 hover 与点击；任务选择复用现有 work drawer。47 项前端测试和 GUI 构建通过。

2026-10-04 Agent stdout 审查：独立 review 见 `docs/agent-output-review.md`。
request reply 已在源码缩为 sent/messageId，Server recent/quoted context 改为独立消息标题与空行。
用户已批准；六个协作 CLI 已统一接入逐操作 allow-list 和公共 ok/data/page 范式，
colab-open 使用同一 envelope。安装器保留 updater 消费的机器 receipt。
29 项 Python 回归、6 项 Server 回归通过；发布/安装结果见 validation-plan。

2026-10-04 Canvas 转换替换：已删除 Rust 手写 Markdown renderer/XmlText patcher，
改用 Local Core 自有 `canvas-codec`（ProseMirror Markdown + Tiptap Yjs binding）。
7 个转换回归和 Rust/Yrs 桥接回归通过；原文 237 个真实 updates 的打包运行时回放，
追加生成 145-byte delta，换行和胶囊保留。首次 `0.1.75-dev` 验收发现段尾硬换行省略，
已通过显式 `<br>` 映射修复，最终安装制品为 Core `0.1.77-dev`。
安装态真实 Agent 派活、修改文档与 GUI 读回均已通过；证据见 validation-plan 的
“Canvas codec 与更新状态：安装后验收”及文末 closure，不以体外测试替代安装态结果。

状态：执行中  
当前里程碑：M1–M4 主链与 Files 预览已完成；当前主线为 M5 Quick Share，随后依次收口身份生命周期、存储治理和邀请可靠性。Windows 实机验收等待测试设备，微信登录等待开放平台材料，二者不阻塞当前主线。

2026-10-03：主线切换到 Canvas。独立技术设计见 `docs/canvas-technical-design.md`；集中式工程 tracing 后续调研线索见 `docs/engineering-tracing.md`，不阻塞 Canvas 正确性主链。唯一开发前体外门禁 F-CANVAS-01 已通过：真实 Tiptap/Yjs update 可由 Rust/Yrs 投影和局部修改，JS/Tiptap 回放正确，重复/乱序并发更新收敛，结构化组件 fence 修改被拒绝。当前进入正式最窄纵向实现，首轮只做 macOS/Codex。

## M6：Canvas 协作结构化文档（进行中）

1. [x] 技术设计与能力归属；
2. [x] F-CANVAS-01 Tiptap/Yjs ↔ Rust/Yrs Projection Codec 前置门禁；
3. [x] Server Canvas persistence、权限与 account realtime invalidation domain；
4. [x] Local Core Yrs replica、durable outbox、Markdown Projection Codec 与 Local API；
5. [x] macOS `colab-canvas` Agent 脚手架（list/create/read/search/apply-patch）；
6. [~] Desktop GUI Canvas list/Tiptap-Yjs editor、同步状态已完成；typed structured component Node View 未完成；
7. [~] 正式 Projection Codec 普通文本与 component fence 拒绝契约已通过；typed component commands 未实现；
8. [x] 体内 recovery fault injection：Server 不可达时 update 留在 SQLite outbox，Core 重启恢复后以同一 clientUpdateId ACK；
9. [ ] macOS 双用户/双 Agent 系统验收；
10. [ ] 主链完成后接入 engineering tracing，再执行规模与压缩验证。

2026-10-03 实现/验证结果：Server `0.1.98-dev` 已部署且公网 readiness 通过；Mac Core `0.1.67-dev`、GUI `0.1.60-dev`、Skill `0.1.44-dev` 已发布到 stable。本轮 Canvas 没有修改或重建 Electron；stable 保留此前的 Darwin Electron `0.1.21-dev`（Windows `0.1.19-dev`）。Conversation 与 Canvas 复用一个浏览器 account realtime socket；WebSocket 只发可丢失 invalidation，Server sequence/HTTP repair 仍为事实来源。GUI `0.1.60-dev` 进一步保证先应用初始远端 update、再挂载 Tiptap，避免空文档初始化 update 与远端状态竞态；22 项测试和 production build 通过，源码仅有 singleton realtime 模块创建 WebSocket。正式 Core/Skill 链路创建 Canvas、提交真实 Yjs、读取投影、执行 Codex patch、断网持久化与重启补发均通过，证据见 `.trial/V-CANVAS-02-core-skill-recovery/README.md`。typed components、双用户系统验收与规模压缩仍未完成，不标记 Canvas 总里程碑完成。

2026-10-03 Canvas resource UX 修复完成并安装验证：Server `0.1.100-dev`、Mac Core `0.1.69-dev`、GUI `0.1.62-dev` 已发布并安装，Electron 保持 `0.1.21-dev`、Skill 保持 `0.1.45-dev`。根资源统一按 nullable parent 渲染；New 改为菜单直选并立即生成树节点，名称自动全选、Enter/失焦保存、Escape 取消、双击重命名；目录行提供直接新建子文档。Server/Local Core 增加真实 rename use case。Give to Agent 模板严格按“先读当前文档 → 按需编辑 → 最后按需探索其他文档”排序，删除底层投影实现说明。实机强制重载后 Canvas 树显示 `Canvas E2E 2026-10-03` 与 `hello`，New 只出现 Document/Folder 菜单且无创建弹层，Agent Prompt 实机显示新顺序。

2026-10-03 Canvas mention 与文档标题交互完成并安装验证：stable promotion `0.1.109-dev` 安装 GUI `0.1.68-dev` 与 Mac Core `0.1.72-dev`；Electron 保持 `0.1.21-dev`、Skill 保持 `0.1.45-dev`。member/Agent mention 使用带稳定身份 ID 的原子节点，hover/focus 身份卡展示成员或 Agent owner，Agent 卡底部执行真实 Server request；Server 按 mention 所属 Heading section 组装最小任务提示词，并列出按需可用的 read/apply-patch/list 工具。真实请求 `4968a3a1…` 与 `78fa6f16…` 均以一次 attempt 达到 durable `succeeded`，且复用 Desktop 可见 thread `01a0f715…`。首次黑盒发送分别发现并修复旧数据库 kind 约束与 Tiptap Collaboration 默认 shared type（`default`）投影错误；最终安装态 `colab-canvas read` 返回 `syncState=synced` 且包含结构化 mention 的 Markdown 投影。文档标题可在 header 与 sidebar 双击编辑并走同一 rename use case；同步状态紧邻标题，header 下方分割线已移除。

2026-10-03 Agent activity 与 Canvas 编辑器补齐并安装验证：stable promotion `0.1.111-dev` 只推进 GUI 到 `0.1.70-dev`，Core `0.1.72-dev`、Skill `0.1.45-dev`、Electron `0.1.21-dev` 均保持不变；Server `0.1.111-dev` 已部署。Messages 原先已有 `running` 聚合函数但没有接入任何可见组件；现已把 Server 权威 request 状态投影到 Channel 顶部稳定状态位。Canvas request 在 Server 持久关联 `source_canvas_id`，GUI 可跨刷新/设备恢复本篇文档最近一次 `Sent / working / Completed / Failed`，并通过 account realtime invalidation、重连和 5 秒低频对账更新；状态同时显示在文档标题旁和 Agent 身份卡中。编辑正文改为居中的 `max-w-4xl` 页面与 48px 横向 gutter，并基于已有 Tiptap StarterKit 命令提供 Paragraph、Heading 1–3、Bold、Italic、bullet/numbered list、quote、code block 工具栏。安装态实机已从 Server 恢复用户此前请求并同时显示 `Runtime Validation Agent completed` 与标题旁 `Completed`，资源树、页边距及全部格式控件也已出现。

2026-10-03 Canvas command 状态模型与块样式交互修正并完成安装态验收：stable promotion `0.1.114-dev` 安装 GUI `0.1.73-dev`，Server `0.1.112-dev` 已部署；Electron `0.1.21-dev`、Core `0.1.72-dev`、Skill `0.1.45-dev` 均保持不变。Canvas 不再把“最近一次 request”投影为文档或 Channel 的永久完成态，也不让发送按钮兼任状态标签。身份卡按 `(canvas_id, target_blueprint_id)` 汇总该 Agent 的所有未结束 command，终态自动退出即时区域，按钮始终保持发送语义；完整历史仍由 `agent_requests` 保存。常驻格式工具栏删除，改为 top-level block hover 手柄和块类型菜单。Server request list 增加稳定 `targetBlueprintId`，避免按可变显示名关联。安装态确认标题区只保留 `Synced`，Agent 卡只显示 `Send to Agent Runtime Validation Agent`，点击正文块出现 Text、Heading 1–3、Bulleted list、Numbered list、Quote、Code 菜单。

2026-10-02：Messages 紧凑交互补齐：macOS Shell 以 hidden-inset 暴露固定标题状态位；GUI 将 Loading 与 Agent working 投影到同一位置，连续 WebSocket invalidation 使用 drain 对账；composer 支持 Agent/成员原子 mention、Enter 发送与 Shift+Enter 换行；人类头像使用绿色环，Agent 标记使用紫色。GUI/Shell 独立版本分别推进，未改动 Core、Skill 或 Server。

2026-10-02：修复 macOS Shell 大制品更新：安装器不再给 immutable artifact 设置 180 秒总下载时限，改为 curl 断点续传、传输错误重试与 60 秒低速失活检测；manifest/signature 等元数据仍保留有界总超时。该变更只推进 Colab Skill，不重打 GUI/Core/Shell。

2026-10-02：更新交互与 Messages 操作区继续收口。长更新从通用 `trackedFetch` 剥离，Skill 原子写入下载进度，Core 暴露只读进度，GUI 在始终可见的 Updates 行展示进度/速度/ETA；Core/GUI/Skill 先激活重启，再自动续跑 Shell 下载，使新 Core 能观测大文件进度。消息 hover 操作移动到时间后，采用 Quote/Forward/List 图标；多选态统一把 checkbox 放到每条消息左侧。

## 执行纪律

- 严格按里程碑和任务编号推进；前一项未达到验收条件，不提前铺后续功能；
- 当前阶段使用真实 Google OAuth、真实 PostgreSQL 和真实 Rust Server，不以 mock/fake 服务替代最终验收；
- 单元测试可以隔离纯函数，但跨端闭环必须连接真实组件；
- 每完成一项，更新本清单的状态、验证命令和结果；
- Supabase 实现冻结，不在当前主线修改；
- Files 已稳定，Session 已完成；Shared Skill 按已确认的统一 `source_path`、shadow Git `root_oid` 与目标 Agent 安装模型实现。
- T2.4 Files 超大来源防护已完成发布与真实复验；主线可恢复 Shared Skill 纵向实现。

## 总体顺序

1. **M1：Desktop + 成员管理闭环**
2. **M2：Files 共享与同步闭环**
3. **M3：Session 与 Skill Shared Item**
4. **M4：Python Agent Skill**
5. **M5：Quick Share 一次性上下文传输**

## M1：Desktop + 成员管理闭环

### M1.0 工程和制品骨架

- [x] `desktop/ui`：独立 React/Vite GUI 资源制品；`desktop/shell` 是可选 Electron launcher，不承担业务和更新真源；
- [x] `local/`：Rust workspace、`colabd`、Local API contract；
- [x] `server/`：Rust workspace、Server API contract、standalone server；
- [x] `skills/colab/`：独立 Skill artifact，包含 setup、Colab Browser 与 Session Reader 稳定入口；
- [x] 统一版本文件、格式化、lint、测试和构建入口；
- [x] Local Core、Desktop GUI、Skill 三个必需本地制品的真实构建和 release manifest；Server 独立部署；Electron 为可选 launcher。

验收：三个工程可独立构建；根级检查命令可一次运行；目录与技术设计一致。

结果：2026-09-27 已按新边界改造。GUI 由 Local Core 通过 loopback HTTP 托管；Skill setup 负责三个必需本地制品的安装/更新/启动；Electron 只是可选的 App 入口。2026-09-28 将 Skill canonical name、调用名和各 Agent 安装目录统一为 `agent-colab` / `$agent-colab`，补齐 `agents/openai.yaml` 搜索元数据，并通过 `0.1.14-dev` 真实发布与 Codex 安装验证；受管的旧 `colab` 链接已安全迁移删除。

2026-09-28 修正版本模型：release promotion 与四个 artifact 版本解耦，receipt 增加 `componentVersions`，默认构建不再重打 Electron。设置页统一检查/更新，独立显示 Agent Colab Skill 版本；Agent 行只管理安装目标。`0.1.15-dev` 已真实发布、安装并验证，Electron 正确保持 `0.1.12-dev`。

2026-09-28 Files “Give to Agent”交互完成：`use` 同步返回当前本地根路径与目录树；GUI 使用可关闭 Dialog 和默认 Agent split-button，设置持久化默认 Agent。`0.1.16-dev` 已发布并真实安装；安装后的命令对 `Files tree validation` 返回预期 `localPath` 和 4 项 tree，默认 Agent 写入/读取与 Codex 打开接口均通过。

### M1.1 独立 Rust Server 基础

- [x] Axum/Tokio 服务启动、配置加载和健康检查；
- [x] 连接真实 PostgreSQL；
- [x] migrations 与启动时版本检查；
- [x] 结构化错误、request id、body/timeout 基线；
- [x] `server/api/openapi.yaml` 建立 v1 最小契约。

验收：真实 PostgreSQL 上 migration 成功；`/health/live`、`/health/ready` 可验证进程与数据库状态。

结果：2026-09-26 完成。连接本机真实 PostgreSQL 17 数据库 `agent_colab_dev`，SQLx migration `0001 foundation` 成功；真实进程的 liveness、readiness、status 均返回 200，并携带 `x-request-id`。

### M1.2 真实 Google Auth

- [x] 创建/确认正确类型的 Google OAuth client；
- [x] 配置真实 redirect URI；
- [x] Local Core 实现 authorization code + PKCE、state/nonce 校验，Rust Server 向 Google 验证 ID token；
- [x] 建立 `users`、`auth_identities`、`sessions`；
- [x] opaque access/refresh token rotation；
- [x] logout/revoke 与 Desktop 系统浏览器真实 Google 登录；
- [x] 多账号 session 写入 Local Core 独占、权限为 `0600` 的 SQLite；Web 使用 HttpOnly/Secure cookie。

验收：真实 Google 账号完成登录、刷新、服务重启后恢复、退出；旧 refresh token 无法继续使用。

### M1.3 Channel 与成员服务端闭环

- [x] `organizations`、`organization_members`、企业 IdP 映射、`channels`、`channel_members`；
- [x] Organization Member 作为组织内主体；Channel membership、创建者和邀请者不再直接引用全局 User；
- [x] 账号设置内列出、切换和创建 Organization，Local Core 按账号保存当前 Organization；
- [x] 创建、读取、修改 Channel；
- [x] 列出、添加、移除成员；
- [x] owner/admin/member 权限；
- [x] 组织内人员搜索与直接加入 Channel；
- [x] 组织外邀请、接受后原子加入 Organization 与 Channel 的服务端模型；
- [x] 邀请 Web 落地页、Desktop deep link、Local Core 接受接口和登录后继续处理邀请；
- [x] Cloudflare 免费 verified-destination 发信链路启用并完成真实投递；
- [ ] transactional outbox/retry 与双账号点击邮件后的完整 UX 验收；
- [x] 对应 Server API 与数据库迁移。

验收：至少两个真实 Google 身份完成创建 Channel、组织外邮件邀请与同意、加入、权限拒绝、移除和重新加入流程。

### M1.4 Rust Local Core

- [x] `colabd` 独立进程与真实 Server client；
- [x] SQLite 账号 schema、单写模型和多账号切换；
- [x] loopback Local API、mode-0600 discovery file，以及首次随机生成、后续重启稳定复用的端口和 bearer；
- [x] 登录、Channel、成员、设置 use cases；
- [x] GUI 不运行时可启动、恢复状态和访问 Server；
- [~] launchd 首版安装与启动已完成；卸载入口延后到发布强化。

验收：仅运行 `colabd` 时 Local API 可完成登录状态查询和 Channel/成员操作；重启不丢失状态。

### M1.5 Desktop GUI

- [x] Google 登录页和账号状态；
- [x] Discord server 风格 Channel rail；
- [x] Channel Settings：名称、图标、成员管理；
- [x] 所有业务请求只经过 Local API；
- [ ] 错误、加载、空状态和权限反馈；
- [x] 退出 GUI 后 `colabd` 继续运行。

验收：两名真实用户通过 Desktop 完成整个成员管理故事线。

### M1.6 Setup、安装与更新基线

- [x] Skill setup 安装 GUI、`colabd`、Skill artifact，Electron 不是前置；
- [~] release manifest、Ed25519 SSH 签名、SHA-256 和独立制品 URL 已真实验收；兼容范围拒绝尚未完成；
- [x] ownership receipt；
- [~] 安全解包、staging 和稳定链接原子替换已完成；alpha 更新异步触发 Local Core 重启，health-gated rollback 延后；
- [~] Codex 安装位置、版本目录和稳定链接已验收；Claude Code/MyFlicker 检测和用户修改保护待完成；
- [x] headless setup 为安装真源，GUI 只调用同一 setup 能力；
- [x] macOS LaunchAgent 真实安装并启动 `colabd`，GUI 在不安装 Electron 时可从 discovery endpoint 访问；
- [x] Cloudflare R2 作为统一客户端制品源：四个制品使用不可变版本路径，签名 stable channel 使用自定义域名分发，并逐个公网回读校验；VPS 不再承担客户端制品分发；
- [x] 公网 bootstrap 安装器已发布到 R2：先验证 stable manifest SSH 签名，再校验 Skill hash/size，最后由 Skill setup 安装 Core、GUI、Skill；支持可选安装 Electron；
- [~] 可选 Electron macOS arm64 launcher 已收敛为纯 Local Core GUI launcher，不再捆绑或管理 GUI；`0.1.8-dev` 已构建、ad-hoc 签名并由 R2 完整回读。当前未做 Apple Developer ID 签名/公证；
- [x] standalone Server 在 VPS 完成 PostgreSQL 16、migration 1–11、systemd 激活和内外网 readiness 验收。

实测（2026-09-28）：Server `0.1.6-dev` 的 `http://108.174.57.132:8787/health/ready` 返回 200，migration 11 已生效。客户端制品位于 `https://artifacts.agent-colab.zhiyuanwangluo.online`；当前 stable `0.1.12-dev` 的 Local Core、GUI、Skill、Electron 均从自定义域名完整下载并通过 size + SHA-256。GUI 分别展示 Local Core、GUI Resources、Electron Shell 的当前/最新版本，并按 Agent 类型安装 Skill。Electron Shell 已从 `0.1.8-dev` 独立更新到 `0.1.12-dev`，旧 App 保留在应用数据备份目录。Electron 仍为 ad-hoc 签名 alpha 制品。

### T1.5 GUI 安装与更新入口（已完成）

- [x] Settings 分别展示 Local Core、GUI Resources、Electron Shell 的当前/最新版本，以及 Codex、Claude Code、MyFlicker Skill 状态；
- [x] 检查更新、资源更新、按 Agent 安装/卸载均委托同一个 `colab-setup`，React 不直接改安装目录；
- [x] GUI 实测 `0.1.12-dev` 三项制品 current/latest，Codex 已安装，并通过 API 完成 Claude Code 安装与卸载；Electron Shell 独立更新保留可恢复备份。

验收：干净环境完成安装；执行一次升级；模拟失败后回滚；GUI 不运行时 Local Core 仍可用。

### M1.7 M1 端到端验收

- [ ] 从干净安装开始；
- [ ] 用户 A、B 使用真实 Google 登录；
- [ ] A 创建 Channel 并添加 B；
- [ ] B 看到 Channel；
- [ ] 权限和移除生效；
- [ ] GUI 退出、Server/Local 重启后状态一致；
- [ ] 记录遗留问题并决定是否进入 M2。

## M2：Files 共享与同步闭环

- [x] 统一 `channel_shares(kind=files)`、Files revision 数据与 Server/Local API；
- [x] 来源目录外置 shadow Git，不修改或复用开发目录自身 `.git`；
- [x] 首次完整 pack、后续 thin incremental pack、root commit 与 CAS；
- [x] 可替换 Blob Store 的首个本地文件系统 adapter；
- [x] 其他成员下载 revision chain、校验 Git pack、物化当前 root；
- [x] Desktop Files 列表、单文件/目录选择、自动发布，以及 IDE 式全窗下钻预览；文本、图片、PDF、`.docx`、`.xlsx` 有明确 renderer，未知/损坏/超限格式在预览区降级；不再显示“Open/Share changes”假操作；
- [x] 贡献者撤回与非贡献者权限拒绝；
- [x] 真实双账号完成两次 revision、消费物化、目录树和文件内容验证；
- [x] 原生文件监听、2 秒静默窗口合并、首次立即发布与进程内失败重试；
- [x] `E2E-FILES-01` 用两个真实 Google 账号和共同 Channel 验证：单文件/目录首次发布、watcher 自动推进 root、消费端旧缓存即时读取、Skill 同步后原子更新、按贡献者/分享名物化、GUI 树/文本预览、canonical Give-to-Agent 指令和贡献者撤回；
- [x] Agent ref 改用可读完整路径；解析先受当前账号、当前 Organization 和权限过滤，再由子孙路径收窄；完整路径歧义时返回候选元数据与 UUID fallback；`colab-browser use` 在一次操作内部完成解析、检查、同步与本地路径返回；
- [x] 持久化 job/outbox、进程重启后的断网退避恢复与任务状态 UI；
- [ ] Blob 求缺协议、服务端 GC、配额和大文件上限策略；
- [x] 两个真实账号在同一设备切换，完成贡献端与消费端权限、发布、缓存和物化闭环；不再把第二台物理设备作为独立产品验证项。

## M3：Session 与 Skill Shared Item

- [x] Session 接口专项设计：已用真实共享会话验证最近 turns、revision-pinned cursor、工具输出开关、单项截断和 freshness；已明确“原始结构持久化、读取时投影”的 adapter 边界；
- [x] Session 纵向闭环：来源增量同步、服务端原始结构存储、本地缓存、按来源读取适配、Session Reader、Desktop 共享/阅读/撤回与真实双账号验收已完成；
- [x] Session 来源选择性能：三类 Agent 的会话元数据由后台增量写入 SQLite，选择器即时打开并按名称或 thread/session ID 搜索，列表标明来源 Agent；正文不进入索引；
- [x] Skill Tool 接口专项设计：来源发现、选择 Codex/Claude Code/MyFlicker 安装目标、ensure/check-update/update/uninstall、receipt 和用户修改保护；
- [x] 明确 Skill 不是通过 Browser 阅读目录来消费；自动发现与用户指定路径统一进入 `source_path` catalog；shadow Git `root_oid` 即共享版本；
- [x] Server：Skill Shared Item、opaque Git pack revision、撤回与权限闭环；
- [x] Local Core：Skill catalog、48 小时变化推荐、watcher/outbox、物化与安装 receipt；
- [x] Python Agent Skill：Browser 的 Skill share/withdraw parity、`colab-skill-tool`，以及独立 GUI 启动脚手架 `colab-open`；
- [x] Desktop：来源选择、共享列表、安装/更新/卸载、统一 Give-to-Agent 弹层；
- [x] 文档、各模块 `AGENTS.md`、契约、自动测试和双账号真实验收；
- [x] 独立制品构建、Server 部署、R2 发布与安装升级验收：release `0.1.42-dev`，Core `0.1.32-dev`、GUI `0.1.27-dev`、Skill `0.1.29-dev`、Electron 保持 `0.1.14-dev`。

## M4：Python Agent Skill

1. [x] Python 标准库 Local API client；
2. [x] Channel/Shared Item 消费：`open` 用于自主浏览，`use` 用于指定对象的一步解析、同步与本地交付；可读名称 ref 已用安装后 Codex 路径验收；
3. [~] Browser 的 Channel create/update、成员管理、Files/Session/Skill share 与 withdraw 已实现；跨对象正文 search/changes 仍延后；
4. [x] Session Reader：已实现 snapshot-pinned cursor、来源 adapter 与工具输出裁剪；
5. [~] headless setup 安装与更新：主链与多 Agent target 通过，正式签名、公证与自动回滚仍延后；
6. [x] Codex、Claude Code、MyFlicker 的实际安装位置、安装/更新/卸载与用户修改保护已验收；用户要求打开产品页面时由 `colab-open` 直接启动 Core 并打开认证后的 GUI，不经过 setup 或资源查询命令。

## M5：Quick Share 一次性上下文传输（纵向实现中）

1. [x] 产品边界：Quick Share 是固定快照的临时 Transfer，不是临时 Channel，不创建 Organization Member，也不要求贡献者或接收者先加入协作关系；
2. [x] 安全边界：默认 24 小时、可提前撤销、服务端仅存 capability token hash；token 只能读取明确列出的对象，不能枚举其他资源；
3. [x] **T5.1 Server**：transfer schema、匿名创建限额/滥用防护、capability consume/revoke、到期 GC 与 Blob 引用回收；
4. [x] **T5.2 Local Core**：复用 Files/Skill shadow Git 与 Session 固定字节边界建立一次静态快照，不注册 watcher；接收端以流式 SHA-256 校验完成隔离物化、token 脱敏和 Files/Session/Skill 分流；
5. [x] **T5.3 Python Skill**：新增并验证 `colab-transfer create|receive|revoke`；官方 Core 制品携带发布者 OAuth client 配置，公开签名安装器不再要求终端用户选择 JSON；
6. [x] **T5.4 Desktop**：实现全局 Quick Share 类型下拉、Session/Files/Skill 单 item 选择、选中即创建、弹层内结果管理、TTL、接收提示词、使用者列表、复制和提前撤销；`Manage shared items` 可重新进入已经成立的分享；
7. [x] **T5.5 管理面**：Server 以 hashed reader identity 聚合领取记录，登录接收者显示账号、未登录接收者保持匿名；Local Core 私有保存管理 capability 和来源摘要，提供 list/detail/update/revoke API；
8. [~] **T5.6 黑盒验收（当前）**：release `0.1.59-dev` 已部署 Server migration/API，R2 完整回读并在本机实际升级到 Core `0.1.42-dev`、GUI `0.1.36-dev`；Skill `0.1.35-dev` 与 Electron `0.1.18-dev` 未无故升版。真实单 item Files 快照已验证创建、领取、登录账号使用记录、有效期修改、管理清单与撤销；GUI 已目视验证类型下拉、结果页边界和 `Manage shared items`。干净未安装起点、自然到期、超额与 GC 仍为后续黑盒项。

### M5 之后的固定收口顺序

1. [x] Google session 生命周期：Server 一次性 refresh rotation 与代际记录、Local Core 到期前单飞恢复和原子持久化、replay 撤销 session family；隔离测试 session 黑盒已验证；
2. [x] Files 存储治理：Files/Skill pack 上传和下载改为磁盘流式 I/O，Server 256 MiB 硬边界、每贡献者 2 GiB active revision 配额、失败写入即时清理及基于可达性的小时 GC；
3. [~] 邀请可靠性：transactional outbox、lease 恢复、指数退避和 GUI queued 语义已完成并通过真实 provider 失败重试黑盒；任意收件人送达仍等待 VPS 25 端口/rDNS 条件，不把外部准备伪装成已完成；
4. [ ] Windows 干净账户实机：首次启动、登录、更新和三类共享；**等待测试设备，不阻塞 1–3**；
5. [ ] 微信登录：provider identity、显式账号关联和真实登录；**等待微信开放平台材料，不阻塞 1–4**。

## 身份能力待办

- [x] Google session 生命周期加固：refresh rotation、过期恢复和 replay 黑盒测试；
- [ ] 微信登录集成：确认开放平台网站应用/移动应用身份类型、unionid/openid 账号合并规则、OAuth 回调和中国区隐私合规，再实现 Server provider adapter、GUI 登录入口及真实账号验收；不得把微信账号与 Google 账号仅按昵称或未验证邮箱自动合并。

## 当前收口顺序

1. [x] Local API discovery file、随机 bearer、Host/Origin 防护；
2. [x] Files 持久化 publish/materialize job、重启恢复与可见状态；
3. [x] Google token 过期刷新、refresh rotation 与 replay 测试；
4. Session Reader 的产品实现与真实验收已完成；
5. Shared Skill 纵向闭环已完成；未来 query hook 自动推荐继续延后，不混入当前实现。

## 当前执行清单（不得跨项）

### T4 Windows 客户端兼容与可选 Electron 引导（进行中）

- [x] 定义并实现跨平台应用数据目录、discovery 与 setup 路径；
- [x] Windows setup 安装/更新 Core、GUI、Skill，注册用户登录后自启动任务并支持 `colab-open`；
- [x] Local Core 的 setup 调用、受管更新重启与 Agent 打开能力适配 Windows；
- [x] 构建 `windows-x86_64` Local Core 和 Electron portable，发布清单按平台与架构选择制品；
- [x] Electron preload 暴露可信宿主标记；普通浏览器 GUI 展示当前平台 Electron 下载入口，Electron 内隐藏；
- [x] 补齐单元测试、静态构建、跨目标编译检查、各模块 `AGENTS.md` 与验证计划；
- [x] release `0.1.46-dev` 发布并在 macOS 从旧安装器升级回归，确认平台制品选择、Core 重启、`colab-open` 和安装状态；
- [ ] Windows 实机安装、登录、自启动、更新和文件同步由 Windows 设备验收后标记完成。

Windows 首版采用 `%LOCALAPPDATA%\\AgentColab`、目录 junction 和用户级 `AgentColabCore` Task Scheduler 任务，不要求管理员权限或 Developer Mode。`0.1.46-dev` 已在 macOS 上使用 `cargo-xwin` 对 `x86_64-pc-windows-msvc` 完成完整 release 构建，并由 electron-builder 生成 x64 portable；R2 stable 与 Windows PowerShell bootstrap 已发布。Skill 同时带有 Windows `.cmd` 入口，GUI 生成的 Give-to-Agent 命令按宿主平台选择入口。这证明编译、分发和升级选择链路成立，但不能替代 Windows 实机运行验收。

### T3 Session 共享与阅读闭环（已完成）

- [x] 重新核对 Session 设计与 Omni Colab 已验证的 Codex/MyFlicker/Claude Code adapter；
- [x] 固化三种游标职责：`sourceCursor` 只表示贡献端原始会话读取位置，`snapshot` 固定一次可消费快照，`pageCursor` 只表示该快照内的阅读分页位置；
- [x] Server：Session 原始 segment、snapshot manifest、权限过滤和 Blob API；
- [x] Local Core：来源发现、首次全量/后续增量上传、消费缓存、adapter 投影和分页；
- [x] Python Skill：薄封装 `colab-session-reader read`，不在 Skill 内复制业务逻辑；
- [x] Desktop：Session 列表、共享、最近同步时间、Give to Agent 和撤回；已删除会隐式物化并全量投影大型快照的 GUI 正文预览，正文只由 Agent Session Reader 按需消费；
- [x] Files/Session Give to Agent 收敛到同一个共享 Dialog：统一响应式宽度、内容换行、默认 Agent 主操作与其他 Agent 下拉；Session 提示词删除 adapter/cursor 实现说明，只保留执行任务所需指令；
- [x] Codex/MyFlicker 真实来源、双账号消费、增量游标与分页游标验收；
- [x] Session 来源清单改为 SQLite 元数据索引；MyFlicker 补齐新版 CLI、旧版 CLI 与 Desktop 三类存储，排除 `requests/` 请求碎片，并以独立 Desktop adapter 处理覆盖、rollback 与工具调用；
- [x] Agent Colab Skill 显式暴露 GUI 对应的 Files/Session 完整故事线：来源发现、共享、消费、阅读和撤回；脚手架 `--help` 同步提供可发现的命令说明；
- [x] 更新 API 契约、技术设计、各模块 `AGENTS.md`；当前复验发布为 release `0.1.34-dev`、Core `0.1.27-dev`、Skill `0.1.25-dev`。
- [x] 修复已安装 Skill 的 sibling-module 导入契约，并从临时安装树直接执行全部五个入口；不再由源码 `PYTHONPATH` 掩盖打包错误；
- [x] 修复大型 Session 首次同步：冻结本轮长度、按完整 JSONL record 聚合约 8 MiB segment、逐段提交 cursor/snapshot 并支持失败续传；读取不再吞掉贡献端同步错误；
- [x] 同一 Session 的后台、显式与 Reader 触发同步按 Share 串行，避免并发复用旧 parent snapshot 产生 `session_snapshot_conflict`；
- [x] contributor source 按当前 user 隔离；`session-sources` 的 catalog id/source path 可被后续 `share --source` 精确查回；
- [x] 发布 release `0.1.52-dev`（Core `0.1.36-dev`、Skill `0.1.34-dev`，GUI/Electron 不变），并用 `yuzhyuan@gmail.com` → `jeffreyyuzhyuan@gmail.com` 完成 Files/Session/Skill 分享、列表、消费、安装/卸载和撤回的安装后黑盒验收。

### T0 计划与设计校准

- [x] 区分“已删除”和“明确延后”，不再混用状态；
- [x] 删除第二台物理设备验证门槛，保留双真实账号单机闭环结果；
- [x] 明确 Session Reader 复刻 Codex `read_thread`，接口评审前不实现；
- [x] 明确 Skill Tool 承担目标 Agent 的安装、检查更新和更新，接口评审前不实现；
- [x] 同步更新技术设计、交互设计、Agent 接口、验证计划和相关 `AGENTS.md`。

### T1 Local API 安全边界（已完成）

- [x] Local Core 启动时选择可用 loopback 端口并生成高熵 bearer；
- [x] 在应用数据目录写入仅当前用户可读的 discovery file，并以原子替换发布；
- [x] Desktop GUI、Python Skill 和 Electron launcher 从 discovery 获取 endpoint；
- [x] Local API 校验 bearer、Host 与 Origin；登录 callback 和公开 GUI 静态资源按明确白名单处理；
- [x] 增加未授权、错误 Origin、重启轮换和 discovery 权限测试；
- [x] 更新 Local API 契约、模块注释和 `local/AGENTS.md`，并以 R2 安装制品完成 Core 重启、Skill 自动重发现和 Electron 启动实测。

### T2 Files 持久化任务与重启恢复（已完成）

- [x] SQLite `local_jobs` migration、状态机、dedupe key、generation 和原子 claim；
- [x] watcher 只写 dirty/publish job，不直接拥有重试生命周期；
- [x] Core 启动恢复 pending/running job，指数退避并记录最后错误；
- [x] materialize refresh 同样进入可去重任务，并保持缓存优先读取；
- [x] GUI 展示 preparing/syncing/failed/ready，失败可重试；
- [x] 断网失败、进程强停恢复、手动重试和重复事件合并测试；
- [x] 更新同步设计、模块注释和 `local/AGENTS.md`，并以 `0.1.12-dev` 安装制品完成实测。

### T2.1 独立制品更新体验（已完成）

- [x] 更新检查在设置内明确展示检查中、有更新、已是最新和失败，不再静默完成；
- [x] GUI 以自身包版本对比当前 `ui.json`，制品根目录切换后在窗口聚焦或周期检查时自动刷新；
- [x] 构建脚本支持按 component 选择性产出，GUI `0.1.17-dev` 独立发布，Core/Skill 保持 `0.1.16-dev`、Electron 保持 `0.1.12-dev`；
- [x] R2 manifest 公共读回、Local Core 检查、更新安装和 active UI symlink 均完成验证。

### T2.2 Files 归因与消费元数据（已完成）

- [x] Files item 去除 root OID 展示，改为头像、贡献者、`(me)`、hover actions 和 destructive Withdraw；
- [x] Channel Files 与 Quick Share Files 都只保留一个直接选择动作；删除所有“文件/目录”二级菜单，由宿主统一 picker 返回路径后再识别来源类型；
- [x] Server 返回贡献者头像，Local Core 缓存远端 `updatedAt` 与头像，cached materialization 不再伪造空时间；
- [x] Core、Server、GUI 本地构建测试通过；
- [x] Server `0.1.18-dev` 部署；Core `0.1.17-dev` 与 GUI `0.1.18-dev` 发布、安装、重启并验收；消费方真实返回头像与非空 `updatedAt`，GUI 显示新 Files 行结构。

### T2.3 跨版本更新恢复（已完成）

- [x] 定位浏览器页面在 Local Core 随机端口轮换后停留于死亡 origin 的根因；
- [x] 删除 Electron discovery 轮询；将 endpoint/bearer 收敛为安装级稳定身份，GUI 在显式更新后按 PID 做限时同源恢复；
- [x] GUI 更新调用不再在 Core 计划退出后继续发状态请求；
- [x] LaunchAgent 管理的 Core 在更新响应返回后退出，由 launchd 激活新二进制；非托管 Core 明确保留人工重启；
- [x] 发布并验证 release `0.1.29-dev` 修正版：更新前后 endpoint 保持 `localhost:53393`，同一浏览器 cookie 可继续访问，最终一次 PID 从 `65800` 变为 `85086`；GUI 按 PID 做显式更新期内的限时 reload，并删除后台 GUI 更新轮询；Electron 源码与 `0.1.14-dev` 制品不含常驻 discovery 检查。

### T2.4 Files 同步范围与传输护栏（已完成）

- [x] 复现构建产物进入 shadow index 后生成超过 2 GiB 对象、单请求无法进入 256 MiB Server 的失败；
- [x] `pack-objects` 前增加单文件 100 MiB、总内容 200 MiB 的确定性拒绝；共享登记改为 durable job 接受后返回；
- [x] GUI 在首次共享前按需预览文件数/体积与生成目录候选，贡献者可从 item 编辑同步范围；
- [x] 排除规则以 shadow Git `$GIT_DIR/info/exclude` 为唯一真源；Local Core 直接读写，SQLite 不保存副本，来源 `.gitignore` 不被修改；
- [x] Rust 单元测试验证排除生效、规则可读回、来源目录不产生 `.gitignore` 且 schema 不包含 exclude 配置；
- [x] 独立发布 release `0.1.36-dev`：Core `0.1.28-dev`、GUI `0.1.26-dev`、Skill `0.1.26-dev`，Electron 保持 `0.1.14-dev`；真实 `agent-colab` 来源扫描排除 102,559 文件/20,071,279,289 bytes，纳入 393 文件/47,483,603 bytes，首次发布约 4 秒完成并得到 root `9972e3fe…`，随后撤回临时 item；
- [x] 修复 macOS setup 在 `bootout` 后立即 `bootstrap` 的 launchd EIO 竞态：有界重试并只以目标 service 真实可见为成功。

### T2.5 Public alpha loading and open-source distribution (in progress)

- [x] Keep the initial empty-state hidden until authentication, Organization, and Channel discovery resolve; show an explicit workspace loading state instead.
- [x] Track foreground Local API requests across the shell and Files, Sessions, Skills, and Agent handoff modules; show a global top loading indicator while preserving rendered data.
- [x] Keep periodic reconciliation silent so background polling does not create permanent loading flicker.
- [x] Translate public README, visible UI additions, and Agent handoff prompts into English.
- [x] Expand ignore rules for credentials, local databases, runtime state, build output, and provider tooling.
- [x] Publish GUI `0.1.30-dev` in release channel `0.1.47-dev`; all six platform artifacts passed public R2 size and SHA-256 readback verification.
- [x] Create public repository `kwgjjeffrey/agent-colab`; mirror ten descriptively named installers/artifacts in GitHub prerelease `v0.1.47-dev` and verify anonymous manifest hash plus Windows executable range download.

### T2.6 Windows launcher startup recovery (in progress)

- [x] Identify the silent failure: the portable Electron launcher rejected startup when Local Core discovery was absent, but a GUI process had neither a console nor a top-level error dialog.
- [x] Ask Windows Task Scheduler to start the setup-owned Core task before discovery, without moving lifecycle/configuration ownership into Electron.
- [x] Persist startup diagnostics under the Agent Colab application-data directory and show a native dialog linking to installation guidance.
- [x] Build and publish Electron `0.1.16-dev` in release `0.1.48-dev`; verify the packaged ASAR contains the corrected source and complete R2 public size/SHA-256 readback for both Windows and macOS artifacts.
- [ ] Validate corrected startup, Task Scheduler activation, and diagnostic dialog on a real Windows machine.

### T2.7 Windows one-artifact desktop bootstrap (in progress)

- [x] Correct the distribution contract: a first-time Windows user must not run a separate bootstrap before opening the desktop executable.
- [x] Add a Shell-owned first-run orchestrator that verifies bundled Core/GUI/Skill seeds, installs them under `%LOCALAPPDATA%\\AgentColab`, creates managed junctions, installs the Codex Skill, and registers the existing user-level Core task.
- [x] Keep the receipt as the final commit point so interrupted setup remains diagnosable and retryable; keep all post-install updates in the existing independent-component setup path.
- [x] Build Electron `0.1.17-dev`, inspect the packaged Windows ASAR and embedded seed resources, then publish release `0.1.49-dev` to R2 with complete public size/SHA-256 readback. GitHub mirror follows the source commit/tag below.
- [ ] Validate first-run setup and launch on a clean Windows account.

`0.1.17-dev` 的首次自举仍错误地要求终端用户选择 Google OAuth JSON，因此不作为可验收桌面入口。`0.1.18-dev` 已把官方 Desktop OAuth client 改为 ignored release configuration 注入的打包资源，终端用户只执行登录；开源 fork 可在自己的发布环境替换该配置。release `0.1.50-dev` 已通过 R2 全量公网 size/SHA-256 回读，待 Windows 实机验收。

### T2.8 Developer-facing open-source entry (completed)

- [x] Separate the published-alpha evaluation path from source development and self-hosting prerequisites in the public README.
- [x] Document the implemented runtime/service boundaries, server and local persistence model, Files/Skills synchronization, and Session synchronization with checked-in SVG diagrams linked to editable Mermaid sources. Static SVG avoids GitHub's intermittent Mermaid `svg element not in render tree` failure.
- [x] Standardize repository metadata and the root license on Apache-2.0 so the public project has permissive commercial reuse plus an explicit contributor patent grant.
- [x] Add a human-facing Apple-silicon DMG without replacing the ZIP used by machine-driven update flows, and mirror the DMG in the public GitHub prerelease.

### T2.9 IDE-style Files preview (implementation and release completed; visual acceptance pending)

- [x] Replace the inline list-row preview with a full-window File Explorer containing a left tree, right preview pane, back action, and breadcrumb;
- [x] Keep UTF-8 text bounded, stream image/PDF/raw bytes from authenticated Local Core, and lazy-load DOCX/XLSX renderers with a 25 MiB client parsing guard;
- [x] Display unsupported, corrupt, oversized, and renderer failures inside the preview pane rather than as bottom-of-page JSON errors;
- [x] Split collection, explorer, and format rendering into separate modules; update Local API contract, module `AGENTS.md`, interaction and technical design;
- [x] Pass Rust tests and Desktop/Electron checks; release `0.1.54-dev` with Core `0.1.38-dev` and GUI `0.1.32-dev`, while Skill remains `0.1.34-dev` and Electron remains `0.1.18-dev`;
- [x] Install from stable R2 and verify the authenticated DOCX byte stream returns the correct MIME type, `nosniff`, exact size and SHA-256;
- [ ] Human visual acceptance for directory navigation, DOCX, XLSX, PDF, image and unsupported-file states.

### T3.1 Channel Messages and Agent blueprints (runtime protocol replacement implemented; primary black-box path verified)

- [x] Fix the reviewed target design: preserve complete rich-text bodies and inline mention nodes; support several distinct Agent targets in one message; treat an owner's reply-with-mention as a new command whose reply chain supplies prior context; separate Conversation synchronization from runtime command delivery; and reduce the injected prompt to the exact task, quoted/recent context, optional instruction, and concrete context/reply tools.
- [x] Replace the GUI-driven second Agent Request write with Server-side routing after message commit; persist full rich content, derive immutable mention identities from atomic nodes, and fan out at most one command per distinct mentioned blueprint.
- [x] Replace account-stream invalidation plus HTTP `/requests/next` claim with a separately authenticated runtime WebSocket carrying complete Server-packaged commands. PostgreSQL remains the pending-command truth; Local Core ACKs a fully parsed command on the same socket, Server releases an unacknowledged claim after ten seconds, and Local Core stores a completion receipt before acknowledging provider completion.
- [x] Replace `awaiting_owner` and offline status cards with ordinary Agent-authored messages; an owner message that mentions the Agent is evaluated as a new command, while its explicit reply chain and the preceding ten non-duplicate messages are packaged as context.
- [x] Stop automatically publishing the provider's final assistant message. Keep it in the visible Codex Desktop session and let the Agent use the existing request-scoped `colab-messages request reply` tool when it chooses to report progress or results.
- [x] Release `0.1.80-dev` retains migration 22/Server and GUI `0.1.47-dev`, and publishes Core `0.1.58-dev` for macOS/Windows. Installed macOS GUI visually confirms inline atomic mention, reply selection, and absence of request-state cards. A real middle-position mention created a visible Codex thread and the Agent independently used `colab-messages request reply`; Channel seq 28 arrived from `Runtime Validation Agent` with `protocol 2 delivery works`. The first attempt exposed that Codex `workspace-write` disables even loopback access on macOS; Core now starts the runtime turn with filesystem isolation retained and `networkAccess: true`, so the documented Local Core reply path is actually executable. Two-Agent fan-out, owner confirmation and offline reconnect delivery remain follow-up fault/branch validation rather than blockers for the primary path.
- [x] Repair the real post-release delivery failure exposed by Channel seq 29: the protocol-2 Server closed runtime WebSocket immediately after ACK and marked the device offline throughout provider execution, while Local Core also guessed ownership by cross-producting historical runtimes/thread bindings with all saved accounts. Keep one runtime socket through `accepted → provider execution → durable receipt → ready`, count overlapping presence connections, and start workers only from explicit account-scoped registrations. Deploy Server `0.1.82-dev` (the final immutable build also preserves the one-command lifecycle for legacy clients), hot-install Core `0.1.59-dev` on the validation Mac, and let the already queued request `875d98ef…` resume without resending: the existing visible Codex thread completed the exact Chinese task and its request-scoped Skill call created Channel seq 31, `我收到了你的消息`. Public Core promotion remains pending a native Windows `0.1.59-dev` build; GUI/Skill/Electron stay unchanged.
- [x] Repair the remaining idle/reconnect failure using the user's real seq 32/33 messages. Local Core now sends a delayed 20-second WebSocket heartbeat so a half-open runtime is detected, while Server ignores Ping/Pong control frames until it receives the exact request-scoped `accepted` ACK. Discard legacy hidden `codex exec` thread bindings by adapter version and create/resume only Codex app-server tasks visible in Desktop. Both existing requests recovered without resending, produced Channel seq 35/36 `我收到了你的消息`, and created visible Codex task `01a0f5ed-1c88-73b0-a73e-7c5e9a71f520`. Install Core `0.1.61-dev`, GUI `0.1.48-dev`, and Server `0.1.83-dev`; Electron remains unchanged at `0.1.19-dev`.
- [x] Replace the flat message list with identity-specific bubbles: current member right/primary, other members left/muted, Agent left/violet with owner avatar plus supernova ring. Keep the compact avatar beside sender content, label Agents as `<name> (<owner>'s Agent)`, and reveal timestamps/reply/select actions only on hover. Verify the installed Electron app after restart rather than relying on component tests alone.
- [x] Repair the user-exposed Messages regressions: model the `(Channel, blueprint) → provider thread` binding separately from app-server writer ownership. The final architecture is one long-lived app-server per Local Core retaining every Colab-managed thread, while Desktop remains a reader. Protocol black-boxing proved that a second `turn/start` during an active turn steers the same turn; `thread/queue/add` instead creates an independent submission, remains queued while busy, and is automatically consumed by the owning app-server when idle. Local Core now owns one persistent `CodexManager`, stores adapter-version-3 bindings, submits every Server request with its stable ID through `thread/queue/add`, correlates FIFO turn events, treats only `completed` as success, and unsubscribes on orderly manager shutdown without duplicating the provider queue in SQLite. Rust workspace tests cover missing-thread replacement and two-request FIFO completion/failure mapping. GUI keeps a per-Channel message/cursor cache, restores scroll offset, fixes the shell to the viewport, pins the rail/composer, and places Channel identity plus Quick Share on one compact row. Stable now contains Core `0.1.62-dev`, GUI `0.1.49-dev`, Skill `0.1.40-dev`, and deliberately unchanged Electron `0.1.19-dev`. The installed macOS chain executed two ordered requests in visible Codex thread `01a0f6e9-d8d0-7802-8cd8-08a2e15451db`, then survived a forced Local Core restart and executed two more requests in that same thread; Channel seq 40/42/44/46 and all four durable Agent requests completed successfully. The installed GUI was force-refreshed and visually verified for compact avatars, identity-specific bubbles, fixed viewport, bottom-pinned rail settings and composer, and the compact Channel/Quick Share header. Cross-thread concurrency remains a follow-up stress case, not a release gate for this same-thread repair.
- [x] Repair the false “Agent did nothing” state exposed by the user's real Channel seq 47. The command reached Local Core, ran for 191 seconds in Desktop-visible Codex thread `01a0f715-a4ee-7380-8528-80afd293b5a7`, shared `sine.png`, and committed Agent reply seq 48, but the browser's Conversation WebSocket was half-open: it received neither invalidation nor `onclose`, so the existing reconnect/cursor repair never ran. Server `0.1.85-dev` now emits 15-second text heartbeats and consumes peer frames; GUI `0.1.50-dev` closes an otherwise-open socket after 45 seconds of silence and always catches up from `lastSeq` on open. Server workspace tests, 13 GUI tests/build, immutable R2 readback and real macOS installation passed. Black-box validation observed consecutive heartbeats 15.6 seconds apart, restarted the deployed Server while a Local-Core-bridged socket was open, then reconnected and repaired the exact existing gap with `after=47 → seq 48`; the installed Electron page visibly contained both the real request and reply. Core `0.1.62-dev`, Skill `0.1.40-dev`, and Electron `0.1.19-dev` remained unchanged.
- [x] Close the remaining healthy-socket reconciliation hole exposed by the user's real electronic-cloud request. The Agent command succeeded in Desktop-visible thread `01a0f715-a4ee-7380-8528-80afd293b5a7`, uploaded `electron-cloud.png`, and committed Agent message seq 50 at 20:02:49 local time; `after=49` through the actual Local Core returned that exact row, but the open GUI had missed its invalidation and later heartbeats prevented the silence watchdog from reconnecting. GUI `0.1.51-dev` now treats every heartbeat, matching invalidation, socket open, window focus, and visibility restoration as a single-flight cursor reconciliation barrier. Stable `0.1.86-dev` was published with only Desktop GUI changed, installed through the real update path, and force-loaded in the installed Electron app; the existing seq 50 reply appeared without rerunning the Agent. GUI 13 tests, production build, immutable R2 size/SHA-256 readback, and installed-app visual acceptance passed; Core `0.1.62-dev`, Skill `0.1.40-dev`, and Electron `0.1.19-dev` remained unchanged.
- [x] Flatten the Messages participant roster: compact member avatars, no disclosure tree or item cards, owner-ring Agent avatars matching the timeline, and an Agent-count management entry only for the current member. Add a top-of-message-area Agent activity projection backed by durable request state: claim remains `delivering` until protocol-2 Local Core ACKs the exact command, then `accepted_at` makes it eligible for “is working”; terminal transitions clear it. Request invalidation and the existing heartbeat/focus reconciliation repair lost notifications without adding chat messages.
- [x] Replace the superseded bubble layout with a compact Discord-style row stream: one left-aligned rich-content column, equal framed member/Agent avatars, Agent supernova ring plus AI badge, hover-only metadata/actions, a flat non-indented participant roster, edge-to-edge Messages workspace, and one borderless composer surface with a solid up-arrow action. Reorder global Settings to active User/Organization drill-downs, My Agents count, Skill installation, then collapsed Updates. GUI tests and production build pass. GUI `0.1.53-dev` was published on 2026-10-02 as promotion `0.1.88-dev`, with signed stable-channel and public size/SHA-256 readback verified; user-triggered update and packaged visual acceptance remain pending.
- [x] Make request-scoped Agent replies address the requester without expanding provider authority: Server derives a structured member mention and trigger-message reply link from request ID, persists both with the Agent message, and GUI renders the current user's mention as a deep-blue pill plus the referenced message preview. Skill and provider prompt remain unchanged.
- [x] Preserve the `(Channel, blueprint) → provider thread` binding when Local Core restarts after Codex Desktop has acquired that thread's writer. Core `0.1.63-dev` distinguishes active-writer from missing-thread, skips owner-only metadata mutation, and submits the independent command directly to the original thread's provider queue. Release `0.1.88-dev` promotes only Darwin Core while retaining the prior Windows Core, GUI `0.1.52-dev`, Skill `0.1.40-dev`, and Electron `0.1.19-dev`; the publisher now supports an explicit platform-scoped component promotion. Installed request `c47b335d…` ran to `succeeded` in Desktop-visible original thread `01a0f6e9…`, and the request-scoped reply became Channel seq 55 with a Server-derived structured `@Zhiyuan Yu` member mention and `replyToMessageId` pointing to trigger seq 54. This validates delivery, provider completion, automatic requester addressing and reply association without a replacement thread or manual Channel write.

- [x] Record the decision not to build traditional project management or an OKR substitute without evidence of long-running cross-owner dependency failures;
- [x] Define Conversation as a separate domain object that can reference a Channel without inheriting or mutating Channel membership;
- [x] Define an Agent participant as owner + blueprint + selected runtime, with one provider-native session binding per Conversation;
- [x] Define explicit Agent Request authorization, approval, offline queue, lease and summary-reporting semantics;
- [x] Re-evaluate transport, broker, gateway and full-IM layers against the actual first-slice scope; select authenticated Axum WebSocket in the existing Server with PostgreSQL as durable truth. The later reviewed design supersedes the original HTTP runtime claim: Conversation invalidations and runtime command delivery now use separate WebSocket protocols.
- [x] Extend the existing low-fidelity shell with a concrete Conversation entry, three-pane chat, blueprint editor and coding-agent prompt, participant picker, message selection/forwarding, Agent Request state and reply/source references;
- [x] Repair the wireframe's page hierarchy so Conversation and Agent-blueprint settings are mutually exclusive screens, and add public production evidence for Matrix, XMPP/Prosody and Centrifugo/Centrifuge with explicit limits on what each case proves;
- [x] Add a concrete ER diagram, module placement diagram and Agent Request sequence, with editable Mermaid sources and static SVG renderings;
- [x] Reconcile the DM ER with the implemented tenant model: visually separate existing and proposed Colab tables, use `organization_members` as the actor, keep transport out of the ER, and remove a Conversation-specific outbox because reconnect cursor repair already closes the commit/publish crash gap;
- [x] Run the existing full repository check after the previous Files/Quick Share work: Desktop build, Local Core tests and Server tests all pass on 2026-09-30;
- [x] Fix the final ownership decision: Colab owns rooms, messages and Agent participation in its existing PostgreSQL. Conversation WebSocket carries repairable message invalidations; a separate runtime WebSocket carries Server-packaged commands. Matrix/Tuwunel and external IM services are rejected because their separate state, service and identity/room mapping cost conflicts with the required embedded Colab model.
- [x] Implement the first Channel-scoped vertical slice: Messages as the first tab, member-first message stream/input, Add user reuse, expandable member Agents, Organization-wide personal blueprint list, per-Channel Agent selection, requested configuration fields, and the shared Agent prompt component.
- [x] Add Server persistence/API, Local Core credential-hiding HTTP/WebSocket bridge, and `colab-messages` Skill operations for message list/send and blueprint list/upsert/select.
- [x] Add reconnect with bounded exponential backoff and cursor catch-up; realtime remains an optimization and cannot create or lose durable messages.
- [x] Atomically deploy Server `0.1.66-dev`, then publish stable channel `0.1.67-dev` with publicly verified Core `0.1.47-dev`, GUI `0.1.41-dev`, Skill `0.1.37-dev`, and deliberately unchanged Electron `0.1.19-dev`. From the installed Skill, create/select a blueprint and send/list messages; switch to `jeffreyyuzhyuan`, read the message and owner Agent, verify `editable=false` plus HTTP 403 on mutation, and receive the cross-account WebSocket invalidation before restoring `yuzhyuan`.
- [x] Implement the Codex-only runtime vertical slice: Skill installation registers `(member, stable device ID, coding-agent provider)` with Server; blueprint creation requires the exact available runtime UUID; the target Local Core alone claims its durable request; `(Channel, blueprint, runtime)` binds one Codex thread; first execution uses `codex exec`, later execution uses `codex exec resume`; request-scoped replies return to the originating Channel. Provider launch/resume failures explicitly transition `running` requests to `failed`. Other provider execution adapters remain deferred until the Codex path is accepted.
- [x] Messages implementation repair: use maintained shadcn message primitives, fix empty successful HTTP responses, make notices dismissible/expiring, add real reply selection, and preserve rich mention documents through Local Core. Packaged-GUI visual acceptance remains part of the release black box above.
- [x] Agent blueprint interaction repair: creation is immediately selected into the current Channel, removal is supported, `Create by my agent` is the primary path, runtime is one registered “device · Codex” selection, and the generated prompt contains the allowed runtime UUIDs. Legacy empty-runtime blueprints must be saved with a valid registered runtime before they can execute.
- [x] Agent context handoff: a structured `@Agent` target creates a request containing the complete triggering message, root-to-parent reply chain, preceding ten messages excluding reply-chain duplicates, and request-scoped commands for loading earlier context and replying; forwarding selected messages creates a bounded request with the same reply command but no progressive-history instruction.
- [x] Repair Agent request projection races: preserve a Tiptap mention at any sentence position, keep UUID routing separate from display text/query, and prevent late create/list responses from regressing `running` or terminal states to `queued`. Document the concrete editor-to-Codex contract in `docs/architecture/agent-request-data-flow.md`.
- [x] Publish the race repair as release `0.1.77-dev` with only Desktop GUI advanced to `0.1.46-dev`; retain the signed stable Core/Skill/Electron artifacts instead of requiring or promoting unrelated half-built local versions.
- [x] Replace the editable `Textarea` mention imitation with a Tiptap atomic Mention node carrying
  the blueprint UUID, preserve its visible label in the full body, and render sent mentions inline.
  The later reviewed protocol removed request-state cards and status fetching from Conversation;
  Server alone derives and routes commands from the committed rich message. Earlier account-scoped
  runtime evidence remains useful, but release acceptance is tracked by the black-box item above.

### T3.2 Update and workspace-loading regression (completed)

- [x] Trace the apparent empty workspace to a failed initial Channel request being rendered as a successful empty result; preserve loading, loaded-empty, and failed states separately with an explicit retry.
- [x] Remove Python `urllib` from release manifest/artifact reads; use proxy-bypassed curl streaming with bounded retries/timeouts and streaming SHA-256 verification.
- [x] Bound setup subprocess diagnostics at both the setup and Local Core boundary so Settings never renders raw tracebacks or unbounded local paths.
- [x] Add regression coverage for the updater transport policy and pass Skill, GUI, and Local Core tests.
- [x] Publish release `0.1.73-dev`, install it through the existing managed path, and verify real Channel recovery plus Settings update check in the packaged GUI.

### T2.10 Unified Files source picker regression (completed)

- [x] Remove the nested file/folder menu from both Channel Files and Quick Share Files; each surface exposes one action only.
- [x] Keep source-kind inference behind the host adapter and Local Core inspection rather than encoding it as a second product decision.
- [x] Add a GUI regression test that rejects reintroducing `Choose a file` / `Choose a folder` menu items.
- [x] Release `0.1.64-dev` with Core `0.1.46-dev`, GUI `0.1.39-dev`, and the independently changed Electron Shell `0.1.19-dev`; publish and verify macOS/Windows artifacts through public R2 readback.
- [x] Install the release, restart the actual App, and visually verify that Channel Files has one `Share files` action, Quick Share has one `Choose Files` action, and the native picker displays files and folders in the same selectable list.

### T2.11 Quick Share dialog structure regression (completed)

- [x] Trace the malformed footer to a shadcn `DialogFooter` nested inside the independently padded and scrolling result body.
- [x] Restore the standard Dialog composition: direct Header/body/Footer siblings, with only the body using `ScrollArea`.
- [x] Add a source-level regression test that rejects putting the footer back inside `ResultView`, and document the layout invariant in `desktop/AGENTS.md`.
- [x] Build and publish release `0.1.65-dev`, install GUI `0.1.40-dev` without advancing Core/Skill/Electron, then visually verify the real App: the footer remains fully contained inside the rounded Dialog and separated from the scrolling prompt/body.

## 已删除的工作

- `git2`/libgit2 替换验证：不再为实现纯度替换已验证的 Git CLI；真实跨平台问题出现时另建分发任务；
- 服务端 `file_entries`、通用 node、object version、skill version；
- 协同编辑、服务端产品级版本管理和 alpha 历史数据迁移；
- Electron 内置业务、内置 GUI 更新器和高频 Electron 发布；
- “两台物理设备”作为独立验证门槛；账号、权限、远端真源、发布和消费已可由同一设备切换两个真实账号验证。

### T3.3 Atomic updater restart handshake (completed)

- [x] Trace the repeated `Failed to fetch` to Local Core exiting from the same HTTP handler that still owed the GUI an update response; distinguish this transport race from artifact download failure.
- [x] Split activation and restart into two commands: `/v1/system/update` now returns a durable `restartRequired` acknowledgement, while `/v1/system/restart` is a fire-and-forget managed-service command followed by a new-PID readiness probe.
- [x] Keep Electron independent: release only Core `0.1.65-dev` and GUI `0.1.56-dev`; retain Shell `0.1.20-dev` and Skill `0.1.42-dev`.
- [x] Recover the real macOS installation through `colab-setup update --no-restart`, restart the launchd-managed Core, then exercise the same authenticated update/restart HTTP path as the GUI. Verify HTTP 202, PID replacement, all four installed versions, and no remaining update.

### T3.4 Durable artifact transfer (completed for macOS)

- [x] Persist digest-addressed partials across downloader/Core/App process exits; resume with HTTP Range and retain partials after transient or low-speed failure.
- [x] Report real bytes, total, rolling transfer speed, ETA, resume offset, verification, cached completion, interruption, and hash failure through an atomic progress document and GUI progress bar.
- [x] Verify exact size and SHA-256 before atomically promoting a partial to a reusable verified blob; prevent concurrent macOS installers with a process lock.
- [x] Publish promotion `0.1.96-dev` without advancing Electron, then upgrade the actual installed `0.1.95-dev` through its authenticated Local Core HTTP endpoint to Core `0.1.66-dev`, GUI `0.1.57-dev`, and Skill `0.1.43-dev`.
- [x] Run the installed downloader in two separate processes against a Range server that truncates every first-run response: preserve 65,536 partial bytes, resume to 8,388,608 bytes, and verify the final digest.
- [ ] Consider P2P sources only after the single-origin transport has production evidence; any P2P source must satisfy the same immutable manifest, exact-size, and SHA-256 verification boundary.
- [x] Publish a version-only Electron `0.1.21-dev` in promotion `0.1.97-dev` as a user-operated 111 MB updater acceptance target; no Electron source, Core, GUI, or Skill change is included.

## 明确延后的工作

- Supabase 第二套服务端与双后端 contract parity；只有明确恢复 Supabase 时再立项；
- Cloudflare 原生后端、RLS、Queue、Realtime 组合验证；当前 Cloudflare 只承担 R2 制品分发与 DNS；
- WebSocket/SSE 实时失效通知；正确性继续依赖 pull，出现实际延迟问题后再增加；
- 群聊、Agent runtime/blueprint、结构化任务模块、P2P 传输和 SAML bridge；
- 完整搜索实现；在真源到索引的同步关系确定前不做部分元数据搜索冒充完成品；
- 任意收件人的邀请邮件；选定可用 SMTP/provider 后连同 outbox 与模板验收一起恢复；
- query submit hook 的自动 Skill 推荐；当前先完成显式共享、安装与 Give-to-Agent 闭环。
# Canvas mentions and document header interaction (2026-10-03)

- Canvas mentions use atomic editor nodes carrying immutable member or Agent blueprint IDs.
- Mention identity cards expose the real Agent dispatch action; dispatch is persisted as an Agent request and the existing runtime WebSocket is only a wake-up hint.
- The Server owns the Canvas runtime prompt template. The relevant heading section is the immediate task context; read/edit/list Canvas commands are presented as optional tools in task order.
- Document rename uses the same Server use case from both the sidebar and the document header.
- The document header keeps synchronization state beside the title and does not render a divider below the header.

- [x] Add task-scoped Agent work details for Messages and Canvas. Core `0.1.73-dev` captures app-server events for the exact FIFO-paired Codex turn and uploads a bounded final record without coupling observability failure to command delivery. Server stores events by durable request id and authorizes owner writes/member reads. GUI `0.1.74-dev` exposes Working/Work details entries and a shadcn Drawer with tool events collapsed. Canvas request-list failures no longer overwrite document-sync errors, and explicit editor typography restores visible H1–H3 hierarchy after Tailwind reset.
- [x] Installed-Mac validation caught a missing Local Core GET proxy for `/v1/agent-requests/{id}/events`: the deployed Server route and captured work record were healthy, but the Drawer received a local 404. Core `0.1.74-dev` adds the boundary route; release `0.1.116-dev` supersedes `0.1.115-dev` before final acceptance.
## 2026-10-04 Canvas codec selection audit

F-CANVAS-03 disproves automatic losslessness of the default Markdown codec for the current GUI schema. Existing libraries handle standard syntax, and a custom identity tokenizer round-trips mentions; several richer node/attribute constructions require enhanced syntax or an explicit product normalization decision. Trial and detailed loss matrix: [.trial/F-CANVAS-03-markdown-roundtrip](../.trial/F-CANVAS-03-markdown-roundtrip/README.md). The production source-map/patch adapter remains unfinished; do not reuse earlier simple text replacement validation as evidence of complete edit support.

## Engineering tracing 第一阶段（2026-10-04）

- [x] Honeycomb test 环境认证、独立 ingest key 与官方 MCP 查询；凭据位于仓库外私有配置。
- [x] 标准 OTel SDK、公共 HTTP 跨进程 propagation、Core authenticated OTLP intake/有界异步队列、Server relay 源码。
- [x] CLI 七入口 terminal wrapper；GUI transport 与 `messages.send` 呈现出口。
- [x] 单调 duration、四时间戳 calibration、偏移/uncertainty/quality 元数据。
- [x] 可重建候选目录与独立只读诊断 Skill；隔离 fixture 云端查回单根五 span。
- [ ] 候选目录语义分类与全部 GUI entry/result 配对；真实产品 GUI/CLI 纵向验收。
- [ ] Agent request、WebSocket、outbox/retry 的 durable trace context 与完整回复闭环。
- [ ] 匿名采集、服务端配额、休眠/时钟漂移/重启故障注入、Windows SDK fallback 实机与生产 rollout。

设计与确切范围见 [engineering-tracing.md](engineering-tracing.md)。隔离公共边界验证不计作已部署产品验收。

- [x] Tracing 本地制品验证：独立构建 Core、GUI、Skill；从刚构建的 Skill zip 提取 vendor 再执行隔离云端协议验证，CLI exit 0。入口候选 184/35、结果候选 448 与初始 operations 注册表已落盘。未发布、未启用生产。

- [x] 双 OTLP provider profile 与私有 env materializer；从 Grafana 登录界面读到 stack endpoint/instance。
- [ ] Grafana traces:write policy/token 创建、实际上报查回与部署切换（尚未执行）。

- [x] Grafana ingest token 与配置选择、真实 OTLP 上报、Tempo API 查询和 UI 瀑布图；CLI fixture 完整 5 spans。真实数据预览查询查回 GUI 9 traces、Skill 4 traces；未部署生产。

### Canvas framework / updater closure — 2026-10-04

- [x] Identity cards now use shadcn HoverCard on Tiptap React Node Views, with hover/focus/Escape regression coverage. Work details uses an item-ID conversation projection, Markdown instructions/responses, collapsed typed tools and forward task order. GUI tests: 41 passing; TypeScript check passing. Installed acceptance is tracked separately below in validation-plan.md.

- [x] ProseMirror Markdown + official y-tiptap reconciliation replaces handwritten Canvas conversion; packaged Core runtime installed through signed R2 stable channel.
- [x] Installed Canvas dispatch acceptance: Agent read/patch/read exit 0, actual appended paragraph, preserved both mention identities, Server synced sequence advanced, task succeeded and GUI Work details loaded. Reproducible setup scripts: `.trial/F-CANVAS-03-markdown-roundtrip/{installed_verify,runtime_verify}.py`; exact IDs/results in validation plan.
- [x] Mac updater lock is the running authority. GUI restores background progress on Settings open/focus and keeps watching active operations; repeated update attaches; stale transfer is interrupted; activation awaiting resident Core restart has its own action. Core 0.1.77 / GUI 0.1.75 installed; Electron unchanged.

### Tracing production rollout — 2026-10-04

- [x] Server 0.1.121-dev 激活于 `/opt/agent-colab/releases/0.1.121-dev`，systemd active，公网 readiness 为 ok；远端与本地 Linux binary SHA-256 一致（4aef58016e76b6574d5017bddfb5227ce48d510ce20805ff3fc5c79e9c4f49e6）。私有 Grafana exporter env 已由独立 systemd drop-in 加载。
- [x] R2 signed stable channel 0.1.122-dev 发布并执行全部新增制品公网 size/SHA-256 readback。本机正式 updater 成功安装 Core 0.1.78-dev、GUI 0.1.76-dev、Skill 0.1.46-dev；Electron 与 Windows Core 保留原版本。修复 publisher 平台筛选遗漏通用 GUI/Skill 制品的问题。
- [x] V-TRACE-PRODUCTION-SKILL-01：`observability/tests/validate-production.py` 使用已安装 Skill 查询真实生产 Channel，exit 0、4 channels；Tempo 查回 `46636876e384c1999a3e4be29acc1b23`，7 spans，Skill → Core → Server 父子链完整。
- [x] V-TRACE-PRODUCTION-GUI-01：已安装 GUI 实际加载并点击 Files/Sessions，页面返回真实文件与会话。Tempo 查回 `0a9d6f4ebba91daff2d87a4129c3354a`，4 spans，GUI 0.1.76-dev → Core 0.1.78-dev → Server 0.1.121-dev。该 span 是 transport_only，不代表页面全部业务完成或 Agent 回复闭环。
- [x] 实机跨端校准：VPS NTPSynchronized=yes；Core reference=server-estimated，偏移约67 ms、不确定度134–139 ms；GUI/Skill trace quality=estimated，保留各自累积 uncertainty。单端 duration 使用单调时钟。没有执行人工时钟跳变、休眠、漂移注入，不能声称消除所有误差或支持毫秒级跨端排序。
- [x] 回归：GUI 34 tests 与 production build、Skill 24 tests、Rust Core/Server workspace tests/check、Linux release build 均通过；部署脚本 bash syntax 与 git diff whitespace check 通过。
- [ ] 全部业务入口/页面结果配对、Agent durable command/ACK/receipt/reply、Canvas outbox/retry/repair、匿名上报、时钟故障注入与生产限流仍待完成。
### Work details and identity hover closure — 2026-10-04

- [x] Replace custom Canvas identity popover with standard shadcn HoverCard; project request-scoped runtime events into instruction/Agent responses/default-collapsed tools, preserving chronological order.
- [x] GUI 0.1.77-dev formally published and installed; installed real Canvas task drawer and tool expansion verified. Automated hover traversal and drawer regressions included in 41 passing GUI tests. No Electron version advance. Detailed acceptance in validation plan.
### Agent roster task entry — 2026-10-04

- [x] Global Settings My Agents cross-tab entry repaired in GUI 0.1.80-dev: select/mount Messages before consuming the management intent; clear intent after handling and report API failures. Signed promotion 0.1.126-dev installed and Canvas → Settings → My Agents opens the real manager; closing and remounting Messages does not reopen it.

- [x] Remove Messages latest-task header; Agent roster item opens the shared identity card through shadcn Popover. Owner management entry preserved. Runtime-acknowledged work animates roster background with reduced-motion fallback.
- [x] Shared Canvas/roster card displays distinct task summary, state, start time and duration; owner attribution shown once, Send button concise with horizontal padding. Server timestamps use append-only migration 0029 and idempotent terminal trigger.
- [x] GUI 44 tests/build and Server 6 workspace tests passed. Server 0.1.124-dev deployed with migration 0029; transactional trigger fixture passed. GUI 0.1.79-dev published through signed promotion 0.1.125-dev and installed through the normal updater; installed roster/card and older-task navigation verified.

### V-TRACE-ENTRY-01 — 2026-10-04

- [x] `.trial/V-TRACE-ENTRY-01` 四入口可运行样例：真实安装 GUI 三页面定位/呼吸高亮、Skill browser.open 命令显示/复制；浏览器验证通过。Files DOM animationName=trial-breathe，Messages selector 命中发送按钮；定位未触发业务动作。
- [ ] 全量入口、稳定控件 ID/资源参数、无权限与重启恢复、直接定位 Electron 原窗口、最新 trace 查询未验证；正式服务归属未决定。

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

### Information-association loading repair — 2026-10-04

- [x] @ 候选列表限高并可滚动；Canvas 候选框以光标坐标在右下方展开，边缘空间不足时翻转；移除资源类型和用户邮箱的重复备注，保留 Agent owner 信息。GUI `0.1.87-dev` 已发布、安装并通过真实 Canvas 视觉验收。

- [x] Channel entry loads member and Agent identity only. Files, Sessions and Canvas catalogs load when an @ chooser or User card opens; Canvas loads Message candidates only when its @ chooser opens. A resource capsule checks its own resource type, and Message capsules use the exact-message endpoint. Message invalidations no longer refetch all resource catalogs.
- [x] Real Canvas → local Agent Runtime acceptance request `ea96b9f3-46d2-48bc-b81e-0e74444405c5` succeeded. The Agent appended `CANVAS_HANDOFF_OK_20261004`; readback confirmed the edit and both existing mention capsules remained intact.

### Comprehensive operation tracing — 2026-10-05

- Static inventory: 92 GUI entries and all 39 actual CLI parser leaves (131 user entries). Runtime bindings consume unit registries unchanged; 145 Core and 86 Server coarse internal definitions pass binding/source audits. This is static coverage, not 131 independently exercised production cases.
- Explicit GUI closures and Rust task scopes preserve concurrent parents; every traced layer records original entry, owned operation and code source/revision. Files jobs, Canvas outbox and initial Session publication persist context atomically; Agent requests persist dispatch and result context (migrations 0030/0032). Historical context-less tasks remain uncorrelated.
- Final prompt capture distinguishes handoff/preview/dispatch, includes kind/template/request/source/bytes and truncation/redaction markers. GUI capability credentials are redacted. Default analysis omits prompt bodies; selected-span retrieval returns one body. Concrete Agent CLI commands carry per-invocation W3C context, separate from command identity.
- Verified: GUI build + 61 tests; Skill 33 tests (including enabled HTTP-span regression); Core 23 tests; Server 7 tests; observability 4 tests; generic trace 6 tests; CLI 39/39 and runtime 92/145/86 binding audits.
- Production/client acceptance: Skill channel creation trace 7f9dfa804959ce458f51a6c4a6f00aae has Skill/Core/Server; GUI message trace 7a4f1ae59d49556c1d49f9303a417a32 includes presentation; GUI handoff fef639d501087360afbe4eb69b0fae88 records the tagged synthetic prompt. Agent dispatch 54561756b4bccd4bbd88c3a0c9354d51 contains preview/dispatch/Server delivery/Core execution. Independent runtime trace 52f4019ec95afaf17a49396700dee77f verifies restored Agent command and GUI terminal presentation; first reply uncovered an enabled HTTP-span NameError, corrected and regression-tested before final acceptance.
- Client artifacts published with exact public size/SHA-256 verification: Core 0.1.82-trace.2, GUI 0.1.86-trace.2, Skill 0.1.50-trace.3; Electron unchanged. Server 0.1.135-trace.5 deployed. Final trace 5e53914557e086856e1c7200207f2d33 has 37 spans across GUI/Core/Server/Skill, successful reply/execution/presentation and zero missing parents. New Core independently exercised with bounded parallel delivery and zero reported drops. Main Core artifact installed; existing unrelated Agent work prevents interrupting its old live process.
- Generic development remains /Users/yuzhiyuan/my_code/trace. Generic trace source pushed as a6ddd72b65933f06df5263bd33dfab52997118f0; GitHub v0.2.0 published and installed from verified release asset. Installed runtime check ready; CLI/HTTP catalog equality confirms 131 entries; App reports current/latest 0.2.0. MCP stdio/catalog protocol passes; host-specific embedded iframe rendering and every GUI locator remain outside verified scope. Performance uses bounded search samples, not population metrics.

### 2026-10-05：GUI trace 定位补全

GUI 注册表为 92 个入口补充控件/区域、只读导航、资源与权限前提；DOM `traceTargets()` 与 span 消费同一 ID。64 个操作控件、28 个结果区域，覆盖 16 个拥有者区域。`audit-locators.py` 独立于 span 绑定审计，92/92 通过。缺失具体控件只报告所属区域，绝不把业务按钮当作导航点击。

预览修复全局定位强制依赖 Channel tab 的错误、旧 iframe HTML 缓存、滚动区域高亮被裁剪和窄窗口状态提示遮挡。后台读取标出结果区域；检查更新/更新/重启定位共享状态按钮并说明当前文字。预览注册表持续运行时加载，无清单编译副本。

验证：GUI 26 个测试文件、65 个测试全部通过；类型检查/构建通过。真实安装预览验证 Channel 列表、检查更新、更新、Files 清单、Canvas 树和 Agent 管理弹层；没有点击任何保存/发送/分享/删除业务目标。静态绑定齐全不等于全部资源、权限和弹层组合已经实测。GUI `0.1.86-trace.5` 已通过 canonical R2 发布与完整大小/SHA-256 验证，并在本机安装；GUI ZIP SHA-256 为 `4821af65427cd799519d8e941c076c9a91663c5d56647f0ded65df3b29ec16fe`。

最终安装资源 `index-CATh7rOj.js` 已在真实 iframe 验证；Quick Share 管理页 `transfers.list` 的安全导航及结果区域高亮通过。验收快照保留在本机、由 Git 忽略；可复现的定位适配器和验证步骤分别见 `observability/gui-locator/` 与 `.trial/V-TRACE-ENTRY-01/`。


### 2026-10-05 正式 Trace App 定位页面修复

先前仅有独立试验页、正式目录却无真实 GUI 预览的状态已被替代。正式浏览器入口 http://127.0.0.1:53481/ 现在拥有左侧统一入口清单、右侧真实 GUI；点击 GUI 入口通过项目适配器 /embed 在同页导航和呼吸高亮，重复定位保留 GUI 状态。Skill 入口显示实际脚手架命令。项目适配器迁至 observability/gui-locator，旧 /trial 返回 410，启动使用持久 LaunchAgent。

实际浏览器点击验证 channels.list、messages.send、system.check-update、system.update 均在正式页面产生对应高亮，未执行目标业务操作；browser.open 显示 colab-browser open。证据：observability/gui-locator/formal-app-acceptance.png。GUI 定位回归 4/4、Trace 工具测试 7/7、注册绑定审计 92/92 通过。本机 Trace Skill 已从独立源码仓安装 0.2.1-dev；这不是新的公开发行。MCP 宿主内嵌渲染未在本次验收范围内。


### 2026-10-05 Trace 目录精简验收

正式 Trace 浏览器页面改为整项选择：左侧只有入口 ID、语义、源码路径、Grafana Tempo 返回的近一小时 root span P50/P90/P95；右侧顶部只有源码与携带入口筛选条件的 Grafana Drilldown 链接，下方为真实 GUI 预览或注册命令。移除 instrumented/owner 状态标记、重复查询按钮、Trace/Span 详情及版本操作。统计来自 /api/metrics/query 的 quantile_over_time，缺失分位数不补算。

本机 Skill 已从独立开发仓更新，持久目录服务已重启。实际点击 channels.list 验证右侧同页高亮、顶部源码/Grafana URI 和左侧三个 provider 分位数；browser.open 验证脚本命令。Trace 源码测试 10/10 通过（含缺失 P90、秒转毫秒、通用属性默认值、Drilldown 精确筛选）。README 已同步新界面截图 docs/images/colab-catalog.png 与 colab-command.png。未声称本次验证了登录后的 Grafana 页面渲染。


### 2026-10-05 Trace 源码定位精度修复

按 TypeScript AST 核对 92 个 GUI 入口的真实 runOperation/beginOperation 调用归属，注册表明确 source.path、source.object（组件）、source.function（函数或所属事件回调）。main.tsx 内 App 的不同闭包保留实际文件归属，修正 QuickShareControl、CanvasEditor/LoadedCanvasEditor 等此前笼统或不准确的归属。目录左侧及详情顶部显示文件 → 组件 → 函数，agent source 接口返回相同元数据。

验证：92 个入口均找到真实调用；Trace 工具测试 10/10 通过，本机 Skill 更新并重启目录服务。实际浏览器点击 files.withdraw 显示 desktop/ui/src/main.tsx → App → withdrawFiles，source 命令返回相同 object/function。修改未重新发布 Desktop GUI 制品，历史 span 不会被回写。

### 2026-10-05 安装入口与上下文胶囊

README 收敛为 macOS DMG 首启安装、Agent 执行 `colab-install` 安装 Skill 并由其 setup 安装 Core/UI 两条路线，加入两个实际协作案例截图。Electron Shell 首启调用随 App 打包的官方 bootstrap，检查 Core/UI/Skill 安装结果后才打开窗口；已安装时复用，启动时尝试唤起 Core 服务。Messages 上下文对象胶囊改用项目现有 shadcn Badge 渲染并截断长名称。

账号切换在注册新账号的已安装 Runtime 并确认 WebSocket 建立后才成功；失败恢复原账号，账号选择持久化使用事务。Token 刷新只写对应账号凭据，原账号的刷新不得覆盖后来切换的前台账号；后台 Runtime 对当前会话的检查和更新使用同一次锁。

`0.1.140-dev` 已提交后构建、发布到 R2 和 GitHub，并在本机安装 Core `0.1.86-dev`、GUI `0.1.88-dev`、Shell `0.1.22-dev`。实际故障还包含助手绑定了 `Trace acceptance isolated Core` 测试设备：仅恢复现有助手到本机已注册 Runtime，未改变调用权限或其他测试 Agent。双账号切换、各自真实 Agent 回复验收已通过；验收脚本见 `.trial/E2E-ACCOUNT-RUNTIME-01/verify.py`。


### 2026-10-05 Standard Trace page locator migration

Trace now owns a framework-independent page locator module and `locator-install` command. Agent Colab installed it into observability/page-locator with a version/hash receipt; the former gui-locator/browser.js highlighter was deleted. The project bootstrap imports the standard module, while the proxy retains authentication, HTTP/WebSocket transport and original live registry access. Repository project.previewUrl declares the diagnostic GUI. Normal GUI resources do not load this diagnostic module.

Verified: Trace 12/12 tests and Colab locator 6/6 tests pass, including an unrelated checkout entry using only the standard marker, untrusted origin/non-parent rejection, missing-resource fallback and navigation without executing business actions. Actual formal catalog clicks locate channels.list, messages.send and system.update; messages.send has computed animation trace-breathe. files.withdraw with no shared file reports the owning region and ok:false instead of claiming the control was located. Served runtime SHA-256 matches the command-installed module. This does not claim every project-specific route or MCP host renderer has been validated.

发行版复验：Trace v0.3.0 从 GitHub Release 校验并升级后，用已安装 Skill 的 locator-install 再安装 Colab 模块，receipt.version=0.3.0。移除目录 LaunchAgent 的 TRACE_LOCATOR_URL/TRACE_LOCATOR_EMBED_URL，正式目录从项目注册表 project.previewUrl 获得嵌入地址；再次点击 messages.send 产生 trace-breathe 动画。
# 2026-10-05 Ask me first policy correction

- Non-owner Ask me first requests use terminal `rejected`, exactly like Refuse; only the automatic reply differs. Owner replies remain new commands with the full query and reply chain.
- Migration 0033 closes historical `awaiting_owner` records as rejected; it does not replay them or retarget runtimes.
- Deployed Server `0.1.140-dev-ask-owner-1` from commit `45b380c`; policy and prompt tests passed. Live cross-account acceptance passed: refused request `345b1d43-7e4f-4aa2-95c0-b221b08bf86e` remained rejected while the owner's independent request `64a9ffdd-8793-44a0-97ae-4b3c54c93e70` succeeded with the additional requested reply. Original foreground account restored.
# 2026-10-05 macOS title-bar regression

- Restored a fixed 38px native-control/drag row only in macOS Electron; channel rail and workspace begin below it. Browser and Windows layouts stay unchanged.
- GUI type check and production build passed. GUI 0.1.89-dev published through the signed stable channel and installed on the unchanged Electron 0.1.22-dev. Refreshed native window shows the dedicated title bar above the channel rail; native drag gesture exercised on that region.

### 2026-10-06 Trace regression prototype

Project-owned pilot is isolated in `.trial/regression_test` (registry and GUI/Skill scripts); generic runner lives in the Trace repository's `.trial/regression_test`. No Colab product behavior or release boundaries changed. Two read-only cases verified through real Chrome/CDP GUI and real colab-browser command. Initial GUI readiness false positive was fixed by waiting for a business landmark; its original failure record remains. No client artifact built/released for this experiment.

### 2026-10-06 Regression formal directory integration

Project-owned registry, GUI/Skill cases and ignored history moved from `.trial/regression_test` into `regression_test/`. Five historical records retain their timestamps/outcomes; relocated source/evidence references now use the formal paths. Generic execution, parsing and persistence stay in the independent Trace repository. Formal workspace at http://127.0.0.1:53481/ shares React/shadcn navigation, metadata badges and syntax-highlighted script drawers. Preview uses the existing 53480 adapter; no Colab production GUI/Core/Server behavior or artifacts changed.

Verified formal browser: messages.send has trace-breathe animation, provider Grafana link carries the exact operation/origin, cases share their real project source, copy-path succeeds, historical 4.83-second run still shows two passed cases and its relocated screenshot. Trace typecheck/build and twenty tests passed. The latest historical 401 failure remains a failure; no fresh business E2E pass is claimed. Automatic provider trace correlation is still pending.

Formal runtime acceptance: run `20261006T025324Z-5d33dbe0` passed GUI and Skill (two passed, one inactive fixture excluded), total 9.19 seconds. Prior run `20261006T025229Z-cd78ee22` remains recorded: GUI readiness matched six tabs and failed strict resolution, Skill passed. Fixed project readySelector to the unique Messages tab; do not weaken runner strictness or discard the prior failure. Desktop and narrow viewport interfaces verified; package dry run has no .trial/.runtime/.runs/node_modules payload.
