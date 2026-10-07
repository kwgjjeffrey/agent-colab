# 技术验证计划

### 2026-10-07 Resource visual rollback

Restoring pre-refinement presentation at user request. The earlier 93 Vitest tests are frontend unit/component/source checks with mocks, not Trace end-to-end regression. Native restoration acceptance and publication pending.

### 2026-10-07 Sessions / Files visual refinement

- Rollback checkpoint 4271026; presentation-only scope. Seven new DOM tests pass: owner click isolation, keyboard open, owner menu, disabled handoff, one empty-state share button, original Session/Files prompt contents/no body prefetch, and unchanged materialize/tree path. Production build passed.
- Full GUI suite: 93 tests across 32 files passed; production build passed. Source d22a8b9 committed before canonical GUI-only publication. Stable promotion 0.1.150-dev / GUI 0.1.98-dev published and installed with normal setup. Public readback verified 908874 bytes, SHA-256 7206e6bf3cf1ba1074c157d357821e593247e04b8dd93e65e18777ac0dc907e9.
- Installed native acceptance: Sessions/Files headers, icons and metadata render; mouse owner menu opens Withdraw; contributor opens Profile without opening handoff; Session handoff opens its existing reader prompt; Files opens actual AGENTS.md preview and its original read-only colab-browser prompt; empty Files shows exactly one real Share files action. No withdrawal, sharing or Agent dispatch performed. Screenshots are ignored local dist/ga-review/sessions-refined.jpg and files-refined.jpg. No backend changes require deployment.

### 2026-10-07 Activity / website

- GUI: 86 tests passed, including bounded page fetch, exact task from Messages/Canvas activity, nested capsule click isolation and Enter activation. Production build passed.
- Isolated PostgreSQL: activity membership, cursor pagination, coalesced reads and actor identity passed; rich preview retains atomic IDs and caps text at 160 characters. Two targeted tests passed in 0.15s. No full Server suite was run.
- Independent website: build and three release-asset selection tests passed; dependency audit reports zero vulnerabilities after patched sharp override. Cloudflare deployment produced Worker version `6eaa0714-d106-45bb-bdfd-f4cea39c805e`. Public HTML matches build SHA-256 `000663e0fb8ee08cf96c42855eef8c92be8c80eccc13bdd3f2918145501a9629`; fixed Mac download redirects to an official DMG with final HTTP 200; install script readback passes `bash -n`; unknown routes return 404 and download POST returns 405. Desktop and 390px mobile preview passed, mobile document and viewport widths both 390px. No fresh-machine installation claimed.
- Source committed as `fe2dd07` before release. GUI 0.1.97-dev / promotion 0.1.149-dev published and installed through normal setup; public GUI verification: 907440 bytes, SHA-256 `5cacbfd25d5cf74b3d1a63c5da06be944bcc68a801221c1a50943d37b7e95c93`. Server 0.1.149-dev built from committed HEAD and deployed with readiness passing.
- Native installed GUI confirms velocity headline, rich Activity capsules and Agent Profile without row navigation. Clicking an older activity opens request `2c8d6d9d-56af-4016-adc7-06d188a2c4c8`, showing its exact instruction, intermediate reply and `REGRESSION_OK`, oldest to newest, tool call collapsed. No Agent command dispatched in this acceptance. Screenshot: ignored local `dist/ga-review/home-after.jpg`.

### 2026-10-06 compact Use cases / exact activity task

85 GUI tests and production build passed. Regression covers both Messages and Canvas activity
keys opening exactly their request, not trigger message or latest task; existing bounded-page
resource navigation and retry tests remain green. Publication/native acceptance recorded below.

Stable promotion 0.1.148-dev / GUI 0.1.96-dev published from committed source 2ebf1f8.
Public artifact readback verified 907103 bytes and SHA-256
ffca20953dd136b8c9a4f0672bddea9659b5d2502a7c136d5ac1bbca78a96e89.
Installed updater confirmed GUI 0.1.96-dev. Isolated browser screenshot confirms five distinct
role palettes, labels beside case text and compact rows. Existing collapsed preference survives.
Native Home clicked a non-latest completed activity (ACCOUNT_RUNTIME_OK_0d37efdc): the Drawer
loaded that exact instruction/response and request eaa9da2d-3928-479f-9548-7d56180d2090, not
the latest ASK_OWNER task. Tool call remains collapsed. No command dispatched during acceptance.

### 2026-10-06 role-oriented Tips acceptance

- 83 GUI tests passed, including role filtering, dismiss/recovery, missing-data vs failed-request
  handling, source-bound prompts, additional-query forwarding and explicit-only remote dispatch.
- Production GUI build passed. Existing large-bundle advisory remains; no new backend deployed.
- Isolated actual GUI on port 55505: Reviewer selects only the review case; Try reports no
  teammate Session and offers the existing invitation path. No runtime task sent in this check.
- Publication and installed-GUI acceptance are recorded after the release completes; mocked
  dispatch tests alone do not claim a new end-to-end runtime execution.
- Installed acceptance of GUI 0.1.94-dev caught an over-restrictive team-summary source filter:
  own shared Sessions were omitted. Summary/review now include all Channel Sessions; only
  teammate-style/takeover restrict to collaborators. Regression asserts own sources remain visible.
- Final stable promotion 0.1.147-dev / GUI 0.1.95-dev published from committed source 27648ee.
  R2 public verification: 906680 bytes, SHA-256
  70db62649557ee12663f8515c8d6b83f93c03c04e6f37abf668c90521e7b4c17.
  Installed updater confirmed GUI 0.1.95-dev; other client components retained their versions.
- Native installed GUI verified role badges/filter; team-summary Try selects the actual shared
  Session with contributor and last-sync time; Prepare prompt includes task/source metadata;
  adding User query then Forward preserves both the prepared task and exact additional query.
  Send remains disabled until a target is selected. Cancel returns Home. No task was sent or
  source Session body read as part of this UI acceptance.

2026-10-06 Home 布局/频率跟进：GUI 74 测试及生产构建通过，定向断言验证标题紧跟三图、Agent/人频率 30 倍。GUI 0.1.93-dev 经公网 size/SHA-256 校验并提升至稳定清单 0.1.145-dev；标准安装器更新后版本匹配，真实桌面应用刷新及隔离浏览器均验证标题位于主角图右侧，其他制品不变。

2026-10-06 Home 主线验收完成：GUI 全量 74 测试及构建、Core/Server cargo check、Skill 34 测试通过。隔离 PostgreSQL 的有界分页、跨用户拒绝、重复消费聚合、撤回隐藏、Canvas创建与两类指令记录验证通过。真实 Core 托管 GUI 验证正向三角形/新文案/无框 Tips/真实共享动态、点击共享对象进入 Files 详情、Tips 收起刷新持久化。发布前源码提交 3cb4cc3、版本提交 9914fdf；稳定清单 0.1.144-dev 全部改变制品通过公网 size/SHA-256，Server 0.1.144-dev 远端 symlink/readiness 验证。本机标准安装器核验缓存中的同一已公开验证制品，安装 Core 0.1.88-dev、GUI 0.1.92-dev、Skill 0.1.52-dev；实际桌面应用刷新显示新 Home 和真实历史动态。未切换真实用户账号或组织。读取动态是成功消费的尽力上报，不回填此前未记录的读取历史；手工直接读取已下载文件不会产生新上报。

2026-10-06 Home 动效第二版：真实浏览器验证三组各三个节点、人/Agent 周期 6s/0.6s、Colab 边宽 9px；窄窗口仍三组横排。独立构建通过，正式页面未修改。

2026-10-06 Home 动效样板：独立生产构建、真实浏览器三组布局和暂停/恢复通过。正式移植、活动数据链路、窄屏视觉验收尚未执行。

### Information-association / Canvas UI follow-up — 2026-10-05

- [x] GUI TypeScript 与生产构建通过；23 文件/56 测试通过。Canvas mention hover 保持、共享 prompt 弹层 User query 与 Send、文档拖拽持久化请求和删除确认均有定向 UI 测试。
- [x] Local Core 与 Server `cargo check` 通过；Server Canvas prompt 单测验证预览与派发复用构造函数、Heading 区段、read 命令、资源说明和 User query 顺序。PostgreSQL 临时表事务成功解析 0031 迁移并回滚；这不等于真实业务库已迁移。
- [ ] 真实 PostgreSQL 迁移 0031、Canvas 拖拽跨目录/删除后列表、安装态预览→下发→Agent Runtime 完成与实际文档改动尚待端到端验收。未完成前不得宣称全部功能已交付。

2026-10-04 信息关联验证（进行中）：GUI 20 文件/51 测试与 TypeScript 检查通过，包含转发先选目标再明确发送、用户指令保留、四类资源提示词；Server 6 测试通过，包含资源引用去重与精确读取命令；Skill 30 测试通过，包含单条消息精确读取且不泄露渲染树；Canvas codec 11 测试通过，四种胶囊 Markdown 往返、相邻 patch 身份不变及伪造 URI 身份拒绝；Local Core `cargo check` 通过。现有安装态只读 CLI 可以列出真实 Channel、Agent 和 Canvas。新 Server/Core/GUI/Skill 的正式部署与更新、跨账号权限测试、真实 Runtime 执行返回、原生窗口交互均未通过门禁；原生窗口工具本轮连续两次超时。完整门禁见 `docs/information-association.md`。

2026-10-04 GUI 0.1.82-dev：47 前端测试与构建通过，R2 发布并正常更新安装；
实际 Colab 窗口刷新后截图确认消息 Agent 圆形相框完整、角标在右下角，无竖线拉伸。

2026-10-04 Messages avatar identity：前端 18 文件/47 测试通过；新增点击头像、
任务定位、hover 从头像移至卡片保持以及离开关闭回归，复用标准 HoverCard。
GUI 0.1.81-dev 经 R2 完整回读发布，正常 update 安装；installation refresh 确认
installed/latest 均为 0.1.81-dev。原生窗口自动化 getState 超时，因此未宣称原生窗口
点击验收通过；交互验证来自真实组件的 jsdom 用户事件测试。

2026-10-04 Agent stdout implementation：29 项 Python 与 6 项 Server 测试通过。
逐操作白名单覆盖六个协作 CLI；回归包含未知字段不透传、消息短回执、分页、
Markdown/胶囊正文保留、空成员更新回执和 nullable transfer tree。
Skill 0.1.48-dev 经 R2 公网 size/SHA-256 验证与 stable 0.1.128-dev promotion，
通过正常 /v1/system/update 安装；installation refresh 确认 installed/latest 均 0.1.48-dev，
安装版 output_views 与源码 cmp 一致。安装版真实只读验证包含消息、runtime、成员、
文档读取和 source 发现；隔离 HTTP fixture 执行安装版消息写入/请求回复及 transfer，
不重发用户历史 request，也不以生产删除/安装动作凑覆盖。
Server 0.1.127-dev 已部署，公网 ready=ok；recent/quoted 消息标题与正文换行由构造测试验证。
此项不宣称全部 mutation 已在生产实测，完整审查边界见 agent-output-review。

状态：当前实现主线改为独立 Rust + PostgreSQL；Supabase 与 Cloudflare 验证资产保留，但暂不继续开发。以下只保留会改变当前实现顺序、同步协议、客户端边界或上线可行性的验证项

## 1. 标记规则

- **确定原则**：由产品定位直接推出，不依赖具体技术能否成立；
- **推荐方案**：当前认为最合适，但仍可能被验证结果推翻；
- **待验证假设**：存在兼容性、性能、平台能力或工程复杂度不确定性；
- **待设计**：当前阶段尚未形成足够具体的方案，不伪装成已解决。

