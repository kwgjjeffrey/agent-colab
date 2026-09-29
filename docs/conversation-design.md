# Conversation / DM product and technical design

Status: design only; not implemented.

## Product interaction

The concrete low-fidelity layout is in [conversation-wireframe.html](../.trial/interaction-wireframe/conversation-wireframe.html). It extends the existing Channel rail instead of inventing a separate shell.

- Conversations is a fixed application-level entry above the Channel icons.
- The main surface has a conversation list, message pane, and participant/reference pane.
- Agent blueprints are account settings: name, avatar, purpose, provider, invocation policy, and preferred runtime.
- Configure with my coding agent produces a target-specific prompt containing the dedicated blueprint scaffold. The primary action uses the default coding agent; other installed agents live in the adjacent menu.
- Add people or agents searches Organization people and available blueprints together. A row always shows blueprint owner, provider, runtime status, and invocation policy.
- Hover/focus exposes message selection. One or more messages can be forwarded to a person or passed as explicit input to a participating agent.
- An Agent reply uses a standard reply block for the triggering message, source chips for referenced Shared Items, and a separate Agent Request state card. It never hides execution state inside an ordinary message bubble.
- Conversation may reference Channel context, but neither membership nor authorization is inherited in either direction.

## IM foundation decision

The first implementation should use self-hosted Matrix Synapse as the classic IM foundation. Matrix is the sole source of truth for rooms, human membership, messages, reply relations, history pagination, and incremental sync. Colab PostgreSQL must not duplicate a messages table.

Decision criteria, in order:

1. Do not hand-build classic IM correctness.
2. Self-hosted and open-source.
3. Native DM/group membership, durable history, pagination, replies, and reconnect sync.
4. Viable Rust and Web SDK ecosystem.
5. Allows Colab-specific Agent authorization to remain separate.

| Candidate | Classic IM coverage | Reconnect/history | Client integration | Remaining custom work |
| --- | --- | --- | --- | --- |
| Matrix / Synapse | Rooms, membership, messages and relations are native | Incremental Client-Server sync and history are native | Matrix Rust SDK and Web SDK ecosystem | Agent blueprint, authorization, runtime lease and Shared Item references |
| XMPP / Prosody | Mature, but assembled from MUC, MAM and other XEPs | Stream Management plus archive query | Capabilities vary across Rust/Web clients | Agent domain plus a selected XEP profile and mapping layer |
| Centrifugo plus Colab message store | Realtime transport only | Strong short recovery; long-term history stays in an application database | Good realtime SDKs, no IM domain SDK | Message store, membership, pagination, relations and sync semantics |
| Raw WebSocket | None | None | Fully custom | Almost the entire IM stack |

Centrifugo is reliable, but its official documentation describes history as a bounded recovery cache rather than an authoritative long-term message store. Selecting it would still require Colab to build most IM semantics. Matrix Application Services can observe and inject events but cannot block or rewrite a message already being sent. Therefore an Agent Request is created through the Colab Server authorization API first; it is not inferred from arbitrary Matrix text.

Primary research:

- [Matrix Client-Server API](https://spec.matrix.org/latest/client-server-api/)
- [Matrix Application Service API](https://spec.matrix.org/latest/application-service-api/)
- [Matrix SDK ecosystem](https://matrix.org/ecosystem/sdks/)
- [XMPP Multi-User Chat](https://xmpp.org/extensions/xep-0045.html)
- [XMPP Message Archive Management](https://xmpp.org/extensions/xep-0313.html)
- [XMPP Stream Management](https://xmpp.org/extensions/xep-0198.html)
- [Centrifugo history and recovery](https://centrifugal.dev/docs/server/history_and_recovery)

## Data ownership and ER

Matrix owns the chat domain: room, human membership, event/message, reply relation, and sync token. Colab owns only its product-specific domain: Conversation-to-room mapping, Agent blueprint, Agent participant, runtime, Agent Request, lease, and authorized context reference. Organization Member maps to a controlled Matrix identity; Organization and Channel are not copied into Matrix as a second authorization source.

![Conversation ER](architecture/conversation-er.svg)

Editable source: [conversation-er.mmd](architecture/conversation-er.mmd).

Important invariants:

- One user may own many blueprints.
- One blueprint may participate in many Conversations.
- Each conversation_agent has one stable binding key; the owner's Local Core maps it to one provider-native session.
- Agent Requests reference immutable Shared Item revisions and never expand access.
- Runtime presence is display state. Only a server-issued short lease grants execution.

## Modules and placement

![Conversation modules](architecture/conversation-modules.svg)

Editable source: [conversation-modules.mmd](architecture/conversation-modules.mmd).

- Matrix Synapse stores and synchronizes classic chat.
- Colab Server owns blueprint policy, Conversation/room mapping, Agent Request state, approval, runtime lease, and context authorization.
- A Matrix Application Service adapter inside Colab Server provisions controlled Matrix identities/rooms and emits Agent status/results. It does not decide authorization.
- Local Core is the only desktop business process. It runs the Matrix client sync, exposes messages to GUI through Local API, claims authorized requests, and maps a Conversation agent binding to a provider-native session.
- Desktop GUI calls Local Core only. It never talks directly to Matrix or Colab Server.
- Agent Colab Skill calls the same Local Core use cases for blueprint, message, selection, and Agent invocation operations.

## Critical Agent Request sequence

![Conversation sequence](architecture/conversation-sequence.svg)

Editable source: [conversation-sequence.mmd](architecture/conversation-sequence.mmd).

1. The requester selects messages or types an Agent mention.
2. Local Core asks Colab Server to create an Agent Request.
3. Server verifies Conversation participation, blueprint policy, and every Shared Item reference before the Application Service emits the request event.
4. When approval is required, the owner approves the request ID explicitly. Natural-language replies never count as authorization.
5. Owner Local Core claims the authorized request with a short lease and resumes the provider session bound to this Conversation.
6. The provider receives only the trigger, selected messages, and authorized references. A request-bound receipt constrains progress/final reporting to this request.
7. Colab Server emits progress/result events with a reply relation into Matrix. Lease expiry permits safe reclaim; reports use idempotency keys.

Agent Request states are awaiting_approval, awaiting_runtime, queued, running, succeeded, failed, rejected, cancelled, and expired.

## Deliberately excluded from the first slice

Federation, end-to-end encryption, reactions, typing indicators, read receipts, video, a generic attachment store, project management, and automatic Channel/Conversation membership coupling are not part of the first implementation.
