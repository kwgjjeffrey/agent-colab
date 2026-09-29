import { FormEvent, StrictMode, useEffect, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import packageMetadata from "../package.json";
import {
  BotIcon,
  CheckIcon,
  LogOutIcon,
  LoaderCircleIcon,
  PlusIcon,
  RefreshCwIcon,
  Share2Icon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilesView, type FileShare } from "@/features/files/FilesView";
import type { AgentTarget } from "@/features/agent/AgentPromptDialog";
import { SessionsView, type SessionShare } from "@/features/sessions/SessionsView";
import { SkillsView } from "@/features/skills/SkillsView";
import { QuickShareDialog } from "@/features/transfers/QuickShareDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import "./styles.css";
import { requestActivitySnapshot, subscribeRequestActivity, trackedFetch } from "@/api/request-activity";

declare global {
  interface Window {
    colabHost: {
      isElectron: boolean;
      openExternal(url: string): Promise<void>;
      choosePath(options: {
        directory: boolean;
        title: string;
      }): Promise<string | null>;
      onDeepLink(callback: (urls: string[]) => void): () => void;
      showAndFocus(): Promise<void>;
      markUiReady(): void;
    };
  }
}

const host = window.colabHost ?? {
  isElectron: false,
  openExternal: async (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  },
  choosePath: async (options: { directory: boolean; title: string }) => {
    const response = await trackedFetch(
      `/v1/system/choose-path?directory=${options.directory}`,
    );
    if (!response.ok) throw new Error(await response.text());
    return ((await response.json()) as { path: string | null }).path;
  },
  onDeepLink: (_callback: (urls: string[]) => void) => () => undefined,
  showAndFocus: async () => {
    window.focus();
  },
  markUiReady: () => undefined,
};

type User = { displayName?: string; email: string; avatarUrl?: string };
type Auth = { authenticated: boolean; user?: User; error?: string };
type Channel = {
  id: string;
  name: string;
  icon?: string;
  role: string;
  createdAt: string;
};
type Member = {
  memberId?: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  role: string;
  status: "joined" | "pending";
};
type Account = {
  userId: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  active: boolean;
};
type OrganizationPerson = {
  userId: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
};
type Organization = {
  id: string;
  memberId: string;
  name: string;
  role: string;
  createdAt: string;
  active: boolean;
};
type AddMemberResult = {
  status: "joined" | "invited";
  emailDelivery: "not_required" | "queued";
};
type InstallationStatus = {
  installed: boolean;
  version?: string;
  latestVersion?: string;
  updateAvailable?: boolean;
  targets: Record<string, { installed: boolean; path: string }>;
  defaultAgent?: AgentTarget;
  components?: Record<string, { installedVersion?: string; latestVersion?: string; updateAvailable?: boolean; downloadUrl?: string }>;
};

type InstallationAction = "checking" | "updating";
type InstallationMessage = { kind: "success" | "error"; text: string };

function App() {
  const [auth, setAuth] = useState<Auth>({ authenticated: false });
  const [authResolved, setAuthResolved] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateOrganization, setShowCreateOrganization] = useState(false);
  const [showQuickShare, setShowQuickShare] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [members, setMembers] = useState<Member[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [fileShares, setFileShares] = useState<FileShare[]>([]);
  const [sessionShares, setSessionShares] = useState<SessionShare[]>([]);
  const [installation, setInstallation] = useState<InstallationStatus>();
  const [installationAction, setInstallationAction] = useState<InstallationAction>();
  const [installationMessage, setInstallationMessage] = useState<InstallationMessage>();
  const [installationMutationBusy, setInstallationMutationBusy] = useState(false);
  const installationBusy = installationAction !== undefined || installationMutationBusy;
  const activeRequests = useSyncExternalStore(subscribeRequestActivity, requestActivitySnapshot);
  const selected = channels.find((channel) => channel.id === selectedId);

  async function refreshAuth(initial = false) {
    try {
      const response = await fetch("/v1/auth/status");
      if (response.ok) {
        setAuth(await response.json());
        setAuthResolved(true);
      } else if (initial) {
        setAuth({ authenticated: false, error: await response.text() });
        setAuthResolved(true);
      }
    } catch (reason) {
      if (initial) {
        setAuth({ authenticated: false, error: String(reason) });
        setAuthResolved(true);
      }
    }
  }
  async function refreshChannels() {
    const response = await trackedFetch("/v1/channels");
    if (!response.ok) throw new Error(await response.text());
    const next: Channel[] = await response.json();
    setChannels(next);
    setSelectedId((current) =>
      current && next.some((channel) => channel.id === current)
        ? current
        : next[0]?.id,
    );
  }
  async function refreshAccounts() {
    try {
      setAccounts(
        await (await trackedFetch("/v1/auth/accounts")).json(),
      );
    } catch {
      /* Local Core may be starting. */
    }
  }
  async function loadInstallation(refresh = false) {
    const response = await api(`/v1/system/installation${refresh ? "?refresh=true" : ""}`);
    const next: InstallationStatus = await response.json();
    setInstallation(next);
    return next;
  }
  async function checkInstallation() {
    setInstallationAction("checking");
    setInstallationMessage(undefined);
    try {
      const next = await loadInstallation(true);
      const updates = Object.entries(next.components ?? {})
        .filter(([, component]) => component.updateAvailable)
        .map(([id]) => id);
      setInstallationMessage({
        kind: "success",
        text: updates.length > 0
          ? `Updates available: ${updates.join(", ")}.`
          : "All Colab resources are up to date.",
      });
    } catch (reason) {
      setInstallationMessage({ kind: "error", text: `Update check failed: ${String(reason)}` });
    } finally {
      setInstallationAction(undefined);
    }
  }
  async function updateInstallation() {
    setInstallationAction("updating");
    setInstallationMessage(undefined);
    try {
      const response = await api("/v1/system/update", { method: "POST" });
      const result = await response.json() as { restartScheduled?: boolean; previousPid?: number };
      if (result.restartScheduled) {
        setInstallationMessage({ kind: "success", text: "Colab resources updated. Restarting Local Core…" });
        // The installation-scoped loopback origin and auth cookie remain stable across a managed
        // Core restart. Poll only while this explicit update is in progress; this is bounded and
        // browser-native, so neither Electron nor a permanent background timer is required.
        const deadline = Date.now() + 30_000;
        let restarted = false;
        await new Promise((resolve) => window.setTimeout(resolve, 1_400));
        while (Date.now() < deadline) {
          try {
            const statusResponse = await fetch(`/v1/status?restartProbe=${Date.now()}`, {
              cache: "no-store",
            });
            if (statusResponse.ok) {
              const status = await statusResponse.json() as { pid?: number };
              if (status.pid && status.pid !== result.previousPid) {
                restarted = true;
                break;
              }
            }
          } catch {
            // A refused connection is expected while launchd replaces the old process.
          }
          await new Promise((resolve) => window.setTimeout(resolve, 500));
        }
        if (!restarted) {
          throw new Error("Local Core did not become ready within 30 seconds");
        }
        window.location.reload();
      } else {
        await loadInstallation(true);
        setInstallationMessage({ kind: "success", text: "Colab resources installed. Restart Local Core to activate them." });
      }
    } catch (reason) {
      setInstallationMessage({ kind: "error", text: `Update failed: ${String(reason)}` });
    } finally { setInstallationAction(undefined); }
  }
  async function setAgentSkill(agent: string, installed: boolean) {
    setInstallationMutationBusy(true);
    try {
      await api(`/v1/system/agents/${agent}/${installed ? "uninstall" : "install"}`, { method: "POST" });
      await loadInstallation();
      setNotice(`Agent Colab Skill ${installed ? "uninstalled from" : "installed for"} ${agent}.`);
    } catch (reason) { setError(String(reason)); }
    finally { setInstallationMutationBusy(false); }
  }
  async function setDefaultAgent(agent: AgentTarget) {
    setInstallationMutationBusy(true);
    try {
      await api(`/v1/system/agents/${agent}/default`, { method: "POST" });
      await loadInstallation();
      setNotice(`${agent} is now the default Agent.`);
    } catch (reason) { setError(String(reason)); }
    finally { setInstallationMutationBusy(false); }
  }
  async function refreshOrganizations() {
    const response = await api("/v1/organizations");
    const next: Organization[] = await response.json();
    setOrganizations(next);
    return next;
  }
  useEffect(() => {
    void refreshAuth(true);
    void refreshAccounts();
    // Give to Agent is available outside Settings, so target availability and the default Agent
    // must be loaded with the application rather than lazily when Settings is first opened.
    void loadInstallation().catch((reason) =>
      setInstallationMessage({ kind: "error", text: `Could not load installation status: ${String(reason)}` }),
    );
    const timer = window.setInterval(() => void refreshAuth(), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    // GUI resources are independently replaceable while Electron keeps running.
    // Compare this bundle's embedded version with the active ui.json whenever the
    // window regains focus, then reload only when Local Core has switched roots.
    async function reloadIfGuiChanged() {
      try {
        const response = await fetch(`/ui.json?checkedAt=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) return;
        const active = await response.json() as { version?: string };
        if (active.version && active.version !== packageMetadata.version) window.location.reload();
      } catch {
        /* Local Core can be restarting during an artifact update. */
      }
    }
    const onFocus = () => void reloadIfGuiChanged();
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  useEffect(() => {
    host.markUiReady();
    const unlisten = host.onDeepLink(async (urls) => {
      for (const raw of urls) {
        try {
          const url = new URL(raw);
          if (url.hostname === "invitation") {
            const token = url.searchParams.get("token");
            if (token)
              localStorage.setItem("pendingOrganizationInvitation", token);
          }
        } catch {
          /* Ignore unrelated deep links. */
        }
      }
      await refreshAuth();
      await refreshAccounts();
      const accepted = await finishPendingInvitation();
      if (!accepted && localStorage.getItem("pendingOrganizationInvitation"))
        await signIn();
      await host.showAndFocus();
    });
    return unlisten;
  }, []);
  useEffect(() => {
    if (!authResolved) return;
    if (auth.authenticated) {
      void refreshOrganizations()
        .then(() => refreshChannels())
        .catch((reason) => setError(String(reason)))
        .finally(() => setInitialLoading(false));
      void finishPendingInvitation();
    } else {
      setInitialLoading(false);
    }
  }, [auth.authenticated, authResolved]);
  useEffect(() => {
    if (!selectedId) {
      setFileShares([]);
      setSessionShares([]);
      return;
    }
    void loadFileShares();
    void loadSessionShares();
    // Local jobs continue without the GUI. A small metadata poll makes their durable state
    // observable without coupling the worker to a WebSocket or the React lifecycle.
    const timer = window.setInterval(() => {
      void loadFileShares(true);
      void loadSessionShares(true);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [selectedId]);

  async function signIn(loginHint?: string) {
    setBusy(true);
    setError(undefined);
    try {
      const response = await trackedFetch(
        `/v1/auth/google/start${loginHint ? `?loginHint=${encodeURIComponent(loginHint)}` : ""}`,
      );
      if (!response.ok) throw new Error(await response.text());
      const body = await response.json();
      await host.openExternal(body.authorizationUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }
  async function switchAccount(account: Account) {
    setBusy(true);
    try {
      const response = await trackedFetch("/v1/auth/switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: account.userId }),
      });
      if (response.status === 401) {
        await signIn(account.email);
        return;
      }
      if (!response.ok) throw new Error(await response.text());
      await refreshAuth();
      await refreshAccounts();
      await refreshOrganizations();
      await refreshChannels();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      await api("/v1/auth/logout", { method: "POST" });
      setAuth({ authenticated: false });
      setChannels([]);
      setSelectedId(undefined);
      await refreshAccounts();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }
  async function createChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);
    try {
      const response = await trackedFetch("/v1/channels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: form.get("name") }),
      });
      if (!response.ok) throw new Error(await response.text());
      const channel: Channel = await response.json();
      await refreshChannels();
      setSelectedId(channel.id);
      setShowCreate(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }
  async function switchOrganization(organization: Organization) {
    if (organization.active) return;
    setBusy(true);
    setError(undefined);
    try {
      await api(`/v1/organizations/${organization.id}/activate`, {
        method: "POST",
      });
      await refreshOrganizations();
      await refreshChannels();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }
  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(undefined);
    try {
      await api("/v1/organizations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: form.get("name") }),
      });
      await refreshOrganizations();
      await refreshChannels();
      setShowCreateOrganization(false);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }
  async function api(path: string, init?: RequestInit, silent = false) {
    // Durable background reconciliation must not make the foreground loading indicator pulse.
    const response = await (silent ? fetch(path, init) : trackedFetch(path, init));
    if (!response.ok) throw new Error(await response.text());
    return response;
  }
  async function finishPendingInvitation() {
    const token = localStorage.getItem("pendingOrganizationInvitation");
    if (!token) return false;
    const status: Auth = await (
      await trackedFetch("/v1/auth/status")
    ).json();
    if (!status.authenticated) return false;
    const response = await trackedFetch(
      `/v1/organization-invitations/${encodeURIComponent(token)}/accept`,
      { method: "POST" },
    );
    if (!response.ok) {
      setError(await response.text());
      return false;
    }
    localStorage.removeItem("pendingOrganizationInvitation");
    await refreshChannels();
    return true;
  }
  async function loadMembers() {
    if (!selectedId) return;
    setMembers(await (await api(`/v1/channels/${selectedId}/members`)).json());
  }
  async function loadFileShares(silent = false) {
    if (!selectedId) return;
    setFileShares(await (await api(`/v1/channels/${selectedId}/files`, undefined, silent)).json());
  }
  async function loadSessionShares(silent = false) {
    if (!selectedId) return;
    setSessionShares(await (await api(`/v1/channels/${selectedId}/sessions`, undefined, silent)).json());
  }
  async function withdrawSession(share: SessionShare) {
    setBusy(true); setError(undefined);
    try { await api(`/v1/sessions/${share.id}`, { method: "DELETE" }); await loadSessionShares(); setNotice("Shared Session withdrawn."); }
    catch (reason) { setError(String(reason)); }
    finally { setBusy(false); }
  }
  // Files UI stays deliberately thin: it selects user intent and delegates scanning, Git pack
  // generation, persistence and synchronization to the GUI-independent Local Core API.
  // This keeps the same workflow available to the future Python Skill when Desktop is not open.
  async function chooseFiles(directory: boolean) {
    return host.choosePath({
      directory,
      title: directory
        ? "Share a folder with this Channel"
        : "Share a file with this Channel",
    });
  }
  async function shareFiles(path: string, syncExcludes: string[]) {
    if (!selectedId) return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await api(`/v1/channels/${selectedId}/files/share`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ localPath: path, syncExcludes }),
      });
      await loadFileShares();
      setNotice(
        "Files shared with this Channel. Future changes sync automatically.",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }
  async function ensureLocalFiles(share: FileShare) {
    if (share.canWithdraw) return share;
    setError(undefined);
    const response = await api(`/v1/files/${share.id}/materialize`, {
      method: "POST",
    });
    const result: FileShare = await response.json();
    await loadFileShares();
    return result;
  }
  async function withdrawFiles(share: FileShare) {
    setBusy(true);
    setError(undefined);
    try {
      await api(`/v1/files/${share.id}`, { method: "DELETE" });
      await loadFileShares();
      setNotice("Shared folder withdrawn.");
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }
  async function retryFiles(share: FileShare) {
    setError(undefined);
    await api(`/v1/files/${share.id}/retry`, { method: "POST" });
    await loadFileShares();
  }
  async function saveChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await api(`/v1/channels/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          icon: form.get("icon") || null,
        }),
      });
      await refreshChannels();
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }
  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const response = await api(`/v1/channels/${selected.id}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          role: form.get("role"),
        }),
      });
      const result: AddMemberResult = await response.json();
      formElement.reset();
      await loadMembers();
      setNotice(
        result.status === "joined"
          ? "Member added to this Channel."
          : "Invitation queued for delivery.",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }
  async function changeRole(member: Member, role: string) {
    if (!selected || !member.memberId) return;
    try {
      await api(`/v1/channels/${selected.id}/members/${member.memberId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      await loadMembers();
    } catch (reason) {
      setError(String(reason));
    }
  }
  async function removeMember(member: Member) {
    if (!selected) return;
    const target = member.memberId
      ? `members/${member.memberId}`
      : `invitations/${encodeURIComponent(member.email)}`;
    try {
      await api(`/v1/channels/${selected.id}/${target}`, { method: "DELETE" });
      await loadMembers();
    } catch (reason) {
      setError(String(reason));
    }
  }

  return (
    <TooltipProvider>
      <main className="grid min-h-screen grid-cols-[76px_1fr] bg-background text-foreground">
        {!initialLoading && activeRequests > 0 && (
          <div className="fixed top-0 right-0 left-0 z-50 flex h-8 items-center justify-center gap-2 border-b bg-background/95 text-xs font-medium shadow-sm backdrop-blur" role="status">
            <LoaderCircleIcon className="size-3.5 animate-spin" /> Loading…
          </div>
        )}
        <aside
          className="flex flex-col items-center justify-between bg-sidebar-foreground px-3 py-5"
          aria-label="Channels"
        >
          <div className="flex flex-col items-center gap-3">
            {channels.map((channel) => (
              <Tooltip key={channel.id}>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-lg"
                      variant={
                        selectedId === channel.id ? "default" : "secondary"
                      }
                      className="rounded-2xl"
                      onClick={() => setSelectedId(channel.id)}
                      aria-label={channel.name}
                    />
                  }
                >
                  {channel.icon ?? initials(channel.name)}
                </TooltipTrigger>
                <TooltipContent side="right">{channel.name}</TooltipContent>
              </Tooltip>
            ))}
            {auth.authenticated && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-lg"
                      variant="outline"
                      className="rounded-2xl border-dashed"
                      onClick={() => setShowCreate(true)}
                      aria-label="Create channel"
                    />
                  }
                >
                  <PlusIcon />
                </TooltipTrigger>
                <TooltipContent side="right">Create Channel</TooltipContent>
              </Tooltip>
            )}
          </div>
          <Popover onOpenChange={(open) => { if (open) void loadInstallation().catch((reason) => setInstallationMessage({ kind: "error", text: `Could not load installation status: ${String(reason)}` })); }}>
            <PopoverTrigger
              render={
                <Button
                  size="icon-lg"
                  variant="secondary"
                  aria-label="Settings"
                />
              }
            >
              <SettingsIcon />
            </PopoverTrigger>
            <PopoverContent side="right" align="end" className="max-h-[85vh] w-[28rem] overflow-y-auto">
              <PopoverHeader>
                <PopoverTitle>Settings</PopoverTitle>
              </PopoverHeader>
              <div className="mb-4 rounded-lg border">
                <div className="flex items-center gap-3 border-b p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Colab resources</p>
                    <p className="text-xs text-muted-foreground">Independently distributed local artifacts</p>
                  </div>
                  <Button size="sm" variant="outline" disabled={installationBusy} onClick={() => void (Object.values(installation?.components ?? {}).some((component) => component.updateAvailable) ? updateInstallation() : checkInstallation())}>
                    {installationAction === "checking"
                      ? "Checking…"
                      : installationAction === "updating"
                        ? "Updating…"
                        : Object.values(installation?.components ?? {}).some((component) => component.updateAvailable)
                          ? "Update"
                          : "Check updates"}
                  </Button>
                </div>
                {installationMessage && (
                  <p role="status" className={`border-b px-3 py-2 text-xs ${installationMessage.kind === "error" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
                    {installationMessage.text}
                  </p>
                )}
                {([['local-core','Local Core'],['desktop-ui','GUI Resources'],['colab-skill','Agent Colab Skill'],['electron-shell','Electron Shell']] as const).map(([id,label]) => {
                  const component=installation?.components?.[id];
                  return <div key={id} className="flex items-center gap-3 border-b p-3 last:border-b-0">
                    <div className="min-w-0 flex-1"><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">{component?.installedVersion ?? "Not installed"}{component?.latestVersion ? ` · Latest ${component.latestVersion}` : ""}</p></div>
                    {component?.updateAvailable && <span className="text-xs font-medium text-primary">Update available</span>}
                    {id === "electron-shell" && !host.isElectron && component?.downloadUrl && (
                      <Button size="sm" variant="outline" onClick={() => void host.openExternal(component.downloadUrl!)}>
                        Download app
                      </Button>
                    )}
                  </div>;
                })}
              </div>
              <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">Agent Skills</p>
              <div className="mb-4 divide-y rounded-lg border">
                {([['codex','Codex'],['claude','Claude Code'],['myflicker','MyFlicker']] as const).map(([id,label]) => {
                  const target = installation?.targets?.[id];
                  return <div key={id} className="flex items-center gap-3 p-3">
                    <Button size="sm" variant="ghost" aria-label={`Use ${label} as default Agent`} disabled={installationBusy || !target?.installed || installation?.defaultAgent === id} onClick={() => void setDefaultAgent(id)}>
                      {installation?.defaultAgent === id && <CheckIcon data-icon="inline-start" />}
                      {installation?.defaultAgent === id ? "Default" : "Set default"}
                    </Button>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{label}</p>
                      <p className="truncate text-xs text-muted-foreground">{target?.installed ? "Installed" : "Not installed"}</p>
                    </div>
                    <Button size="sm" variant="outline" disabled={installationBusy || !installation} onClick={() => void setAgentSkill(id, Boolean(target?.installed))}>
                      {target?.installed ? "Uninstall" : "Install"}
                    </Button>
                  </div>;
                })}
              </div>
              <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">Accounts</p>
              {auth.authenticated && (
                <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
                  <Avatar size="lg">
                    <AvatarImage src={auth.user?.avatarUrl} alt="" />
                    <AvatarFallback>
                      {initials(
                        auth.user?.displayName ?? auth.user?.email ?? "U",
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <strong className="truncate text-sm">
                      {auth.user?.displayName ?? auth.user?.email}
                    </strong>
                    <span className="truncate text-xs text-muted-foreground">
                      {auth.user?.email}
                    </span>
                  </div>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Sign out"
                    disabled={busy}
                    onClick={() => void logout()}
                  >
                    <LogOutIcon />
                  </Button>
                </div>
              )}
              {auth.authenticated && (
                <div className="mt-3 flex flex-col gap-1">
                  <p className="px-2 text-xs font-medium text-muted-foreground">
                    Organizations
                  </p>
                  {organizations.map((organization) => (
                    <Button
                      key={organization.id}
                      variant="ghost"
                      className="justify-start"
                      disabled={busy}
                      onClick={() => void switchOrganization(organization)}
                    >
                      <span className="min-w-0 flex-1 truncate text-left">
                        {organization.name}
                      </span>
                      {organization.active && <CheckIcon />}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    onClick={() => setShowCreateOrganization(true)}
                  >
                    <PlusIcon />
                    Create Organization
                  </Button>
                </div>
              )}
              {accounts
                .filter((account) => !account.active)
                .map((account) => (
                  <Button
                    key={account.userId}
                    variant="ghost"
                    className="h-auto justify-start gap-3 p-2"
                    disabled={busy}
                    onClick={() => void switchAccount(account)}
                  >
                    <Avatar>
                      <AvatarImage src={account.avatarUrl} />
                      <AvatarFallback>
                        {initials(account.displayName ?? account.email)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 text-left">
                      <strong className="block truncate">
                        {account.displayName ?? account.email}
                      </strong>
                      <small className="block truncate text-muted-foreground">
                        {account.email}
                      </small>
                    </span>
                    <RefreshCwIcon />
                  </Button>
                ))}
              <Button
                variant={auth.authenticated ? "outline" : "default"}
                disabled={busy}
                onClick={() => void signIn()}
              >
                {auth.authenticated
                  ? "Add another account"
                  : "Sign in with Google"}
              </Button>
            </PopoverContent>
          </Popover>
        </aside>
        <section className="min-w-0 px-10 py-8">
          <div className="mb-4 flex justify-end">
            <Button variant="outline" onClick={() => setShowQuickShare(true)}>
              <Share2Icon />Share my context
            </Button>
          </div>
          {initialLoading ? (
            <div className="flex min-h-[80vh] items-center justify-center" role="status">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <LoaderCircleIcon className="size-7 animate-spin" />
                <p className="text-sm">Loading your workspace…</p>
              </div>
            </div>
          ) : selected ? (
            <Tabs defaultValue="sessions" className="gap-8">
              <div className="flex items-center justify-between border-b">
                <TabsList variant="line">
                  <TabsTrigger value="sessions">Sessions</TabsTrigger>
                  <TabsTrigger value="files">Files</TabsTrigger>
                  <TabsTrigger value="skills">Skills</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>
                <Button>
                  <BotIcon data-icon="inline-start" />Ask an Agent
                </Button>
              </div>
              <TabsContent value="sessions">
                <SessionsView
                  channelId={selected.id}
                  channelName={selected.name}
                  shares={sessionShares}
                  busy={busy}
                  defaultAgent={installation?.defaultAgent ?? "codex"}
                  installedAgents={installation?.targets ?? {}}
                  onRefresh={loadSessionShares}
                  onWithdraw={withdrawSession}
                />
              </TabsContent>
              <TabsContent value="files">
                <FilesView
                  shares={fileShares}
                  busy={busy}
                  onChoose={chooseFiles}
                  onShare={shareFiles}
                  onEnsureLocal={ensureLocalFiles}
                  onWithdraw={withdrawFiles}
                  onRetry={(share) => void retryFiles(share)}
                  defaultAgent={installation?.defaultAgent ?? "codex"}
                  installedAgents={installation?.targets ?? {}}
                />
              </TabsContent>
              <TabsContent value="skills">
                <SkillsView
                  channelId={selected.id}
                  channelName={selected.name}
                  busy={busy}
                  defaultAgent={installation?.defaultAgent ?? "codex"}
                  installedAgents={installation?.targets ?? {}}
                  onChoose={chooseFiles}
                />
              </TabsContent>
              <TabsContent value="settings" onFocus={() => void loadMembers()}>
                <ChannelSettings
                  channel={selected}
                  members={members}
                  busy={busy}
                  onSave={saveChannel}
                  onAdd={addMember}
                  onLoad={() => void loadMembers()}
                  onRole={changeRole}
                  onRemove={removeMember}
                />
              </TabsContent>
            </Tabs>
          ) : (
            <ContextEmpty
              title={
                auth.authenticated
                  ? "Create your first Channel"
                  : "Connect your team"
              }
              description={
                auth.authenticated
                  ? "Channels organize an ongoing collaboration and its shared context."
                  : "Sign in with Google to create or join a Channel."
              }
              action={
                auth.authenticated ? (
                  <Button onClick={() => setShowCreate(true)}>
                    Create Channel
                  </Button>
                ) : (
                  <Button disabled={busy} onClick={() => void signIn()}>
                    Sign in with Google
                  </Button>
                )
              }
            />
          )}
          {(error ?? auth.error) && (
            <p className="fixed right-5 bottom-5 left-24 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error ?? auth.error}
            </p>
          )}
          {notice && (
            <p className="fixed right-5 bottom-5 rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground shadow-lg">
              {notice}
            </p>
          )}
        </section>
        <QuickShareDialog
          open={showQuickShare}
          defaultAgent={installation?.defaultAgent ?? "codex"}
          installedAgents={installation?.targets ?? {}}
          onChoose={chooseFiles}
          onClose={() => setShowQuickShare(false)}
        />
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent>
            <form onSubmit={(event) => void createChannel(event)}>
              <DialogHeader>
                <DialogTitle>Create Channel</DialogTitle>
              </DialogHeader>
              <FieldGroup className="py-5">
                <Field>
                  <FieldLabel htmlFor="channel-name">Channel name</FieldLabel>
                  <Input
                    id="channel-name"
                    name="name"
                    autoFocus
                    required
                    maxLength={80}
                    placeholder="e.g. Developer Platform"
                  />
                </Field>
              </FieldGroup>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Creating…" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog
          open={showCreateOrganization}
          onOpenChange={setShowCreateOrganization}
        >
          <DialogContent>
            <form onSubmit={(event) => void createOrganization(event)}>
              <DialogHeader>
                <DialogTitle>Create Organization</DialogTitle>
              </DialogHeader>
              <FieldGroup className="py-5">
                <Field>
                  <FieldLabel htmlFor="organization-name">
                    Organization name
                  </FieldLabel>
                  <Input
                    id="organization-name"
                    name="name"
                    autoFocus
                    required
                    maxLength={80}
                    placeholder="e.g. Acme Engineering"
                  />
                </Field>
              </FieldGroup>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateOrganization(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Creating…" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </main>
    </TooltipProvider>
  );
}

function ContextEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Empty className="min-h-[60vh]">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action}
    </Empty>
  );
}
function ChannelSettings({
  channel,
  members,
  busy,
  onSave,
  onAdd,
  onLoad,
  onRole,
  onRemove,
}: {
  channel: Channel;
  members: Member[];
  busy: boolean;
  onSave: (e: FormEvent<HTMLFormElement>) => void;
  onAdd: (e: FormEvent<HTMLFormElement>) => void;
  onLoad: () => void;
  onRole: (m: Member, r: string) => void;
  onRemove: (m: Member) => void;
}) {
  const [people, setPeople] = useState<OrganizationPerson[]>([]);
  useEffect(onLoad, [channel.id]);
  async function searchPeople(query: string) {
    if (!query.trim()) {
      setPeople([]);
      return;
    }
    try {
      const response = await trackedFetch(
        `/v1/channels/${channel.id}/organization/people?q=${encodeURIComponent(query)}`,
      );
      if (response.ok) setPeople(await response.json());
    } catch {
      /* Search is progressive enhancement. */
    }
  }
  const canManage = channel.role === "owner" || channel.role === "admin";
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10 py-6">
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">Channel identity</h2>
          <p className="text-sm text-muted-foreground">
            Name and compact icon shown in the Channel rail.
          </p>
        </div>
        <form onSubmit={onSave}>
          <FieldGroup>
            <div className="grid grid-cols-[1fr_120px] gap-4">
              <Field>
                <FieldLabel>Name</FieldLabel>
                <Input
                  name="name"
                  defaultValue={channel.name}
                  disabled={!canManage}
                />
              </Field>
              <Field>
                <FieldLabel>Icon</FieldLabel>
                <Input
                  name="icon"
                  defaultValue={channel.icon ?? ""}
                  maxLength={3}
                  disabled={!canManage}
                />
              </Field>
            </div>
            {canManage && (
              <Button type="submit" disabled={busy} className="w-fit">
                Save changes
              </Button>
            )}
          </FieldGroup>
        </form>
      </section>
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">Members</h2>
          <p className="text-sm text-muted-foreground">
            Search this Organization or enter an email to invite someone into
            the Organization and Channel.
          </p>
        </div>
        {canManage && (
          <form onSubmit={onAdd}>
            <FieldGroup>
              <div className="flex items-end gap-3">
                <Field className="flex-1">
                  <FieldLabel>Person or email</FieldLabel>
                  <Input
                    name="email"
                    type="email"
                    list={`organization-people-${channel.id}`}
                    required
                    placeholder="name@company.com"
                    onChange={(event) =>
                      void searchPeople(event.currentTarget.value)
                    }
                  />
                  <datalist id={`organization-people-${channel.id}`}>
                    {people.map((person) => (
                      <option key={person.userId} value={person.email}>
                        {person.displayName ?? person.email}
                      </option>
                    ))}
                  </datalist>
                </Field>
                <Field className="w-32">
                  <FieldLabel>Role</FieldLabel>
                  <Select name="role" defaultValue="member">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Button type="submit" disabled={busy}>
                  {busy ? "Adding…" : "Add member"}
                </Button>
              </div>
            </FieldGroup>
          </form>
        )}
        <div className="divide-y rounded-xl border">
          {members.map((member) => (
            <div
              key={member.memberId ?? member.email}
              className="flex items-center gap-3 p-3"
            >
              <Avatar>
                <AvatarImage src={member.avatarUrl} />
                <AvatarFallback>
                  {initials(member.displayName ?? member.email)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {member.displayName ?? member.email}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {member.email}
                </p>
              </div>
              {member.status === "pending" && (
                <Badge variant="outline">Invitation pending</Badge>
              )}
              {channel.role === "owner" &&
              member.role !== "owner" &&
              member.memberId ? (
                <Select
                  value={member.role}
                  onValueChange={(value) => onRole(member, value as string)}
                >
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="secondary">{member.role}</Badge>
              )}
              {channel.role === "owner" && member.role !== "owner" && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove ${member.email}`}
                  onClick={() => onRemove(member)}
                >
                  <Trash2Icon />
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "C"
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
