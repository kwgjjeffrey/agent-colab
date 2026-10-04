# Agent command data flow

This contract deliberately separates two planes:

- Conversation messages are durable Channel content. PostgreSQL sequence numbers and the message
  WebSocket/cursor protocol synchronize them to clients.
- Agent commands are server-created execution instructions. A dedicated runtime WebSocket delivers
  them to one registered `(member, device, coding agent)` runtime.

The message stream never doubles as an execution queue, and a runtime command is never rendered as
a chat message or status card.

## Message content and mentions

Tiptap stores the complete visible message. An Agent mention is an atomic inline node whose
`blueprintId` is the execution identity; its label remains part of the readable message:

```json
{"type":"doc","content":[{"type":"paragraph","content":[
  {"type":"text","text":"Please "},
  {"type":"mention","attrs":{"id":"00000000-0000-4000-8000-000000000001","label":"Release Agent"}},
  {"type":"text","text":" and "},
  {"type":"mention","attrs":{"id":"00000000-0000-4000-8000-000000000002","label":"Security Agent"}},
  {"type":"text","text":" check this release."}
]}]}
```

The Server persists the rich content plus the derived, complete plain text:

```json
{
  "plainText": "Please @Release Agent and @Security Agent check this release.",
  "content": { "type": "doc", "content": ["..."] },
  "replyToMessageId": null
}
```

It never removes mention text, calculates character ranges, or reconstructs the body. Mention rows
are a query index derived from the rich nodes. One message may address several Agents; the router
creates at most one command per distinct `(message_id, blueprint_id)`, and every target receives the
same complete `plainText`.

## Policy and reply-chain semantics

After committing a message, the Server routes each Agent mention independently:

- `refuse`: append an ordinary reply authored by that Agent;
- `awaiting owner`: append an ordinary Agent reply mentioning the owner; do not create an
  executable command yet;
- allowed but runtime offline: retain a pending server command and append an ordinary Agent message
  saying it is offline and will handle the request when it returns;
- allowed and online: package and dispatch a runtime command.

An owner's later reply is a new command, not a boolean approval. It must itself mention the Agent.
The Server uses that complete new message as the task and follows `reply_to_message_id` to include
the earlier request and the Agent's confirmation request. This permits the owner to amend the task
instead of merely saying yes or no.

## Exact task prompt

The Server renders only information useful for doing the work:

```text
{{sender_name}}: {{current_message_plain_text}}

{{#if reply_chain}}
Quoted messages:
{{#each reply_chain}}
{{sender_name}}: {{plain_text}}
{{/each}}
{{/if}}

Recent conversation:
{{#each recent_context}}
{{sender_name}}: {{plain_text}}
{{/each}}

To load earlier messages for this task, run:
~/.agents/skills/agent-colab/bin/colab-messages request context \
  --request '{{request_id}}' \
  --before '{{earliest_context_seq}}' \
  --limit 20

Tools below are at your disposal if the user's task requires them:
{{#if blueprint_instruction}}
Instruction: {{blueprint_instruction}}
{{/if}}

When you complete the task, send a summary back to the Channel by running the command below. You
can also use the same command to share progress updates when necessary.

~/.agents/skills/agent-colab/bin/colab-messages request reply \
  --request '{{request_id}}' \
  --message '<message>'
```

`reply_chain` is ordered root-to-parent. `recent_context` contains the ten messages preceding the
current one, in chronological order, excluding messages already present in the reply chain. Empty
sections are omitted. The current query retains every visible mention exactly as written.

The request-scoped commands bind the Channel and Agent identity on the Server; the model cannot
select a different destination or sender. The exact command names above already exist. If a future
tool is designed but not implemented, the template must leave a named placeholder rather than add
generic rules or internal product explanations.

## Runtime delivery and execution

The Server sends a distinct command envelope through the target runtime WebSocket:

```json
{
  "type": "agent.command",
  "command": {
    "id": "req-789",
    "runtimeId": "runtime-macbook-codex",
    "channelId": "channel-release",
    "targetBlueprintId": "bp-release",
    "threadTitle": "Release Agent · Agent Colab",
    "prompt": "<the rendered task prompt above>"
  }
}
```

Local Core does not parse messages, evaluate policy, fetch conversation context, or automatically
publish the provider's final answer. It creates or resumes the provider session identified by
`sessionBindingKey`, starts one turn with `prompt`, and records enough provider receipt data to
avoid duplicating a turn after a local crash. The running Agent decides whether and when to use the
request-scoped reply command; those writes enter the same Channel message path as human messages.
