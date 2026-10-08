# Colab 交互设计

Channel Settings → Members 增加 Invite via Agent（owner/admin）。按需创建现有 24 小时普通成员邀请，标准 Dialog 提供单条 macOS bootstrap 命令的提示词、复制和撤销；不自动分享资料。命令补齐签名安装、Core 服务与设备账号准备，加入后定位 Channel Home。多账号未选择时必须由用户选择。

### 2026-10-08 workspace continuity and onboarding

macOS window close hides the existing renderer; activation restores it. A cold renderer restores the last accessible Channel and its saved tab. Focus only checks active GUI resources; ordinary reconciliation retains the current workspace. Channel Settings offers a preview, image upload and local Generate icon action rather than a text icon field; rail/header share the same image renderer. Skills actions use the same centered workspace gutters as Sessions.

Messages use cases live before the first message within the timeline, so growing history pushes them out of view; they cover adding one's Agent counterpart, mentioning a teammate/Agent, and dispatching the agreed decision with quoted/forwarded context. The first action opens the existing Agent manager. Bottom-follow applies only while the user is at the bottom, preserving manual history reading.

Sessions shows sharing, handoff and review guidance only while its Session list is empty. As soon as any Session exists, the entire guide is hidden, including unfinished tips. Try uses real source/Session selection; opening or canceling alone does not record completion. New Channels contain an editable/deletable Welcome to Canvas with writing, formatting, folders, heading-scoped Agent dispatch, resource references, local handoff and save-status instructions.

Home 收口（2026-10-07）：价值陈述使用 agentic velocity。Recent activity 使用完整主谓宾标题，成员、Agent 和资源复用同一 MentionCapsule/Profile；指令摘要保留结构化 mention。标题 14px、摘要/时间 12px，统一行内间距与上下留白。整行（含键盘 Enter/Space）打开资源详情或精确 request 的 Work details；胶囊点击只打开 Profile，不触发行跳转。任务详情仍只在点击后加载。

Home 收口（2026-10-06）：Tips 展示名称改为 Use cases，保留已有账号偏好键。角色 Badge 与场景文案同行，不再堆叠；五类角色分别使用蓝、紫、金、玫红、绿语义色。Recent activity 的 Messages/Canvas 指令行直接打开该活动 ID 中 request 对应的已有 Work details Drawer，不跳消息、不默认最新任务；正文仍仅在用户点击后加载。

Tips 角色场景（2026-10-06）：每条显示角色 Badge，顶部可按 Individual / Collaborator / Team lead / Reviewer / Skill sharing 筛选；这是使用视角，不是账号权限。新增求助、接手、团队总结、决策评审、远端检查、Skill 复用六条。共享类 Try 复用 Quick Share；Session 消费类只在 Try 时读取当前 Channel 的 Session 元数据，用户选择来源后得到任务预填的标准提示词，可追加 User query、复制或转发。未同步的 Session 不可选择；缺少同事 Session 进入已有邀请分享流程。远端检查复用选择 Agent + 可编辑指令，必须显式发送；缺少 Agent 有明确提示。Skill 复用进入已有安装界面。保留折叠、dismiss 和恢复，不新建工作流、调度或权限系统。

Home（2026-10-06）：紧凑横向协作网络并列 before agent / with agent / with Agent Colab；正向三角形，协作主体位于内环，人与 Agent 的独立频率为 1:30。价值陈述为 “Your team is about to work at agentic speed”，位于右侧紧邻 Agent Colab 图，无强调底色。Tips 条目只由分隔线区分，整体可折叠且按账号记忆；不重复提供已有 Tab 的功能按钮。下方 Recent activity 用分页真实元数据展示共享、最近消费、Canvas 创建和 Messages/Canvas Agent 指令，资源可跳至既有详情。它不是完整安全审计，也不展示资源正文或工具日志。

