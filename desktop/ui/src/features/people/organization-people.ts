import { useEffect, useState } from "react";
import { runOperation } from "@/api/operation-runner";
export type Person = {userId?: string; memberId?: string; email: string; displayName?: string; avatarUrl?: string; username?: string; department?: string; identity?: {provider: string; subject: string}};
export const personLabel = (person: Person) => person.displayName || person.username || person.email;
export const personKey = (person: Person) => person.memberId || (person.identity ? `directory:${person.identity.provider}:${person.identity.subject}` : person.userId || person.email);
/** All consumers use the same provider-neutral Core endpoint. Empty queries never search. */
export function useOrganizationPeople(channelId: string | undefined, query: string, enabled: boolean) {
  const [state, setState] = useState<{query: string; rows: Person[]; loading: boolean; error: string}>({query:"",rows:[],loading:false,error:""});
  const term=query.trim();
  useEffect(()=>{
    if(!enabled || !channelId || !term){setState({query:term,rows:[],loading:false,error:""});return;}
    const controller=new AbortController();setState({query:term,rows:[],loading:true,error:""});
    const timer=setTimeout(()=>void runOperation("members.search",async operation=>{
      try {const response=await operation.fetch(`/v1/channels/${channelId}/organization/people?q=${encodeURIComponent(term)}`,{signal:controller.signal});
        if(!response.ok)throw new Error("Could not search people. Please try again.");
        const rows:Person[]=await response.json();if(!controller.signal.aborted)setState({query:term,rows,loading:false,error:""});
      }catch(reason){if(!controller.signal.aborted){operation.fail();setState({query:term,rows:[],loading:false,error:reason instanceof Error?reason.message:"Could not search people."});}}
    }),200);
    return()=>{clearTimeout(timer);controller.abort();};
  },[channelId,term,enabled]);
  // A previous request's results/errors must never describe a new or empty query.
  return enabled && term && state.query===term ? state : {query:term,rows:[],loading:Boolean(enabled&&term),error:""};
}
export function mentionPeople(rows: Person[], query: string): Person[] {
  const term=query.trim().toLocaleLowerCase();if(!term)return rows.slice(0,3);
  const exact=rows.filter(p=>[p.displayName,p.username,p.email].some(value=>value?.toLocaleLowerCase()===term));
  return exact.length?exact:rows.slice(0,3);
}