技术文档中的推荐方案必须能回指本表中的验证项。验证通过前，不把推荐方案写成既成事实。

## 2. 验证总账

| ID | 状态 | 要回答的问题 | 已得结论 / 下一步 |
| --- | --- | --- | --- |
| F-CANVAS-01 | **通过** | 真实 Tiptap/Yjs 文档能否由 Rust/Yrs 做确定性 Markdown 投影、局部文本 transaction 和前端回放，而不向 Agent 暴露 CRDT block | Tiptap `3.31.4` + Yjs `13.6.27` 生成包含 heading、mark、list 和 component fence 的 update-v1 fixture；Yrs `0.28.0` 正确投影并局部修改 XmlText，JS/Tiptap 回放正确且保留未修改 mark。同一 update 重复应用幂等，与独立并发 update 反向乱序应用收敛；component fence 修改返回 `structured_component_requires_tool`。[可复现 trial](../.trial/F-CANVAS-01-yjs-yrs-projection/README.md)。进入正式 Server/Core/Skill/GUI 实现，恢复与端到端只在正式代码中验证。 |
| V-CANVAS-02 | **通过（最窄正式纵向链路）** | 正式 Server/Core/Skill 是否真实保存、投影、patch，并在 Server 不可达与 Core 重启后补发 | 部署 Server `0.1.98-dev` + migration 0024；release Core `0.1.67-dev` 和 packaged `colab-canvas` 创建真实 Canvas，Yjs update 获得 seq 1，Codex patch 获得 seq 2。Server 断开时 89-byte update 以固定 clientUpdateId 留在 SQLite pending；同一数据库重启后自动补发为 seq 3/acked，Skill 读回合并内容与 `syncState=synced`。[证据](../.trial/V-CANVAS-02-core-skill-recovery/README.md)。不覆盖 typed components、双用户 GUI 和规模压缩。 |
| V-CANVAS-GUI-01 | **代码级通过；真实升级目视待用户验收** | GUI 是否在初始 CRDT 状态完成前避免挂载编辑器，并与 Messages 复用一条 account socket | GUI `0.1.60-dev` 先拉取并应用 ordered updates，之后才创建 Tiptap Collaboration editor；源码扫描只有 `api/realtime.ts` 一个 `new WebSocket`，Messages/Canvas 均订阅该 singleton。22 项 Vitest 与 production build 通过，R2 公网回读 size `743949`、SHA-256 `5697b10a…` 一致。按约定未代替用户点击更新，因此不把真实安装后的视觉/交互记为已通过。 |
| V-CANVAS-RESOURCES-01 | **通过** | Canvas 文档/嵌套目录创建、树渲染、重命名和 Agent handoff 是否使用真实 Core/Server/Skill 链路 | 根资源未渲染的根因是 Server JSON 的 nullable parent 被 GUI 错按 `undefined` 比较；GUI `0.1.62-dev` 统一归一化为 `null`。Server `0.1.100-dev`、Mac Core `0.1.69-dev`、GUI `0.1.62-dev` 经 R2 发布、完整 SHA-256 回读并在本机更新；Electron 保持 `0.1.21-dev`、Skill 保持 `0.1.45-dev`。正式 Local API 对现有 `hello` 完成临时重命名和恢复；实机强制重载后资源树显示两个根文档，New 展开为 Document/Folder 菜单且无弹层，Give to Agent 实际显示“先读 → 按需编辑 → 最后探索”。GUI 26 项、Server 6 项、Local Core 20 项测试及 production build 通过。 |
| V-GIT-01 | **通过** | shadow Git 能否完全隔离来源仓库并生成稳定 root tree | 能。已覆盖脏仓库、ignored/untracked、symlink、非 Git 目录和嵌套 `.git`；来源 HEAD/index/status 不变。详见 `.trial/V-GIT-01-shadow-git/` |
| V-GIT-02 | **结论完成，方案已修正** | shadow Git 的扫描与增量成本是否可接受 | 10 万文件首次扫描 192.3 秒，只能后台执行；已知单文件增量 0.98 秒。100 MiB 追加式 Session 会重建 101 MiB blob，因此 Session 改为不可变 segment/chunk；不再重复验证已明确的问题 |
| V-GIT-03 | **取消，不再需要** | `git2`/libgit2 能否替代已工作的 Git CLI | 这不会验证产品假设，只会替换已通过验证的实现。alpha 沿用 Git CLI；跨平台分发遇到真实兼容问题时捆绑固定 Git executable，不手写 Git object 实现 |
| V-INFRA-01 | **通过** | Supabase 能否独立承载首版服务端 | 数据库、事务、鉴权 Edge Function、private Storage 字节往返、Realtime、Queue/Cron 和搜索能力均成立。网络问题确认是本机代理未注入 CLI/Node 进程，不是 Supabase 缺陷。详见 `.trial/V-INFRA-01-baas/` |
| V-INFRA-02 | **暂停** | Cloudflare 原生模块能否组成 Colab 后端 | 本地纵切已通过，但首版已选择 Supabase，不再投入远端验证。详见 `.trial/V-INFRA-02-cloudflare/` |
| V-SYNC-01 | **通过** | Git object OID 作为 Blob 身份后，两台客户端能否完成求缺、传输、校验和物化 | 双端纵切通过；首次 4/4 objects、第二次仅传新增 4/8 objects，物化内容一致，旧 root CAS 被拒绝。目录采用 `(share_id, oid)`，不做跨 Share 去重。详见 `.trial/V-SYNC-01-supabase/` |
| V-SYNC-02 | **通过** | Supabase Storage 的断点续传是否满足大对象同步 | TUS 以 6 MiB chunk 上传 18 MiB 随机对象，首块后中断并从服务端 offset 恢复，下载 SHA-256 一致。1 GB 只保留为容量测试，不再视为协议不确定性 |
| V-LOCAL-01 | **通过** | 同一 Application Core 能否稳定同时服务 GUI 与外部 Agent 调用 | GUI + 两个 Agent 并发请求被合并为一次同步；SQLite 单写、Local API 鉴权、云端凭据不下发均通过。该验证证明共享 Core 的行为成立，但原型仍需在 V-LOCAL-02 中升级为真正独立进程。详见 `.trial/V-LOCAL-01-application-core/` |
| V-AUTH-01 | **历史验证；暂停** | Supabase 身份能否覆盖 Desktop session 生命周期和 Google PKCE | Email session 生命周期已通过；Google 路径未完成。因 Supabase 实现冻结，不再作为当前阻塞项 |
| V-AUTH-02 | **暂不验证** | 是否需要单独支持企业 SAML bridge | 首批需求尚未要求 SAML；企业 OIDC 优先。出现明确 SAML 客户后再验证，不提前制造适配层 |
| V-AUTH-03 | **通过** | 独立 Rust Server 能否用 Google OIDC 完成 Desktop PKCE、Colab session 和成员身份匹配 | 两个真实 Google 账号已完成 PKCE 登录、账号保存/切换、logout 和成员身份匹配。Server 以事务轮换一次性 opaque refresh token 并保留消费代际；隔离 session 黑盒得到首次刷新 200、旧 access 401、新 access 200、旧 refresh 重放 401，且重放后新 access/新 refresh 均为 401。Local Core 以绝对到期时间和单飞锁在到期前恢复，并先持久化新 token pair；Rust workspace 测试通过。 |
| V-ORG-01 | **核心链路通过，待真人验收** | Organization 多租户主体、切换、人员目录、组织外邀请和 Channel 加入语义是否闭环 | 真实 PostgreSQL 已迁移为 Organization Member 主体，Channel membership/创建/邀请均引用 Member；真实 Local API 已验证同一账号在两个 Organization 间切换后只返回当前组织 Channel，并验证创建 Organization 自动生成 owner Member。Desktop 已接入账号设置中的列表、切换和创建；待真人完成 GUI 验收与真实邮件邀请 UX |
| V-EMAIL-01 | **受限范围通过** | Cloudflare 免费能力能否先完成真实邀请投递 | 已启用免费 Email Routing，验证 `yuzhyuan@gmail.com` destination，为 token 增加 Email Sending 权限，并通过 Cloudflare REST adapter 真实投递 Organization 邀请。Free plan 仍只能发送到预验证地址；开放任意邀请收件人需付费或替换 provider。可靠 outbox/retry 仍是业务层待实现项 |
| V-LOCAL-02 | **macOS 通过；Windows 构建通过、实机待验** | 独立 Rust `colabd` 能否在未安装或未运行 GUI 时完整服务 Agent | Skill setup 已从远端 manifest 下载/校验/安装 `colabd`，macOS 注册 LaunchAgent；Windows 使用 `%LOCALAPPDATA%\\AgentColab`、目录 junction 与用户级 Task Scheduler。Windows MSVC Core 已完成 release 交叉编译，仍需 Windows 实机验证安装、登录自启、重启恢复与文件监听。 |
| V-LOCAL-03 | **macOS 通过；Windows 实机待验** | loopback HTTP + discovery file 是否能作为唯一 Local API transport | macOS 已实测随机端口、private discovery、稳定 endpoint/bearer、鉴权和重启重发现。Windows 已实现相同协议与平台路径并通过交叉编译；NTFS 权限、任务重启及浏览器 cookie 仍须在 Windows 机器黑盒验收。 |
| V-WINDOWS-01 | **制品链路通过，自举版构建中，实机待验** | Windows x86_64 是否能从单个桌面制品安装并独立运行 Core、GUI、Skill 与 Electron | release `0.1.46-dev` 已完成原生 Core 与 portable Electron 构建、R2 回读、平台选择及独立 PowerShell setup；实机证明旧 launcher 单独双击不构成完整安装。`0.1.49-dev` 首次加入 Core/GUI/Skill 种子，但仍错误暴露了 OAuth JSON 选择，不作为验收入口。`0.1.50-dev` 将官方 Desktop OAuth client 作为 ignored release configuration 注入构建，终端用户无需提供配置文件；待发布后在干净 Windows 账户验证首次启动、Google 登录、自动更新及 Files/Session/Skill 闭环。 |
| V-SKILL-01 | **通过** | Python 标准库 Skill client 能否覆盖首批 Agent runtime | canonical name 与安装目录统一为 `agent-colab`；Codex、Claude Code、MyFlicker 均完成真实安装/状态/卸载验收，用户修改过的安装会返回 conflict 并拒绝覆盖或删除。setup 对制品 `bin/` 中全部入口统一恢复 executable bit，不再依赖硬编码文件清单。`colab-open` 已从已安装 Skill 实测唤醒 Local Core 并打开 GUI，且 SKILL.md 明确把“打开页面”直接路由到该命令，而不是 setup 或资源查询。 |
| V-SHARED-SKILL-01 | **通过** | Shared Skill 能否完成来源发现、共享、跨账号消费、更新判断与目标 Agent 安装 | 真实 `agent-colab` Skill 根目录共享到共同 Channel；另一真实 Google 账号可读取并安装到 MyFlicker，owner 可安装到 Claude Code；非 owner 无撤回权限，owner 撤回成功。服务端保存 opaque Git revision，Local Core 使用 `root_oid` 判断更新并以 receipt 保护非托管或本地改动目录。release `0.1.42-dev` 已完成 Server 部署、R2 公网回读、安装升级与真实命令验收。 |
| V-RELEASE-03 | **通过** | 独立 artifact 版本与 Agent target 操作 | `0.1.15-dev` channel 中 Core/GUI/Skill 为 `0.1.15-dev`、Electron 为未变化的 `0.1.12-dev`；安装 receipt 与 `/v1/system/installation?refresh=true` 均返回相同的独立版本且 Electron 无虚假更新。经真实 Local API 往 MyFlicker target 执行 install → 验证 `SKILL.md` → uninstall，均成功并恢复未安装状态。 |
| V-RELEASE-04 | **通过** | Local Core 更新能否由普通浏览器恢复且不依赖 Electron | release `0.1.29-dev` 实测：受管更新响应 `restartScheduled=true, previousPid=65800`；更新后 endpoint 仍为 `localhost:53393`，原浏览器 HttpOnly cookie 无需重新 bootstrap 即可访问新 PID `85086`。GUI 只在显式更新后的最多 30 秒内每 500ms 探测 PID并 reload，另在窗口重新获得焦点时做一次 GUI 版本比较，不运行后台更新轮询；Electron `0.1.14-dev` 只在创建窗口时读取一次 discovery。旧 `0.1.27-dev` 的轮询方案与结论作废。 |
| V-FILES-GIVE-01 | **通过** | Give to Agent 能否一次取得可消费上下文并前往默认 Agent | `0.1.16-dev` 安装后运行可读引用 `Files tree validation`，响应同时包含来源根 `localPath` 与 4 项 `tree`；Python 测试验证非来源消费调用 `materialize?wait=true`。SQLite 默认 Agent 写入/读回为 `codex`，allow-list 打开接口返回 204。GUI 构建通过并使用 Dialog + ButtonGroup + DropdownMenu。 |
| V-RELEASE-01 | **alpha 主链通过，发布强化延后** | 多制品能否独立构建、分发、安装和运行 | Cloudflare R2 已成为唯一客户端制品源；当前 stable `0.1.12-dev` 的 Local Core、Desktop GUI、Skill、Electron 使用不可变版本 key，并通过公网回读校验。GUI 已分别显示 Local Core、GUI Resources、Electron Shell 的 current/latest，并按 Codex、Claude Code、MyFlicker 检测与操作 Skill；Claude Code 安装/卸载已验收。Electron Shell 已从 0.1.8 独立更新至 0.1.12，并保留旧 App 备份。Electron 仍为 ad-hoc 签名且尚无 Apple Developer ID/公证。 |
| V-FILES-01 | **双账号单机通过；产品与可靠性闭环通过** | Files 是否符合共享而非协同编辑的产品语义 | 两个真实 Google 账号在共同 Channel 完成目录与单文件分享；首次登记立即发布，2 秒静默窗口后 root 自动推进。消费方先读取旧物化缓存，再由 durable materialize job 刷新。`0.1.10-dev` 实测 12 个 watcher 事件合并为一次执行、运行中 generation 不丢事件、running job 强停恢复、失败退避与手动重试、缓存 15ms 返回后后台刷新完成。物化位于 Application Support 并按贡献者/分享名称寻址；不再要求第二台物理设备。 |
| V-FILES-STORAGE-01 | **通过** | Files/Skill Blob 大对象边界、配额和孤儿回收是否避免堆内存放大与无界磁盘增长 | Server Files/Skill pack 改为临时文件流式写入、256 MiB hard limit、`fsync` 后原子改名及流式下载；边界测试确认超限不发布 partial Blob。每贡献者 active revision 2 GiB 配额由 advisory transaction lock 串行核算，真实部署黑盒返回 HTTP 413 `storage_quota_exceeded`。小时 GC 从 active Channel shares 与未过期 Quick Shares 计算可达集，并以一小时 grace 回收 failed/withdrawn/expired Blob。 |
| V-SESSION-02 | **通过；大历史同步与 GUI 退场复验完成** | 保留原始 Session 后，增量同步、来源 adapter、固定快照分页和跨账号消费能否闭环 | Server 只保存 opaque JSONL segment/snapshot；真实 Codex 与 MyFlicker 来源均由已安装 Reader 在读取时投影。2026-09-29 复现 258+ MiB Codex 首次同步被单请求拖垮：改为约 8 MiB 完整-record segment、每段持久化 offset/snapshot、冻结本轮长度和按当前 user 限定贡献源。原 `offset=0/snapshot=null` 的真实 Share 已推进到 266,353,053 bytes 并读出固定 snapshot；切换到另一 Google 账号仍成功读取且没有借用贡献者本地源。后续又确认 GUI 预览会先物化整个快照并把本地 JSONL 全量读入内存，因此 release `0.1.53-dev`（Core `0.1.37-dev`、GUI `0.1.31-dev`）删除 GUI 正文预览，只查询 Share 元数据并显示最近同步时间；同一 Share 的后台、手动和 Reader 触发同步由 Local Core 串行化，避免并发 CAS 产生 `session_snapshot_conflict`。R2 发布、完整回读、安装升级与已安装资源检查均通过。Agent Reader 首次消费仍会把缺失 segments 逐段流式落盘后在本地全量投影，这是明确保留的独立消费路径和后续性能改进点，不再由 GUI 隐式触发。 |
| V-AGENT-TOOLS-01 | **通过** | 分发后的 Agent 脚手架是否真正可执行，并能跨账号完成三类 Shared Item 闭环 | 临时安装树直接执行 `colab-open`、Browser、Session Reader、Skill Tool 和 setup，捕获并修复 `lib` 包路径错误。真实安装后 E2E 由 `yuzhyuan@gmail.com` 分享临时 Files/Session/Skill，`jeffreyyuzhyuan@gmail.com` 列出三项、校验 Files 内容、读到 Session turns/snapshot、往 MyFlicker 安装再卸载 Skill，最后 owner 撤回三项。测试脚本位于 `.trial/E2E-AGENT-TOOLS-01/`。 |
| V-SESSION-03 | **通过** | 本地 Session 清单能否快速、完整地覆盖三类 Agent，而不在打开选择器时解析正文 | 清单查询只读 SQLite；已安装 Core 实测 200 条约 12ms、按 ID 搜索约 6ms。MyFlicker 与 omni-colab 基准一致，共 73 条：新版 CLI 54、旧版 CLI 11、Desktop 8；排除了 2000+ 个 `requests/` 请求碎片。Desktop 独立 adapter 的覆盖、rollback 和工具调用投影有 Rust fixture 测试。发布验收版本为 release `0.1.33-dev`、Core `0.1.27-dev`、Skill `0.1.24-dev`。 |
| V-FILES-03 | **通过** | 超大或误包含构建物的共享源是否会拖死同步 | `agent-colab` 曾因构建物进入 shadow index 产生超过 2 GiB 对象，而 Server body limit 为 256 MiB。release `0.1.36-dev` 已安装复验：按 shadow `info/exclude` 排除 102,559 文件/20,071,279,289 bytes，纳入 393 文件/47,483,603 bytes，预览约 4.2 秒；真实临时 Shared Item 首次发布约 4 秒完成并得到 root `9972e3fe…`，随后已撤回。范围 PATCH → durable job completed → GET 读回均通过，SQLite schema 不含 exclude 配置，来源 `.gitignore` hash 保持 `8a8346e3…`。现有单文件 100 MiB/总量 200 MiB 预检阻止不可能进入单请求的工作；更大对象的分块传输仍属后续 transport 能力。 |
| V-CONTRACT-01 | **Supabase 恢复时验收** | Supabase 与独立 Rust+PostgreSQL 后端是否具有相同产品语义 | 当前只验收 standalone；恢复 Supabase 后再让同一套黑盒测试运行两次 |
| V-PUBLIC-01 | **通过** | 首次加载、前台请求状态与公开 GitHub 分发是否形成可理解、可复验的 alpha 体验 | GUI `0.1.30-dev` 构建与 request-activity 并发测试通过；首次无数据时显示 workspace loading，已有数据时 foreground request 显示顶部 loading，后台 reconciliation 静默。release `0.1.47-dev` 六个制品已通过 R2 公共 size/SHA-256 回读；public repository `kwgjjeffrey/agent-colab` 与含描述性资产名的 GitHub prerelease 已创建，匿名 manifest 下载 hash 与 Windows executable HTTP Range 下载通过。macOS DMG 从 release `0.1.52-dev` 已发布 ZIP 中的同一 App 生成；挂载后通过深层签名、bundle version 和 ASAR 摘要一致性验证，GitHub 完整回读为 110,809,491 bytes、SHA-256 `71733a62…4392`。README 中四张架构图已从 GitHub 运行时 Mermaid 改为仓库内静态 SVG，并保留可编辑 `.mmd` 源；公开页面不再出现 Mermaid `Loading`/rich-display failure，四个 SVG 均通过 XML 校验并由 GitHub 以 `image/svg+xml` 提供。 |
| V-FILES-PREVIEW-01 | **流式链路通过，待真人视觉验收** | Files 是否能以 IDE 式信息架构预览常见格式，同时避免 Local Core 缓冲大文件 | GUI 已拆为全窗 File Explorer（目录树 + 内容区）；文本、图片、PDF、`.docx`、`.xlsx` 分别使用原生或按需 renderer。release `0.1.54-dev`（Core `0.1.38-dev`、GUI `0.1.32-dev`）通过 Rust/GUI 构建、R2 完整回读和实际安装；已安装 Core 对真实 `Doc1.docx` 以 `ReaderStream` 返回 371,251 bytes，MIME、`nosniff` 与源 SHA-256 完全一致。未知/损坏/超限文件只在预览区降级，Office 前端解析上限为 25 MiB；待真人完成树导航及各格式视觉验收。 |
| V-FILES-PICKER-01 | **通过** | Files 能否真正以一个操作选择文件或目录，而不是把二选一藏进下一层菜单 | release `0.1.64-dev` 删除 Channel Files 与 Quick Share Files 的两处 file/folder dropdown，并增加源码回归测试。安装 Core `0.1.46-dev`、GUI `0.1.39-dev`、Electron `0.1.19-dev` 后重启实机验收：Channel 只有 `Share files`，Quick Share 只有 `Choose Files`；一次点击打开同一原生列表，其中普通文件与目录同时可选。Windows/macOS Core 与 Shell 制品均完成 R2 size/SHA-256 回读。 |
| V-TRANSFER-01 | **主体通过；跨账号与到期/GC 待验** | 未注册、未加入 Organization/Channel 的贡献者能否安全完成一次性上下文交付 | release `0.1.59-dev` 已部署 migration/API 并经 R2 完整回读、本机真实升级。真实 Files 快照得到 create 201、receive 1 item、登录账号 `Zhiyuan Yu` 使用记录、有效期更新和 revoke 204，管理清单保留 revoked 状态；GUI 目视确认类型下拉、视口内结果页、访问者与重新管理入口。整仓 `make check` 通过。仍需第二账号/匿名领取、干净 bootstrap、自然到期/超额/GC 黑盒。 |
| V-TRANSFER-UI-01 | **通过** | Quick Share 结果弹层在内容滚动时，底部操作区是否始终位于弹层边界内 | 根因是 shadcn `DialogFooter` 被嵌入带独立 padding/scroll 的 `ResultView`，其标准负边距相对错误容器计算。release `0.1.65-dev` 改为 `DialogContent` 的直接子节点并让 `ScrollArea` 只包裹正文；GUI 单测/构建、R2 size/SHA-256 回读、真实安装均通过。实机重开历史 Quick Share 后确认 footer 完整收在圆角 Dialog 内，正文滚动区、分隔线和操作按钮互不侵占。 |
| V-AUTH-WECHAT-01 | **待调研/验证** | 微信开放平台 OAuth 能否与现有 Google identity 安全共存 | 先确认目标客户端类型、所需开放平台资质、回调域名和 unionid 可用范围，再验证 provider identity 映射、显式账号关联与真实登录；不按昵称或未验证邮箱自动合并。 |
| V-INVITE-OUTBOX-01 | **可靠性通过；任意收件人送达待外部条件** | 邀请是否会因邮件 provider 延迟/失败丢失或让业务请求假失败 | 邀请与 `email_outbox` 在同一 PostgreSQL 事务提交，API 真实返回 202/`queued`；部署环境用不可送达测试地址验证 worker 已领取一次、记录失败并退回 pending，后续按 capped exponential backoff 重试。成功后删除含短期明文 token 的 outbox 行。任意公网收件人送达仍等待 VPS 出站 25 与 rDNS 工单，不标记通过。 |
| V-CHAT-01 | **Codex 主路径通过；崩溃 lease 与 owner approval 待后续** | 一个真实 provider session 能否由指定 Local Core runtime 按 Conversation binding 恢复 | `jeffreyyuzhyuan` 的真实 runtime `kwaideMacBook-Pro.local · Codex` 已由 Skill 安装记录登记；`Runtime Validation Agent` 精确绑定该 runtime。第一次 request 创建 Codex thread `01a0f275-5430-7e11-85bf-4022f842f7c3` 并回传 `runtime validation pass 3`，第二次执行实际使用 `codex exec resume` 同一 thread 并回传 `runtime validation resumed`。启动路径故障曾暴露永久 running 风险，现已增加失败上报把 provider 启动/恢复/回传错误转为 `failed`。进程硬崩后的 lease 重领与他人请求 owner approval 尚未声称通过。 |
| V-CHAT-DESIGN-01 | **通过；不再重开框架选择** | Messages/DM 方案是否把入口、blueprint、技术选型、ER、模块和关键时序说清楚 | 最终决定由 Colab 在现有 Rust Server/PostgreSQL 中拥有 room/message/Agent 领域，Axum WebSocket 只传失效通知，HTTP+cursor pull 保证正确性。Matrix/Tuwunel/OpenIM/Tinode 会带来独立服务、状态库与身份/房间映射；Centrifugo/Mercure/MQTT只覆盖传输或 broker，并不减少首版领域实现，因此均不进入当前部署。只有未来明确出现 federation、第三方协议客户端或 E2EE 需求，才以新证据重新立项，而不是重复当前选型讨论。 |
| V-MESSAGES-UX-02 | **主体通过；最终安装包回归待发布后复核** | Message/MessageGroup 组件、空响应、Agent 新建/选择/删除、合并 runtime 选择、提示自动消失 | 真实 GUI 已验证消息时间线、发送/回复、创建后自动加入 Channel、删除入口、`Create by my agent` 主操作、单一 runtime Select 与自动消失通知；HTTP 204 不再被误解析为 JSON。Local Core 补齐 runtime 字段透传后，需要用下一稳定制品再做一次选择器标签截图回归。 |
| V-AGENT-HANDOFF-01 | **主路径通过；分支与故障注入待验** | `@Agent` 是否以完整富文本正文和结构化 identity 由正确 runtime 执行，并由 Agent 自主回写 | 用户真实 seq 32/33 最终暴露两个剩余根因：空闲 runtime WebSocket 半开后服务端 presence 消失，以及立即触发的心跳 Ping 抢在 command ACK 前到达。Core `0.1.61-dev` 改为 20 秒延迟心跳；Server `0.1.83-dev` 在十秒 ACK 窗口内处理控制帧并只接受精确 request ACK。旧 `codex exec` 绑定以 adapter version 1 作废；app-server version 2 新建 Codex Desktop 可见 task `01a0f5ed-1c88-73b0-a73e-7c5e9a71f520`。两个既有请求均从 queued 转为 succeeded、Local receipt 为 completed，Channel seq 35/36 均收到 `我收到了你的消息`；Codex `list_threads` 直接返回该 task 及真实中文请求摘要。自动测试覆盖两个 Agent 和重复 mention 去重；仍待真实双 Agent 扇出、owner confirmation 与执行中断线重投。 |
| V-AGENT-WRITER-01 | **macOS 安装态通过；跨 thread 压测待后续** | Codex thread 的 writer 被占用时，后续 Channel command 是否保持同一逻辑会话 | 双 app-server 验证：A resume 成功；B 得到 `already has an active writer`；A unsubscribe 后 B 可在同一 thread resume。非持有者 unsubscribe 返回 `notLoaded`，不存在 force takeover；Desktop 可以读取别的 app-server 持有的 thread。[可复现 trial](../.trial/V-AGENT-WRITER-01-codex-writer/README.md) 又确认 active 期间第二次 `turn/start`/`turn/steer` 都是插入原 turn，而 `thread/queue/add` 产生独立 submission、busy 时可见、idle 时由 owner 自动消费。Core `0.1.62-dev` 安装后，四个真实 Agent request 均使用 Desktop 可见 thread `01a0f6e9-d8d0-7802-8cd8-08a2e15451db`：重启前回传 Channel seq 40/42，强制重启 launchd Local Core 后继续回传 seq 44/46，四个请求最终均为 `succeeded`。Core `0.1.63-dev` 进一步把 Desktop active-writer 作为非致命所有权冲突处理；安装态 request `c47b335d…` 在原 thread `01a0f6e9…` 完成并达到 durable `succeeded`，Agent 工具回传被 Server 构造成 seq 55，包含请求人结构化 mention 且引用触发 seq 54。尚未执行两个不同 blueprint thread 的并行压力验收。 |
| V-MESSAGES-VIEWPORT-01 | **通过** | 返回 Messages 时是否保留记录与滚动位置，且整页不随历史增长 | GUI `0.1.49-dev` 以 Channel 为键保留 rows/lastSeq，返回时只拉 cursor delta；`sessionStorage` 保存 timeline scrollTop。App shell 固定为 viewport，Channel rail/settings 与 composer 固定，timeline/participant list 独立滚动；Channel identity 与 Quick Share 合并为一行，头像缩至 24px，composer 合并为单一输入表面。11 个 GUI 测试与生产构建通过；R2 公网制品 SHA-256/size 回读通过，安装到真实 macOS App 并强制刷新后，已目视确认紧凑头像、三类气泡、吸底 Settings/composer 和单层输入面。Electron 保持 `0.1.19-dev`。 |
| V-MESSAGES-RECOVERY-01 | **通过** | 代理/NAT/休眠造成 WebSocket 半开、浏览器不触发 `onclose` 时，已提交消息能否自动恢复 | 用户真实 seq 47 已在 Desktop 可见 thread `01a0f715-a4ee-7380-8528-80afd293b5a7` 完成并提交 Agent seq 48，但旧 GUI 因半开 Conversation socket 永久未刷新。Server `0.1.85-dev` 增加 15 秒文本 heartbeat，GUI `0.1.50-dev` 增加 45 秒无帧 watchdog；黑盒观察到两个 heartbeat 间隔 15.6 秒，并在保持 Local Core bridge socket 时强制重启部署 Server，客户端成功重连且 `after=47` 精确补回 seq 48。真实 Electron 页面随后目视确认请求和回信均存在。13 项 GUI 测试、Server workspace 测试、R2 size/SHA-256 回读与真实安装通过；Electron/Core/Skill 未推进。 |
| V-MESSAGES-RECOVERY-02 | **通过** | WebSocket 仍有 heartbeat、但某次业务 invalidation 丢失时，已提交消息能否自行补齐 | 用户真实电子云请求对应的 Agent 已在 Desktop-visible thread `01a0f715-a4ee-7380-8528-80afd293b5a7` 完成、上传 `electron-cloud.png` 并提交 Channel seq 50；真实 Local Core 的 `after=49` 精确返回该消息，证明故障只在 GUI 对账。旧 GUI 因 heartbeat 持续到达而不会触发 silence watchdog，也不会再拉 cursor。GUI `0.1.51-dev` 将 heartbeat、匹配 invalidation、socket open、focus 和 visibility 统一为 single-flight `after=lastSeq` reconciliation barrier。13 项 GUI 测试及 production build 通过；stable `0.1.86-dev` 的新 GUI 通过 R2 完整 size/SHA-256 回读并经真实更新路径安装，强制载入后 Electron 直接显示已有 seq 50 及其电子云图片链接，无需重跑 Agent。Electron/Core/Skill 版本未推进。 |
| V-MESSAGES-UX-03 | **通过** | 消息身份是否能在真实安装界面中一眼区分 | GUI `0.1.48-dev` 使用三类气泡和对齐：本人右侧 primary、其他成员左侧 muted、Agent 左侧 violet；28px 头像与发送者同组，Agent 用 owner 头像加超新星渐变环并显示 `<Agent> (<owner>'s Agent)`，时间和辅助操作 hover 才出现。GUI 11 tests/build 通过；安装后重启真实 Electron App，目视确认三类布局和 Agent 归属样式，Electron 版本未推进。 |
| V-MESSAGES-UX-04 | **制品已发布，待用户更新与视觉验收** | Discord 式紧凑消息流和重组后的 Settings 是否符合最新交互结论 | 移除三类气泡与本人右对齐，统一为左对齐紧凑行；真人和 Agent 使用同尺寸基础头像框，Agent 增加超新星框和 AI 标签；成员/Agent 侧栏无缩进；Messages 去除卡片外框并贴合 tab/视口；composer 去除内层边框并使用实心上箭头。Settings 首层收敛为当前 User/Organization、My Agents 数量、Skill 安装和默认折叠 Updates。新增结构回归测试，GUI 19 tests 与 production build 通过。2026-10-02 已将 GUI `0.1.53-dev` 作为 promotion `0.1.88-dev` 发布到 R2；公网回读 707,088 bytes、SHA-256 `ccc057206ac68afc741b0ea3e2fb1037577b5d3eee125da3acf5db9a8c7feecf`，stable 清单签名验证通过。Electron 保持 `0.1.19-dev`；未代替用户触发安装，真实 App 更新与视觉验收仍待完成。 |
| V-MESSAGES-UX-05 | **制品已发布，待用户更新与真人视觉验收** | 原生标题栏能否承载稳定 Loading/typing 状态，且成员 mention 与 IM 键盘习惯是否正确 | macOS Shell 使用 `hiddenInset`，GUI 常驻 36px drag slot，不再临时覆盖内容。Agent activity 只投影 Server `running` 状态；连续 WS invalidation 在 fetch 期间会排定下一轮权威对账。composer 支持 Agent/Channel member 两类不可编辑 mention；member identity 保留在 rich content 且不进入 Agent routing。Enter 发送、Shift+Enter 换行，placeholder 给出指引。GUI 21 tests/build、Shell check/build 通过。stable `0.1.90-dev` 已发布 GUI `0.1.54-dev`（707,494 bytes，SHA-256 `a9b7e466…1d64`）与 macOS Shell `0.1.20-dev`（111,195,212 bytes，SHA-256 `56bbe867…2947`），两者均经 R2 公开域名完整回读；Windows Shell 保持原版本。待用户自行点击更新并验收真实标题栏、typing 与输入交互。 |
| V-RELEASE-06 | **修复制品已发布；待安装态重试** | 慢速网络下载 111 MB Electron Shell 时，更新是否会被固定总时长误杀 | 用户安装态在 180,078 ms 下载 16,287,562/111,195,212 bytes 后被 curl code 28 中止，证明连接仍有吞吐但旧 `--max-time 180` 不适合大制品。Skill `0.1.41-dev` 删除 artifact 总时限，增加 `--continue-at -`、5 次 transport retry，以及 60 秒/1 KiB/s 低速失活判断；manifest/signature 仍有 30 秒总时限。19 项 Skill tests 通过；stable `0.1.91-dev` 已发布并经公开域名完整回读（37,474 bytes，SHA-256 `e693623f…a5685`），待用户再次点击更新后登记安装结果。 |
| V-RELEASE-07 | **macOS 安装态通过** | 长更新是否有可见进度且不污染全局 Loading | 更新 POST 改为 feature-owned activity，不进入全局 request counter；Skill 原子输出 artifact/bytes/total/speed/ETA，Core 提供只读进度 API，Updates 折叠时仍保留更新按钮和进度。反复 `Failed to fetch` 的根因不是 R2 下载，而是旧 Core 在 `/v1/system/update` 应答尚未送达时定时退出；promotion `0.1.95-dev` 将安装确认与重启拆为 `/update` + `/restart`。Core `0.1.65-dev`（5,400,053 bytes，SHA-256 `66b408e5…d5fb`）和 GUI `0.1.56-dev`（708,355 bytes，SHA-256 `ef561eab…a528`）已经 R2 完整回读，Electron/Skill 保持 `0.1.20-dev`/`0.1.42-dev`。真实 macOS 安装态验收：正式 setup 将小制品激活到 `0.1.95-dev`，launchd Core PID `57448` 通过新端点收到 HTTP 202 后更换为 `66897`；同一 Local Core HTTP 更新入口完成 Shell `0.1.20-dev` 安装，最终 installation API 报告 Core `0.1.65-dev`、GUI `0.1.56-dev`、Skill `0.1.42-dev`、Shell `0.1.20-dev`，无剩余 update。 |
| V-RELEASE-08 | **macOS 断点续传与旧版升级通过** | 网络/进程中断后是否保留进度并自主恢复 | promotion `0.1.96-dev` 发布 Core `0.1.66-dev`、GUI `0.1.57-dev`、Skill `0.1.43-dev`，Electron 保持 `0.1.20-dev`。真实已安装 `0.1.95-dev` 不使用源码 setup，通过其 Local Core 认证 HTTP update/restart 完成自升级：HTTP 202，PID `72373` 更换为 `95659`，三个当前链接均指向新版。[Range 中断黑盒](../.trial/V-RELEASE-DOWNLOAD-01/README.md) 使已安装 downloader 首进程失败并保留 65,536 bytes，第二进程续传至 8,388,608 bytes，最终 size/SHA-256 精确匹配且 progress 为 `completed`。Skill 22 tests、GUI 22 tests/build、Core 16 tests 通过；R2 公网回读完成。 |
| V-RELEASE-09 | **待用户点击验收** | 真实 111 MB Electron 制品是否在 GUI 中显示进度/速度并完成安装 | promotion `0.1.97-dev` 仅推进 Electron `0.1.21-dev`；Electron 源码与 `0.1.20-dev` 一致，Core `0.1.66-dev`、GUI `0.1.57-dev`、Skill `0.1.43-dev` 均保持不变。macOS ZIP 111,195,215 bytes，SHA-256 `00a5e35e…d84`，已经 R2 公开域名完整回读。安装态 refresh 精确报告 Shell `0.1.20-dev → 0.1.21-dev` 可更新，其余三个制品 `updateAvailable=false`；未代替用户点击更新。 |
| V-AGENT-STATE-RACE-01 | **通过** | 快速执行状态是否会覆盖创建响应；mention 是否只能位于开头 | Conversation 不再读取或渲染 Agent Request 状态，因此不存在 `queued` 响应覆盖 `running` 的界面竞态。Tiptap mention 是不可编辑原子节点，完整可见文本与 UUID rich node 一并提交；自动测试覆盖句中 mention、两个 Agent 与重复 mention 去重。GUI `0.1.47-dev` 安装后，实机输入 `Please @Run` 出现候选并插入同一行胶囊；时间线无 Queued/Working/Completed 卡片，Reply 引用条可出现并取消。 |
| V-AGENT-ACTIVITY-01 | **通过** | 用户能否看见 Agent 确实已收到任务且仍在处理，同时不把内部状态塞进消息流 | Server 将 claim 与客户端 acceptance 分开：`accepted_at` 只在 protocol-2 Local Core 对精确 request ACK 后持久化，未 ACK 的 claim 对 GUI 映射为 `delivering`；GUI 只把 accepted/running target 投影为消息区域顶部的 `is working…`，终态自动消失。request invalidation、heartbeat、open、focus、visibility 共用权威状态对账。安装态 request `c47b335d…` 在 provider queue 精确 ACK 后显示为 durable `running`，Codex 原 thread 完成后转为 `succeeded`；自动测试覆盖 activity 过滤/去重。 |
| V-AGENT-REPLY-ADDRESS-01 | **通过** | Agent 回复是否自动指向请求人和原请求，且不授予 Agent 任意 mention 权限 | `report_agent_request` 只接收 request ID/正文/nonce；Server 从权威 request 反查 requester 与 trigger message，在事务内生成 member mention rich node、完整 plain body 和 reply link。真实 request `c47b335d…` 的工具只提交 `writer fallback passed`，Server 生成 Channel seq 55：body 为 `@Zhiyuan Yu writer fallback passed`，member mention ID 为 `4df84d8f…`，`replyToMessageId` 精确指向触发 seq 54。GUI 对当前用户 mention 使用深蓝胶囊并显示引用预览，相关渲染测试通过。 |
| V-CHAT-SLICE-01 | **Channel + Codex runtime 纵向闭环通过** | Channel Messages、成员侧栏、Agent blueprint 与本机 Codex 是否形成 GUI/Skill/Local Core/Server 纵向闭环 | stable `0.1.72-dev` 已公开验证 Core `0.1.52-dev`（macOS + Windows）、GUI `0.1.42-dev`、Skill `0.1.39-dev`，Electron 仍为独立且未变的 `0.1.19-dev`；Server `0.1.72-dev` 公网 readiness 通过。双账号消息/权限/WebSocket 验收仍成立；新增真实 Skill 注册 runtime、强制蓝图绑定、目标设备 durable claim、首轮 Codex thread 创建、次轮同 thread resume、request-scoped reply 与显式失败终态。已安装 Skill 实测缺少 `--runtime` 返回 exit 2；runtime 清单返回 `kwaideMacBook-Pro.local · Codex`、稳定 runtime UUID 和最新 Skill `0.1.39-dev`。 |
| V-RELEASE-05 | **通过** | 更新检查网络失败是否仍会破坏界面，首次 Channel 请求失败是否被误报为空数据 | setup 已移除 macOS `urllib`，统一使用 `curl --noproxy '*'`、retry/timeout、落盘流式 hash；Local Core 和 GUI 将错误限制为 500 字符摘要。GUI 把 initial loading、loaded-empty、load-failed 分开，失败显示 Retry 而非 Create first Channel。Skill 18 tests、GUI 6 tests/build、Local Core 16 tests均通过。release `0.1.73-dev` 已完成 R2 公网完整回读并真实安装；已安装 API/GUI 显示三个 Channel，Settings 实际点击返回 `All Colab resources are up to date`，四项独立版本完全匹配且无 traceback。 |

