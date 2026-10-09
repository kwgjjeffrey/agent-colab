import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { runOperation } from "@/api/operation-runner";
import { traceTargets } from "@/api/trace-locators";
import {
  FolderIcon,
  ChevronRightIcon,
  PlusIcon,
  MessageSquareIcon,
  FileIcon,
  MessagesSquareIcon,
  SparklesIcon,
  FileTextIcon,
  HouseIcon,
  EllipsisIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import type { OperationScope } from "@/api/operation-runner";
import { ItemIcon } from "./ItemIcon";
import { CatalogDragTarget, type DropPosition } from "./CatalogDragTarget";
import {
  WorkspaceActionProvider,
  WorkspaceActionSlot,
} from "./WorkspaceActions";

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
    { kind: "session", label: "Session", icon: MessagesSquareIcon },
    { kind: "files", label: "Files", icon: FileIcon },
    { kind: "skill", label: "Skill", icon: SparklesIcon },
  ];
export async function catalogRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
  operation?: OperationScope,
): Promise<T> {
  const response = await (operation?.fetch ?? trackedFetch)(path, {
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
  quickShare?: ReactNode;
  heading?: ReactNode;
  activity?: string;
};
export function CatalogWorkspace({
  channelId,
  channelName,
  view,
  focus,
  onSelect,
  onAdd,
  children,
  quickShare,
  heading,
  activity,
}: Props) {
  const [branches, setBranches] = useState<Record<string, CatalogItem[]>>({});
  const loadEpoch = useRef(0);
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
  const [renaming, setRenaming] = useState<CatalogItem>();
  const renameCommit = useRef(false);
  const renameCancelled = useRef(false);
  async function commitRename() {
    if (!renaming || renameCommit.current || renameCancelled.current) return;
    const item = renaming,
      value = name.trim();
    if (!value || value === item.name) {
      setRenaming(undefined);
      return;
    }
    renameCommit.current = true;
    try {
      await mutate((operation) =>
        catalogRequest(
          item.kind === "canvas"
            ? `/v1/canvases/${item.id}`
            : `/v1/channels/${channelId}/catalogs/${item.id}`,
          "PATCH",
          { name: value },
          operation,
        ),
      );
      setRenaming(undefined);
      if (selected?.id === item.id) onSelect({ ...item, name: value });
    } catch {
      /* Keep the input and expose the mutation error for correction. */
    } finally {
      renameCommit.current = false;
    }
  }
  const [moving, setMoving] = useState(false);
  const [focusedTrail, setFocusedTrail] = useState<CatalogItem[]>([]);
  const [previewPath, setPreviewPath] = useState<{
    id: string;
    path?: string;
  }>();
  useEffect(() => {
    const update = (event: Event) =>
      setPreviewPath(
        (event as CustomEvent<{ id: string; path?: string }>).detail,
      );
    window.addEventListener("colab:preview-path", update);
    return () => window.removeEventListener("colab:preview-path", update);
  }, []);
  const [trailRevision, setTrailRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setTrailRevision((value) => value + 1);
    window.addEventListener("colab:catalog-changed", refresh);
    return () => window.removeEventListener("colab:catalog-changed", refresh);
  }, []);
  async function load(parent?: string) {
    const epoch = loadEpoch.current;
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
    if (epoch === loadEpoch.current)
      setBranches((current) => ({ ...current, [parent ?? "root"]: result }));
  }
  useEffect(() => {
    setBranches({});
    loadEpoch.current++;
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
  const all = [
    ...new Map(
      [...focusedTrail, ...Object.values(branches).flat()].map((item) => [
        `${item.kind}:${item.id}`,
        item,
      ]),
    ).values(),
  ];
  const selected =
    view === "catalog"
      ? (all.find((item) => item.id === selectedCatalog?.id) ?? selectedCatalog)
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
  async function mutate(
    action: (operation: OperationScope) => Promise<unknown>,
  ) {
    return runOperation("workspace.mutate", async (operation) => {
      setWorking(true);
      setError(undefined);
      try {
        await action(operation);
        loadEpoch.current++;
        window.dispatchEvent(new Event("colab:catalog-changed"));
      } catch (reason) {
        setError(String(reason));
        throw reason;
      } finally {
        setWorking(false);
      }
    });
  }
  async function drop(
    source: CatalogItem,
    target: CatalogItem | undefined,
    position: DropPosition,
  ) {
    const parentId =
      position === "inside" ? (target?.id ?? null) : (target?.parentId ?? null);
    const siblings = branches[parentId ?? "root"] ?? [];
    let before = position === "before" ? target : undefined;
    if (position === "after" && target) {
      const index = siblings.findIndex((row) => row.id === target.id);
      before = siblings.slice(index + 1).find((row) => row.id !== source.id);
    }
    try {
      await mutate((operation) =>
        catalogRequest(
          `/v1/channels/${channelId}/catalog-items/position`,
          "PATCH",
          {
            kind: source.kind,
            itemId: source.id,
            parentId,
            before: before
              ? { kind: before.kind, itemId: before.id }
              : undefined,
          },
          operation,
        ),
      );
      setBranches((current) =>
        Object.fromEntries(
          Object.entries(current).map(([key, items]) => [
            key,
            items.filter((item) => item.id !== source.id),
          ]),
        ),
      );
      if (parentId) {
        setExpanded((current) => ({ ...current, [parentId]: true }));
        await load(parentId);
      }
      await load(source.parentId ?? undefined);
      await load(parentId ?? undefined);
    } catch {
      /* mutate exposes the authoritative failure; no optimistic success. */
    }
  }
  function rows(parent?: string, depth = 0): ReactNode {
    if (depth > 64) return null;
    return (branches[parent ?? "root"] ?? []).map((item) => {
      return (
        <Collapsible key={item.id} open={Boolean(expanded[item.id])}>
          <CatalogDragTarget
            item={item}
            channelId={channelId}
            disabled={working}
            onDrop={(source, position) => void drop(source, item, position)}
          >
            <div className="group flex min-w-0 items-center gap-0">
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
              {renaming?.id === item.id ? (
                <Input
                  aria-label="Item name"
                  value={name}
                  autoFocus
                  disabled={working}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => setName(event.target.value)}
                  onBlur={() => void commitRename()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void commitRename();
                    if (event.key === "Escape") {
                      event.preventDefault();
                      renameCancelled.current = true;
                      setRenaming(undefined);
                    }
                  }}
                />
              ) : (
                <Button
                  variant={selected?.id === item.id ? "secondary" : "ghost"}
                  className={cn(
                    "min-w-0 flex-1 justify-start",
                    item.kind === "catalog" && "pl-1",
                  )}
                  title={item.name}
                  data-item-id={item.id}
                  data-item-kind={item.kind}
                  data-trace-nav="workspace.item"
                  data-trace-target={
                    item.kind === "files"
                      ? traceTargets("files.browse")
                      : item.kind === "canvas"
                        ? traceTargets("canvas.list")
                        : undefined
                  }
                  onClick={() => select(item)}
                  onDoubleClick={() => {
                    if (item.kind === "catalog" || item.kind === "canvas") {
                      renameCancelled.current = false;
                      setName(item.name);
                      setRenaming(item);
                    }
                  }}
                >
                  {item.kind !== "catalog" && (
                    <ItemIcon kind={item.kind} name={item.name} />
                  )}
                  <span className="truncate">{item.name}</span>
                </Button>
              )}
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
                      {kinds.map(({ kind, label }) => (
                        <DropdownMenuItem
                          key={kind}
                          onClick={() => add(kind, item.id)}
                        >
                          <ItemIcon kind={kind} name={label} />
                          {label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </CatalogDragTarget>
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
    <WorkspaceActionProvider>
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel
          id="channel-sidebar"
          defaultSize={
            Number(localStorage.getItem("colab:sidebar-width")) || 350
          }
          minSize={260}
          maxSize="50%"
          onResize={(size) =>
            localStorage.setItem(
              "colab:sidebar-width",
              String(Math.round(size.inPixels)),
            )
          }
        >
          <aside
            className="flex h-full min-h-0 flex-col gap-1 p-3"
            aria-label="Channel items"
            data-trace-region="catalog-items"
            data-trace-target={traceTargets("workspace.mutate")}
          >
            {heading && (
              <div className="mb-2 flex h-12 shrink-0 items-center">
                {heading}
              </div>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="default" className="justify-start" />}
              >
                <PlusIcon data-icon="inline-start" />
                Add
              </DropdownMenuTrigger>
              <DropdownMenuContent keepMounted align="start" className="w-52">
                <DropdownMenuGroup>
                  {kinds.map(({ kind, label }) => (
                    <DropdownMenuItem key={kind} onClick={() => add(kind)}>
                      <ItemIcon kind={kind} name={label} />
                      {label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                {quickShare}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant={view === "home" ? "secondary" : "ghost"}
              className="justify-start"
              onClick={() => {
                setSelectedCatalog(undefined);
                onSelect("add");
              }}
            >
              <HouseIcon data-icon="inline-start" />
              Home
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
            <ScrollArea className="min-h-0 flex-1">
              <CatalogDragTarget
                channelId={channelId}
                disabled={working}
                onDrop={(source) => void drop(source, undefined, "inside")}
              >
                <div className="min-h-[calc(100vh-240px)] pb-16">{rows()}</div>
              </CatalogDragTarget>
            </ScrollArea>
          </aside>
        </ResizablePanel>
        <ResizableHandle aria-label="Resize Channel sidebar" />
        <ResizablePanel id="channel-content" minSize={300}>
          <section className="flex h-full min-h-0 min-w-0 flex-col">
            {activity && (
              <span
                role="status"
                className="shrink-0 truncate px-6 py-1 text-xs text-muted-foreground"
              >
                {activity}
              </span>
            )}
            {selected && (
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
                <div className="min-w-0 flex-1 basis-full overflow-hidden md:basis-0">
                  <Breadcrumb>
                    <BreadcrumbList className="flex-nowrap whitespace-nowrap">
                      <BreadcrumbItem>
                        <BreadcrumbLink
                          render={
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCatalog(undefined);
                                onSelect("add");
                              }}
                            />
                          }
                        >
                          {channelName}
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                      {trail.map((item) => (
                        <Fragment key={item.id}>
                          <BreadcrumbSeparator />
                          <BreadcrumbItem>
                            <BreadcrumbLink
                              render={
                                <button
                                  type="button"
                                  onClick={() => select(item)}
                                />
                              }
                            >
                              {item.name}
                            </BreadcrumbLink>
                          </BreadcrumbItem>
                        </Fragment>
                      ))}
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        {previewPath?.id === selected.id && previewPath.path ? (
                          <BreadcrumbLink
                            render={
                              <button
                                type="button"
                                onClick={() =>
                                  window.dispatchEvent(
                                    new CustomEvent("colab:preview-navigate", {
                                      detail: { id: selected.id, path: "" },
                                    }),
                                  )
                                }
                              />
                            }
                          >
                            {selected.name}
                          </BreadcrumbLink>
                        ) : (
                          <BreadcrumbPage
                            title={selected.name}
                            className="truncate max-w-80"
                          >
                            {selected.name}
                          </BreadcrumbPage>
                        )}
                      </BreadcrumbItem>
                      {previewPath?.id === selected.id &&
                        previewPath.path
                          ?.split("/")
                          .map((part, index, parts) => (
                            <Fragment key={index}>
                              <BreadcrumbSeparator />
                              <BreadcrumbItem>
                                {index === parts.length - 1 ? (
                                  <BreadcrumbPage>{part}</BreadcrumbPage>
                                ) : (
                                  <BreadcrumbLink
                                    render={
                                      <button
                                        type="button"
                                        onClick={() =>
                                          window.dispatchEvent(
                                            new CustomEvent(
                                              "colab:preview-navigate",
                                              {
                                                detail: {
                                                  id: selected.id,
                                                  path: parts
                                                    .slice(0, index + 1)
                                                    .join("/"),
                                                },
                                              },
                                            ),
                                          )
                                        }
                                      />
                                    }
                                  >
                                    {part}
                                  </BreadcrumbLink>
                                )}
                              </BreadcrumbItem>
                            </Fragment>
                          ))}
                    </BreadcrumbList>
                  </Breadcrumb>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    id="workspace-item-actions"
                    className="flex items-center gap-2"
                  >
                    <WorkspaceActionSlot primary />
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="More item actions"
                        />
                      }
                    >
                      <EllipsisIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent keepMounted align="end">
                      <DropdownMenuGroup>
                        <WorkspaceActionSlot />
                        <DropdownMenuItem
                          disabled={selected.canMove === false}
                          onClick={() => setMoving(true)}
                        >
                          Move
                        </DropdownMenuItem>
                        {selected.kind === "catalog" && (
                          <>
                            <DropdownMenuItem
                              onClick={() => {
                                setName(selected.name);
                                setForm({ item: selected });
                              }}
                            >
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={working}
                              onClick={() =>
                                void mutate(async (operation) => {
                                  await catalogRequest(
                                    `/v1/channels/${channelId}/catalogs/${selected.id}`,
                                    "DELETE",
                                    undefined,
                                    operation,
                                  );
                                  onSelect("add");
                                  setSelectedCatalog(undefined);
                                }).catch(() => {})
                              }
                            >
                              Remove empty catalog
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
                  {(branches[selectedCatalog?.id ?? "root"] ?? []).map(
                    (item) => (
                      <Button
                        key={item.id}
                        variant="ghost"
                        className="justify-start"
                        onClick={() => select(item)}
                      >
                        {item.name}
                      </Button>
                    ),
                  )}
                </div>
              </ScrollArea>
            ) : (
              children
            )}
          </section>
        </ResizablePanel>
      </ResizablePanelGroup>
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
              void mutate(async (operation) => {
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
                  operation,
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
                    void mutate(async (operation) => {
                      await catalogRequest(
                        `/v1/channels/${channelId}/catalog-items/position`,
                        "PATCH",
                        {
                          kind: selected?.kind,
                          itemId: selected?.id,
                          parentId: item.id,
                        },
                        operation,
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
    </WorkspaceActionProvider>
  );
}
