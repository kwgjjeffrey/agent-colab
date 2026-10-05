# F-CANVAS-01 — Tiptap/Yjs ↔ Rust/Yrs Projection Codec

状态：通过（2026-10-03）

## 假设

Rust/Yrs 能读取真实 Tiptap/ProseMirror 生成的 Yjs document update，确定性投影为普通 Markdown，在不重建整个 document 的前提下把普通文本 patch 映射为 Yrs transaction，并让 Tiptap/Yjs 正确回放；结构化组件 fence 不允许通过普通文本 patch 修改。

## 预定义通过标准

1. fixture 必须由 Tiptap schema 和 `y-prosemirror` 生成，包含 heading、marks、list 和 component fence；
2. Rust/Yrs 载入 fixture 后得到预期逐字节 Markdown；
3. Rust 将 `Release validation is pending.` 修改为 `Release validation passed on macOS.` 并输出 Yjs update v1；
4. JS/Yjs 应用该 update 后能由同一 Tiptap schema恢复正确文档；
5. update 重复应用以及与独立并发 update 乱序应用后收敛；
6. 普通 patch 试图修改 component fence 时返回明确拒绝且不产生 update。

## 运行

```bash
pnpm install
pnpm fixture
cargo run -- render fixture.yjs
cargo run -- patch fixture.yjs patched.update
pnpm verify
```

## 实测结果

环境：macOS arm64，Node `22.23.2`，pnpm `10.28.2`，Rust `1.95.0`，Yjs `13.6.27`，Yrs `0.28.0`，Tiptap `3.31.4`。

- Tiptap schema + `y-prosemirror` 生成的 `fixture.yjs` 被 Yrs update-v1 decoder 正确载入；
- Rust 投影逐字节得到 heading、普通段落、bold mark、list 和 component fence；
- Rust transaction 只替换目标 XmlText 中的普通文本，生成 `patched.update`；
- JS 应用更新后恢复为合法 ProseMirror JSON，目标段落为 `Release validation passed on macOS.`，未修改段落的 bold mark 保留；
- 同一 update 重复应用结果不变；Rust update 与独立 JS 并发 update 以相反顺序、包含重复帧应用后 XML 完全一致；
- 普通 patch 修改 `colab-component` fence 返回 `structured_component_requires_tool`，未生成 update。

验证输出：

```json
{
  "restoredParagraph": "Release validation passed on macOS.",
  "markPreserved": "bold",
  "duplicateUpdateIdempotent": true,
  "oppositeOrderConverged": true
}
```

## 结论与设计影响

F-CANVAS-01 通过。冻结 Yjs/Yrs update encoding v1、顶层 `content` XmlFragment 和本 fixture；正式 Local Core 可以进入 `CanvasProjectionCodec` 实现。Trial 证明 wire compatibility 与最窄投影/patch 路线可行，不代表完整 Markdown AST diff、持久化、恢复或端到端已经完成，这些必须在正式代码中继续验证。
