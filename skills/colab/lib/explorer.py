"""Mixed-tree discovery; legacy consumer references remain independent of placement."""
from urllib.parse import quote, unquote, urlparse
from local_api import LocalApiError, request


def parse_ref(value):
    uri = urlparse(value)
    if uri.scheme != "colab" or uri.query or uri.fragment:
        raise ValueError("Use colab:// or colab://channel/<channel>/<catalog...>/<item>")
    if not uri.netloc and uri.path in ("", "/"):
        return None, []
    if uri.netloc == "resource":
        parts=uri.path.strip("/").split("/")
        if len(parts)!=3 or parts[1] not in ("catalog","canvas","session","files","skill") or any(not p for p in parts):
            raise ValueError("Stable Explorer reference must be colab://resource/<channel>/<kind>/<id>")
        return unquote(parts[0]), [unquote(p) for p in parts[1:]]
    parts = uri.path.strip("/").split("/")
    if uri.netloc != "channel" or not parts or any(not p for p in parts):
        raise ValueError("Use colab://channel/<channel>/<catalog...>/<item>")
    return unquote(parts[0]), [unquote(p) for p in parts[1:]]


def path_ref(channel, path=()):
    return "colab://channel/" + "/".join(quote(p, safe="") for p in [channel, *path])


def match(rows, value):
    return [r for r in rows if r["id"] == value] or [r for r in rows if r["name"].casefold() == value.casefold()]


def children(core, channel, parent=None, offset=0, limit=100):
    query = f"offset={offset}&limit={limit}"
    if parent:
        query += "&parentId=" + quote(parent, safe="")
    return request("GET", f"/v1/channels/{channel}/catalog-items?{query}", core=core)


def all_children(core, channel, parent):
    offset = 0
    while True:
        page = children(core, channel, parent, offset, 200)
        yield from page
        if len(page) < 200:
            return
        offset += len(page)


def resolve(core, ref):
    name, path = parse_ref(ref)
    if name is None:
        raise ValueError("A Channel reference is required")
    if urlparse(ref).netloc=="resource":
        channels=match(request("GET","/v1/channels",core=core),name)
        if len(channels)!=1:
            raise LocalApiError("Stable reference Channel is not available")
        rows=request("GET",f"/v1/channels/{quote(channels[0]['id'],safe='')}/catalog-items/{quote(path[0],safe='')}/{quote(path[1],safe='')}/trail",core=core)
        if not rows:
            raise LocalApiError("Stable resource is no longer available")
        return channels[0],rows[-1]
    candidates = [(c, None) for c in match(request("GET", "/v1/channels", core=core), name)]
    for segment in path:
        next_candidates = []
        for channel, parent in candidates:
            if parent is not None and parent["kind"] != "catalog":
                continue
            rows = list(all_children(core, channel["id"], parent["id"] if parent else None))
            next_candidates.extend((channel, row) for row in match(rows, segment))
        candidates = next_candidates
    if not candidates:
        raise LocalApiError("Resource not found in the active account and Organization")
    if len(candidates) != 1:
        raise LocalApiError("Explorer reference is ambiguous; choose a stableRef from its parent listing", 2)
    return candidates[0]


def entry(channel, path, row):
    kind = row["kind"]
    # Consumer refs use the existing UUID fallback, so relocation cannot break
    # Session Reader, Files use, Skill installation or Canvas operations.
    stable = path_ref(channel["id"], ["canvas", row["id"]] if kind == "canvas" else [row["id"]])
    result = {"ref": path_ref(channel["name"], [*path, row["name"]]),
              "kind": kind, "name": row["name"], "updatedAt": row["updatedAt"],
              "explorerRef": "colab://resource/"+"/".join(quote(p,safe="") for p in [channel["id"],kind,row["id"]])}
    if kind != "catalog":
        result["stableRef"] = stable
    else:
        result["stableRef"] = result["explorerRef"]
    return result


