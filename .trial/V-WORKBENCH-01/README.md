# Operation Workbench acceptance

Settings opens the independently built Operation Workbench frontend at `/operation-workbench/`, hosted by Local Core with the same browser authentication. First module: Skill Feedbacks. Asset lists and raw fragments retain Server owner/explicit-reviewer authorization; builtin Agent Colab requires an explicit reviewer grant.

Published GUI 0.1.173-dev and Workbench 0.1.3-dev through the canonical signed R2 channel. Both passed complete public size/SHA-256 readback. Workbench: 381509 bytes, SHA-256 `fbd015e99a467532dd255d2ad5a09d647c2a28a28608eb30d667791cb89a4069`. Promotion 0.1.233-dev retained concurrent Core/Skill releases instead of downgrading them.

Installed desktop acceptance (2026-10-10): Settings entry opened the separate frontend; official Skill count/list, positive ignored comment, rendered Markdown/YAML, and raw Session reader passed. Reader displayed prior queries 1/2/3, current query, collapsed tools and final assistant reply from the dedicated test fixture. Check updates visibly returned up-to-date. Shared utility styles are compiled explicitly into this artifact.

Installed components during final validation: Core 0.1.120-dev, GUI 0.1.173-dev, Skill 0.1.68-dev, Workbench 0.1.3-dev, Shell 0.1.23-dev. Workbench-only signed update preserved Core PID and every component version. Missing/malformed artifact handling is covered by installer tests. No Shell or Server release was needed.

Security acceptance: no-auth feedback API returned 401, invalid Host on Workbench returned 400. Existing Server feedback owner/reviewer checks remain in effect. Feedback capture remains disabled; this task uploaded no real user conversation.

Checks: feedback component tests 3, installer tests 3, publisher tests 4; both frontend TypeScript checks, cargo check, Core security test and trace registry check (172 operations) passed. Final independent frontend build repeated TypeScript/build validation. Private execution logs remain ignored.


## Separate-window feedback lists and access management (2026-10-10)

Published promotion 0.1.238-dev: GUI 0.1.177-dev, Workbench 0.1.4-dev, Core 0.1.123-dev. Server 0.1.19 deployed and readiness passed. Existing Shell 0.1.23-dev supports a separate native window; no Shell release required. The desktop Settings click opens Workbench without navigating the Colab window. Closing Workbench returned to the same selected Canvas and open Settings; reopening showed the directly visible evaluation list. Shadcn Button/Badge/Separator/Field/Dialog primitives replace the card grid and nested feedback entry.

Permissions are asset-scoped Server grants, not a frontend account allow-list. The official asset currently has one account, Zhiyuan Yu, with manager/reviewer roles. Its live access dialog was opened and left visible with the registered-account-email grant form. Shared Skill owners manage their own reviewer grants. Reviewers cannot delegate; revoke immediately removes review authorization. Server records mutation audit events. Migration 47 seeds builtin managers from existing operator grants once; environment bootstrap cannot overwrite GUI-managed grants on restart.

Verified four feedback UI tests (including direct inline item rendering), isolated PostgreSQL grant/revoke/reviewer-denial/nonexistent-account tests, frontend TypeScript/build checks, Server/Core cargo check and 176-operation registry check. Installed access list matched the actual single-account grant; unauthenticated mutation returned 401. No additional real account was granted access during acceptance. Raw conversation evidence remained the previous synthetic fixture.
