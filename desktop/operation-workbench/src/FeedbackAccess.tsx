import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { trackedFetch } from "@/api/request-activity";

type Access = {canManage:boolean; members:{userId:string; name:string; email:string; roles:string[]}[]};
export function FeedbackAccess({assetKey}:{assetKey:string}) {
  const [open,setOpen]=useState(false),[data,setData]=useState<Access>(),[email,setEmail]=useState(""),[error,setError]=useState<string>(),[busy,setBusy]=useState(false);
  useEffect(()=>{setOpen(false);setData(undefined);setEmail("");},[assetKey]);
  async function request(action?:"grant"|"revoke",target?:string) {
    setBusy(true);setError(undefined);
    try {
      const r=await trackedFetch(`/v1/feedbacks/${action?"update":"list"}-feedback-access`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({assetKey,...(action?{action,email:target}: {})})});
      if(!r.ok) { const detail=await r.text();throw new Error(r.status===403?"你没有管理此 Skill 反馈权限的授权。":detail.includes("feedback_account_not_found")?"未找到这个邮箱对应的 Colab 账号，请让对方先注册。":"权限操作失败，请重试。"); }
      setData(await r.json());if(action==="grant")setEmail("");
    }catch(e){setError(String(e));}finally{setBusy(false);}
  }
  return <><Button variant="outline" size="sm" onClick={()=>{setOpen(true);void request();}}>查看与管理权限</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Skill 反馈权限</DialogTitle><DialogDescription>以下账号可以查看评价及原始任务片段。Owner 和 Manager 可以管理 Reviewer；Reviewer 无权转授权。</DialogDescription></DialogHeader>
      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
        {data?.members.map(m=><div key={m.userId} className="flex items-center justify-between gap-4 border-b py-3"><div className="min-w-0"><p>{m.name}</p><p className="text-xs text-muted-foreground">{m.email}</p><div className="mt-2 flex gap-2">{m.roles.map(role=><Badge variant="secondary" key={role}>{role}</Badge>)}</div></div>{data.canManage&&m.roles.includes("reviewer")&&!m.roles.some(r=>r==="owner"||r==="manager")&&<Button variant="ghost" size="sm" disabled={busy} onClick={()=>void request("revoke",m.email)}>移除查看权限</Button>}</div>)}
        {data?.canManage&&<form className="flex flex-col gap-2" onSubmit={e=>{e.preventDefault();void request("grant",email.trim());}}><FieldGroup><Field><FieldLabel htmlFor="reviewer-email">添加 Reviewer（Colab 账号邮箱）</FieldLabel><div className="flex gap-2"><Input id="reviewer-email" type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/><Button type="submit" disabled={busy||!email.trim()}>添加</Button></div></Field></FieldGroup></form>}
        {data&&!data.canManage&&<p className="text-sm text-muted-foreground">你可以查看名单；管理权限仅属于 Owner 或 Manager。</p>}
        {busy&&<p role="status">正在读取或保存权限…</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}<Button variant="ghost" onClick={()=>void request()}>重试</Button></p>}
      </div>
    </DialogContent></Dialog></>;
}