状态：首版结构稿  
范围：Channel、Messages、Session、Files、Skills、Settings
暂缓实现：独立于 Channel 的 DM、项目管理、Agent runtime 实际编排

## 1. 人类故事线

### 1.1 建立协作关系

用户像选择 Discord server 一样，从左侧 Channel rail 进入已有 Channel，也可以创建新的 Channel。Channel 因现实协作需要建立，不与仓库或组织结构强绑定。

用户也可以直接要求自己的 agent 创建 Channel、设置名称与图标、邀请成员。Agent 使用与 GUI 相同的底层能力，完成后 GUI 立即呈现结果。

进入 Channel 后，Channel 头像与名称位于页头；用户可以从页面顶部在 Messages、Sessions、Files、Skills 和 Settings 五个区域间切换。

### 1.2 登记工作上下文与能力

用户可以向当前 Channel 登记：

- 完整的 agent session；
- 单个文件或目录；
- 可供其他成员 agent 使用的 skill。

登记建立持续共享关系。每个对象区域都提供“共享我的 Session / Files / Skill”入口，不单独设计“我的登记”模块。

### 1.3 浏览和选择

用户浏览 Channel 内其他成员共享的 Session、Files 和 Skills，查看贡献者、来源和最近同步时间。Session 正文不在 GUI 中预览；人把对象交给 Agent 后，由 Session Reader 按任务需要读取。

用户既可以自己打开对象，也可以直接在具体对象上点击“给 Agent”，避免 agent 从整个 Channel 中自行查找。对象所有者还可以从对象自身的操作中撤回共享。

### 1.4 管理 Channel

有权限的用户在 Settings 中修改 Channel 名称与图标、邀请或移除成员，并处理其他 Channel 级设置。

## 2. Agent 故事线

### 2.1 发现 Channel

Agent 通过 Colab skill 获取当前用户可访问的 Channel，并根据名称、说明和成员选择与当前任务相关的 Channel。

### 2.2 取得对象清单

Agent 分别列出 Channel 下的 Session、Files 和 Skills。清单只提供发现所需的元数据，不一次性载入所有内容。

### 2.3 分层读取

- Session：先读概览，再分页读取消息或在完整 session 中搜索；
- Files：先读目录树与文件元数据，再读取具体文件或搜索内容；
- Skills：先看 Channel 中可用 Skill 的名称、贡献者、版本和兼容目标；选定后安装或更新到指定 Agent runtime，再由该 runtime 自己的 Skill 发现/加载机制使用。Colab 不把“阅读 Skill 目录”当作主要消费方式。

### 2.4 使用并保留来源

Agent 将共享对象用于当前任务，并保留稳定对象引用，使用户可以回到贡献者、Channel 和原始对象。

### 2.5 处理更新

再次执行相关任务时，Agent 可以根据版本和更新时间判断对象是否变化，只读取新增或改变的内容。

## 3. 人类与 Agent 故事线

### 3.1 人指定起点

用户从具体 Session、共享文件对象或 Skill 上点击“给 Agent”，再说明任务。GUI 传递稳定对象引用，而不是把页面中可见文本复制给 agent。

用户也可以从 Channel 顶部直接点击“让 Agent 干活”，先描述任务，再由 agent 自主发现 Channel 中的相关上下文，不要求每次都从某个 shared item 出发。

### 3.2 Agent 自主补充

Agent 从指定对象开始工作。如果发现信息缺口，可以继续列出或搜索同一 Channel 中的其他对象。

### 3.3 Agent 使用共享能力

当任务需要团队成员沉淀的能力时，Agent 可以发现共享 Skill，确认目标 runtime（Codex、Claude Code、MyFlicker 等）后安装或更新，再按目标 runtime 的原生方式加载并使用，不要求用户重新复制安装说明。

### 3.4 人验收结果

Agent 交付结果时说明使用了哪些共享对象。用户可以沿引用回到原始 Session、File 或 Skill。

### 3.5 新结果进入协作循环