## 3. 接下来的执行顺序

1. **真人视觉验收**：Files 全窗树/内容预览，以及文本、图片、PDF、DOCX、XLSX 与不支持格式降级；实现和发布链路已经通过，不替用户标记视觉结论。
2. **Quick Share 剩余黑盒**：干净未安装起点 bootstrap、自然到期/超额/GC；主体能力与发布已通过。
3. **外部条件项**：邮件任意公网收件人送达等待 VPS 出站 25/rDNS；Windows 干净账户实机等待设备；微信登录等待开放平台材料。
4. **后续加固**：健康检查与故障注入；Supabase 仅在路线恢复时运行同一契约套件，不进入当前 standalone 主线。
5. **Messages 后续**：Codex runtime 主路径已经通过；下一步只补 owner approval、进程硬崩 lease 重领，以及经用户确认后的独立 DM/group，不再重做已完成的 runtime/thread binding。

## 4. 当前确定原则

- 不触碰用户开发仓库的 Git 状态；
- 服务端只登记当前 Shared Item，不提供产品级版本管理；
- Session 原始数据是事实来源，结构化内容只是可重建投影；
- GUI 和 Agent 使用独立 Rust Local Core 的同一套能力；GUI 是可选客户端，不参与后台任务生命周期；
- Files 与 Skill 消费前物化到本地，使用本机原生工具；
- 当前只实现独立 Rust + PostgreSQL Server；Supabase 资产冻结，未来恢复时实现同一 Colab Server 领域协议。