def open_ref(core, ref, offset=0, limit=100):
    name, path = parse_ref(ref)
    if name is None:
        return {"items": [{"ref": path_ref(c["name"]), "kind": "channel", "name": c["name"]}
                          for c in request("GET", "/v1/channels", core=core)]}
    channel, item = resolve(core, ref)
    if urlparse(ref).netloc=="resource":
        trail=request("GET",f"/v1/channels/{channel['id']}/catalog-items/{item['kind']}/{item['id']}/trail",core=core)
        path=[row["name"] for row in trail]
    if item is not None and item["kind"] != "catalog":
        return entry(channel, path[:-1], item)
    rows = children(core, channel["id"], item["id"] if item else None, offset, limit + 1)
    result = {"items": [entry(channel, path, row) for row in rows[:limit]]}
    if len(rows) > limit:
        result["nextOffset"] = offset + limit
    return result


def destination(core, ref):
    channel, item = resolve(core, ref)
    if item is not None and item["kind"] != "catalog":
        raise ValueError("Destination must be a Channel or Catalog")
    return channel, item


def readable_path(core, ref, channel, item):
    if urlparse(ref).netloc!="resource": return parse_ref(ref)[1]
    trail=request("GET",f"/v1/channels/{channel['id']}/catalog-items/{item['kind']}/{item['id']}/trail",core=core)
    return [row["name"] for row in trail]


def create_catalog(core, parent_ref, name):
    channel, parent = destination(core, parent_ref)
    row = request("POST", f"/v1/channels/{channel['id']}/catalogs", core=core,
                  body={"name": name, "parentId": parent["id"] if parent else None})
    path = readable_path(core,parent_ref,channel,parent)
    return {"created": True, "ref": path_ref(channel["name"], [*path, row["name"]])}


def mutate_catalog(core, ref, name=None, remove=False):
    channel, item = destination(core, ref)
    if item is None:
        raise ValueError("A Catalog reference is required")
    endpoint = f"/v1/channels/{channel['id']}/catalogs/{item['id']}"
    if remove:
        request("DELETE", endpoint, core=core)
        return {"removed": True}
    row = request("PATCH", endpoint, core=core, body={"name": name})
    path = readable_path(core,ref,channel,item)
    return {"renamed": True, "ref": path_ref(channel["name"], [*path[:-1], row["name"]])}


def move(core, ref, parent_ref):
    channel, item = resolve(core, ref)
    target_channel, parent = destination(core, parent_ref)
    if item is None or channel["id"] != target_channel["id"]:
        raise ValueError("Move requires an item and a destination in the same Channel")
    request("PATCH", f"/v1/channels/{channel['id']}/catalog-items/position", core=core,
            body={"kind": item["kind"], "itemId": item["id"], "parentId": parent["id"] if parent else None})
    path = readable_path(core,parent_ref,target_channel,parent)
    return {"moved": True, **entry(channel, path, item)}


def share(core, parent_ref, item_type, source, name=None):
    # Reuse the existing registration protocol. Browser itself remains unchanged.
    import importlib.machinery
    import importlib.util
    from pathlib import Path
    channel, parent = destination(core, parent_ref)
    loader = importlib.machinery.SourceFileLoader("colab_legacy_browser", str(Path(__file__).resolve().parents[1] / "bin" / "colab-browser"))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    browser = importlib.util.module_from_spec(spec)
    loader.exec_module(browser)
    row = browser.share_item(core, path_ref(channel["id"]), item_type, source, name)
    stable = path_ref(channel["id"], [row["id"]])
    if parent:
        try:
            request("PATCH", f"/v1/channels/{channel['id']}/catalog-items/position", core=core,
                    body={"kind": item_type, "itemId": row["id"], "parentId": parent["id"]})
        except LocalApiError as error:
            raise LocalApiError(f"Asset was shared at Channel root but placement failed. Existing asset: {stable}. {error}", error.exit_code) from error
    path = readable_path(core,parent_ref,channel,parent)
    return {"shared": True, "ref": path_ref(channel["name"], [*path, row["name"]]), "stableRef": stable}
