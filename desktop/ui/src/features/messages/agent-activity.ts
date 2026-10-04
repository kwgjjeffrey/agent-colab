import type { AgentRequestStatus } from "./types";

/** Request state is durable; duplicate requests for one Agent collapse into one typing identity. */
export function activeAgentNames(requests:AgentRequestStatus[]){
  return [...new Set(requests.filter(request=>request.state==="running").map(request=>request.targetName))];
}

export function agentActivityLabel(names:string[]){
  if(!names.length)return "";
  return `${names.join(", ")} ${names.length===1?"is":"are"} working…`;
}
