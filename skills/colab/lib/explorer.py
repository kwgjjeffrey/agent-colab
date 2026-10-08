"""Mixed-tree discovery; legacy consumer references remain independent of placement."""
from urllib.parse import quote, unquote, urlparse
from local_api import LocalApiError, request


def parse_ref(value):
    uri = urlparse(value)
    if uri.scheme != "colab" or uri.query or uri.fragment:
        raise ValueError("Use colab:// or colab://channel/<channel>/<catalog...>/<item>")
    if not uri.netloc and uri.path in ("", "/"):
        return None, []
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
              "kind": kind, "name": row["name"], "updatedAt": row["updatedAt"]}
    if kind != "catalog":
        result["stableRef"] = stable
    else:
        result["catalogId"] = row["id"]
    return result


def open_ref(core, ref, offset=0, limit=100):
    name, path = parse_ref(ref)
    if name is None:
        return {"items": [{"ref": path_ref(c["name"]), "kind": "channel", "name": c["name"]}
                          for c in request("GET", "/v1/channels", core=core)]}
    channel, item = resolve(core, ref)
    if item is not None and item["kind"] != "catalog":
        return entry(channel, path[:-1], item)
    rows = children(core, channel["id"], item["id"] if item else None, offset, limit + 1)
    result = {"items": [entry(channel, path, row) for row in rows[:limit]]}
    if len(rows) > limit:
        result["nextOffset"] = offset + limit
    return result
