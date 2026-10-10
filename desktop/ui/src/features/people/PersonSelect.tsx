import { useEffect, useId, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useOrganizationPeople, personLabel as label, type Person } from "./organization-people";
export type { Person } from "./organization-people";
export function PersonSelect({channelId, enterprise, excluded, disabled}: {channelId: string; enterprise: boolean; excluded: string[]; disabled?: boolean}) {
  const [query,setQuery]=useState(""); const [selected,setSelected]=useState<Person>();
  const [open,setOpen]=useState(false);const [active,setActive]=useState(-1);
  const {rows,loading,error}=useOrganizationPeople(channelId,query,open && !selected);
  const input=useRef<HTMLInputElement>(null);const id=useId();
  useEffect(()=>{const form=input.current?.form;const reset=()=>{setQuery("");setSelected(undefined);setOpen(false);};form?.addEventListener("reset",reset);return()=>form?.removeEventListener("reset",reset);},[]);
  useEffect(()=>{input.current?.setCustomValidity(enterprise && !selected ? "Select a person from your organization." : "");},[enterprise,selected]);
  const email=selected?.email || (!enterprise && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query.trim())?query.trim():"");
  const allowed=rows.filter(p=>!excluded.includes(p.email));
  function choose(p:Person){setSelected(p);setQuery(label(p));setOpen(false);}
  return <div className="relative" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
    <div className="flex h-9 min-w-0 items-center gap-1 rounded-lg border border-input bg-transparent px-2 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
    {selected && <div className="flex min-w-0 max-w-full items-center gap-2 rounded-full bg-muted px-2 py-0.5 text-sm" data-slot="selected-person">
      <Avatar className="size-6"><AvatarImage src={selected.avatarUrl}/><AvatarFallback>{label(selected).slice(0,1)}</AvatarFallback></Avatar>
      <span className="truncate">{label(selected)}</span><span className="truncate text-muted-foreground">{selected.username || selected.email}</span>
      <Button type="button" variant="ghost" size="icon-xs" className="shrink-0" disabled={disabled} aria-label="Clear selected person" onClick={()=>{setSelected(undefined);setQuery("");input.current?.focus();setOpen(true);}}>×</Button>
    </div>}
    <Input className={`h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:border-transparent focus-visible:ring-0 ${selected ? "w-0" : "w-full"}`} ref={input} role="combobox" aria-label={enterprise?"Person":"Person or email"} aria-expanded={open} aria-controls={id} aria-autocomplete="list" aria-activedescendant={active>=0?`${id}-${active}`:undefined}
      placeholder={selected?undefined:enterprise?"Name / pinyin / username…":"Name or email…"} value={selected?"":query} disabled={disabled} required={!email} readOnly={Boolean(selected)}
      onFocus={()=>{if(!selected)setOpen(true);}} onChange={e=>{setQuery(e.target.value);setSelected(undefined);setOpen(true);}}
      onKeyDown={e=>{if(e.key==="Escape")setOpen(false);if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();setOpen(true);setActive(i=>allowed.length?(i+(e.key==="ArrowDown"?1:-1)+allowed.length)%allowed.length:-1);}if(e.key==="Enter"&&open&&active>=0){e.preventDefault();choose(allowed[active]);}}}/>
    </div>
    <input type="hidden" name="email" value={email}/><input type="hidden" name="identity" value={selected?.identity?JSON.stringify(selected.identity):""}/>
    {open && <div id={id} role="listbox" className="absolute top-full z-50 max-h-64 w-full overflow-auto rounded-b-lg border bg-popover p-1 shadow-md">
      {!query.trim()?<p className="p-2 text-sm text-muted-foreground">Type a name or username to search.</p>:loading?<p role="status" className="p-2 text-sm">Searching…</p>:error?<p role="alert" className="p-2 text-sm text-destructive">{error}</p>:<>
        {rows.map(p=>{const taken=excluded.includes(p.email);const index=allowed.indexOf(p);return <button type="button" role="option" id={index>=0?`${id}-${index}`:undefined} aria-selected={selected?.email===p.email} aria-disabled={taken} disabled={taken} key={p.identity?`${p.identity.provider}:${p.identity.subject}`:p.userId || p.email}
          className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm disabled:opacity-50 ${active===index&&!taken?"bg-accent":"hover:bg-accent"}`} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(p)}>
          <Avatar className="size-8"><AvatarImage src={p.avatarUrl}/><AvatarFallback>{label(p).slice(0,1)}</AvatarFallback></Avatar>
          <span><span className="block font-medium">{label(p)}</span><span className="block text-xs text-muted-foreground">{p.username || p.email}{p.department?` · ${p.department}`:""}</span></span>{taken&&<span className="ml-auto text-xs">Already added</span>}
        </button>;})}
        {!rows.length&&<p className="p-2 text-sm text-muted-foreground">No matching people.</p>}
        {!enterprise&&email&&!selected&&!excluded.includes(email)&&<button type="button" className="w-full p-2 text-left text-sm" onMouseDown={e=>e.preventDefault()} onClick={()=>choose({email})}>Invite {email}</button>}
      </>}
    </div>}
  </div>;
}
