# 技术验证计划

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
| V-CHAT-01 | **待进入实现前验证** | 一个真实 provider session 能否由指定 Local Core runtime 按 Conversation binding 恢复，并在断线重连后恰好领取一次已授权请求 | 产品与架构决策不依赖此项；实现前用一个真实 Agent、一个 Conversation 和一次 runtime 断线验证 session 连续性、owner approval、lease 过期重领、幂等上报及 cursor 补洞。不要用 mock 对话冒充通过。 |
| V-CHAT-DESIGN-01 | **文档结构通过；真人交互评审待确认** | DM 方案是否把入口、blueprint、消息转发/引用、IM 选型、ER、模块和关键时序说清楚 | 已补独立低保真页面、结构化选型矩阵、ER/模块/时序的 Mermaid 源与静态 SVG；XML、HTML 结构检查通过。该项只证明设计制品完整，不冒充真实 Matrix 或 Agent runtime 验证。进入实现前仍需 Matrix provisioning/sync/Application Service 小型 trial 和 V-CHAT-01。 |

## 3. 接下来的执行顺序

1. **真人视觉验收**：Files 全窗树/内容预览，以及文本、图片、PDF、DOCX、XLSX 与不支持格式降级；实现和发布链路已经通过，不替用户标记视觉结论。
2. **Quick Share 剩余黑盒**：干净未安装起点 bootstrap、自然到期/超额/GC；主体能力与发布已通过。
3. **外部条件项**：邮件任意公网收件人送达等待 VPS 出站 25/rDNS；Windows 干净账户实机等待设备；微信登录等待开放平台材料。
4. **后续加固**：健康检查与故障注入；Supabase 仅在路线恢复时运行同一契约套件，不进入当前 standalone 主线。
5. **Conversation 实现门槛**：只有该 feature 获得立项后才执行 V-CHAT-01；当前不为尚未实现的聊天搭建空服务或假 UI。

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
