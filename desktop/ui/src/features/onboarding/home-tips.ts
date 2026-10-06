export const tipRoles = ["Individual", "Collaborator", "Team lead", "Reviewer", "Skill sharing"] as const;
export const homeTips = [
  { id: "switch-agent", role: "Individual", text: "Agent quota exhausted? Share your conversation and continue with another Agent." },
  { id: "handoff-design", role: "Collaborator", text: "Design ready? Hand the full Agent conversation to a collaborator to implement and verify." },
  { id: "working-style", role: "Team lead", text: "Understand teammates’ Agent working style by exploring their shared conversations." },
  { id: "get-unstuck", role: "Individual", text: "Stuck? Let another Agent pick up where yours got blocked." },
  { id: "take-over", role: "Collaborator", text: "Taking over someone’s work? Start with the conversation behind it." },
  { id: "team-update", role: "Team lead", text: "Get a team update without asking everyone to write one." },
  { id: "review-reasoning", role: "Reviewer", text: "Review the reasoning behind a decision—not just the final document." },
  { id: "remote-check", role: "Collaborator", text: "Need a check on a teammate’s machine? Ask their Agent." },
  { id: "reuse-skill", role: "Skill sharing", text: "A teammate solved this once. Reuse their Skill." },
] as const;

export const sessionTasks: Record<string, string> = {
  "working-style": "Explore these shared conversations to describe the collaborators’ Agent working styles. Ground observations in concrete examples, distinguish facts from inference, and avoid inferring sensitive personal attributes.",
  "take-over": "Help me take over this work. Explain the goal, decisions, attempts, current state, unfinished work and safe next steps. Do not modify files until I give a specific implementation instruction.",
  "team-update": "Summarize recent team work from the selected conversations: progress, key decisions, risks, blockers and next steps. State the covered dates and each source’s last sync time; do not assume missing or stale records represent all team activity. Preserve source references so I can ask follow-up questions.",
  "review-reasoning": "Review the reasoning behind this work: constraints, alternatives considered, decision rationale, trade-offs and unresolved assumptions. Cite the relevant conversation evidence and identify missing context rather than guessing. Do not modify files.",
};
