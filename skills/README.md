# Skills

未来放置 Colab 面向各类 agent 的配套 skills，包括上下文共享、浏览、检索与消费能力。

首版 `skills/colab/` 是独立发布制品，包含 `colab-browser` 和 `colab-session-reader` 两个薄入口。脚本直接实现 Rust Local Core 的 Local API client，不依赖 Desktop 或额外 CLI，也不持有远端服务 token。具体契约见 [`docs/agent-interface.md`](../docs/agent-interface.md)。
