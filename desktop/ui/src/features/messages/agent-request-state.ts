export type AgentRequestState="awaiting_owner"|"queued"|"running"|"succeeded"|"failed"|"rejected";
export type AgentRequestStatus={id:string;state:AgentRequestState;prompt:string;triggerMessageId?:string;targetName?:string};

const progress:Record<AgentRequestState,number>={awaiting_owner:0,queued:1,running:2,succeeded:3,failed:3,rejected:3};

/** Late HTTP/WebSocket responses cannot regress a request the runtime already advanced. */
export function mergeAgentRequest(current:AgentRequestStatus|undefined,incoming:AgentRequestStatus){
  if(!current||progress[incoming.state]>=progress[current.state])return {...current,...incoming};
  return {...incoming,...current};
}

export function mergeAgentRequestLists(current:AgentRequestStatus[],incoming:AgentRequestStatus[]){
  const previous=new Map(current.map(item=>[item.id,item]));
  return incoming.map(item=>mergeAgentRequest(previous.get(item.id),item));
}