本次工作产生新的 session、文件或 skill 后，由用户决定是否登记进 Channel，继续形成共享—消费—工作—再共享的循环。

## 4. GUI 功能结构

### 4.1 Shared Item

Session、Files 中由成员分享的根对象、Skill，都是 Shared Item 的具体类型。Shared Item 具有统一语义：

- 由某位成员拥有并共享到当前 Channel；
- 可以被其他成员和 agent 读取；
- 具有稳定引用、版本、贡献者和更新时间；
- 提供“给 Agent”操作；
- 所有者可以执行“撤回”。

每个对象区域还提供“共享我的 XXX”，用于创建相应类型的 Shared Item。

### 4.2 应用级结构

- **Channel rail**：采用 Discord server 式的纵向图标列表；选择、创建 Channel；当前 Channel 以左侧白色竖条和图标外高亮描边标识，同时设置 aria-current，不能依赖会被图片遮住的按钮底色。
- **Channel header**：显示 Channel 身份，并提供不依赖具体对象的“让 Agent 干活”；
- **顶部对象导航**：Sessions、Files、Skills、Settings；
- **Content workspace**：当前区域的清单、树、预览和对象操作。

### 4.3 Sessions

顶部提供“共享我的 Session”。清单显示标题、贡献者、来源 agent 和最近同步时间；首次快照尚未提交时明确显示同步中。每个 item 直接提供“给 Agent”；如果当前用户是所有者，还提供“撤回”。Session item 不以点击打开正文预览：对话渲染不是首版产品重点，也不应让一次 GUI 浏览隐式触发大型 Session 的全量物化和 adapter 投影。正文消费统一交给 Session Reader。

### Files drill-down preview

点击 Files item 后离开集合列表并进入占满内容窗口的 File Explorer。顶部提供返回和当前位置面包屑；左侧是目录树，右侧是选中文件的预览区，信息架构与 IDE 一致。文本、图片和 PDF 使用本机浏览器能力；`.xlsx` 与 `.docx` 使用按需加载的本地解析器，内容不会送到第三方预览服务。未知格式、损坏文件和大小超限只在右侧预览区显示明确提示，不能把 Local API JSON 错误追加到页面底部。

### Quick Share

Quick Share 是全局下拉入口，第一层只做类型分流：`Session`、`Files`、`Skill`，以及重新进入既有分享的 `Manage shared items`。选定类型后复用对应 Channel 共享选择器；Files 对人只暴露一个“选择 Files”动作，文件与目录只是系统选择器返回的不同来源，不是两种产品能力。

每次只分享一个 item。用户选中来源时，固定快照与默认 24 小时的分享立即成立，不再增加一个容易产生误解的“最后确认”步骤；随后进入结果/管理页，展示可复制提示词、有效期设置、已经拉取该分享的人（未登录接收者显示为匿名接收者）和红色撤销操作。关闭弹层不会撤销分享，用户可随时从 `Manage shared items` 返回该页。列表、来源名称和提示词都必须在弹层内截断或换行，不能撑破视口。

该流程不要求贡献者先创建账号、Organization 或 Channel。提示词对接收者只描述完成任务需要做的动作：已安装 Agent Colab 时直接使用 Quick Share 脚手架；未安装时先运行官方安装命令，再调用同一个脚手架。提示词不泄露服务端内部 ID、Blob key 或鉴权实现。

### 4.4 Files

顶部提供“共享我的 Files”。Files 与 Sessions 使用相同的信息架构：第一层是共享文件对象列表，显示名称、贡献者、更新时间和简要信息。每个 Shared Item 直接提供“给 Agent”；只有所有者能看到“撤回”。

点击一个 Shared Item 后进入第二层，才展示该对象内部的文件目录树。点击具体文件，在工作区中预览文件内容。用户可以返回共享文件对象列表，不把所有成员及其目录同时塞进一棵全局树。

