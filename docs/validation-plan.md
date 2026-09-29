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
| V-AUTH-03 | **主链通过，生命周期加固待补** | 独立 Rust Server 能否用 Google OIDC 完成 Desktop PKCE、Colab session 和成员身份匹配 | 两个真实 Google 账号已完成 PKCE 登录、账号保存/切换、logout 和成员身份匹配；仍需补 opaque refresh rotation、过期恢复和 replay 黑盒测试 |
| V-ORG-01 | **核心链路通过，待真人验收** | Organization 多租户主体、切换、人员目录、组织外邀请和 Channel 加入语义是否闭环 | 真实 PostgreSQL 已迁移为 Organization Member 主体，Channel membership/创建/邀请均引用 Member；真实 Local API 已验证同一账号在两个 Organization 间切换后只返回当前组织 Channel，并验证创建 Organization 自动生成 owner Member。Desktop 已接入账号设置中的列表、切换和创建；待真人完成 GUI 验收与真实邮件邀请 UX |
| V-EMAIL-01 | **受限范围通过** | Cloudflare 免费能力能否先完成真实邀请投递 | 已启用免费 Email Routing，验证 `yuzhyuan@gmail.com` destination，为 token 增加 Email Sending 权限，并通过 Cloudflare REST adapter 真实投递 Organization 邀请。Free plan 仍只能发送到预验证地址；开放任意邀请收件人需付费或替换 provider。可靠 outbox/retry 仍是业务层待实现项 |
| V-LOCAL-02 | **macOS 通过；Windows 构建通过、实机待验** | 独立 Rust `colabd` 能否在未安装或未运行 GUI 时完整服务 Agent | Skill setup 已从远端 manifest 下载/校验/安装 `colabd`，macOS 注册 LaunchAgent；Windows 使用 `%LOCALAPPDATA%\\AgentColab`、目录 junction 与用户级 Task Scheduler。Windows MSVC Core 已完成 release 交叉编译，仍需 Windows 实机验证安装、登录自启、重启恢复与文件监听。 |
| V-LOCAL-03 | **macOS 通过；Windows 实机待验** | loopback HTTP + discovery file 是否能作为唯一 Local API transport | macOS 已实测随机端口、private discovery、稳定 endpoint/bearer、鉴权和重启重发现。Windows 已实现相同协议与平台路径并通过交叉编译；NTFS 权限、任务重启及浏览器 cookie 仍须在 Windows 机器黑盒验收。 |
| V-WINDOWS-01 | **制品链路通过，实机待验** | Windows x86_64 是否能安装并独立运行 Core、GUI、Skill 与可选 Electron | release `0.1.46-dev`：`cargo-xwin` 已完成 `colabd.exe` release 构建，electron-builder 已生成 Windows x64 portable；六个跨平台制品经 R2 公网完整回读与 SHA-256 验证后提升 stable。setup 使用 platform+arch 选择 manifest、junction 激活版本、Task Scheduler 启动 Core，`colab-open` 可直接唤醒并打开浏览器；PowerShell bootstrap 与四个 `.cmd` Skill 入口已发布，Give-to-Agent 在 Windows 生成可执行的 `.cmd` 命令。macOS 从旧版安装器升级时曾发现 Electron 分支选错同名 Windows artifact，已统一改用 platform selector 并完成升级回归。待 Windows 实机验证 Google 登录、Agent Skill 安装、自动更新及 Files/Session/Skill 闭环。 |
| V-SKILL-01 | **通过** | Python 标准库 Skill client 能否覆盖首批 Agent runtime | canonical name 与安装目录统一为 `agent-colab`；Codex、Claude Code、MyFlicker 均完成真实安装/状态/卸载验收，用户修改过的安装会返回 conflict 并拒绝覆盖或删除。setup 对制品 `bin/` 中全部入口统一恢复 executable bit，不再依赖硬编码文件清单。`colab-open` 已从已安装 Skill 实测唤醒 Local Core 并打开 GUI，且 SKILL.md 明确把“打开页面”直接路由到该命令，而不是 setup 或资源查询。 |
| V-SHARED-SKILL-01 | **通过** | Shared Skill 能否完成来源发现、共享、跨账号消费、更新判断与目标 Agent 安装 | 真实 `agent-colab` Skill 根目录共享到共同 Channel；另一真实 Google 账号可读取并安装到 MyFlicker，owner 可安装到 Claude Code；非 owner 无撤回权限，owner 撤回成功。服务端保存 opaque Git revision，Local Core 使用 `root_oid` 判断更新并以 receipt 保护非托管或本地改动目录。release `0.1.42-dev` 已完成 Server 部署、R2 公网回读、安装升级与真实命令验收。 |
| V-RELEASE-03 | **通过** | 独立 artifact 版本与 Agent target 操作 | `0.1.15-dev` channel 中 Core/GUI/Skill 为 `0.1.15-dev`、Electron 为未变化的 `0.1.12-dev`；安装 receipt 与 `/v1/system/installation?refresh=true` 均返回相同的独立版本且 Electron 无虚假更新。经真实 Local API 往 MyFlicker target 执行 install → 验证 `SKILL.md` → uninstall，均成功并恢复未安装状态。 |
| V-RELEASE-04 | **通过** | Local Core 更新能否由普通浏览器恢复且不依赖 Electron | release `0.1.29-dev` 实测：受管更新响应 `restartScheduled=true, previousPid=65800`；更新后 endpoint 仍为 `localhost:53393`，原浏览器 HttpOnly cookie 无需重新 bootstrap 即可访问新 PID `85086`。GUI 只在显式更新后的最多 30 秒内每 500ms 探测 PID并 reload，另在窗口重新获得焦点时做一次 GUI 版本比较，不运行后台更新轮询；Electron `0.1.14-dev` 只在创建窗口时读取一次 discovery。旧 `0.1.27-dev` 的轮询方案与结论作废。 |
| V-FILES-GIVE-01 | **通过** | Give to Agent 能否一次取得可消费上下文并前往默认 Agent | `0.1.16-dev` 安装后运行可读引用 `Files tree validation`，响应同时包含来源根 `localPath` 与 4 项 `tree`；Python 测试验证非来源消费调用 `materialize?wait=true`。SQLite 默认 Agent 写入/读回为 `codex`，allow-list 打开接口返回 204。GUI 构建通过并使用 Dialog + ButtonGroup + DropdownMenu。 |
| V-RELEASE-01 | **alpha 主链通过，发布强化延后** | 多制品能否独立构建、分发、安装和运行 | Cloudflare R2 已成为唯一客户端制品源；当前 stable `0.1.12-dev` 的 Local Core、Desktop GUI、Skill、Electron 使用不可变版本 key，并通过公网回读校验。GUI 已分别显示 Local Core、GUI Resources、Electron Shell 的 current/latest，并按 Codex、Claude Code、MyFlicker 检测与操作 Skill；Claude Code 安装/卸载已验收。Electron Shell 已从 0.1.8 独立更新至 0.1.12，并保留旧 App 备份。Electron 仍为 ad-hoc 签名且尚无 Apple Developer ID/公证。 |
| V-FILES-01 | **双账号单机通过；产品与可靠性闭环通过** | Files 是否符合共享而非协同编辑的产品语义 | 两个真实 Google 账号在共同 Channel 完成目录与单文件分享；首次登记立即发布，2 秒静默窗口后 root 自动推进。消费方先读取旧物化缓存，再由 durable materialize job 刷新。`0.1.10-dev` 实测 12 个 watcher 事件合并为一次执行、运行中 generation 不丢事件、running job 强停恢复、失败退避与手动重试、缓存 15ms 返回后后台刷新完成。物化位于 Application Support 并按贡献者/分享名称寻址；不再要求第二台物理设备。 |
| V-SESSION-02 | **通过** | 保留原始 Session 后，增量同步、来源 adapter、固定快照分页和跨账号消费能否闭环 | Server 只保存 opaque JSONL segment/snapshot；真实 Codex 与 MyFlicker 来源均由已安装 Reader 在读取时投影。MyFlicker `tool_use/tool-result` 已关联为完成的工具调用。增量 fixture 从 152B 推进到 304B，只追加新 segment，source cursor 与 snapshot 同步前移；无变更 sync 保持原 snapshot。双 Google 账号在同一设备完成贡献/消费；page cursor 固定 snapshot，同名引用返回候选与 UUID fallback。发布验收版本为 release `0.1.26-dev`、Core `0.1.23-dev`、Skill `0.1.21-dev`。 |
| V-SESSION-03 | **通过** | 本地 Session 清单能否快速、完整地覆盖三类 Agent，而不在打开选择器时解析正文 | 清单查询只读 SQLite；已安装 Core 实测 200 条约 12ms、按 ID 搜索约 6ms。MyFlicker 与 omni-colab 基准一致，共 73 条：新版 CLI 54、旧版 CLI 11、Desktop 8；排除了 2000+ 个 `requests/` 请求碎片。Desktop 独立 adapter 的覆盖、rollback 和工具调用投影有 Rust fixture 测试。发布验收版本为 release `0.1.33-dev`、Core `0.1.27-dev`、Skill `0.1.24-dev`。 |
| V-FILES-03 | **通过** | 超大或误包含构建物的共享源是否会拖死同步 | `agent-colab` 曾因构建物进入 shadow index 产生超过 2 GiB 对象，而 Server body limit 为 256 MiB。release `0.1.36-dev` 已安装复验：按 shadow `info/exclude` 排除 102,559 文件/20,071,279,289 bytes，纳入 393 文件/47,483,603 bytes，预览约 4.2 秒；真实临时 Shared Item 首次发布约 4 秒完成并得到 root `9972e3fe…`，随后已撤回。范围 PATCH → durable job completed → GET 读回均通过，SQLite schema 不含 exclude 配置，来源 `.gitignore` hash 保持 `8a8346e3…`。现有单文件 100 MiB/总量 200 MiB 预检阻止不可能进入单请求的工作；更大对象的分块传输仍属后续 transport 能力。 |
| V-CONTRACT-01 | **Supabase 恢复时验收** | Supabase 与独立 Rust+PostgreSQL 后端是否具有相同产品语义 | 当前只验收 standalone；恢复 Supabase 后再让同一套黑盒测试运行两次 |
| V-PUBLIC-01 | **通过** | 首次加载、前台请求状态与公开 GitHub 分发是否形成可理解、可复验的 alpha 体验 | GUI `0.1.30-dev` 构建与 request-activity 并发测试通过；首次无数据时显示 workspace loading，已有数据时 foreground request 显示顶部 loading，后台 reconciliation 静默。release `0.1.47-dev` 六个制品已通过 R2 公共 size/SHA-256 回读；public repository `kwgjjeffrey/agent-colab` 与含十个描述性资产名的 GitHub prerelease 已创建，匿名 manifest 下载 hash 与 Windows executable HTTP Range 下载通过。 |

## 3. 接下来的执行顺序

1. **Files 收口**：完成持久化同步 job/outbox、Local API discovery/bearer/Origin 防护和断网重启恢复。
2. **发布与身份加固**：在公开 alpha 前补 refresh rotation、兼容范围拒绝、健康检查与故障注入；签名公证和其他桌面平台按发布范围安排。
3. **Shared Skill 已完成**：来源发现、共享、跨账号消费、目标 Agent 安装/更新/卸载和 Give-to-Agent 已闭环；下一阶段只在明确需求出现后推进 query submit hook 自动推荐。

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
