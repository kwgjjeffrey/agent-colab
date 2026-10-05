# Interaction wireframe

低保真交互线框，用于核对 Agent Colab 的功能布局和页面流，不表达最终视觉风格。

- 左侧采用 Discord server 式 Channel rail；
- Channel 内通过顶部导航切换 Sessions、Files、Skills、Settings；
- 每个 Shared Item 直接提供“给 Agent”，所有者还可以“撤回”；
- Files 与 Sessions 一样先展示 Shared Item 列表，进入某个 item 后再浏览其内部目录；
- Channel 顶部提供不依赖具体对象的“让 Agent 干活”；
- Conversation / DM 扩展见 conversation-wireframe.html：包含应用级入口、三栏布局、Agent blueprint、coding-agent 配置提示词、加入 Agent、消息多选转发、Agent Request 状态和回复引用。Conversation 与 blueprint 设置是互斥页面，通过顶部入口和返回按钮切换，不在同一画布叠加。
- Conversation 可以引用 Channel Shared Item，但不会改变 Channel 权限。

源文件：`colab-wireframe.fragment.html`  
可独立打开的渲染文件：`index.html`
