import { runOperation } from "@/api/operation-runner";
import { traceTargets } from "@/api/trace-locators";
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { PreviewMarkdown } from '@/features/workspace/PreviewMarkdown';
import { SessionPreview } from '@/features/sessions/SessionPreview';
import { trackedFetch } from '@/api/request-activity';

type Feedback = { feedbackId: string; rating: 'positive'|'negative'|'unrated'; status: string; capturedAt: string; comment?: string; analysisStatus: string; evidenceAvailable?: boolean };
async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await trackedFetch(path, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)});
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}
/** Asset aggregation stays independent of Channel placement. Evidence remains owner-authorized. */
export function SkillFeedback({shareId, assetKey: providedAssetKey}: {shareId?: string; assetKey?: string}) {
  const [refresh,setRefresh]=useState(0);
  const [assetKey,setAssetKey]=useState<string>();
  const [count,setCount]=useState<number>();
  const [open,setOpen]=useState(false);
  const [items,setItems]=useState<Feedback[]>([]);
  const [cursor,setCursor]=useState<string>();
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string>();
  const [sessionId,setSessionId]=useState<string>();
  useEffect(()=>{
    let active=true;setAssetKey(undefined);setCount(undefined);setError(undefined);setOpen(false);setItems([]);
    void (async()=>{
      if (!shareId && !providedAssetKey) throw new Error("Missing feedback asset");
      const binding=providedAssetKey ? undefined : await trackedFetch(`/v1/shares/${shareId}/asset`);
      if (binding && !binding.ok) throw new Error(await binding.text());
      const key=providedAssetKey ?? `asset:${(await binding!.json() as {assetId:string}).assetId}`;
      const result=await post<{totalMatching:number}>('/v1/feedbacks/list-feedbacks',{assetKey:key,limit:1,include:'rating'});
      if(active){setAssetKey(key);setCount(result.totalMatching);}
    })().catch(reason=>{if(active)setError(String(reason));});
    return ()=>{active=false;};
  },[shareId,providedAssetKey,refresh]);
  async function load(next?:string){
    if(!assetKey)return;setLoading(true);setError(undefined);
    return runOperation("feedback.list",async(operation)=>{
    try{const value=await post<{items:Feedback[];nextCursor?:string;totalMatching:number}>('/v1/feedbacks/list-feedbacks',{assetKey,limit:20,include:'metadata,rating,comment',cursor:next});setItems(previous=>next?[...previous,...value.items]:value.items);setCursor(value.nextCursor);setCount(value.totalMatching);}
    catch(reason){operation.fail();setError(String(reason));}finally{setLoading(false);}
    });
  }
  return <>
    <Button data-trace-target={traceTargets("feedback.list")} variant="outline" disabled={!assetKey} onClick={()=>{setOpen(true);void load();}}>查看反馈{count===undefined?'…':`（${count}）`}</Button>
    {!open&&error&&<p role="alert" className="text-sm text-destructive">反馈读取失败：{error}<Button variant="outline" onClick={()=>setRefresh(value=>value+1)}>重试</Button></p>}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader><DialogTitle>Skill 反馈（{count ?? '…'}）</DialogTitle><DialogDescription>消费方 Agent 的使用评价和任务记录</DialogDescription></DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto space-y-4">
          {items.map(item=><details key={item.feedbackId} className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm">{item.rating==='positive'?'点赞':item.rating==='negative'?'点踩':'暂无评价'} · {item.status==='resolved'?'已解决':item.status==='ignored'?'已忽略':'未解决'} · {new Date(item.capturedAt).toLocaleString()}</summary>
            {item.comment?<PreviewMarkdown>{item.comment}</PreviewMarkdown>:<p className="my-3 text-sm text-muted-foreground">{item.analysisStatus==='pending'?'评价尚在处理':item.analysisStatus==='failed'?'端侧分析失败，原始任务片段可供分析':'未启用端侧评价，原始任务片段可供分析'}</p>}
            <Button variant="outline" size="sm" disabled={item.evidenceAvailable===false} onClick={()=>setSessionId(item.feedbackId)}>{item.evidenceAvailable===false ? "任务片段正在上报" : "查看原始任务片段"}</Button>
          </details>)}
          {!loading&&!error&&items.length===0&&<p className="text-sm text-muted-foreground">还没有反馈。</p>}
          {error&&<p role="alert" className="text-sm text-destructive">{error}<Button variant="outline" onClick={()=>void load()}>重试</Button></p>}
          {loading&&<p role="status">正在读取反馈…</p>}
          {cursor&&<Button variant="outline" disabled={loading} onClick={()=>void load(cursor)}>加载更多</Button>}
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(sessionId)} onOpenChange={value=>{if(!value)setSessionId(undefined);}}>
      <DialogContent className="flex h-[80vh] flex-col sm:max-w-3xl">
        <DialogHeader><DialogTitle>原始任务片段</DialogTitle><DialogDescription>任务及此前最多三段用户 query</DialogDescription></DialogHeader>
        {sessionId&&<SessionPreview id={sessionId} feedback />}
      </DialogContent>
    </Dialog>
  </>;
}
