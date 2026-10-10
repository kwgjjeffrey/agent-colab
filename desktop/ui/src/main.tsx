import { readableError } from "@/api/readable-error";
import { artifactConfig } from "@/artifact-config";
import { AuthOnboarding, hasBoundAuth } from "@/features/account/AuthOnboarding";
import { enterpriseDeployment } from "@/deployment";
import { traceTargets } from "@/api/trace-locators";
import { runOperation, type OperationScope } from "@/api/operation-runner";
import { initializeTelemetry } from "@/api/telemetry";
void initializeTelemetry();
import { FormEvent, StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useGuiVersion } from "@/features/updates/useGuiVersion";
import { useWorkspaceNavigation } from "@/features/channels/useWorkspaceNavigation";
import { ChannelHeading } from "@/features/channels/ChannelHeading";
import { ChannelIcon } from "@/features/channels/ChannelIcon";
import { ChannelSettingsContent } from "@/features/channels/ChannelSettingsContent";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LogOutIcon,
  LoaderCircleIcon,
  PlusIcon,
  SettingsIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { CatalogWorkspace, catalogRequest, type AddKind } from "@/features/workspace/CatalogWorkspace";
import { FilesView, type FileShare } from "@/features/files/FilesView";
import type { AgentTarget } from "@/features/agent/AgentPromptDialog";
import { SessionsView, type SessionShare } from "@/features/sessions/SessionsView";
import { WorkbenchEntry } from "@/features/workbench/WorkbenchEntry";
import { SkillsView } from "@/features/skills/SkillsView";
import { MessagesView } from "@/features/messages/MessagesView";
import { CanvasView } from "@/features/canvas/CanvasView";
import { ChannelContextProvider } from "@/features/context/ChannelContext";
import type { ContextResource } from "@/features/context/context-model";
import {useUpdateProgress} from "@/features/updates/useUpdateProgress";
import {isUpdateRunning} from "@/features/updates/progress";
import {UpdateProgressView} from "@/features/updates/UpdateProgressView";
import { QuickShareControl } from "@/features/transfers/QuickShareDialog";
import { ChannelHome, completeHomeTip } from "@/features/onboarding/ChannelHome";
import { InviteSessionDialog, type SessionInvite } from "@/features/onboarding/InviteSessionDialog";
import { AccountDevices } from "@/features/onboarding/AccountDevices";
import { AccountProfile, needsAccountSetup, isDeviceEmail, type AccountProfileData } from "@/features/account/AccountProfile";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import "./styles.css";
import { trackedFetch } from "@/api/request-activity";