## 5. Trial 执行模板

每个验证在 `.trial/<id>-<name>/` 中记录：

1. 对应假设 ID；
2. 测试环境与数据规模；
3. 可重复运行的原型或脚本；
4. 预先定义的通过/失败标准；
5. 实测结果；
6. 对设计的影响与最终决策。
# Canvas mention and header validation (2026-10-03)

- [x] F-CANVAS-03 最终修复：7 个生产 codec 回归、19 个 Local API 回归通过。用原文 237 个真实 updates，在打包 Node/helper 上做只读回放及追加；保留 hardBreak、两处 mention identity，产生 145-byte 增量。首版拒绝的段尾空格+hardBreak 已用显式 `<br>` 修复。最终 Core `0.1.76-dev`、stable `0.1.118-dev` 完成公网全量校验：43,671,073 bytes，SHA-256 `67db8b740a36772fe067099837787fcd0567aede2e572b542dec12e0cc3bb0a5`。
- [ ] 正式安装态回归：旧安装 Core 的正常更新下载已启动，网络速度约 10–50 KiB/s；验收调用在 600s 等待超时，但 progress 仍在增长，不能标成安装成功或下载失败。未直接复制任何源码构建产物进安装目录。`installed_verify.py` 提供安装完成后的实际 API 创建/patch/同步回读验收。

