# Colab 交互设计

状态：首版结构稿  
范围：Channel、Session、Files、Skills、Settings  
暂缓实现：Conversation/DM、项目管理、Agent runtime 编排、Agent blueprint 管理

## 1. 人类故事线

### 1.1 建立协作关系

用户像选择 Discord server 一样，从左侧 Channel rail 进入已有 Channel，也可以创建新的 Channel。Channel 因现实协作需要建立，不与仓库或组织结构强绑定。

用户也可以直接要求自己的 agent 创建 Channel、设置名称与图标、邀请成员。Agent 使用与 GUI 相同的底层能力，完成后 GUI 立即呈现结果。

进入 Channel 后，用户可以从页面顶部在 Sessions、Files、Skills 和 Settings 四个区域间切换。

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

- **Channel rail**：采用 Discord server 式的纵向图标列表；选择、创建 Channel；
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

## 6. Conversation / DM 候选交互（线框已完成，尚未实现）

可看的扩展线框位于 [conversation-wireframe.html](../.trial/interaction-wireframe/conversation-wireframe.html)，它沿用现有 Channel rail 和内容区，而不是另画一套无关产品。

### 6.1 入口与主布局

- Conversation 是左侧 rail 顶部的固定应用级入口；下方仍是各 Channel。它不进入某个 Channel 的 Sessions/Files/Skills tab。
- 进入后采用三栏：会话列表、消息区、参与者/引用详情。窄屏隐藏详情栏，不改变信息层级。
- 新建 DM 从 Organization 人员目录选人；新建群聊可选多人。聊天无需先创建 Channel。
- Channel 是稳定共享上下文空间。消息可引用某个 Channel Shared Item，但这既不把消息存进 Channel，也不扩大聊天成员对该 Shared Item 的权限。

### 6.2 Agent blueprint

blueprint 是账号级设置，入口同时出现在左下角设置和 Conversation 顶部。编辑项只包含首版真正参与执行的内容：名称、头像、目的、provider、谁可调用、默认 runtime。runtime 在线状态是当前事实，不是 blueprint 的身份。

“Configure with my coding agent”打开与 Files/Session 相同的 prompt Dialog。主按钮按默认 Agent 显示“Copy and open Codex”，其他已安装目标收进相邻菜单。提示词必须给出专用 blueprint scaffold，以当前登录账号和可读名称定位 blueprint；Agent 直接执行配置并返回校验错误，不要求用户先手动检查或查 UUID。

### 6.3 把 Agent 加入对话

Conversation header 的“Add people or agents”在一个搜索面板中同时列出 Organization 人员和当前用户可用的 blueprint。Agent 行明确显示 owner、provider、runtime 在线状态和调用策略。加入的是 blueprint 在该 Conversation 的实例，不是裸进程；同一 blueprint 在每个 Conversation 中对应独立 provider session。

### 6.4 选择、转发与调用

- 消息 hover/focus 时出现选择框；可以单选或多选。
- 选择后出现统一操作条：“Forward to person…”发送带原作者、时间和稳定消息引用的转发卡；“Ask agent…”选择对话内 Agent，并把被选消息作为明确输入。
- 直接输入 @Agent 也会创建 Agent Request。普通聊天消息和远程执行请求不是同一状态：消息旁渲染独立状态卡，展示 awaiting approval、awaiting runtime、queued、running、succeeded、failed、rejected、cancelled 或 expired。
- owner 的批准/拒绝绑定明确 request ID，不从“行”“可以”等自然语言猜授权。runtime 离线不是失败；状态卡说明等待上线。

### 6.5 Agent 回复与引用

Agent 回复头展示 blueprint 名称和 owner；正文用标准 reply 块引用触发它的消息。引用过的 Channel Shared Item、Session 或 Files 以来源 chip 呈现，点击时再做权限检查。执行状态、简短进度和最终摘要留在 Agent Request 卡中；详细推理和工具日志仍在 owner 设备上的 provider session，除非 owner 主动共享。

首版不做项目看板、通用附件仓库、视频会议、reaction、typing indicator 或 read receipt。