declare global {
  interface Window {
    colabHost: {
      openWorkbench?: () => Promise<void>;
      isElectron: boolean;
      openExternal(url: string): Promise<void>;
      choosePath(options: {
        directory?: boolean;
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
  choosePath: async (options: { directory?: boolean; title: string }) => {return runOperation("system.choose-path", async (operation)=>{
const trackedFetch=operation.fetch;

    const suffix = options.directory === undefined ? "" : `?directory=${options.directory}`;
    const response = await trackedFetch(`/v1/system/choose-path${suffix}`);
    if (!response.ok) throw new Error(await response.text());
    return ((await response.json()) as { path: string | null }).path;

});},
  onDeepLink: (_callback: (urls: string[]) => void) => () => undefined,
  showAndFocus: async () => {
    window.focus();
  },
  markUiReady: () => undefined,
};

type User = { id: string; displayName?: string; email: string; avatarUrl?: string };
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
  operationWorkbenchAvailable?: boolean;
  installed: boolean;
  version?: string;
  latestVersion?: string;
  updateAvailable?: boolean;
  targets: Record<string, { installed: boolean; path: string }>;
  defaultAgent?: AgentTarget;
  components?: Record<string, { installedVersion?: string; latestVersion?: string; updateAvailable?: boolean; downloadUrl?: string }>;
  shellUpdatePending?: boolean;
};

type InstallationAction = "checking" | "updating";
type InstallationMessage = { kind: "success" | "error"; text: string };

function App() {
  const [auth, setAuth] = useState<Auth>({ authenticated: false });
  const [authResolved, setAuthResolved] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [workspaceLoadError, setWorkspaceLoadError] = useState<string>();
  const [channels, setChannels] = useState<Channel[]>([]);
  const { selectedId, setSelectedId, workspaceTab, setWorkspaceTab, workspaceItem, setWorkspaceItem, openChannelHome } = useWorkspaceNavigation();
  const [contextFocus, setContextFocus] = useState<ContextResource>();
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateOrganization, setShowCreateOrganization] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [members, setMembers] = useState<Member[]>([]);
  const [channelDialog, setChannelDialog] = useState<"identity" | "members">();
  const activeChannelId = useRef(selectedId);
  activeChannelId.current = selectedId;
  const [channelInviteBusy, setChannelInviteBusy] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [fileShares, setFileShares] = useState<FileShare[]>([]);
  const [sessionShares, setSessionShares] = useState<SessionShare[]>([]);
  const [installation, setInstallation] = useState<InstallationStatus>();
  const [installationAction, setInstallationAction] = useState<InstallationAction>();
  const [installationMessage, setInstallationMessage] = useState<InstallationMessage>();
  const [installationMutationBusy, setInstallationMutationBusy] = useState(false);
  const [agentSettingsOpenToken, setAgentSettingsOpenToken] = useState(0);
  const [deviceAccounts, setDeviceAccounts] = useState<Array<{ id: string; displayName?: string; avatarUrl?: string }>>([]);
  const [quickShareRequest, setQuickShareRequest] = useState<{ kind: "session"; token: number }>();
  const [activeHomeTip, setActiveHomeTip] = useState<string>();
  const [sessionInvite, setSessionInvite] = useState<SessionInvite>();
  const [homeTryBusy, setHomeTryBusy] = useState<string>();
  const [creationKind, setCreationKind] = useState<"session" | "files" | "skill">();
  const creationChannel = useRef<string | undefined>(undefined);
  const creationToken = useRef(0);
  const currentCreationToken = creationToken.current;
  const mentionCreation = useRef<{channelId:string;kind:"session"|"files"|"skill";resolve:(resource:ContextResource|undefined)=>void} | undefined>(undefined);
  function closeCreation() { creationToken.current+=1; mentionCreation.current?.resolve(undefined); mentionCreation.current=undefined; setCreationKind(undefined); }
  useEffect(() => { if (creationChannel.current !== selectedId) closeCreation(); }, [selectedId]);
  function createMentionItem(kind:"session"|"files"|"skill"):Promise<ContextResource|undefined> {
    if (!selectedId) return Promise.resolve(undefined);
    closeCreation(); setCatalogDestination(undefined); creationChannel.current=selectedId;
    return new Promise(resolve=>{mentionCreation.current={channelId:selectedId,kind,resolve};setCreationKind(kind);});
  }
  const [catalogDestination, setCatalogDestination] = useState<string>();
  useEffect(()=>{if(workspaceItem&&["canvas","session","files"].includes(workspaceItem.kind)&&selectedId)setContextFocus({...workspaceItem,kind:workspaceItem.kind as "canvas",channelId:selectedId});},[selectedId,workspaceItem?.id]);
  async function addWorkspaceItem(kind: AddKind, parentId?: string) {
    closeCreation();
    setCatalogDestination(parentId);
    if(kind==="catalog"||kind==="canvas"){window.dispatchEvent(new CustomEvent("colab:catalog-add",{detail:{kind,parentId}}));return;}
    creationChannel.current = selectedId;
    setCreationKind(kind);
  }
  async function placedShare(kind: string, id: string, token?:number) {
    if(token!==undefined && token!==creationToken.current){window.dispatchEvent(new Event("colab:catalog-changed"));return;}
    if(catalogDestination && selectedId) await catalogRequest(`/v1/channels/${selectedId}/catalog-items/position`,"PATCH",{kind,itemId:id,parentId:catalogDestination});
    if(selectedId){const trail=await catalogRequest<Array<{id:string;kind:string;name:string}>>(`/v1/channels/${selectedId}/catalog-items/${kind}/${id}/trail`);const item=trail.at(-1);if(item){
      if(token!==undefined && token!==creationToken.current)return;
      const pending=mentionCreation.current;
      if(pending?.channelId===selectedId && pending.kind===kind){mentionCreation.current=undefined;pending.resolve({...item,kind:kind as ContextResource["kind"],channelId:selectedId});}
      else if(creationChannel.current===selectedId){setWorkspaceItem(item);if(kind!=="skill")setContextFocus({...item,kind:kind as "session",channelId:selectedId});setWorkspaceTab(kind==="session"?"sessions":kind==="skill"?"skills":kind);}
    }}
    window.dispatchEvent(new Event("colab:catalog-changed"));
  }
  const loginReady = useRef(false);
  const bootstrapping = useRef(false);
  const acceptingInvite = useRef(false);
  const [settingsView, setSettingsView] = useState<"main" | "accounts" | "organizations" | "devices" | "profile" | "updates">("main");
  const [accountProfile, setAccountProfile] = useState<AccountProfileData>();
  const [googleReminderDismissed, setGoogleReminderDismissed] = useState(false);
  const accountSetupPending = accountProfile?.id === auth.user?.id && needsAccountSetup(accountProfile, googleReminderDismissed, !enterpriseDeployment);
  const profileAccountId = useRef(auth.user?.id);
  profileAccountId.current = auth.user?.id;
  async function loadAccountProfile() {
    const userId = profileAccountId.current;
    const response = await fetch("/v1/auth/profile");
    if (!response.ok) throw new Error("Could not load account settings.");
    const profile = await response.json();
    if (profileAccountId.current === userId && profile.id === userId) setAccountProfile(profile);
  }
  useEffect(() => {
    setAccountProfile(undefined);
    setGoogleReminderDismissed(localStorage.getItem(`colab:google-reminder-dismissed:${auth.user?.id}`) === "1");
    if (auth.user?.id) void loadAccountProfile().catch(() => {});
  }, [auth.user?.id, auth.user?.email]);
  useEffect(() => {
    if (!auth.authenticated || !auth.user?.id) return;
    const refresh = () => { void loadAccountProfile().catch(() => {}); };
    window.addEventListener("focus", refresh);
    // Binding can finish in the browser without changing the current user ID or email.
    const timer = !accountProfile || !hasBoundAuth(accountProfile) ? window.setInterval(refresh, 5000) : undefined;
    return () => { window.removeEventListener("focus", refresh); if (timer) window.clearInterval(timer); };
  }, [auth.authenticated, auth.user?.id, accountProfile?.googleLinked, accountProfile?.profileManaged]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [myAgentCount, setMyAgentCount] = useState(0);
  const [agentActivity, setAgentActivity] = useState<string>();
  const {progress: updateProgress, resolved: progressResolved, refresh: refreshUpdateProgress} = useUpdateProgress(settingsOpen || installationAction === "updating");
  const updateRunning = isUpdateRunning(updateProgress);
  const updateBusy = installationAction === "updating" || updateRunning;
  const installationBusy = installationAction !== undefined || installationMutationBusy || updateRunning || (settingsOpen && !progressResolved);
  const selected = channels.find((channel) => channel.id === selectedId);
  useEffect(() => {
    if (!error) return;
    const timeout = window.setTimeout(() => setError(undefined), 8000);
    return () => window.clearTimeout(timeout);
  }, [error]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(undefined), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  useEffect(()=>{if(initialLoading||installationAction||(!installation?.shellUpdatePending&&sessionStorage.getItem("agent-colab:resume-shell-update")!=="1"))return;sessionStorage.removeItem("agent-colab:resume-shell-update");void finishShellUpdate()},[initialLoading,installation?.shellUpdatePending]);

  async function refreshAuth(initial = false, parent?: OperationScope) {return runOperation("auth.status", async (operation)=>{
const fetch=operation.fetch;

    try {
      const response = await fetch("/v1/auth/status");
      if (response.ok) {
        setAuth(await response.json());
        setAuthResolved(true);
      } else if (initial) {
        setAuth({ authenticated: false, error: await response.text() });
        setAuthResolved(true);
      }
    } catch (reason) {operation.fail();
      if (initial) {
        setAuth({ authenticated: false, error: String(reason) });
        setAuthResolved(true);
      }
    }

}, {parent:parent?.operation});}
  async function refreshChannels(parent?: OperationScope) {
return runOperation("channels.list", async (operation) => {
const trackedFetch = operation.fetch;

    const response = await trackedFetch("/v1/channels");
    if (!response.ok) throw new Error(await response.text());
    const next: Channel[] = await response.json();
    setChannels(next);
    setWorkspaceLoadError(undefined);
    setSelectedId((current) =>
      current && next.some((channel) => channel.id === current)
        ? current
        : next[0]?.id,
    );

}, {parent:parent?.operation});
}
  async function refreshAccounts(parent?: OperationScope) {
return runOperation("accounts.list", async (operation) => {
const trackedFetch = operation.fetch;

    try {
      setAccounts(
        await (await trackedFetch("/v1/auth/accounts")).json(),
      );
    } catch {
      /* Local Core may be starting. */
    }

}, {parent:parent?.operation});
}
  async function loadInstallation(refresh = false, parent?: OperationScope) {
return runOperation("system.installation", async (operation) => {
const api = operation.response;

    const response = await api(`/v1/system/installation${refresh ? "?refresh=true" : ""}`);
    const next: InstallationStatus = await response.json();
    setInstallation(next);
    return next;

}, {parent:parent?.operation});
}
  async function messageSettingsAgentCount(channelId: string) {
return runOperation("members.agent-count", async operation => {
const api=operation.response;

    const response = await api(`/v1/channels/${channelId}/participants`, undefined, true);
    const participants = await response.json() as Array<{ isCurrent: boolean; memberId: string }>;
    const owner = participants.find((participant) => participant.isCurrent);
    if (!owner) return 0;
    const blueprints = await (await api(`/v1/channels/${channelId}/blueprints?ownerMemberId=${encodeURIComponent(owner.memberId)}`, undefined, true)).json() as unknown[];
    return blueprints.length;

});
}
  async function checkInstallation() {
return runOperation("system.check-update", async (operation) => {


    setInstallationAction("checking");
    setInstallationMessage(undefined);
    try {
      const next = await loadInstallation(true, operation);
      const updates = Object.entries(next.components ?? {})
        .filter(([, component]) => component.updateAvailable)
        .map(([id]) => id);
      setInstallationMessage({
        kind: "success",
        text: updates.length > 0
          ? `Updates available: ${updates.join(", ")}.`
          : "All Colab resources are up to date.",
      });
    } catch (reason) { operation.fail();
      setInstallationMessage({ kind: "error", text: `Update check failed: ${readableError(reason)}` });
    } finally {
      setInstallationAction(undefined);
    }

});
}
  async function updateInstallation() {
return runOperation("system.update", async (operation) => {
const api = operation.response;
const fetch = operation.fetch;

    const resumeShell=Boolean(installation?.components?.["electron-shell"]?.updateAvailable);
    setInstallationAction("updating");
    setInstallationMessage(undefined);
    try {
      if (isUpdateRunning(await refreshUpdateProgress())) return;
      // A long artifact transfer has its own progress surface; it is not generic page loading.
      const response = await api("/v1/system/update", { method: "POST" }, true);
      const result = await response.json() as { restartRequired?: boolean; previousPid?: number; alreadyRunning?: boolean };
      if (result.alreadyRunning) { await refreshUpdateProgress(); return; }
      if (result.restartRequired) {
        if(resumeShell)sessionStorage.setItem("agent-colab:resume-shell-update","1");
        setInstallationMessage({ kind: "success", text: "Colab resources updated. Restarting Local Core…" });
        // Restart is intentionally fire-and-forget. The old Core may close this connection as soon
        // as it acknowledges the command; readiness is determined exclusively by the new PID probe.
        void fetch("/v1/system/restart", { method: "POST", keepalive: true }).catch(()=>undefined);
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
        await loadInstallation(true, operation);
        setInstallationMessage({ kind: "success", text: "Colab resources installed. Restart Local Core to activate them." });
      }
    } catch (reason) { operation.fail();
      // An expired caller or a legacy lock-conflict response must attach to the live updater.
      const progress = await refreshUpdateProgress().catch(() => undefined);
      if (!isUpdateRunning(progress)) setInstallationMessage({ kind: "error", text: `Update failed: ${readableError(reason)}` });
    } finally { setInstallationAction(undefined); }

});
}
  async function restartInstalledCore() {
return runOperation("system.restart", async (operation) => {
const fetch = operation.fetch;

    setInstallationAction("updating");
    try {
      void fetch("/v1/system/restart", {method:"POST",keepalive:true}).catch(() => undefined);
      const previousPid = updateProgress?.previousPid;
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        await new Promise(resolve => window.setTimeout(resolve, 700));
        try {
          const response = await fetch(`/v1/status?restartProbe=${Date.now()}`, {cache:"no-store"});
          const status = response.ok ? await response.json() : undefined;
          if (status?.pid && status.pid !== previousPid) {window.location.reload(); return;}
        } catch { /* launchd is replacing Core */ }
      }
      throw new Error("Local Core did not become ready within 30 seconds");
    } catch(reason) { operation.fail();setInstallationMessage({kind:"error",text:readableError(reason)});}
    finally {setInstallationAction(undefined);}

});
}
  async function finishShellUpdate() {
return runOperation("system.shell-update", async operation => {
const api=operation.response;

    setInstallationAction("updating");
    setInstallationMessage(undefined);
    try {
      const response = await api("/v1/system/update-shell", { method: "POST" }, true);
      await response.json();
      await loadInstallation(true, operation);
      setInstallationMessage({ kind: "success", text: "Electron Shell updated. Restart Colab to use the new Shell." });
    } catch (reason) {operation.fail();
      setInstallationMessage({ kind: "error", text: `Electron Shell update failed: ${readableError(reason)}` });
    } finally {
      setInstallationAction(undefined);
    }

});
}
  async function setAgentSkill(agent: string, installed: boolean) {
return runOperation("system.skill-target", async (operation) => {
const api = operation.response;

    setInstallationMutationBusy(true);
    try {
      await api(`/v1/system/agents/${agent}/${installed ? "uninstall" : "install"}`, { method: "POST" });
      await loadInstallation(false, operation);
      setNotice(`Agent Colab Skill ${installed ? "uninstalled from" : "installed for"} ${agent}.`);
    } catch (reason) { operation.fail(); setError(String(reason)); }
    finally { setInstallationMutationBusy(false); }

});
}
  async function setDefaultAgent(agent: AgentTarget) {
return runOperation("system.default-agent", async (operation) => {
const api = operation.response;

    setInstallationMutationBusy(true);
    try {
      await api(`/v1/system/agents/${agent}/default`, { method: "POST" });
      await loadInstallation(false, operation);
      setNotice(`${agent} is now the default Agent.`);
    } catch (reason) { operation.fail(); setError(String(reason)); }
    finally { setInstallationMutationBusy(false); }

});
}
  async function refreshOrganizations(parent?: OperationScope) {
return runOperation("organizations.list", async (operation) => {
const api = operation.response;

    const response = await api("/v1/organizations");
    const next: Organization[] = await response.json();
    setOrganizations(next);
    return next;

}, {parent:parent?.operation});
}
  useEffect(() => {
    if (bootstrapping.current) return;
    bootstrapping.current = true;
    const invitedChannel = new URLSearchParams(location.hash.slice(1)).get("channel");
    if (invitedChannel) { setSelectedId(invitedChannel); setWorkspaceTab("home"); history.replaceState(null, "", location.pathname + location.search); }
    const join = new URLSearchParams(location.search).get("join");
    if (join) { localStorage.setItem("pendingChannelInviteLink", join); history.replaceState(null, "", location.pathname); }
    void fetch("/v1/auth/device/start", { method: "POST" }).then(async response => {
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      if (result.requiresSelection) setDeviceAccounts(result.accounts);
      else { loginReady.current = true; await refreshAuth(true); }
    }).catch(reason => { setError(readableError(reason)); void refreshAuth(true); });
    void refreshAccounts();
    // Give to Agent is available outside Settings, so target availability and the default Agent
    // must be loaded with the application rather than lazily when Settings is first opened.
    void loadInstallation().catch((reason) =>
      setInstallationMessage({ kind: "error", text: `Could not load installation status: ${String(reason)}` }),
    );
  }, []);
  useEffect(() => {
    if (!authResolved || deviceAccounts.length) return;
    const timer = window.setInterval(() => void refreshAuth(), 1000);
    return () => window.clearInterval(timer);
  }, [authResolved, deviceAccounts.length]);
  useGuiVersion(__COLAB_UI_VERSION__);
  useEffect(() => {
    host.markUiReady();
    const unlisten = host.onDeepLink(async (urls) => {
      for (const raw of urls) {
        try {
          const url = new URL(raw);
          if (url.hostname === "join") {
            const token = url.searchParams.get("token");
            if (token) localStorage.setItem("pendingChannelInviteLink", token);
          }
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
      await finishChannelInvite();
      if (!accepted && localStorage.getItem("pendingOrganizationInvitation"))
        await signIn();
      await host.showAndFocus();
    });
    return unlisten;
  }, []);
  useEffect(() => {
    if (!authResolved) return;
    if (auth.authenticated) {
      if (!deviceAccounts.length) loginReady.current = true;
      void refreshOrganizations()
        .then(() => refreshChannels())
        .then(() => finishChannelInvite())
        .catch((reason) => setWorkspaceLoadError(readableError(reason)))
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
  useEffect(() => {
    setMembers([]);
    setChannelDialog(undefined);
    if (selectedId && auth.authenticated) {
      void loadMembers().catch((reason) => setError(readableError(reason)));
    }
  }, [selectedId, auth.user?.id]);

  async function signIn(loginHint?: string) {
return runOperation("auth.sign-in", async (operation) => {
const trackedFetch = operation.fetch;

    setBusy(true);
    setError(undefined);
    try {
      const response = await trackedFetch(
        `/v1/auth/${artifactConfig.auth.kind}/start${loginHint ? `?loginHint=${encodeURIComponent(loginHint)}` : ""}`,
      );
      if (!response.ok) throw new Error(await response.text());
      const body = await response.json();
      await host.openExternal(body.authorizationUrl);
    } catch (reason) { operation.fail();
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }

});
}
  async function switchAccount(account: Account) {
return runOperation("auth.switch", async (operation) => {
const trackedFetch = operation.fetch;

    setBusy(true);
    try {
      const response = await trackedFetch("/v1/auth/device/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: account.userId }),
      });
      if (response.status === 401) {
        await signIn(account.email);
        return;
      }
      if (!response.ok) throw new Error(await response.text());
      await refreshAuth(false, operation);
      await refreshAccounts(operation);
      await refreshOrganizations(operation);
      await refreshChannels(operation);
    } catch (reason) { operation.fail();
      setError(String(reason));
    } finally {
      setBusy(false);
    }

});
}
  async function logout() {
return runOperation("auth.logout", async (operation) => {
const api = operation.response;

    setBusy(true);
    try {
      await api("/v1/auth/logout", { method: "POST" });
      setAuth({ authenticated: false });
      setChannels([]);
      setSelectedId(undefined);
      await refreshAccounts(operation);
    } catch (reason) { operation.fail();
      setError(String(reason));
    } finally {
      setBusy(false);
    }

});
}
  async function createChannel(event: FormEvent<HTMLFormElement>) {
return runOperation("channels.create", async (operation) => {
const trackedFetch = operation.fetch;

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
      await refreshChannels(operation);
      setSelectedId(channel.id);
      setShowCreate(false);
    } catch (reason) { operation.fail();
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }

});
}
  async function switchOrganization(organization: Organization) {
return runOperation("organizations.switch", async (operation) => {
const api = operation.response;

    if (organization.active) return;
    setBusy(true);
    setError(undefined);
    try {
      await api(`/v1/organizations/${organization.id}/activate`, {
        method: "POST",
      });
      await refreshOrganizations(operation);
      await refreshChannels(operation);
    } catch (reason) { operation.fail();
      setError(String(reason));
    } finally {
      setBusy(false);
    }

});
}
  async function createOrganization(event: FormEvent<HTMLFormElement>) {
return runOperation("organizations.create", async (operation) => {
const api = operation.response;

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
      await refreshOrganizations(operation);
      await refreshChannels(operation);
      setShowCreateOrganization(false);
    } catch (reason) { operation.fail();
      setError(String(reason));
    } finally {
      setBusy(false);
    }

});
}
  async function api(path: string, init?: RequestInit, silent = false) {
    // Durable background reconciliation must not make the foreground loading indicator pulse.
    const response = await (silent ? fetch(path, init) : trackedFetch(path, init));
    if (!response.ok) throw new Error(await response.text());
    return response;
  }
  async function finishPendingInvitation() {
return runOperation("invitations.accept", async (operation) => {
const trackedFetch = operation.fetch;

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
    await refreshChannels(operation);
    return true;

});
}
  async function finishChannelInvite() {
    if (!loginReady.current || acceptingInvite.current) return;
    const token = localStorage.getItem("pendingChannelInviteLink");
    if (!token) return;
    acceptingInvite.current = true;
    try {
    const response = await fetch("/v1/invite-links/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
    if (!response.ok) { if (response.status !== 401) setError(await response.text()); if(response.status===400) localStorage.removeItem("pendingChannelInviteLink"); return; }
    const target = await response.json();
    localStorage.removeItem("pendingChannelInviteLink");
    await refreshOrganizations(); await refreshChannels();
    setSelectedId(target.channelId); creationChannel.current = target.channelId; setCreationKind("session");
    } finally { acceptingInvite.current = false; }
  }
  async function inviteToChannel() {
    if (!selected || channelInviteBusy) return;
    setChannelInviteBusy(true);
    try {
      const invitation = await api(`/v1/channels/${selected.id}/invite-links`, { method: "POST" });
      setSessionInvite({ ...await invitation.json(), channelName: selected.name, purpose: "join" });
    } catch (reason) { setError(readableError(reason)); }
    finally { setChannelInviteBusy(false); }
  }
  async function tryHomeCase(id: string) {
    if (!selected || homeTryBusy) return;
    if (id === "reuse-skill") { setWorkspaceTab("skills"); return; }
    if (id === "remote-check" || id === "remote-check-sent") { setWorkspaceTab("messages"); return; }
    if (id !== "working-style") { setActiveHomeTip(id); setQuickShareRequest({ kind: "session", token: Date.now() }); return; }
    setHomeTryBusy(id);
    try {
      const response = await api(`/v1/channels/${selected.id}/sessions`);
      const shares: SessionShare[] = await response.json();
      if (shares.some(share => !share.canWithdraw && share.currentSnapshotId)) {
        setSessionShares(shares); setWorkspaceTab("sessions"); return;
      }
      const invitation = await api(`/v1/channels/${selected.id}/invite-links`, { method: "POST" });
      setSessionInvite(await invitation.json());
    } catch (reason) { setError(readableError(reason)); }
    finally { setHomeTryBusy(undefined); }
  }
  async function loadMembers(parent?: OperationScope) {
return runOperation("members.list", async (operation) => {
const api = operation.response;

    if (!selectedId) return;
    const result: Member[] = await (await api(`/v1/channels/${selectedId}/members`)).json();
    if (activeChannelId.current === selectedId) setMembers(result);

}, {parent:parent?.operation});
}
  async function loadFileShares(silent = false, parent?: OperationScope) {
return runOperation("files.list", async (operation) => {
const api = operation.response;

    if (!selectedId) return;
    setFileShares(await (await api(`/v1/channels/${selectedId}/files`, undefined, silent)).json());

}, {parent:parent?.operation});
}
  async function loadSessionShares(silent = false, parent?: OperationScope) {
return runOperation("sessions.list", async (operation) => {
const api = operation.response;

    if (!selectedId) return;
    setSessionShares(await (await api(`/v1/channels/${selectedId}/sessions`, undefined, silent)).json());

}, {parent:parent?.operation});
}
  async function withdrawSession(share: SessionShare) {
return runOperation("sessions.withdraw", async (operation) => {
const api = operation.response;

    setBusy(true); setError(undefined);
    try { await api(`/v1/sessions/${share.id}`, { method: "DELETE" }); await loadSessionShares(false, operation); setNotice("Shared Session withdrawn."); }
    catch (reason) { operation.fail(); setError(String(reason)); }
    finally { setBusy(false); }

});
}
  // Files UI stays deliberately thin: it selects user intent and delegates scanning, Git pack
  // generation, persistence and synchronization to the GUI-independent Local Core API.
  // This keeps the same workflow available to the future Python Skill when Desktop is not open.
  async function chooseFiles(directory?: boolean) {return runOperation("files.choose", async (operation)=>{
const trackedFetch=operation.fetch;

    // Files is one product operation. Electron and Local Core are host adapters for the same
    // unified intent; neither distinction is exposed as a second UI decision.
    if (directory === undefined && !host.isElectron) {
      const response = await trackedFetch("/v1/system/choose-path");
      if (!response.ok) throw new Error(await response.text());
      return ((await response.json()) as { path: string | null }).path;
    }
    return host.choosePath({
      directory,
      title: directory === true
        ? "Choose a folder"
        : directory === false
          ? "Choose a file"
          : "Choose a file or folder to share",
    });

});}
  async function shareFiles(path: string, syncExcludes: string[], parent?: OperationScope) {
return runOperation("files.share", async (operation) => {
const api = operation.response;
    const token = creationKind ? currentCreationToken : undefined;

    if (!selectedId) return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const sharedResponse = await api(`/v1/channels/${selectedId}/files/share`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ localPath: path, syncExcludes }),
      });
      const created = await sharedResponse.json() as {id:string};
      await placedShare("files",created.id,token);
      await loadFileShares(false, operation);
      setNotice(
        "Files shared with this Channel. Future changes sync automatically.",
      );
    } catch (reason) { operation.fail();
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }

}, {parent:parent?.operation});
}
  async function ensureLocalFiles(share: FileShare) {
return runOperation("files.materialize", async (operation) => {
const api = operation.response;

    if (share.canWithdraw) return share;
    setError(undefined);
    const response = await api(`/v1/files/${share.id}/materialize`, {
      method: "POST",
    });
    const result: FileShare = await response.json();
    await loadFileShares(false, operation);
    return result;

});
}
  async function withdrawFiles(share: FileShare) {
return runOperation("files.withdraw", async (operation) => {
const api = operation.response;

    setBusy(true);
    setError(undefined);
    try {
      await api(`/v1/files/${share.id}`, { method: "DELETE" });
      await loadFileShares(false, operation);
      setNotice("Shared folder withdrawn.");
    } catch (reason) { operation.fail();
      setError(String(reason));
    } finally {
      setBusy(false);
    }

});
}
  async function retryFiles(share: FileShare) {
return runOperation("files.retry", async (operation) => {
const api = operation.response;

    setError(undefined);
    await api(`/v1/files/${share.id}/retry`, { method: "POST" });
    await loadFileShares(false, operation);

});
}
  async function saveChannel(event: FormEvent<HTMLFormElement>) {
return runOperation("channels.update", async (operation) => {
const api = operation.response;

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
      await refreshChannels(operation);
      setChannelDialog(undefined);
    } catch (reason) { operation.fail();
      setError(String(reason));
    } finally {
      setBusy(false);
    }

});
}
  async function addMember(event: FormEvent<HTMLFormElement>) {
return runOperation("members.add", async (operation) => {
const api = operation.response;

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
          identity: form.get("identity") ? JSON.parse(String(form.get("identity"))) : undefined,
          role: form.get("role"),
        }),
      });
      const result: AddMemberResult = await response.json();
      formElement.reset();
      await loadMembers(operation);
      setNotice(
        result.status === "joined"
          ? "Member added to this Channel."
          : "Invitation queued for delivery.",
      );
    } catch (reason) { operation.fail();
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }

});
}
  async function changeRole(member: Member, role: string) {
return runOperation("members.role", async (operation) => {
const api = operation.response;

    if (!selected || !member.memberId) return;
    try {
      await api(`/v1/channels/${selected.id}/members/${member.memberId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      await loadMembers(operation);
    } catch (reason) { operation.fail();
      setError(String(reason));
    }

});
}
  async function removeMember(member: Member) {
return runOperation("members.remove", async (operation) => {
const api = operation.response;

    if (!selected) return;
    const target = member.memberId
      ? `members/${member.memberId}`
      : `invitations/${encodeURIComponent(member.email)}`;
    try {
      await api(`/v1/channels/${selected.id}/${target}`, { method: "DELETE" });
      await loadMembers(operation);
    } catch (reason) { operation.fail();
      setError(String(reason));
    }

});
}

  return (
    <TooltipProvider>
      <main data-trace-target={traceTargets("auth.status", "invitations.accept")} data-trace-region="application" className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        {host.isElectron && /Macintosh|Mac OS X/.test(navigator.userAgent) && (
          <div className="macos-titlebar" aria-label="Window title bar"><span>Colab</span></div>
        )}
        <AuthOnboarding resolved={authResolved} authenticated={auth.authenticated} profile={accountProfile} userId={auth.user?.id} config={artifactConfig} busy={busy} onAuthenticate={() => void signIn()}/>
        <div className="grid min-h-0 flex-1 grid-cols-[72px_1fr] overflow-hidden">
        <aside data-trace-target={traceTargets("channels.list")} data-trace-region={"channels"}
          className="flex h-full min-h-0 flex-col items-center gap-3 bg-sidebar-foreground py-3"
          aria-label="Channels"
        >
          <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-3 overflow-y-auto">
            {channels.map((channel) => (
              <div key={channel.id} className="relative flex w-full shrink-0 justify-center">
              {selectedId === channel.id && <span aria-hidden="true" className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-white" />}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon"
                      variant={
                        selectedId === channel.id ? "default" : "secondary"
                      }
                      className={`size-11 shrink-0 rounded-full ${selectedId === channel.id ? "ring-2 ring-primary ring-offset-2 ring-offset-sidebar-foreground" : ""}`}
                      aria-current={selectedId === channel.id ? "page" : undefined}
                      onClick={() => { setContextFocus(undefined); openChannelHome(channel.id); }}
                      aria-label={channel.name}
                    />
                  }
                >
                  <ChannelIcon icon={channel.icon} name={channel.name} />
                </TooltipTrigger>
                <TooltipContent side="right">{channel.name}</TooltipContent>
              </Tooltip>
              </div>
            ))}
            {auth.authenticated && (
              <Tooltip>
                <TooltipTrigger data-trace-target={traceTargets("channels.create")}
                  render={
                    <Button data-trace-target={traceTargets("channels.create")}
                      size="icon"
                      variant="outline"
                      className="size-11 shrink-0 rounded-full border-dashed"
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
          <Popover open={settingsOpen} onOpenChange={(open) => { setSettingsOpen(open); if (open) { setSettingsView("main"); void loadInstallation().catch((reason) => setInstallationMessage({ kind: "error", text: `Could not load installation status: ${String(reason)}` })); if(selected) void messageSettingsAgentCount(selected.id).then(setMyAgentCount).catch(()=>setMyAgentCount(0)); } }}>
            <PopoverTrigger data-trace-nav={"settings"}
              render={
                <Button data-trace-nav={"settings"}
                  size="icon"
                  variant="ghost"
                  className="relative size-10 rounded-full text-sidebar-accent-foreground hover:bg-sidebar-accent"
                  aria-label="Settings"
                />
              }
            >
              <SettingsIcon />
              {accountSetupPending && <Badge variant="notification" className="absolute right-1 top-1" aria-label="Complete your account settings" />}
            </PopoverTrigger>
            <PopoverContent data-trace-region={"settings"} side="right" align="end" className="max-h-[88vh] w-[28rem] overflow-y-auto p-3">
              <PopoverHeader className="mb-2 flex-row items-center gap-2">
                {settingsView!=="main"&&<Button data-trace-nav={"settings.main"} size="icon-sm" variant="ghost" aria-label="Back to Settings" onClick={()=>setSettingsView("main")}><ChevronLeftIcon/></Button>}
                <PopoverTitle>{settingsView==="profile"?"Account settings":settingsView==="accounts"?"Switch user":settingsView==="organizations"?"Switch organization":settingsView==="devices"?"Linked devices":settingsView==="updates"?"Updates":"Settings"}</PopoverTitle>
              </PopoverHeader>
              {settingsView==="updates"?<div className="mt-2 rounded-lg border"><div className="p-3"><p className="text-sm font-medium">Colab resources</p><p className="text-xs text-muted-foreground">Independently distributed local artifacts</p></div>{installationMessage&&!updateRunning&&<p role="status" className={`max-h-28 overflow-auto break-words border-y px-3 py-2 text-xs ${installationMessage.kind==="error"?"bg-destructive/10 text-destructive":"bg-muted text-muted-foreground"}`}>{installationMessage.text}</p>}{([['local-core','Local Core'],['desktop-ui','GUI Resources'],['colab-skill','Agent Colab Skill'],['electron-shell','Electron Shell'],['operation-workbench','Operation Workbench']] as const).map(([id,label])=>{const component=installation?.components?.[id];return <div key={id} className="flex items-center gap-3 border-t p-3"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">{component?.installedVersion??"Not installed"}{component?.latestVersion?` · Latest ${component.latestVersion}`:""}</p></div>{component?.updateAvailable&&<span className="text-xs font-medium text-primary">Update available</span>}{id==="electron-shell"&&!host.isElectron&&component?.downloadUrl&&<Button size="sm" variant="outline" onClick={()=>void host.openExternal(component.downloadUrl!)}>Download app</Button>}</div>})}</div>:settingsView==="profile"?<AccountProfile publicAuth={!enterpriseDeployment} profile={accountProfile?.id===auth.user?.id?accountProfile:undefined} linking={busy} googleDismissed={googleReminderDismissed} onLinkGoogle={()=>void signIn()} onDismissGoogle={()=>{localStorage.setItem(`colab:google-reminder-dismissed:${auth.user?.id}`,"1");setGoogleReminderDismissed(true);}} onSaved={profile=>{setAccountProfile(profile);void refreshAuth();void refreshAccounts();if(selected)void loadMembers();}}/>:settingsView==="accounts"?<div className="flex flex-col gap-1">
                {accounts.map(account=><Button data-trace-target={traceTargets("auth.switch", "accounts.list")} key={account.userId} variant={account.active?"secondary":"ghost"} className="h-auto justify-start gap-3 p-2" disabled={busy||account.active} onClick={()=>void switchAccount(account).then(()=>setSettingsView("main"))}><Avatar><AvatarImage src={account.avatarUrl}/><AvatarFallback>{initials(account.displayName??account.email)}</AvatarFallback></Avatar><span className="min-w-0 flex-1 text-left"><strong className="block truncate">{account.displayName??account.email}</strong><small className="block truncate text-muted-foreground">{isDeviceEmail(account.email)?"Device sign-in":account.email}</small></span>{account.active&&<CheckIcon/>}</Button>)}
                <Button data-trace-target={traceTargets("auth.sign-in")} variant="outline" disabled={busy} onClick={()=>void signIn()}><PlusIcon/>Add another account</Button>
                {auth.authenticated&&<Button data-trace-target={traceTargets("auth.logout")} variant="ghost" className="text-destructive" disabled={busy} onClick={()=>void logout()}><LogOutIcon/>Sign out</Button>}
              </div>:settingsView==="devices"?<AccountDevices onError={setError} onChanged={()=>{setSettingsView("main");void refreshAuth();void refreshAccounts();}}/>:settingsView==="organizations"?<div className="flex flex-col gap-1">
                {organizations.map(organization=><Button data-trace-target={traceTargets("organizations.switch", "organizations.list")} key={organization.id} variant={organization.active?"secondary":"ghost"} className="justify-start" disabled={busy||organization.active} onClick={()=>void switchOrganization(organization).then(()=>setSettingsView("main"))}><span className="min-w-0 flex-1 truncate text-left">{organization.name}</span>{organization.active&&<CheckIcon/>}</Button>)}
                <Button data-trace-target={traceTargets("organizations.create")} variant="outline" onClick={()=>setShowCreateOrganization(true)}><PlusIcon/>Create Organization</Button>
              </div>:<div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  {enterpriseDeployment ? <div className="flex items-center gap-3 px-2 py-2"><Avatar><AvatarImage src={auth.user?.avatarUrl}/><AvatarFallback>{initials(auth.user?.displayName??auth.user?.email??"U")}</AvatarFallback></Avatar><span className="min-w-0 flex-1 text-left"><span className="block text-xs text-muted-foreground">User</span><strong className="block truncate">{auth.user?.displayName??auth.user?.email??"Not signed in"}</strong></span></div> : <>
                  <Button data-trace-nav={"accounts"} variant="ghost" className="h-auto justify-start gap-3 px-2 py-2" onClick={()=>setSettingsView("accounts")}><Avatar><AvatarImage src={auth.user?.avatarUrl}/><AvatarFallback>{initials(auth.user?.displayName??auth.user?.email??"U")}</AvatarFallback></Avatar><span className="min-w-0 flex-1 text-left"><span className="block text-xs text-muted-foreground">User</span><strong className="block truncate">{auth.user?.displayName??auth.user?.email??"Not signed in"}</strong></span><span className="text-xs text-muted-foreground">Switch</span><ChevronRightIcon/></Button>
                  <Button data-trace-nav={"organizations"} variant="ghost" className="h-auto justify-start px-2 py-2" onClick={()=>setSettingsView("organizations")}><span className="min-w-0 flex-1 text-left"><span className="block text-xs text-muted-foreground">Organization</span><strong className="block truncate">{organizations.find(item=>item.active)?.name??"No organization"}</strong></span><span className="text-xs text-muted-foreground">Switch</span><ChevronRightIcon/></Button>
                  </>}
                </div>
                {selected&&<Button data-trace-target={traceTargets("members.agent-count")} variant="ghost" className="h-10 w-full justify-start px-2" onClick={()=>{setSettingsOpen(false);setWorkspaceTab("messages");setAgentSettingsOpenToken(value=>value+1)}}><span className="min-w-0 flex-1 text-left">My Agents</span><span className="text-muted-foreground">{myAgentCount}</span><ChevronRightIcon/></Button>}
                {auth.authenticated&&<div className="flex flex-col gap-1"><Button variant="ghost" className="h-10 w-full justify-start px-2" onClick={()=>{setSettingsView("profile");void loadAccountProfile().catch(reason=>setError(String(reason)));}}><span className="min-w-0 flex-1 text-left">Account settings</span>{accountSetupPending&&<Badge variant="notification" aria-label="Complete your account settings"/>}<ChevronRightIcon data-icon="inline-end"/></Button><Button variant="ghost" className="h-10 w-full justify-start px-2" onClick={()=>setSettingsView("devices")}><span className="min-w-0 flex-1 text-left">Linked devices</span><ChevronRightIcon data-icon="inline-end"/></Button></div>}
                <section><p className="mb-2 px-1 text-xs font-medium text-muted-foreground">Install Skill to local Agent runtime</p><div className="divide-y rounded-lg border">{([['codex','Codex'],['claude','Claude Code'],['myflicker','MyFlicker']] as const).map(([id,label])=>{const target=installation?.targets?.[id];return <div key={id} className="flex items-center gap-3 p-3"><Button data-trace-target={traceTargets("system.default-agent")} size="sm" variant="ghost" aria-label={`Use ${label} as default Agent`} disabled={installationBusy||!target?.installed||installation?.defaultAgent===id} onClick={()=>void setDefaultAgent(id)}>{installation?.defaultAgent===id&&<CheckIcon data-icon="inline-start"/>}{installation?.defaultAgent===id?"Default":"Set default"}</Button><div className="min-w-0 flex-1"><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">{target?.installed?"Installed":"Not installed"}</p></div><Button data-trace-target={traceTargets("system.skill-target")} size="sm" variant="outline" disabled={installationBusy||!installation} onClick={()=>void setAgentSkill(id,Boolean(target?.installed))}>{target?.installed?"Uninstall":"Install"}</Button></div>})}</div></section>
                {installation?.operationWorkbenchAvailable && <WorkbenchEntry />}
                <section><div className="relative flex items-center"><Button aria-label="Updates" data-trace-target={traceTargets("system.installation", "system.gui-version", "system.shell-update")} variant="ghost" className="h-10 w-full justify-start px-2" onClick={()=>setSettingsView("updates")}><span className="min-w-0 flex-1 text-left">Updates</span><ChevronRightIcon data-icon="inline-end"/></Button><div className="absolute right-9"><Button data-trace-target={traceTargets("system.check-update", "system.update", "system.restart")} size="sm" variant="outline" disabled={installationBusy} onClick={()=>void(updateProgress?.restartRequired?restartInstalledCore():Object.values(installation?.components??{}).some(component=>component.updateAvailable)?updateInstallation():checkInstallation())}>{installationAction==="checking"?"Checking…":updateBusy?"Updating…":updateProgress?.restartRequired?"Restart":Object.values(installation?.components??{}).some(component=>component.updateAvailable)?"Update":"Check updates"}</Button></div></div>{(updateBusy || updateProgress?.restartRequired || ["failed","interrupted"].includes(updateProgress?.state??""))&&<UpdateProgressView progress={updateProgress}/>}</section>
              </div>}
            </PopoverContent>
          </Popover>
        </aside>
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          {initialLoading ? (
            <div className="flex min-h-[80vh] items-center justify-center" role="status">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <LoaderCircleIcon className="size-7 animate-spin" />
                <p className="text-sm">Loading your workspace…</p>
              </div>
            </div>
          ) : workspaceLoadError ? (
            <ContextEmpty
              title="Couldn’t load your workspace"
              description={workspaceLoadError}
              action={<Button onClick={() => { setInitialLoading(true); setWorkspaceLoadError(undefined); void refreshOrganizations().then(() => refreshChannels()).catch((reason) => setWorkspaceLoadError(readableError(reason))).finally(() => setInitialLoading(false)); }}>Retry</Button>}
            />
          ) : selected ? (
            <ChannelContextProvider key={selected.id} channelId={selected.id} channelName={selected.name} createItem={createMentionItem} navigate={resource => { setWorkspaceItem(resource.kind==="message"?undefined:resource);setContextFocus({ ...resource }); setWorkspaceTab(resource.kind === "session" ? "sessions" : resource.kind === "message" ? "messages" : resource.kind === "skill" ? "skills" : resource.kind); }}><Tabs value={workspaceTab} onValueChange={setWorkspaceTab} className="flex min-h-0 flex-1 flex-col gap-0">
              <CatalogWorkspace key={selected.id} heading={<ChannelHeading channel={selected} members={members} onEdit={()=>setChannelDialog("identity")} onMembers={()=>setChannelDialog("members")} />} activity={agentActivity} quickShare={<QuickShareControl submenu
                  defaultAgent={installation?.defaultAgent ?? "codex"}
                  installedAgents={installation?.targets ?? {}}
                  onChoose={chooseFiles}
                  request={quickShareRequest}
                  onRequestConsumed={() => setQuickShareRequest(undefined)}
                  onCreated={() => { if (auth.user && activeHomeTip) completeHomeTip(auth.user.id, activeHomeTip); setActiveHomeTip(undefined); }}
                />} channelId={selected.id} channelName={selected.name} view={workspaceTab} focus={workspaceItem ?? contextFocus} onAdd={(kind,parent)=>void addWorkspaceItem(kind,parent)} onSelect={item=>{if(item==="add"||item==="message"){setWorkspaceItem(undefined);setContextFocus(undefined);setWorkspaceTab(item==="add"?"home":"messages");}else{setWorkspaceItem(item);if(item.kind!=="catalog"&&item.kind!=="skill")setContextFocus({kind:item.kind,id:item.id,name:item.name,channelId:selected.id});else setContextFocus(undefined);setWorkspaceTab(item.kind==="catalog"?"catalog":item.kind==="session"?"sessions":item.kind==="skill"?"skills":item.kind);}}}>
              <TabsContent value="home" className="min-h-0 flex-1 overflow-auto"><ChannelHome key={`${selected.id}:${activeHomeTip ?? "idle"}`} accountId={auth.user?.id ?? ""} busyTip={homeTryBusy} defaultAgent={installation?.defaultAgent ?? "codex"} installedAgents={installation?.targets ?? {}} actions={{channel: selected, onAdd: kind => void addWorkspaceItem(kind), onError: setError, quickShare: <QuickShareControl defaultAgent={installation?.defaultAgent ?? "codex"} installedAgents={installation?.targets ?? {}} onChoose={chooseFiles} />}} onTry={id => void tryHomeCase(id)} /></TabsContent>
              <TabsContent data-trace-target={traceTargets("context.people", "context.resources")} data-trace-region={"messages"} value="messages" className="min-h-0 flex-1 overflow-hidden">
                <MessagesView accountId={auth.user?.id ?? ""} focusId={contextFocus?.kind === "message" ? contextFocus.id : undefined} channelId={selected.id} channelName={selected.name} settingsOpenToken={agentSettingsOpenToken} onSettingsOpenConsumed={()=>setAgentSettingsOpenToken(0)} defaultAgent={installation?.defaultAgent ?? "codex"} installedAgents={installation?.targets ?? {}} onError={setError} onNotice={setNotice} onActivityChange={setAgentActivity}/>
              </TabsContent>
              <TabsContent data-trace-target={traceTargets("sessions.list")} data-trace-region={"sessions"} value="sessions" className="min-h-0 flex-1 overflow-hidden">
                <SessionsView
                  embedded
                  onCreated={id=>placedShare("session",id)}
                  focusId={contextFocus?.kind === "session" ? contextFocus.id : undefined}
                  channelId={selected.id}
                  channelName={selected.name}
                  shares={contextFocus?.kind==="session"?sessionShares.filter(row=>row.id===contextFocus.id):[]}
                  busy={busy}
                  defaultAgent={installation?.defaultAgent ?? "codex"}
                  installedAgents={installation?.targets ?? {}}
                  onRefresh={loadSessionShares}
                  onWithdraw={withdrawSession}
                />
              </TabsContent>
              <TabsContent data-trace-target={traceTargets("files.list")} data-trace-region={"files"} value="files" className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <FilesView
                  creationParentRef={catalogDestination ? `colab://resource/${selected.id}/catalog/${catalogDestination}` : `colab://channel/${encodeURIComponent(selected.name)}`}
                  focusId={contextFocus?.kind === "files" ? contextFocus.id : undefined}
                  shares={contextFocus?.kind==="files"?fileShares.filter(row=>row.id===contextFocus.id):[]}
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
              <TabsContent data-trace-target={traceTargets("skills.list")} data-trace-region={"skills"} value="skills" className="min-h-0 flex-1 overflow-y-auto">
                <SkillsView
                  creationParentRef={catalogDestination ? `colab://resource/${selected.id}/catalog/${catalogDestination}` : `colab://channel/${encodeURIComponent(selected.name)}`}
                  focusId={workspaceItem?.kind==="skill"?workspaceItem.id:undefined}
                  onCreated={id=>placedShare("skill",id)}
                  channelId={selected.id}
                  channelName={selected.name}
                  busy={busy}
                  defaultAgent={installation?.defaultAgent ?? "codex"}
                  installedAgents={installation?.targets ?? {}}
                  onChoose={chooseFiles}
                />
              </TabsContent>
              <TabsContent data-trace-region={"canvas"} value="canvas" className="min-h-0 flex-1 overflow-hidden">
                <CanvasView embedded focusId={contextFocus?.kind === "canvas" ? contextFocus.id : undefined} channelId={selected.id} channelName={selected.name} defaultAgent={installation?.defaultAgent ?? "codex"} installedAgents={installation?.targets ?? {}} />
              </TabsContent>
              </CatalogWorkspace>
              {/* Creation preserves the selected preview; placedShare navigates only after success. */}
              {creationKind === "session" && <SessionsView creationOnly onCreationClose={closeCreation} onCreated={id=>placedShare("session",id,currentCreationToken)} channelId={selected.id} channelName={selected.name} shares={[]} busy={busy} defaultAgent={installation?.defaultAgent ?? "codex"} installedAgents={installation?.targets ?? {}} onRefresh={loadSessionShares} onWithdraw={withdrawSession} />}
              {creationKind === "files" && <FilesView creationOnly onCreationClose={closeCreation} creationParentRef={catalogDestination ? `colab://resource/${selected.id}/catalog/${catalogDestination}` : `colab://channel/${encodeURIComponent(selected.name)}`} shares={[]} busy={busy} onChoose={chooseFiles} onShare={shareFiles} onEnsureLocal={ensureLocalFiles} onWithdraw={withdrawFiles} onRetry={share=>void retryFiles(share)} defaultAgent={installation?.defaultAgent ?? "codex"} installedAgents={installation?.targets ?? {}} />}
              {creationKind === "skill" && <SkillsView creationOnly onCreationClose={closeCreation} creationParentRef={catalogDestination ? `colab://resource/${selected.id}/catalog/${catalogDestination}` : `colab://channel/${encodeURIComponent(selected.name)}`} onCreated={id=>placedShare("skill",id,currentCreationToken)} channelId={selected.id} channelName={selected.name} busy={busy} defaultAgent={installation?.defaultAgent ?? "codex"} installedAgents={installation?.targets ?? {}} onChoose={chooseFiles} />}
              <Dialog open={Boolean(channelDialog)} onOpenChange={open=>{if(!open)setChannelDialog(undefined);}}>
                <DialogContent data-trace-region="channel-settings" className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                  <DialogHeader><DialogTitle>{channelDialog==="members"?"Members":"Edit Channel"}</DialogTitle></DialogHeader>
                  {channelDialog && <ChannelSettingsContent key={`${selected.id}:${channelDialog}`} mode={channelDialog} channel={selected} members={members} busy={busy} onSave={saveChannel} onAdd={addMember} onLoad={()=>void loadMembers().catch(reason=>setError(String(reason)))} onRole={changeRole} onRemove={removeMember} onInvite={()=>void inviteToChannel()} inviteBusy={channelInviteBusy} defaultAgent={installation?.defaultAgent ?? "codex"} installedAgents={installation?.targets ?? {}} onRefresh={()=>refreshChannels().catch(reason=>setError(readableError(reason)))} />}
                </DialogContent>
              </Dialog>
            </Tabs></ChannelContextProvider>
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
                  : enterpriseDeployment ? "使用公司 SSO 登录，加入企业协作空间。" : "Sign in with Google to create or join a Channel."
              }
              action={
                auth.authenticated ? (
                  <Button onClick={() => setShowCreate(true)}>
                    Create Channel
                  </Button>
                ) : (
                  <Button disabled={busy} onClick={() => void signIn()}>
                    {enterpriseDeployment ? "公司 SSO 登录" : "Sign in with Google"}
                  </Button>
                )
              }
            />
          )}
          {(error ?? auth.error) && (
            <div role="alert" className="fixed right-5 bottom-5 left-24 flex items-center gap-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"><span className="min-w-0 flex-1 break-words">{error ?? auth.error}</span>{error&&<Button size="sm" variant="ghost" onClick={()=>setError(undefined)}>Dismiss</Button>}</div>
          )}
          {notice && (
            <div role="status" className="fixed right-5 bottom-5 flex items-center gap-3 rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground shadow-lg"><span>{notice}</span><Button size="sm" variant="ghost" onClick={()=>setNotice(undefined)}>Dismiss</Button></div>
          )}
        </section>
        </div>
        <InviteSessionDialog invite={sessionInvite} onClose={() => setSessionInvite(undefined)} onError={setError} />
        <Dialog open={deviceAccounts.length > 0}><DialogContent showCloseButton={false}><DialogHeader><DialogTitle>Choose your account</DialogTitle><DialogDescription>This device is linked to more than one Colab account.</DialogDescription></DialogHeader><div className="flex flex-col gap-2">{deviceAccounts.map(account => <Button key={account.id} variant="outline" disabled={busy} onClick={() => {
          setBusy(true); void fetch("/v1/auth/device/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: account.id }) }).then(async response => { if (!response.ok) throw new Error(await response.text()); loginReady.current=true; setDeviceAccounts([]); await refreshAuth(true); await refreshAccounts(); }).catch(reason => setError(readableError(reason))).finally(() => setBusy(false));
        }}>{account.displayName ?? "Colab account"}</Button>)}</div></DialogContent></Dialog>
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
