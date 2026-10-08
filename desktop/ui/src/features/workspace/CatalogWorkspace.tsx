import { Fragment, useEffect, useState, type ReactNode } from "react";
import {
  FolderIcon,
  ChevronRightIcon,
  PlusIcon,
  MessageSquareIcon,
  FileIcon,
  NotebookIcon,
  SparklesIcon,
  FileTextIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbSeparator,
  BreadcrumbLink,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "cn";
import { trackedFetch } from "@/api/request-activity";

export type CatalogItem = {
  id: string;
  kind: "catalog" | "canvas" | "session" | "files" | "skill";
  name: string;
  parentId: string | null;
  updatedAt: string;
  canMove?: boolean;
};
export type AddKind = CatalogItem["kind"];
const kinds: Array<{ kind: AddKind; label: string; icon: typeof FolderIcon }> =
  [
    { kind: "catalog", label: "Catalog", icon: FolderIcon },
    { kind: "canvas", label: "Canvas", icon: FileTextIcon },
    { kind: "session", label: "Session", icon: NotebookIcon },
    { kind: "files", label: "Files", icon: FileIcon },
    { kind: "skill", label: "Skill", icon: SparklesIcon },
  ];
export async function catalogRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await trackedFetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.status === 204 ? (undefined as T) : response.json();
}