首次共享前，界面按需扫描并预览纳入范围；对明显的生成目录给出默认排除选择，并在内容超过当前传输上限时阻止提交。贡献者可从自己的 Files item 重新打开“同步范围”。这些规则保存在应用私有的 shadow Git 中，不修改项目 `.gitignore`；该入口无需常驻展示技术配置或维护额外索引。

### 4.5 Skills

顶部提供“共享我的 Skill”。共享选择器首先展示 Local Core 从 Codex、Claude Code、MyFlicker Skill 根目录发现、最近 48 小时内创建或内容变化、且尚未登记到当前 Channel 的 Skill；用户也可以选择任意包含合法 `SKILL.md` 的本地 Skill 根目录。两种入口最终都是一个 `source_path`，不会把整个 Skill 仓库或某个 Agent 的全部 Skill 自作主张地共享出去。

Channel Skill 清单显示名称、说明、贡献者以及本机各目标的安装状态。主要操作是安装、更新、卸载和“给 Agent”；默认 Agent 是主操作，其他已安装 Agent 使用与 Files/Session Give to Agent 相同的下拉交互。所有者还可以撤回。版本判断由 shadow Git 快照 `root_oid` 完成，但不向人展示 Git OID 或额外制造 Skill 语义版本。详情可以展示使用说明和安装目标，目录阅读不是 Skill 的主要消费路径。

“给 Agent”复用统一 Agent Prompt Dialog。目标 Agent 尚未安装该 Skill 时，提示词调用 `colab-skill-tool ensure` 完成同步和安装；已经安装且为当前快照时，提示词直接告知 Skill 名称与安装位置。共享者撤回后不远程删除其他设备已有安装，但该安装失去更新来源并可由用户主动卸载。

### 4.6 Settings

包含 Channel 名称、图标、成员与权限等 Channel 级管理能力。

这些不是 GUI 独占能力。Agent 可以通过 Colab Browser 创建和修改 Channel、列出成员、邀请或移除成员、调整角色；涉及他人的变更仍受相同权限与确认规则约束。

## 5. 低保真线框

可交互线框位于 [`.trial/interaction-wireframe/`](../.trial/interaction-wireframe/README.md)。它只验证功能布局和对象关系，不表达最终视觉风格。

## 6. Channel Messages 与 Agent blueprint（首版实现基线）

首版按用户确认的信息架构进入现有 Channel：Messages 是第一个 tab，中央为消息流和输入区，右侧为 Channel 人员与其带入的 Agent。Channel rail、Sessions、Files、Skills、Settings 保持现有位置。

### 6.1 入口与主布局

- Messages 是 Channel tab，不新增独立 rail 入口。未来的跨 Channel DM 不混入首版。
- 中央消息流和输入区占主要空间，右侧是成员与 Agent；窄屏可以收起右栏。
- 右侧提供与 Settings 相同的 Add user 能力；Settings 暂时保留原入口，待 Messages 稳定后再去重。
- 当前登录成员排在顶部。成员与其带入 Channel 的 Agent 直接平铺，不使用树状展开、卡片边框或额外层级线。成员头像保持紧凑；Agent 头像复用 owner 头像并增加与消息流一致的超新星头像框。
- 只有当前登录成员显示其 Agent 数量并把它作为管理入口；其他成员不显示数量入口，其 Agent 直接以只读行列在该成员之后。
- 消息采用 Discord 式紧凑行流而不是聊天气泡：所有发送者统一左对齐，头像、名称、正文和富内容处于同一稳定网格；整行 hover 才显示时间、回复和选择操作。真人与 Agent 使用相同尺寸、相同基础头像框，Agent 额外增加超新星框与 `AI` 标签。
- Messages 工作区从 tab 分隔线一直贴到视口底部，左右也不额外增加卡片 margin、圆角或外框。输入区只由工作区的顶部分隔线界定，不在内部再嵌套输入框边框；发送使用实心圆形上箭头。
- 点击自己的 Agent 数量打开双栏 Dialog：左侧是账号下的 blueprint 清单与 Channel 勾选状态，右侧是 focus blueprint 的配置。