- [x] 2026-10-04 F-CANVAS-03 实现后体内：生产 `canvas-codec` 6 项回归通过；Rust/Yrs→Node helper→Yjs delta→Yrs 回放桥接测试通过（重复回放幂等、失败不修改原文）；此前 Local API 18 项回归通过。Core `0.1.75-dev` 经 canonical publisher 公网全量核验：43,671,042 bytes，SHA-256 `a80dde3db5aa6c87c813336e861b669118ae5d3b60c2c36bb09ee96e0f304b07`，stable promotion `0.1.117-dev`。GUI/Shell/Skill 不变。安装态正式更新和实际 API patch 回读尚在验收，不将已发布等同于已安装。

- [x] 2026-10-04 F-CANVAS-03 选型假设审计（实现前、体外）：真实 StarterKit/Mention schema 的 14 个往返 fixture 中 9 个 exact-tree 通过、5 个失败；明确记录空段落、标题硬换行、mark 边缘空格、strike 和 link 附加属性损失。strike 的扩展修复、身份完整 mention 链接、保持 mention identity 的段落追加与独立段落并发更新均单独通过。结果见 [.trial/F-CANVAS-03](../.trial/F-CANVAS-03-markdown-roundtrip/README.md)。不能据此声称完整 Markdown patch 适配层、真实 query 组件或安装态无损验收完成。

