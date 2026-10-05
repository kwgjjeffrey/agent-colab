# F-CANVAS-03 — Markdown / Tiptap / Yjs round-trip selection audit

2026-10-04. Implementation-before, isolated technical assumption validation. This is not production acceptance.

Production replacement lives in `../../local/canvas-codec/`, not this trial.
Post-implementation unit regressions: `node --test local/canvas-codec/codec.test.mjs`
(7 passed: real append, terminal hard break, identities, component fence, ambiguity, lossy-region rejection,
incremental duplicate/concurrent-update convergence).
`installed_verify.py` exercises the installed Core via the authenticated Local API:
create an isolated named test Canvas, seed real Yjs bytes, apply the ordinary patch,
then read back the synchronized append and unchanged capsule/context. It does not
manually alter the user's document or install source-built files into the app.

`packaged_verify.mjs` takes the real document update array on stdin. With 237
production updates, Core 0.1.76-dev's packaged Node/helper preserved hard breaks
and capsules and produced a 145-byte append delta. This is read-only on the real
document; the generated patch is not uploaded. The first 0.1.75-dev run rejected
the actual trailing space + terminal hardBreak; the explicit `<br>` mapping fixed
that failure. This packaged-data test is not installed-Core acceptance.

Run `pnpm install --frozen-lockfile && pnpm test`. Exact inputs, serialized Markdown and reconstructed trees are saved in `results.json`. Dependencies are pinned and locked. The schema matches the current GUI's StarterKit and extended Mention attributes (id, label, kind, mentionId); the binding is the `@tiptap/y-tiptap` implementation currently used by Tiptap Collaboration, rather than a separately chosen binding.

## Hypothesis and criterion

Can established Markdown codecs and the existing collaboration binding reproduce the complete supported document tree, including identity attributes, without rewriting CRDT history? Compare original and parsed ProseMirror nodes using `Node.eq`, including attributes, marks, empty nodes and nesting. Merely matching visible text is insufficient. Markdown spelling normalization is distinct from document-semantic preservation.

## Results

14 baseline fixtures: 9 exact-tree passes, 5 failures. Heading/body, bold/italic/code, paragraph hard breaks, nested unordered/ordered lists with non-one start, multi-paragraph quote, fenced code with Unicode/backticks, user/Agent mentions, same-label distinct identities, and the current component code-fence representation pass. Mentions require a custom tokenizer/serializer; the trial uses a Markdown link carrying encoded complete attributes, not label lookup.

| Loss | Cause | Remedy / status |
|---|---|---|
| Consecutive empty paragraphs disappear | CommonMark blank lines are separators, not distinct empty paragraph nodes | Preserve untouched nodes through localized transactions. For exact edits/export of blank paragraphs, register an explicit enhanced-MD empty-paragraph representation. Not implemented/proved here. Ordinary MD alone cannot distinguish these trees. |
| Heading with hardBreak becomes different blocks | ATX heading syntax does not represent multiline heading content | Disallow that editor construction or add a dedicated enhanced syntax. Disallowing would alter existing documents; user decision needed. Custom round-trip not proved. |
| Bold edge whitespace moves outside mark | CommonMark emphasis delimiter rules | Preserve untouched marks locally; explicit enhanced inline syntax is needed for exact round-trip of affected content. Not proved. Visible output often equal, tree not equal. |
| Strike unsupported by default codec | CommonMark lacks strike | markdown-it strikethrough + serializer/parser rules: separately tested and exact-tree passed. |
| Link target/rel/class lost | Standard MD stores URL/title, not these extra attributes | Carry explicit attributes in enhanced syntax, or choose defined defaults. Custom solution not proved. Current schema has these attrs even though GUI has no dedicated attribute editor. |
| Plain @label loses identity | Display name does not encode id/kind/occurrence | Custom identity-bearing Markdown links: exact-tree passed, including same-name distinct IDs. Plain @label must not be used as writable identity projection. |

The component fixture tests only the currently supported `codeBlock(language=colab-component)` placeholder. The richer design's queryList node and nested components Y.Map are not implemented by current GUI. Therefore no claim about rich query state round-trip is justified. Such state should remain in its original shared types; a protected stable reference is the text projection, not an encoding of all component state.

## CRDT update result

Reconciled a changed ProseMirror tree into the existing `default` fragment using `prosemirrorToYXmlFragment`. The unchanged mention kept the same Yjs object identity. Appending a paragraph merged with a remote edit in another paragraph. Opposite update exchange plus duplicate application produced equal document trees and preserved both changes. This proves these exact fixtures only; same-region stale edits, node moves, deletes, ambiguous repeated context and full Codex patch mapping remain unverified.

## Decision

Reject the assumption that installing prosemirror-markdown alone makes arbitrary StarterKit documents lossless. Adopt its parser/serializer as building blocks, with a shared schema and explicit enhanced-MD rules. Use existing collaboration reconciliation, not direct string replacement in XmlText. A production patch adapter must preserve untouched nodes, use baseline-aware affected-range mapping, protect components and reject unrepresentable transformations before mutation. Node equality against the intended result is a release gate. Do not overwrite full documents from stale Markdown.

This trial does not implement the source map, patch transaction adapter, Rust-owned helper integration, or installed-app acceptance. It does not repair or release current Canvas. User must decide whether enhanced syntax and any normalization are acceptable before they are product contracts.

## Subsequent implementation acceptance (2026-10-04)

The preceding statement describes the original pre-implementation trial, not the final product. The selected framework now owns parsing/serialization and reconciliation in `local/canvas-codec`; Rust owns validation and durable synchronization. `installed_verify.py` exercises the installed API patch. `runtime_verify.py` creates an isolated Canvas and dispatches to the actual runtime; it never writes the expected final result. Request `5ce3d4bc-3e35-4990-80b2-56b270678774` succeeded: Agent executed read/apply-patch/read (exit 0), appended `CANVAS_RUNTIME_ACCEPTANCE_795512d4`, retained both capsule identities, and advanced Server seq to 2. Actual GUI displays the new paragraph and task-scoped Work details. Stable 0.1.120 installed Core 0.1.77 and GUI 0.1.75 via the formal updater. This does not expand the supported schema to arbitrary future rich components.
