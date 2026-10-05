import { useLayoutEffect, useRef } from "react";
import type { AgentRequestStatus } from "@/features/messages/types";
import { resumeOperation } from "./telemetry";
/** Observe live terminal transitions after React commit; don't fabricate delivery for history. */
export function useAgentResultObservation(requests: AgentRequestStatus[]) {
  const previous=useRef(new Map<string,string>());
  useLayoutEffect(() => {
    for (const request of requests) {
      const before=previous.current.get(request.id);
      if (before && before!==request.state && ["succeeded","failed"].includes(request.state) && request.traceContext) {
        const operation=resumeOperation("agent.result.presented",request.traceContext,{path:"desktop/ui/src/api/agent-result-observation.ts",function:"useAgentResultObservation"});
        operation?.span.setAttribute("colab.request_id",request.id);
        operation?.finish(request.state==="failed"?"error":"success","agent.result.state_committed");
      }
      previous.current.set(request.id,request.state);
    }
  },[requests]);
}