- [x] Desktop GUI TypeScript build accepts collaborative Mention nodes, member/Agent lookup, identity cards, inline header rename, and real dispatch.
- [x] Local Core workspace compiles with the Canvas Agent dispatch proxy.
- [x] Server workspace compiles with Canvas dispatch creation and runtime wake-up.
- [x] Installed macOS artifact: Agent mention renders as an atomic capsule; its identity card identifies `Runtime Validation Agent` as Jeffrey Yu's Agent and exposes the real dispatch action. Two dispatched requests (`4968a3a1…`, `78fa6f16…`) each reached durable `succeeded` in one attempt and reused visible Codex thread `01a0f715…`; `read_thread` showed the actual requester, Heading section, and ordered optional Canvas tools. The final installed `colab-canvas read` returned `syncState=synced` and the mention projection. The test text contained no actionable edit request, so this row deliberately does not claim an Agent content edit.
- [x] Installed macOS artifact: double-clicking the same document title in the header and sidebar enters selected inline editing on both surfaces; both call the same rename use case. The header has no lower divider and renders `Synced` immediately beside the title.
- [x] Failure-path regression: the first real dispatch exposed the pre-migration `agent_requests.kind` constraint and the first provider read exposed the wrong Yjs fragment name. Migration `0026_canvas_agent_requests.sql` and Core `0.1.72-dev` corrected them; a fresh installed CLI read proves the packaged Core uses Tiptap Collaboration's `default` shared type.
- [x] GUI `0.1.70-dev` activity regression: Messages now consumes the previously orphaned `activeAgentNames` projection. Server `0.1.111-dev` persists `source_canvas_id` for every Canvas request and migration 27 backfills unambiguous historical title matches; Canvas reconciles the matching request against `/agent-requests` on realtime invalidation, reconnect and a five-second fallback interval. The production build and all 28 GUI tests pass. Server records prove the user-observed Canvas request `fb181e53…` and Message request `aae2b3fc…` both reached `succeeded`; the prior absence was a presentation-chain defect rather than an undelivered command.
- [x] Installed Canvas editor visual acceptance: after formal update and app reload, the old Canvas request is recovered from Server and visibly renders `Runtime Validation Agent completed` in the Channel status area plus `Completed` beside `Synced`. Accessibility state exposes Text style, Bold, Italic, Bullet list, Numbered list, Quote and Code block controls; screenshot confirms centered editor content with symmetric page gutters. Stable `0.1.111-dev` public readback verified GUI `0.1.70-dev` at 748,673 bytes, SHA-256 `d51ae059…64050`.
- [x] Canvas command/card correction: Server `0.1.112-dev` returns stable `targetBlueprintId`; GUI filters active commands by document+Agent, excludes terminal states, and keeps the send action reusable. All 28 GUI tests, production build, and Server compile pass. Stable `0.1.114-dev` publicly verified GUI `0.1.73-dev` (748,824 bytes, SHA-256 `28c03634…4940d0`) and was installed through the formal updater without changing Electron/Core/Skill. Installed macOS UI shows only `Synced` in the header, no stale completed state, an unchanged `Send to Agent Runtime Validation Agent` action in the Agent card, and the paragraph hover/click handle opens Text, Heading 1–3, Bulleted list, Numbered list, Quote, and Code commands.

- [x] V-AGENT-WORK-DETAILS-01: Local Core workspace tests (20), Server workspace tests (6), GUI tests (28), and production GUI build pass. Verified task identity is derived from queue order plus `turn/started`, not prompt matching; task events close with `turn/completed`; diagnostics upload is best-effort; Drawer is task-scoped and collapses tool records. Installed-macOS validation first exposed a missing Local Core read proxy as a real Drawer HTTP 404; Core `0.1.74-dev` added that route and was installed through the formal updater. The installed GUI then displayed `Working` during a real Canvas dispatch and `Work details` after completion; the task-scoped Drawer loaded persisted `turn/started`, Agent output, retry diagnostics, command execution and tool events, with tool records collapsed by default. The same installed build no longer shows the auxiliary request-list `Error: {\"error\":\"\"}`, and an actual H1 renders visibly larger/bolder than body text. Stable release `0.1.116-dev` publicly verified GUI `0.1.74-dev` (766,873 bytes, SHA-256 `529fedaa7f9fa68f7e88523c1ce5dc138e5f66e2657f5ee4c77fc865fa85f6a4`) and Core `0.1.74-dev` (5,808,428 bytes, SHA-256 `78f8f048b97e9475127854e7da3c2c18a3dcc61a60613b1a5671ec1d03d4f652`). Electron and Skill did not advance.

## Canvas codec 与更新状态：安装后验收（2026-10-04）

- [x] V-WORK-CONVERSATION-01 (development-after implementation): 41 GUI tests pass, including real shadcn HoverCard pointer capsule→card→outside and capsule→outside, focus/Escape, and Drawer conversation/collapsed-output interaction. Installed request `5ce3d4bc…` replay: 136 raw events become one instruction, two Agent responses, three tool calls in forward order; final text confirms the actual Canvas edit. This row proves projection and component behavior, not a new runtime dispatch or live streaming.

- [x] Core 20 tests、GUI 34 tests、生产构建通过。Stable `0.1.120-dev` 经 R2 正式发布/公开 hash readback；实际更新安装 Core `0.1.77-dev` 与 GUI `0.1.75-dev`，managed PID 从 44427 变为 49521。Skill `0.1.45-dev`、Electron `0.1.21-dev` 未变；没有绕过发布链路复制源码构建产物。
- [x] 安装后普通 patch 验证：Canvas `3a53608c-8f5a-43a3-8611-157b237b48f4`，序号 1→2、synced、追加文字存在，原文/胶囊保留。
- [x] 真实 Canvas→Agent Runtime：request `5ce3d4bc-3e35-4990-80b2-56b270678774`，Canvas `41ae519e-4a1f-4d2e-94b6-40c851870aec`。Agent 自行执行已安装 Skill 的 read→apply-patch→read，三个 exit 0；指定独立段落 `CANVAS_RUNTIME_ACCEPTANCE_795512d4` 存在，两个 mention identity 均保留，Server seq 1→2、synced、request succeeded。验收脚本只创建初始测试文档和派活，不代替 Agent 编辑结果。
- [x] 正式安装 GUI：验收文档 H1 显著大于正文；新增段落与两个胶囊可见；Agent 卡片显示 Work details，任务 scoped Drawer 加载 136 个真实事件、工具记录默认折叠。此次约 160s 包含上游 WebSocket 超时重试和 HTTPS fallback，不是 codec 失败。当前过程事件在 turn 结束后上传，不计作实时 streaming 验收。
- [x] Mac Python flock→已安装 Rust status 的跨语言验证：锁持有时 running=true、state=installing；重复 POST update 返回 alreadyRunning=true 而非失败；释放后 running=false。真实安装 GUI 在折叠 Updates 区自动显示 disabled Updating 与进度。该状态测试是明确的 OS-lock fixture，不是伪造下载成功。

## Engineering tracing 验证（2026-10-04，独立记录）

- [x] V-TRACE-CLOUD-01：Management auth/environment read HTTP 200；官方 MCP workspace context 返回 test/3 datasets；真实安装树 CLI + 两个独立生产 middleware fixture 的 trace `589a7e61…` 查回 5 spans、单根、正确 parent 链、CLI JSON/exit 0。范围为隔离边界 fixture，未连接生产业务 DB，未部署。
- [x] V-TRACE-CLOCK-UNIT-01：Rust 四时间戳测试包含 5s offset 与 20/80ms 不对称路径，真实 offset 位于估计区间；拒绝回拨/负 RTT/NaN 样本。仅算法测试，不标记系统休眠或实机跨端故障注入通过。
- [x] V-TRACE-INGEST-01：Rust protobuf schema 解码，invalid IDs 拒绝，credential 属性过滤；原生 relay 的 body/数量限制已经实现。
- [x] 原有回归：Local workspace 20 tests，Server workspace 6 tests，Skill 24 tests；GUI 31 tests（包含 3 个 tracing 测试）与 TypeScript/production build 已通过。Core、GUI、Skill 的独立本地制品构建通过；未发布。
- [ ] 真实产品 GUI message 的 root/render return 与真实 CLI reader；Agent durable command/ACK/receipt/reply；Canvas durable mutation/retry/repair；匿名上报；时钟跳变/休眠/重启；Collector/配额与生产启用。

第一轮试验查回 missing root，暴露短命令同步等待云端转发超时；第二轮异步 intake 后五 span 完整。不得把 Local intake accepted 计作 Honeycomb delivered。

- [x] V-TRACE-PACKAGED-01：从新构建 Skill zip 提取 bundled SDK，真实命令 exit 0；官方 Honeycomb MCP 查回 `d381a986088c3fa819e80d6c97fff121` 的 5 spans，单根与四层 parent 链完整。Server 最终 workspace check 与 diff whitespace check 通过。仍为隔离 fixture，不是生产产品验收。

- [x] V-TRACE-LIVE-CLIENT-01：临时只读预览代理读取现有安装 Core 的真实业务数据；GUI 加载并切换 Files/Sessions/Skills，Skill 查询 Channel 列表/内容/成员。官方 MCP 在最近 10 分钟查回 GUI 14 spans、Skill 11 spans。只证明终端采集，现有 Core/Server 未部署 tracing，不能计作内部链路覆盖。实机预览发现并修复 MessagesView effect 中误插入的重复 Hook；修复后真实页面加载、GUI 31 tests 与 production build 通过。

- [x] 双 provider 配置：Honeycomb 私有 env 生成成功；Grafana Basic auth 编码与 `/otlp/v1/traces` endpoint 组合验证通过。未计作 Grafana 云端连接成功。

- [x] V-TRACE-GRAFANA-01：OTLP HTTP 200，Tempo read HTTP 200，UI 按 ID `a67de55fcf4f30f0fe4b7e1325ddb0f9` 显示 3 services/5 spans；真实只读预览查回 GUI 9 traces、Skill 4 traces。Cloud policy 已包含 traces:read/write，查询工具可使用私有凭据读取，不依赖浏览器登录。完整五 span 为隔离 fixture，真实产品 Core/Server tracing 未部署。

### Tracing production rollout — 2026-10-04

- [x] Server 0.1.121-dev 激活于 `/opt/agent-colab/releases/0.1.121-dev`，systemd active，公网 readiness 为 ok；远端与本地 Linux binary SHA-256 一致（4aef58016e76b6574d5017bddfb5227ce48d510ce20805ff3fc5c79e9c4f49e6）。私有 Grafana exporter env 已由独立 systemd drop-in 加载。
- [x] R2 signed stable channel 0.1.122-dev 发布并执行全部新增制品公网 size/SHA-256 readback。本机正式 updater 成功安装 Core 0.1.78-dev、GUI 0.1.76-dev、Skill 0.1.46-dev；Electron 与 Windows Core 保留原版本。修复 publisher 平台筛选遗漏通用 GUI/Skill 制品的问题。
- [x] V-TRACE-PRODUCTION-SKILL-01：`observability/tests/validate-production.py` 使用已安装 Skill 查询真实生产 Channel，exit 0、4 channels；Tempo 查回 `46636876e384c1999a3e4be29acc1b23`，7 spans，Skill → Core → Server 父子链完整。
- [x] V-TRACE-PRODUCTION-GUI-01：已安装 GUI 实际加载并点击 Files/Sessions，页面返回真实文件与会话。Tempo 查回 `0a9d6f4ebba91daff2d87a4129c3354a`，4 spans，GUI 0.1.76-dev → Core 0.1.78-dev → Server 0.1.121-dev。该 span 是 transport_only，不代表页面全部业务完成或 Agent 回复闭环。
- [x] 实机跨端校准：VPS NTPSynchronized=yes；Core reference=server-estimated，偏移约67 ms、不确定度134–139 ms；GUI/Skill trace quality=estimated，保留各自累积 uncertainty。单端 duration 使用单调时钟。没有执行人工时钟跳变、休眠、漂移注入，不能声称消除所有误差或支持毫秒级跨端排序。
- [x] 回归：GUI 34 tests 与 production build、Skill 24 tests、Rust Core/Server workspace tests/check、Linux release build 均通过；部署脚本 bash syntax 与 git diff whitespace check 通过。
- [ ] 全部业务入口/页面结果配对、Agent durable command/ACK/receipt/reply、Canvas outbox/retry/repair、匿名上报、时钟故障注入与生产限流仍待完成。
### Work details and identity hover installed acceptance — 2026-10-04

