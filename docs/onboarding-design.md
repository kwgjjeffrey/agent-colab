# Device login and onboarding sample

Implementation baseline: `27da1a6`. Existing regression directory migration is unrelated and retained.

## Scope

Accounts own permissions and content. Google remains the primary identity; an installation-specific
Ed25519 key provides an additional account login credential. Local Core alone holds PKCS#8 private
key bytes in its private SQLite. Cryptography uses ring, not a handwritten implementation. This
does not protect against other processes running as the same OS user.

Server-issued, expiring, single-use challenges bind proof to a purpose and target account.
No proof or private key reaches GUI/Skill. A previously unknown device creates one ordinary account and
personal Channel. One binding logs in automatically; multiple bindings require account selection.
Revocation terminates device-originated sessions and retains a revoked binding. Google binding
never silently merges two accounts or their content.

Channel Home offers three dismissible tips: switch coding agents using a Session; hand a design
Session to a collaborator; understand teammates' working style from their shared Sessions.
Try opens the actual Session picker or the appropriate existing consumption flow. Sharing is
always explicit: invitations cannot select or upload a recipient's Session automatically.

Invitation links expire after 24 hours, grant ordinary membership only, and can be revoked.
An app link targets the recipient's own Local Core, not the sender's loopback port. Install
fallback prompts resume the same invitation and open the Session picker.

## Interface ownership

- GUI/Skill invoke Core `POST /v1/auth/device/start`; multiple bindings return an account picker,
  with no active foreground session until `POST /v1/auth/device/login` selects an account.
- Core signs Server `/v1/auth/device/challenge`, `/accounts`, `/session` and `/bind` exchanges.
  Existing saved authenticated accounts are bound during one-time migration, never replaced.
- Core `/v1/auth/devices` lists bindings; DELETE revokes the binding and its device sessions.
  The final remaining credential cannot be removed until Google or another device is linked.
- Core `/v1/channels/:id/invite-links` creates a 24-hour ordinary-member capability;
  `/v1/invite-links/accept` joins and selects the target organization. Owners/admins can revoke.
- GUI consumes `colab://join?token=…&action=share-session` or its own Core bootstrap `?join=…`.
  Pending invitations wait for account selection and clear only on successful acceptance or expiry.
- Home preferences are account-scoped local preferences, not shared Channel content. Success
  retires the relevant tip; canceling the picker does not. Four distinct exposure days tuck ignored
  tips away; View all use cases keeps them recoverable.

## Verification gates

- Fresh isolated installation creates exactly one account and Channel, including concurrent retry.
- Challenge replay, expiry, wrong key/purpose/account fail.
- Multiple device bindings require selection; account data and runtime routing remain isolated.
- Device unbinding invalidates its access/refresh sessions and prevents automatic re-binding.
- New Google identity links to the current auto-created account; existing Google identity selects
  its existing account without merging content.
- Tips dismiss persist per account; clicking Try alone does not count as success.
- Invite installation/join/share flow requires user source selection and handles expiry/revocation.
- Commit verified source before publishing any changed artifact.