### 6.2 Agent blueprint

blueprint 是 Organization Member 账号级设置，所有 Channel 看到同一份个人列表；Channel 只保存哪些 blueprint 被带入。配置包括 name、loading instruction、loading command、runtime 和 upon request by others（refuse / awaiting owner message / process）。runtime 是 Server 返回的已登记实例选项，显示为“设备名 · Coding Agent”（例如 `MacBook Pro · Codex`、`Windows PC · Codex`），不是 device 与 coding agent 两个自由输入框。登记来源是该成员在对应设备上安装 Agent Colab Skill；多台设备上的同一种 Coding Agent 是不同选项。首版只允许选择 Codex runtime；没有可用 runtime 时只展示安装/连接指引，不允许保存或加入 Channel。

“Create by my agent”是新建界面的主操作，打开与 Files/Session 相同的 prompt Dialog。主按钮按默认 Agent 显示“Copy and open Codex”，其他已安装目标收进相邻菜单。提示词必须列出 Local Core 当前返回的可选 runtime ID，并要求 blueprint scaffold 显式传入其中一个 ID；缺失或无效 ID 必须失败，不能产出半配置 blueprint。

### 6.3 把 Agent 加入对话

个人配置入口展示同一 blueprint 列表但没有 Channel 勾选能力。Messages 的 Agent Dialog 才负责把 blueprint 引入或移出当前 Channel。Agent 行明确显示 owner、runtime 和调用策略；加入的是 blueprint，不是裸进程。

### 6.4 选择、转发与调用

- 消息 hover/focus 时出现选择框；可以单选或多选。
- 选择后出现统一操作条：“Forward to person…”发送带原作者、时间和稳定消息引用的转发卡；“Ask agent…”选择对话内 Agent，并把被选消息作为明确输入。
- 输入 `@` 后从 Channel Agent 列表选择，得到不可拆分的胶囊；用户只能整颗删除，不能逐字修改名字。胶囊是完整消息富文本中的 inline node，同时携带 label 和稳定 blueprint UUID；服务端不删除 `@Agent`、不存字符范围、不从可编辑字符串反推身份。
- 一条消息可同时 mention 多个 Agent。Server 对每个不同 blueprint 独立执行 policy 和 runtime 路由，并把同一份完整消息交给每个 Agent；同一消息重复 mention 同一 Agent 默认只生成一条命令。
- Ask me first 与 Refuse 都将非 owner 请求记录为终态 `rejected`，不保留待批准或待执行任务。前者以该 Agent 身份发送一条 mention owner 的普通引导消息。owner 后续回复并再次 mention Agent 时，这条完整回复就是新命令；Server 沿 reply chain 带上原请求，因此 owner 可以增补或改写任务，而不是审批旧任务。
- runtime 离线时，Server 以 Agent 身份发送正常离线消息，命令留在服务端待投递。不在对话里暴露 `queued/running/completed` 基础设施状态卡。

### 6.5 Agent 回复与引用

Agent session 不自动把 provider 的最终回答镜像到 Channel。Agent 在它认为需要时，通过 request-scoped Agent Colab Skill 命令发送进度或结果；这些输出与人类输入走同一 Channel message 通道，只是 sender 身份由 Server 根据 request 固定为目标 blueprint。详细推理和工具日志保留在 owner 设备上的 provider session。

Agent 提交回复时不拥有自由 mention 能力。Server 从 request ID 反查 requester 与触发消息，自动在最终正文开头插入结构化 `@requester` member mention，并把 `reply_to_message_id` 指向触发消息；Agent 工具、提示词和参数不重复携带这些可伪造字段。GUI 对提到当前登录成员的胶囊使用深蓝实色，并显示默认引用，使请求人能一眼识别自己的回音。

### 6.6 全局 Settings 信息架构