- [x] GUI 0.1.77-dev published through canonical R2 publisher, exact public size/hash verified; signed promotion 0.1.123-dev installed through the normal updater. Electron remains 0.1.21-dev. GUI archive: 842208 bytes, SHA-256 `a106dc8766c2db1012b2710d3c5fbfcc8d16659c38f8738a3296cfa67afb67cb`.
- [x] Installed Colab opened Canvas `CANVAS_RUNTIME_ACCEPTANCE_795512d4`; identity card exposed real Work details. Request `5ce3d4bc-3e35-4990-80b2-56b270678774` displayed highlighted instruction, expanded intermediate/final responses, three initially collapsed tool calls. Expanding the first call exposed its read command input/output. Task-specific oldest-to-newest order is explicit; startup/lifecycle protocol noise absent.
- [x] Installed card disappeared after leaving its area. Standard HoverCard automated tests separately cover capsule-to-card pointer traversal, leaving both regions, focus and Escape. All 41 GUI tests and production build passed. This acceptance reused a completed real dispatch; it does not claim a new dispatch or live streaming.
### Agent roster task entry — 2026-10-04

- [x] V-SETTINGS-AGENTS-01: GUI 0.1.80-dev, 45 tests and production build passed; public R2 artifact size 843100 bytes, SHA-256 `dd11f6072ca1f5e990a507f07546d62d5f23786e2664804f7619b10f38be6b57`. Promotion 0.1.126-dev installed through normal update/restart. Native installed GUI verified Canvas → global Settings → My Agents displays Agents dialog with existing blueprint and editable fields. Close → Canvas → Messages leaves dialog closed (consumed intent); no blueprint mutations made.

- [x] V-AGENT-ROSTER-UNIT-01: actual shadcn Popover component test verifies Agent-only task count, two distinct commands, choosing older request, working-to-terminal animation removal, delivering is not working, Escape dismissal, live elapsed and fixed terminal duration, and unknown legacy timing. Owner entry/static header regressions included; GUI 44 tests/build passed.
- [x] Server workspace 6 tests passed after timestamp/history API extension. No live database migration or installed GUI acceptance is implied by these tests.
- [x] Server 0.1.124-dev deployed, readiness passed, migration 0029 applied. `.trial/V-AGENT-ROSTER-01/timing-trigger.sql` passed against deployed PostgreSQL in a rolled-back transaction: terminal timestamp recorded once, repeated receipt unchanged, running not prematurely finished, failure recorded.
- [x] GUI 0.1.79-dev public artifact verified (843023 bytes, SHA-256 `e99f6393d744ca491184398d078e16bca2f476aba6268f931cbcf48d417ab302`), signed promotion 0.1.125-dev installed through authenticated update/restart. Installed Messages has no latest-task header, roster displays 6/27 tasks, owner management unchanged. Shared card shows owner once, summary/start/duration and explicitly unknown legacy timing. Choosing Task 24 opens request `5ce3d4bc-3e35-4990-80b2-56b270678774`, not latest Task 27; instruction/response and three collapsed tools are correct. This acceptance reuses a real completed task; running animation transitions are covered by component tests, not a new live dispatch.

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

### Information-association acceptance — 2026-10-04

- [x] @ 候选修复在主检出目录通过 TypeScript、3 个相关测试文件/6 个测试和 GUI 生产构建。GUI `0.1.87-dev` 从提交 `e2fb81e` 构建，正式 R2 制品经公开回读 SHA-256 `bf682f9c074289f7bc4013097c3c76d52e5e0cdc64e2cbb2347d3964edd4e941` 校验，通道 `0.1.139-dev` 已本机安装。真实 Colab Canvas 空白文档中输入 `@`：候选框在光标右下、资源/用户不再显示类型/邮箱、限定高度内可滚动到末尾；测试输入已撤销，文档恢复空白。

- [x] UI regression verifies no Files/Sessions/Canvas/Messages fetch on Channel entry, resource fetch only after opening choices, and no Message history fetch for the Messages chooser. TypeScript check and complete Vitest suite passed.
- [x] Server prompt tests (6/6) passed, including context identity and deduplicated reading instructions. A real Canvas dispatch returned a prompt with read, patch and optional exploration commands; request `ea96b9f3-46d2-48bc-b81e-0e74444405c5` reached the local Agent Runtime and succeeded. Independent Canvas readback confirmed `CANVAS_HANDOFF_OK_20261004` was appended and both existing mentions survived.

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

### 2026-10-05 Git 追踪与 tracing 配置边界

源码、独立制品版本、数据库迁移、tracing 注册/适配器、可复现 `.trial` 脚本和锁文件纳入 Git；扫描清单、运行结果、验收 JSON/截图保留本机并忽略。`observability/boundary-inventory.json` 从 Git 索引移除，磁盘文件保留。私有 `observability/providers.json` 及凭据文件忽略，仓库只含占位 provider 示例；未配置 OTLP 目的地时不得默认发往维护者平台。`AGENTS.md` 记录独立 `trace` Skill 的公开制品入口。

本次验证：`trace check` 通过，四个单元注册表共 131 个操作；`skills/colab/tests/test_tracing_registry.py` 3/3 通过；`git diff --cached --check` 通过；已确认验收快照与 `.trial` 生成输出命中 Git ignore。此处不声称重新执行所有已提交业务功能的端到端验收。


### 2026-10-05 Trace 源码定位精度修复

按 TypeScript AST 核对 92 个 GUI 入口的真实 runOperation/beginOperation 调用归属，注册表明确 source.path、source.object（组件）、source.function（函数或所属事件回调）。main.tsx 内 App 的不同闭包保留实际文件归属，修正 QuickShareControl、CanvasEditor/LoadedCanvasEditor 等此前笼统或不准确的归属。目录左侧及详情顶部显示文件 → 组件 → 函数，agent source 接口返回相同元数据。

验证：92 个入口均找到真实调用；Trace 工具测试 10/10 通过，本机 Skill 更新并重启目录服务。实际浏览器点击 files.withdraw 显示 desktop/ui/src/main.tsx → App → withdrawFiles，source 命令返回相同 object/function。修改未重新发布 Desktop GUI 制品，历史 span 不会被回写。

### 2026-10-05 安装入口与上下文胶囊

最终补充验收：在已安装 Shell `0.1.22-dev` 的 GUI 中点击切到 Jeffrey，Local Core `/v1/auth/status` 同步为 Jeffrey，再通过 GUI 切回 Zhiyuan。两个实发验收请求均为 succeeded。GitHub DMG 完整公开字节范围下载共 110,808,449 bytes，SHA-256 为 `7518210857382f8318e0dfbc507e60ad71958e52b8ee660a7987b166458f9681`，与发布制品一致；GitHub 初始重定向元数据经代理获取，实际制品分段读回使用仓库 curl verifier、绕过代理。公开 bootstrap 完整读回 SHA-256 为 `70353a70ae873185fc2fcdc2ad3c2ddb969196e6279c1f5b23b115016b39335c`。

已通过 `pnpm --dir desktop/ui check`、`pnpm --dir desktop/shell check`、`pnpm --dir desktop/shell test`（模拟干净安装后的首启检查和二次启动复用）及 `bash -n packaging/colab-install`。Electron DMG 构建与 App 签名核验通过，已确认 bootstrap 位于 App Resources。官方 bootstrap 已实际安装本机 Core/UI/Skill；Shell 更新后 `/Applications/Colab.app` 为 `0.1.22-dev`。真实 GUI 验证长 Session 胶囊单行截断、点击卡片保留完整名称和详情入口。未声称在另一台干净 macOS 设备完成拖入 DMG 后的全流程安装。

服务端依据 Runtime WebSocket presence 决定 offline 提示；发现切号缺少主动注册/连接确认，以及 token 刷新可以覆盖前台账号的竞态，已修复并通过针对性竞态测试。额外确认助手错误绑定到测试设备 Runtime `5a7970e5-3f17-478d-ab53-1f747d1458da`，恢复本机 `aaa434e0-d264-48b0-a132-83d21664f54e`，保留原调用权限。安装后依次切换 Zhiyuan、Jeffrey，分别从 demo、1st channel @ 各自 Agent，成功收到 `ACCOUNT_RUNTIME_OK_0d37efdc`、`ACCOUNT_RUNTIME_OK_0dc19b83`；Jeffrey 请求 `7407bf82-cf73-4445-aefd-76195d80a074` 状态为 succeeded，结束后恢复原前台账号。R2 所有推广制品完整大小/SHA-256 读回通过；GitHub bootstrap 读回哈希通过，GitHub Release 制品 digest 与本机构建一致。


### 2026-10-05 Standard Trace page locator migration

Trace now owns a framework-independent page locator module and `locator-install` command. Agent Colab installed it into observability/page-locator with a version/hash receipt; the former gui-locator/browser.js highlighter was deleted. The project bootstrap imports the standard module, while the proxy retains authentication, HTTP/WebSocket transport and original live registry access. Repository project.previewUrl declares the diagnostic GUI. Normal GUI resources do not load this diagnostic module.

Verified: Trace 12/12 tests and Colab locator 6/6 tests pass, including an unrelated checkout entry using only the standard marker, untrusted origin/non-parent rejection, missing-resource fallback and navigation without executing business actions. Actual formal catalog clicks locate channels.list, messages.send and system.update; messages.send has computed animation trace-breathe. files.withdraw with no shared file reports the owning region and ok:false instead of claiming the control was located. Served runtime SHA-256 matches the command-installed module. This does not claim every project-specific route or MCP host renderer has been validated.

发行版复验：Trace v0.3.0 从 GitHub Release 校验并升级后，用已安装 Skill 的 locator-install 再安装 Colab 模块，receipt.version=0.3.0。移除目录 LaunchAgent 的 TRACE_LOCATOR_URL/TRACE_LOCATOR_EMBED_URL，正式目录从项目注册表 project.previewUrl 获得嵌入地址；再次点击 messages.send 产生 trace-breathe 动画。
# 2026-10-05 Ask me first policy correction

- Passed: `cargo test -p colab-server-persistence invocation_policy_tests --lib` (1 test). Both refusal policies reject non-owner requests; owner and Process requests remain executable.
- Passed: prompt assembly test preserves full query and reply chain. Installed-Core cross-account E2E `.trial/E2E-ACCOUNT-RUNTIME-01/ask_owner.py` rejected the non-owner request, generated the owner instruction invitation, and completed a distinct owner request with reply `ASK_OWNER_NEW_67e3af60`; the refused request stayed rejected. Original foreground account restored.
- Production migration verified: historical request `8532ae8b-0ac2-4558-9770-c456a613539c` is now rejected. No old request was replayed or retargeted.
# 2026-10-05 macOS title-bar regression

