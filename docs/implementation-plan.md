# Colab 实现计划

状态：执行中  
当前里程碑：M1–M4 主链与 Files 预览已完成；当前主线为 M5 Quick Share，随后依次收口身份生命周期、存储治理和邀请可靠性。Windows 实机验收等待测试设备，微信登录等待开放平台材料，二者不阻塞当前主线。

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

### T3.1 Adjacent feature decision: project management and Conversation/DM (design completed)

- [x] Record the decision not to build traditional project management or an OKR substitute without evidence of long-running cross-owner dependency failures;
- [x] Define Conversation as a separate domain object that can reference a Channel without inheriting or mutating Channel membership;
- [x] Define an Agent participant as owner + blueprint + selected runtime, with one provider-native session binding per Conversation;
- [x] Define explicit Agent Request authorization, approval, offline queue, lease and summary-reporting semantics;
- [x] Re-evaluate Matrix, XMPP, Centrifugo and raw WebSocket against the requirement not to rebuild classic IM; select self-hosted Matrix/Synapse as the chat truth while Colab retains only blueprint/request/runtime/context business state;
- [x] Extend the existing low-fidelity shell with a concrete Conversation entry, three-pane chat, blueprint editor and coding-agent prompt, participant picker, message selection/forwarding, Agent Request state and reply/source references;
- [x] Add a concrete ER diagram, module placement diagram and Agent Request sequence, with editable Mermaid sources and static SVG renderings;
- [x] Run the existing full repository check after the previous Files/Quick Share work: Desktop build, Local Core tests and Server tests all pass on 2026-09-30;
- [ ] Before implementation, run a narrow Matrix trial for Synapse provisioning, Local Core incremental sync and one Application Service custom event, then run V-CHAT-01 against one real provider runtime and one disconnected/reconnected Local Core.

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

## 明确延后的工作

- Supabase 第二套服务端与双后端 contract parity；只有明确恢复 Supabase 时再立项；
- Cloudflare 原生后端、RLS、Queue、Realtime 组合验证；当前 Cloudflare 只承担 R2 制品分发与 DNS；
- WebSocket/SSE 实时失效通知；正确性继续依赖 pull，出现实际延迟问题后再增加；
- 群聊、Agent runtime/blueprint、结构化任务模块、P2P 传输和 SAML bridge；
- 完整搜索实现；在真源到索引的同步关系确定前不做部分元数据搜索冒充完成品；
- 任意收件人的邀请邮件；选定可用 SMTP/provider 后连同 outbox 与模板验收一起恢复；
- query submit hook 的自动 Skill 推荐；当前先完成显式共享、安装与 Give-to-Agent 闭环。