Settings 首层只显示当前登录 User、当前 Organization、`My Agents (数量)`、本机 Agent runtime 的 Skill 安装区，以及默认折叠的 Updates。User 与 Organization 的新增、切换和登出进入同一 Popover 内的下钻视图，不在首层同时摊开多个账号和组织。My Agents 使用超新星图标并进入既有 blueprint 管理面；Skill 安装行为不变，只把模块名称明确为 `Install Skill to local Agent runtime`。四类独立制品版本、检查和更新操作保持原能力，但移动到末尾的折叠 Updates 中。

首版不做项目看板、通用附件仓库、视频会议、reaction、人类 typing indicator 或 read receipt。Agent 成员行显示任务数量；只有 runtime 已确认且执行中的命令才显示 Working…，背景持续呼吸（降低动态效果时使用静态背景）。点击 Agent 行打开身份卡片，不打开编辑弹层。卡片列出该 Agent 在 Channel 的全部任务，最新在前，每条显示摘要、状态、开始时间和持续时间；点击具体记录才打开该 request 的正序详情。Owner 自己的 Agent 数量入口仍用于设置。顶部不再保留默认指向最新任务的统一入口。
# Desktop title status and message composition

- macOS Electron uses a hidden-inset title bar so the HTML-owned, fixed-height status slot occupies the native title-bar region without adding or removing layout rows. It reads `Loading…` for foreground HTTP work, `<Agent> is working…` only after runtime acceptance, and `Colab` while idle.
- WebSocket events are wake-up hints. Consecutive message/request invalidations are drained into authoritative cursor/status reconciliation; an invalidation arriving during an active fetch schedules another pass instead of being discarded.
- The composer offers atomic Agent and Channel-member mention capsules. Member capsules remain structured IM mentions but never enter Agent command routing.
- Enter sends; Shift+Enter inserts a line break. The empty composer states these shortcuts in its placeholder.
- Human avatars use a visible green identity ring. Agent avatars keep the owner image, purple supernova ring/marker, and AI label.
- Message hover actions sit immediately after the timestamp without a floating border: quote, forward, and enter multi-select. Multi-select moves checkboxes to the left edge of every message row and exposes one batch-forward bar.
- Updates remain actionable while their detail disclosure is collapsed. Long artifact transfer state is separate from page Loading and shows bytes, total, throughput, and ETA.
- The application does not reserve a permanent blank strip for global loading or Agent activity.
  Loading belongs to the surface performing the request; Agent work remains channel/request state.
  A future native-titlebar indicator requires a real Electron integration rather than compensating
  page padding.
Canvas Agent dispatch remains observable in the Agent identity card. For the current document and Agent, the card lists every unfinished `queued / delivering / running / awaiting_owner` command above an always-reusable `Send to Agent` button. Terminal commands disappear from this transient area but remain durable history. Canvas command state is not repeated in the document or Channel title; Messages Agent activity continues to use the Channel-level status projection. WebSocket frames only wake reconciliation; HTTP request lists remain authoritative after missed frames, reconnects, focus changes, or reloads.

Canvas uses a centered document column with symmetric horizontal gutters. It has no permanent toolbar: hovering a top-level paragraph exposes a compact block handle whose menu applies text, Heading 1–3, list, quote, or code styles. These actions produce ordinary collaborative editor transactions and do not introduce a second document protocol.

Updater state belongs to the backend operation, not the browser's button state. Settings opening and focus restore the active operation; a collapsed Updates section still shows progress and disables competing actions. Repeated update requests attach to the existing operation. Mac OS-lock ownership determines running; a stale transfer without a lock is interrupted, and an activated Core different from the resident executable offers Restart. A terminal download record alone does not mean installation has ended.

Sessions 的 onboarding 仅用于空列表；已有任意 Session 时隐藏整块引导，让实际内容占据页面。Messages 的引导仍按既定规则位于消息流开始处，随对话增长自然滚出视口。