type Props = {
  channelId: string;
  channelName: string;
  view: string | number;
  focus?: { id: string; kind: string };
  onSelect: (item: CatalogItem | "add" | "message") => void;
  onAdd: (kind: AddKind, parentId?: string) => void;
  children: ReactNode;
};
export function CatalogWorkspace({
  channelId,
  channelName,
  view,
  focus,
  onSelect,
  onAdd,
  children,
}: Props) {
  const [branches, setBranches] = useState<Record<string, CatalogItem[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedCatalog, setSelectedCatalog] = useState<CatalogItem>();
  const [error, setError] = useState<string>();
  const [working, setWorking] = useState(false);
  const [form, setForm] = useState<{
    parent?: string;
    item?: CatalogItem;
    kind?: "catalog" | "canvas";
  }>();
  const [name, setName] = useState("");
  const [moving, setMoving] = useState(false);
  const [focusedTrail, setFocusedTrail] = useState<CatalogItem[]>([]);
  const [previewPath, setPreviewPath] = useState<{id:string;path?:string}>();
  useEffect(() => {
    const update=(event:Event)=>setPreviewPath((event as CustomEvent<{id:string;path?:string}>).detail);
    window.addEventListener("colab:preview-path",update);
    return ()=>window.removeEventListener("colab:preview-path",update);
  },[]);
  const [trailRevision, setTrailRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setTrailRevision(value => value + 1);
    window.addEventListener("colab:catalog-changed", refresh);
    return () => window.removeEventListener("colab:catalog-changed", refresh);
  }, []);
  async function load(parent?: string) {
    const result: CatalogItem[] = [];
    let offset = 0;
    while (true) {
      const page = await catalogRequest<CatalogItem[]>(
        `/v1/channels/${channelId}/catalog-items?limit=200&offset=${offset}${parent ? `&parentId=${encodeURIComponent(parent)}` : ""}`,
      );
      result.push(...page);
      if (page.length < 200) break;
      offset += page.length;
    }
    setBranches((current) => ({ ...current, [parent ?? "root"]: result }));
  }
  useEffect(() => {
    setBranches({});
    setExpanded({});
    setSelectedCatalog(undefined);
    setError(undefined);
    void load().catch((reason) => setError(String(reason)));
  }, [channelId]);
  useEffect(() => {
    setFocusedTrail([]);
    if (!focus) return;
    void catalogRequest<CatalogItem[]>(
      `/v1/channels/${channelId}/catalog-items/${focus.kind}/${focus.id}/trail`,
    )
      .then((path) => {
        setFocusedTrail(path);
        const current = path.at(-1);
        if (current?.kind === "catalog") setSelectedCatalog(current);
        for (const ancestor of path.slice(0, -1)) {
          setExpanded((value) => ({ ...value, [ancestor.id]: true }));
          void load(ancestor.id).catch((reason) => setError(String(reason)));
        }
      })
      .catch((reason) => setError(String(reason)));
  }, [channelId, focus?.id, focus?.kind, trailRevision]);
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (
        event as CustomEvent<{ kind: "catalog" | "canvas"; parentId?: string }>
      ).detail;
      setName("");
      setForm({ kind: detail.kind, parent: detail.parentId });
    };
    window.addEventListener("colab:catalog-add", listener);
    return () => window.removeEventListener("colab:catalog-add", listener);
  }, [channelId]);
  useEffect(() => {
    const refresh = () => {
      void Promise.all([
        load(),
        ...Object.keys(expanded)
          .filter((id) => expanded[id])
          .map((id) => load(id)),
      ]).catch((reason) => setError(String(reason)));
    };
    const timer = window.setInterval(refresh, 10000);
    window.addEventListener("colab:catalog-changed", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("colab:catalog-changed", refresh);
    };
  }, [channelId, expanded]);
  const all = [...new Map([...focusedTrail,...Object.values(branches).flat()].map(item=>[`${item.kind}:${item.id}`,item])).values()];
  const selected =
    view === "catalog"
      ? all.find(item=>item.id===selectedCatalog?.id)??selectedCatalog
      : all.find((item) => item.id === focus?.id);
  const trail: CatalogItem[] = [];
  const seen = new Set<string>();
  let parent = selected?.parentId;
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    const item = all.find((row) => row.id === parent);
    if (!item) break;
    trail.unshift(item);
    parent = item.parentId;
  }
  function select(item: CatalogItem) {
    setSelectedCatalog(item.kind === "catalog" ? item : undefined);
    onSelect(item);
    if (item.kind === "catalog") {
      setExpanded((current) => ({ ...current, [item.id]: true }));
      void load(item.id).catch((reason) => setError(String(reason)));
    }
  }
  function add(kind: AddKind, parent?: string) {
    if (kind === "catalog" || kind === "canvas") {
      setName("");
      setForm({ parent, kind });
    } else onAdd(kind, parent);
  }
  async function mutate(action: () => Promise<unknown>) {
    setWorking(true);
    setError(undefined);
    try {
      await action();
      window.dispatchEvent(new Event("colab:catalog-changed"));
    } catch (reason) {
      setError(String(reason));
      throw reason;
    } finally {
      setWorking(false);
    }
  }
  function rows(parent?: string, depth = 0): ReactNode {
    if (depth > 64) return null;
    return (branches[parent ?? "root"] ?? []).map((item) => {
      const Icon = kinds.find((row) => row.kind === item.kind)!.icon;
      return (
        <Collapsible key={item.id} open={Boolean(expanded[item.id])}>
          <div className="group flex min-w-0 items-center gap-1">
            {item.kind === "catalog" && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Expand ${item.name}`}
                onClick={() => {
                  const open = !expanded[item.id];
                  setExpanded((current) => ({ ...current, [item.id]: open }));
                  if (open)
                    void load(item.id).catch((reason) =>
                      setError(String(reason)),
                    );
                }}
              >
                <ChevronRightIcon
                  className={cn(expanded[item.id] && "rotate-90")}
                />
              </Button>
            )}
            <Button
              variant={selected?.id === item.id ? "secondary" : "ghost"}
              className="min-w-0 flex-1 justify-start"
              title={item.name}
              data-item-id={item.id}
              data-item-kind={item.kind}
              onClick={() => select(item)}
            >
              <Icon data-icon="inline-start" />
              <span className="truncate">{item.name}</span>
            </Button>
            {item.kind === "catalog" && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                      aria-label={`Add to ${item.name}`}
                    />
                  }
                >
                  <PlusIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuGroup>
                    {kinds.map(({ kind, label, icon: TypeIcon }) => (
                      <DropdownMenuItem
                        key={kind}
                        onClick={() => add(kind, item.id)}
                      >
                        <TypeIcon />
                        {label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          {item.kind === "catalog" && (
            <CollapsibleContent>
              <div className="ml-4">{rows(item.id, depth + 1)}</div>
            </CollapsibleContent>
          )}
        </Collapsible>
      );
    });
  }
  return (
    <div className="flex min-h-0 flex-1 border-t">
      <aside
        className="flex w-64 shrink-0 flex-col gap-1 border-r p-3"
        aria-label="Channel items"
      >
        <Button
          variant={view === "home" ? "secondary" : "ghost"}
          className="justify-start"
          onClick={() => {
            setSelectedCatalog(undefined);
            onSelect("add");
          }}
        >
          <PlusIcon data-icon="inline-start" />
          Add
        </Button>
        <Button
          variant={view === "messages" ? "secondary" : "ghost"}
          className="justify-start"
          onClick={() => {
            setSelectedCatalog(undefined);
            onSelect("message");
          }}
        >
          <MessageSquareIcon data-icon="inline-start" />
          Message
        </Button>
        <ScrollArea className="min-h-0 flex-1">{rows()}</ScrollArea>
      </aside>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        {selected && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b px-6 py-3">
            <div className="min-w-0 flex-1 overflow-hidden">
              <Breadcrumb>
                <BreadcrumbList className="flex-nowrap whitespace-nowrap">
                  <BreadcrumbItem>
                    <BreadcrumbLink render={<button type="button" onClick={() => { setSelectedCatalog(undefined); onSelect("add"); }} />}>
                      {channelName}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  {trail.map((item) => (
                    <Fragment key={item.id}>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <BreadcrumbLink render={<button type="button" onClick={() => select(item)} />}>
                          {item.name}
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                    </Fragment>
                  ))}
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>{previewPath?.id===selected.id && previewPath.path ? <BreadcrumbLink render={<button type="button" onClick={()=>window.dispatchEvent(new CustomEvent("colab:preview-navigate",{detail:{id:selected.id,path:""}}))} />}>{selected.name}</BreadcrumbLink> : <BreadcrumbPage title={selected.name} className="truncate max-w-80">{selected.name}</BreadcrumbPage>}</BreadcrumbItem>
                  {previewPath?.id===selected.id && previewPath.path?.split("/").map((part,index,parts)=><Fragment key={index}><BreadcrumbSeparator/><BreadcrumbItem>{index===parts.length-1 ? <BreadcrumbPage>{part}</BreadcrumbPage> : <BreadcrumbLink render={<button type="button" onClick={()=>window.dispatchEvent(new CustomEvent("colab:preview-navigate",{detail:{id:selected.id,path:parts.slice(0,index+1).join("/")}}))} />}>{part}</BreadcrumbLink>}</BreadcrumbItem></Fragment>)}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <div className="flex items-center gap-2">
              <div
                id="workspace-item-actions"
                className="flex items-center gap-2"
              />
              <Button size="sm" variant="ghost" disabled={selected.canMove===false} onClick={() => setMoving(true)}>
                Move
              </Button>
              {selected.kind === "catalog" && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setName(selected.name);
                      setForm({ item: selected });
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={working}
                    onClick={() =>
                      void mutate(async () => {
                        await catalogRequest(
                          `/v1/channels/${channelId}/catalogs/${selected.id}`,
                          "DELETE",
                        );
                        onSelect("add");
                        setSelectedCatalog(undefined);
                      }).catch(() => {})
                    }
                  >
                    Remove empty catalog
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="px-6 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {view === "catalog" ? (
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-4 p-6">
              <div className="flex flex-wrap gap-2">
                {kinds.map(({ kind, label, icon: Icon }) => (
                  <Button
                    key={kind}
                    size="sm"
                    variant="outline"
                    onClick={() => add(kind, selectedCatalog?.id)}
                  >
                    <Icon data-icon="inline-start" />
                    {label}
                  </Button>
                ))}
              </div>
              {(branches[selectedCatalog?.id ?? "root"] ?? []).map((item) => (
                <Button
                  key={item.id}
                  variant="ghost"
                  className="justify-start"
                  onClick={() => select(item)}
                >
                  {item.name}
                </Button>
              ))}
            </div>
          </ScrollArea>
        ) : (
          children
        )}
      </section>
      <Dialog
        open={Boolean(form)}
        onOpenChange={(open) => {
          if (!open) setForm(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {form?.item
                ? "Rename catalog"
                : form?.kind === "canvas"
                  ? "Create Canvas"
                  : "Create catalog"}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void mutate(async () => {
                const canvas = form?.kind === "canvas";
                const row = await catalogRequest<{
                  id: string;
                  title?: string;
                  name?: string;
                }>(
                  canvas
                    ? `/v1/channels/${channelId}/canvases`
                    : form?.item
                      ? `/v1/channels/${channelId}/catalogs/${form.item.id}`
                      : `/v1/channels/${channelId}/catalogs`,
                  form?.item ? "PATCH" : "POST",
                  canvas
                    ? { title: name, folderId: form?.parent }
                    : { name, parentId: form?.parent },
                );
                if (canvas)
                  onSelect({
                    id: row.id,
                    kind: "canvas",
                    name: row.title ?? name,
                    parentId: form?.parent ?? null,
                    updatedAt: "",
                  });
                setForm(undefined);
              }).catch(() => {});
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="catalog-name">Name</FieldLabel>
                <Input
                  id="catalog-name"
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={200}
                />
              </Field>
              <Button type="submit" disabled={working || !name.trim()}>
                Save
              </Button>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={moving} onOpenChange={setMoving}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to catalog</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-80">
            <div className="flex flex-col gap-2">
              {[
                { id: null, name: channelName },
                ...all.filter(
                  (item) => item.kind === "catalog" && item.id !== selected?.id,
                ),
              ].map((item) => (
                <Button
                  key={item.id ?? "root"}
                  variant="ghost"
                  className="justify-start"
                  disabled={working}
                  onClick={() =>
                    void mutate(async () => {
                      await catalogRequest(
                        `/v1/channels/${channelId}/catalog-items/position`,
                        "PATCH",
                        {
                          kind: selected?.kind,
                          itemId: selected?.id,
                          parentId: item.id,
                        },
                      );
                      setMoving(false);
                    }).catch(() => {})
                  }
                >
                  {item.name}
                </Button>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
