import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { runOperation } from "@/api/operation-runner";
import { initializeTelemetry } from "@/api/telemetry";
import { FeedbackAccess } from "./FeedbackAccess";
import { SkillFeedback } from "@/features/feedback/SkillFeedback";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import "./workbench.css";
declare const __WORKBENCH_VERSION__: string;
void initializeTelemetry({serviceName:"colab-operation-workbench", version:__WORKBENCH_VERSION__});
type Asset = { assetKey: string; name: string; stats: { totalFeedbacks: number; ratingCounts: { positive: number; negative: number; unrated: number }; statusCounts: { unresolved: number; resolved: number; ignored: number } } };
async function api<T>(path: string, body?: unknown): Promise<T> {
  const id=path.includes("list-assets")?"workbench.assets":path.includes("operation-workbench/update")?"workbench.update":path.includes("installation")?"workbench.check-update":"workbench.account";
  return runOperation(id, async operation => {
  const r = await operation.fetch(path, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? {} : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) throw new Error(r.status === 401 ? "请先在 Colab 登录，然后刷新此页面。" : r.status === 403 ? "当前账户没有查看权限。" : `读取失败（${r.status}）`);
  return r.json();
  });
}
function App() {
  const [assets, setAssets] = useState<Asset[]>([]), [cursor, setCursor] = useState<string>(), [account, setAccount] = useState<string>(), [selected, setSelected] = useState<Asset>(), [loading, setLoading] = useState(true), [error, setError] = useState<string>(), [updateMessage, setUpdateMessage] = useState<string>(), [updating, setUpdating] = useState(false), [hasUpdate, setHasUpdate] = useState(false);
  async function load(next?: string) {
    setLoading(true); setError(undefined);
    try {
      const auth = await api<{ authenticated: boolean; user?: { id: string; displayName?: string } }>("/v1/auth/status");
      if (!auth.authenticated) throw new Error("请先在 Colab 登录，然后刷新此页面。");
      const result = await api<{ items: Asset[]; nextCursor?: string }>("/v1/feedbacks/list-assets", { limit: 100, cursor: next });
      result.items.sort((a,b)=>(a.assetKey==="builtin:agent-colab"?-1:b.assetKey==="builtin:agent-colab"?1:a.name.localeCompare(b.name)));
      setSelected(previous => previous && result.items.some(a => a.assetKey === previous.assetKey) ? previous : result.items.find(a => a.stats.totalFeedbacks > 0) ?? result.items[0]);
      setAccount(auth.user?.displayName); setAssets(previous => next ? [...previous, ...result.items] : result.items); setCursor(result.nextCursor);
    } catch (e) { setError(String(e)); } finally { setLoading(false); }
  }
  useEffect(() => {
    void load();
    // Refresh the account scope without interrupting an open feedback reader.
    const focus = () => {
      void load();
      void fetch("/operation-workbench/workbench.json", { cache: "no-store" }).then(r => r.json()).then(v => { if (v.version !== __WORKBENCH_VERSION__) location.reload(); }).catch(() => {});
    };
    window.addEventListener("focus", focus); return () => window.removeEventListener("focus", focus);
  }, []);
  async function check() {
    setUpdating(true); setUpdateMessage("正在检查更新…");
    try {
      const v = await api<{ components: Record<string, { updateAvailable?: boolean; latestVersion?: string }> }>("/v1/system/installation?refresh=true");
      const c = v.components["operation-workbench"]; if (!c?.latestVersion) throw new Error("发布通道未提供 Workbench 版本信息。"); setHasUpdate(Boolean(c?.updateAvailable)); setUpdateMessage(c?.updateAvailable ? `可更新至 ${c.latestVersion}` : "已是最新版本");
    } catch (e) { setUpdateMessage(String(e)); } finally { setUpdating(false); }
  }
  async function update() {
    setUpdating(true); setUpdateMessage("正在下载并验证更新…");
    try { await api("/v1/system/operation-workbench/update", {}); location.reload(); }
    catch (e) { setUpdateMessage(String(e)); setUpdating(false); }
  }
  return <div className="workbench" data-trace-region="operation-workbench">
    <aside className="workbench-nav"><a href="/operation-workbench/" className="brand">Operation Workbench</a><Button variant="secondary" aria-current="page" onClick={()=>void load()}>Skill Feedbacks</Button>
      <footer><small>{__WORKBENCH_VERSION__}</small><Button variant="outline" size="sm" data-trace-target="workbench.check-update workbench.update" disabled={updating} onClick={() => void (hasUpdate ? update() : check())}>{updating ? "处理中…" : hasUpdate ? "更新 Workbench" : "检查更新"}</Button>{updateMessage && <p role="status">{updateMessage}</p>}</footer>
    </aside>
    <main><header className="workbench-header"><div><h1>Skill Feedbacks</h1><p>Skill 使用反馈</p></div><span>{account}</span></header>
      {error ? <section role="alert">{error}<Button variant="outline" onClick={() => void load()}>重试</Button></section> : <div className="feedback-workspace">
        <section className="skill-list" aria-label="Skills" data-trace-target="workbench.assets workbench.account">
          <h2>Skills</h2>{assets.map(a => <Button variant={selected?.assetKey === a.assetKey ? "secondary" : "ghost"} key={a.assetKey} className="skill-row" onClick={() => setSelected(a)}>
            <span className="truncate">{a.assetKey === "builtin:agent-colab" ? "Agent Colab（官方）" : a.name}</span><Badge variant="outline">{a.stats.totalFeedbacks}</Badge>
          </Button>)}
          {cursor && <Button variant="ghost" disabled={loading} onClick={() => void load(cursor)}>加载更多 Skill</Button>}
        </section>
        <section className="feedback-list-pane">{selected ? <><div className="feedback-heading"><h2>{selected.assetKey === "builtin:agent-colab" ? "Agent Colab（官方）" : selected.name}</h2><p>{selected.stats.totalFeedbacks} 条反馈 · {selected.stats.statusCounts.unresolved} 条未解决 · 点赞 {selected.stats.ratingCounts.positive} · 点踩 {selected.stats.ratingCounts.negative}</p><div className="mt-3"><FeedbackAccess assetKey={selected.assetKey}/></div></div><SkillFeedback key={selected.assetKey} assetKey={selected.assetKey} inline /></> : !loading && <p>当前账户暂无可查看的 Skill 反馈资产。官方 Skill 需要明确授权。</p>}</section>
      </div>}{loading && <p role="status">正在读取…</p>}
    </main>
  </div>;
}
createRoot(document.getElementById("root")!).render(<App />);