- Passed GUI `npm run check`; R2 full readback verified GUI SHA-256 `87c879cf04ea306d9778a9c21429ada12b0e012effbe359f189cde661761451f` (868886 bytes). Installed GUI 0.1.89-dev on Electron 0.1.22-dev, refreshed the native app and inspected screenshot: dedicated title row is above the rail, first Channel avatar no longer occupies the native-control region. Exercised native title-bar drag gesture. Browser/Windows exclusion remains explicit in the host/platform render guard.

### 2026-10-06 Regression trial acceptance

Run `20261006T003636Z-81eaa31e` captured a GUI readiness failure plus successful Skill case. Subsequent run at `20261006T003837Z` passed GUI Channel rail/Messages assertions and Skill Channel discovery/JSON/exit assertions in 4.83 s; runner-boundary timing limits passed. Negative fixture `20261006T004238Z-db443bf0` failed deliberately and remains rotten/excluded by default. Browser GUI at http://127.0.0.1:53482/ verified three destinations, authored description drawer, actual script read-only view, run sidebar/detail, and problems filter. Original performance page's real preview/highlight remains functional via separate 53483 diagnostic adapter. Automatic regression-to-cloud-trace association and provider/per-span performance assertions are not yet accepted.

### 2026-10-06 Regression formal directory integration

Project-owned registry, GUI/Skill cases and ignored history moved from `.trial/regression_test` into `regression_test/`. Five historical records retain their timestamps/outcomes; relocated source/evidence references now use the formal paths. Generic execution, parsing and persistence stay in the independent Trace repository. Formal workspace at http://127.0.0.1:53481/ shares React/shadcn navigation, metadata badges and syntax-highlighted script drawers. Preview uses the existing 53480 adapter; no Colab production GUI/Core/Server behavior or artifacts changed.

Verified formal browser: messages.send has trace-breathe animation, provider Grafana link carries the exact operation/origin, cases share their real project source, copy-path succeeds, historical 4.83-second run still shows two passed cases and its relocated screenshot. Trace typecheck/build and twenty tests passed. The latest historical 401 failure remains a failure; no fresh business E2E pass is claimed. Automatic provider trace correlation is still pending.

Formal runtime acceptance: run `20261006T025324Z-5d33dbe0` passed GUI and Skill (two passed, one inactive fixture excluded), total 9.19 seconds. Prior run `20261006T025229Z-cd78ee22` remains recorded: GUI readiness matched six tabs and failed strict resolution, Skill passed. Fixed project readySelector to the unique Messages tab; do not weaken runner strictness or discard the prior failure. Desktop and narrow viewport interfaces verified; package dry run has no .trial/.runtime/.runs/node_modules payload.

### 2026-10-06 Device-account onboarding sample

- Passed actual isolated two-Core → Server → PostgreSQL `.trial/E2E-DEVICE-ONBOARDING-01/verify.py`:
  bootstrap idempotence, separate device accounts, one personal Channel, ordinary-member invite,
  idempotent join, unauthorized create/revoke, revoked token rejection, no automatic Session upload,
  last-credential protection, wrong-account rejection, multiple-binding choice, selected foreground
  account, current-device unlink clearing its session and remaining binding auto-login.
- Passed isolated persistence lifecycle test (0.08 s): replay/expiry/wrong proof, concurrent bootstrap,
  multiple device accounts, access/refresh revocation, no replacement account after revocation,
  new Google identity link versus existing identity no-merge, invitation expiry/permissions.
- Passed final GUI 28 files / 70 tests (4.72 s), production build; onboarding tests distinguish Try from
  real completion and account-scoped dismiss, recover ignored tips. Passed Skill invitation test:
  own discovery endpoint, token retained in bootstrap URL, no credential/capability in output.
- Final Skill suite: 34 tests passed (12.59 s). Repeated isolated two-Core acceptance passed;
  database fixtures are restricted to a loopback `colab_device_test` database. Last-credential
  unlink rejection has a readable UI explanation and a regression test.
- Passed tracing five tests: wrapper future remains under 4 KiB around a 128 KiB business future;
  concurrent/persisted trace contexts retain correct parent and failure results. Debug Core initially
  failed with stack overflow; corrected shared wrapper allocation, then real UI + API runs passed
  on default Tokio stack. Earlier failed attempts are not treated as successful acceptance.
- Real browser UI: Home visible; Try opens Session picker; dismiss survives reload; missing teammate
  Sessions show invitation prompt; recipient link joins then opens Session picker; cancel shows
  "No shared sessions yet"; linked device + shadcn unlink confirmation visible. No user Session was
  uploaded during this acceptance. SQLite directory 0700 / database 0600 verified.
- Pending separate release acceptance: installed Electron deep-link path, fresh installer flow,
  production artifact/server versions and live Google browser exchange. Isolated identity/persistence
  tests do not claim those external deployment/provider paths passed.

### 2026-10-06 published macOS acceptance

- Server deployed at `0.1.142-dev`; remote current symlink and readiness verified.
- Stable promotion `0.1.143-dev`: macOS Core `0.1.87-dev`, GUI `0.1.91-dev`,
  Skill `0.1.51-dev`. Canonical R2 publisher verified public bytes and SHA-256;
  unchanged artifacts retained their prior verification. Source committed before publication.
- Installed updater consumed the signed stable channel and reported matching component versions.
  Existing authenticated account migrated to device login without a replacement account.
- Two fresh isolated Core instances against deployed Server passed bootstrap/repeat/isolation,
  ordinary invitation membership, idempotence, revoke and last-credential/wrong-account protection.
- Installed native App showed Home; Try opened actual Session picker; cancellation uploaded nothing.
  `colab://join` joined an empty test Channel and opened its Session picker. Acceptance caught stale
  Home requests reopening a second picker on Channel remount; GUI patch consumes the request.
  Repeated Try/cancel/invite/remount now needs one Close only and returns to "No shared sessions yet".
- GUI 70 tests and production build passed after the fix. Fresh-machine DMG installation and live
  Google browser exchange were not performed in this run; do not treat them as verified.

### 2026-10-06 — case inventory review, not business qualification

- Catalog discovery: 81 files, 78 case-only drafts, two existing executable pilots and one rotten diagnostic fixture; zero parse diagnostics.
- Generic Trace contracts cover draft exclusion even by explicit ID, ancestor Module selection and segment-boundary matching. The full generic suite passed 24 tests; typecheck and shared GUI build passed.
- No new Agent Colab functional or performance assertions have been executed. Draft metadata and expected results remain subject to human review before script implementation.
- Formal GUI on port 53481 verified: default Active list shows 80 cases (78 case-only and two implemented); selecting the derived `context` ancestor shows all 22 child cases. Prompt-assembly case drawer and source preview expose the real USECASE/META file with no run function.

### 2026-10-06 — project initialization boundary

Initialized this existing repository through Trace project-setup; only root AGENTS.md and regression instructions/example/ignore files were added or updated. A second invocation reported no changes. The underscore-prefixed example is not a case and no business case was executed. Generic tests verify preserved user instructions/configuration, idempotency, template exclusion and preflight rejection of escaped paths or malformed managed blocks.

### Regression review catalog verification

Static discovery validates 76 cases: 74 drafts and two existing pilots, zero diagnostics. Business selection includes 69 records (two executable); release selection includes seven drafts (none executable). Historical run directories remain unchanged. Case-only descriptions have not been validated as product behavior.

### Regression environment verification

Real Channel-binding pilot run 20261006T133843Z-2db3622f passed. A missing Channel override was separately run and blocked before any assertion/script execution. Generic 27-test suite passed, including profile override consumption, recorded-resource identity, unavailable-resource blocking and credential-field rejection. These checks validate environment plumbing and read-only Channel discovery, not the unimplemented Agent command execution cases.

### Regression script checkpoint (2026-10-07)

- Catalog: 76 cases, 36 executable exports, no discovery diagnostics. The formal Trace GUI reload displays executable versus case-only status from the same source.
- Trace source: 28 tests pass and TypeScript checking passes, including stdin transport with suppressed sensitive command-output persistence.
- Production run `20261007T011547Z-5cb247b6`: message nonce retry passed; the other selected pilot was blocked by inventory timeout. Inventory now batches independent reads and still reports unavailable resources explicitly.
- Production run `20261007T012447Z-05779a5d`: actual Skill source discovery passed; other failures were retained for diagnosis.
- Production run `20261007T013028Z-264f85f9`: complete Session fixture output inclusion/truncation passed. Pagination failed because the current reader rejects the previous snapshot cursor after source growth, contrary to the pinned-pagination contract in agent-interface.md.
- Real Codex requests reached `succeeded` and produced request-linked `REGRESSION_OK` replies. The initial helper incorrectly expected `completed`; it was corrected. Full feedback run `20261007T012235Z-049a5fdd` subsequently failed on a Local Core HTTP 502 while probing the reply endpoint; a later direct request-scoped probe succeeded. The failed record remains non-green.
- Owned Files fixture registration returned an active share, but no published root exists and materialization reports `No file snapshot has been published`. Do not claim Files producer/consumer verification passed.
- No full-suite success or complete implementation claim. Cross-account, controlled disconnection, installer rollback and remaining scripts/variations are unverified or not yet implemented.

### 2026-10-07 — full 76-case production regression and script verification

- Static catalog: 76 cases, 76 executable exports, zero diagnostics. JavaScript and Python bridge syntax checks pass. Exports do not establish qualification by themselves.
- Completed full run `20261007T064300Z-a39585a6`: all 76 selected; 34 passed, four failed, one error, 37 blocked; 1120.72 s. Earlier full failures remain unchanged.
- Focused rechecks `20261007T070231Z-d5d9e782` and `20261007T070725Z-8fc400be`: final evidence summary across the same 76 case IDs is 39 passed, three failed, 34 blocked. No blocked runner is called executed or verified. Read .runs/20261007T064300Z-a39585a6/report.md for per-case evidence-run links.
- Real GUI/Skill/Core/production Server and real Codex requests/results were used. Canvas heading prompt assembly, thread binding, forwarding, work details and request-specific reload checks passed. Quick Share GUI fixed snapshots and actual anonymous packaged-CLI receiving passed for Files, Session and Skill. Actual five-minute expiry/revocation and provider-trace capability-redaction checks passed.
- File preview independently passed text content, actual PNG decoding, unsupported-format notice and malformed Office failure visibility. Fixtures are case-owned and withdrawn. Canvas patch passed twice after adding exact restoration, proving the corrected script can repeat. Activity verifies actual metadata/cursor pagination, GUI navigation and absence of full-content prefetch. Skill conflict preserves locally changed bytes and restores its fixture; selected-target uninstall preserves the other target and restores the initial installations.
- Fresh sandbox installation passed using SHA-256-verified immutable release archives, signed-manifest/product installer validation and booting the downloaded Core. Cold network download had previously timed out and is not qualified by the warm-cache pass. No daily installation/account/runtime was interrupted.
- Three failed cases remain: agents.configuration.remove, agents.invocation.multiple and context.sessions.reading.page. Executed-blueprint deletion returns HTTP 500/blueprint_delete_failed; sender_blueprint_id foreign-key deletion handling is a concrete investigation lead. Old Session cursors return 'belongs to an older snapshot' after source growth, contradicting pinned pagination expectations. Neither expectation was weakened to obtain green status.
- 34 blockers still require additional signed-in members/clients, isolated auth/process/network controls, malicious-materialization fixtures or controlled release manifests. Their scripts exist and were included in full selection, but business steps did not run and their correctness is not yet qualified.
- Trace staged source update: 30/30 generic tests pass, shared GUI build succeeds, installed/source worker SHA-256 match. Timeout tests verify owned subprocess termination; functional snapshots compare nested values rather than object identity.
