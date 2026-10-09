"""Agent-facing projections. Unknown API fields never become stdout by default."""
from output import success as emit
from context_projection import project_message, canvas_context


def pick(value, fields):
    if not isinstance(value, dict):
        return {}
    return {key: value[key] for key in fields.split() if key in value and value[key] is not None}


def rows(value, fields):
    return [pick(row, fields) for row in value]


def project(tool, operation, value, args):
    page = None
    if tool == "messages":
        group = args.group
        if group == "request" and operation == "reply":
            data = pick(value, "sent messageId")
        elif group == "messages" and operation == "read":
            data = project_message(value)
        elif group == "messages" and operation == "send":
            data = {"sent": True, "messageId": value["id"]}
        elif operation in ("context", "list") and group != "blueprint":
            data = [project_message(row) for row in value]
            if value:
                key = "nextBefore" if operation == "context" else "nextAfter"
                page = {key: (min if operation == "context" else max)(row["seq"] for row in value)}
        elif operation == "list":
            data = rows(value, "id name ownerName runtimeId runtimeLabel invocationPolicy inChannel editable loadingInstruction loadingCommand")
        elif operation == "runtimes":
            data = rows(value, "id deviceName provider available")
        elif operation == "upsert":
            data = {"saved": True, **pick(value, "id name")}
        else:
            data = pick(value, "removed name inChannel")
    elif tool == "canvas":
        if operation == "list":
            data = {"folders": rows(value["folders"], "path"), "documents": rows(value["documents"], "ref title path canEdit")}
        elif operation == "create":
            data = {"created": True, **pick(value, "ref title")}
        elif operation == "read":
            data = {**pick(value, "ref path content"), "offset": args.offset}
            context = canvas_context(value.get("content", ""), value.get("ref", ""))
            if context:
                data["context"] = context
            if value.get("nextOffset") is not None:
                page = {"nextOffset": value["nextOffset"]}
            if value.get("syncState") not in (None, "synced"):
                data["syncState"] = value["syncState"]
        elif operation == "search":
            data = pick(value, "ref matches truncated")
        else:
            data = {"ref": args.ref, "applied": value.get("status") == "Done"}
    elif tool == "skill-tool":
        fields = "targetAgent state installedPath activation"
        if operation == "sources":
            data = rows(value, "sourceId name description sourcePath")
        elif operation in ("status", "check-update"):
            data = {**pick(value, "name ref"), "installations": rows(value["installations"], fields)}
        else:
            data = pick(value, "name ref " + fields)
    elif tool == "transfer":
        if operation == "create":
            data = pick(value, "transferId capability expiresAt")
        elif operation == "receive":
            data = {"items": rows(value["items"], "name kind localPath sourceAdapter")}
            for result, original in zip(data["items"], value["items"]):
                if original.get("tree") is not None:
                    result["tree"] = rows(original["tree"][:500], "path name kind size")
                    if len(original["tree"]) > 500:
                        result["treeTruncated"] = True
        else:
            data = pick(value, "transferId revoked")
    elif tool == "session-reader":
        # Item payloads are requested task context, not an engineering envelope.
        data = {"turns": [{"items": rows(row.get("items", []), "type text content phase summary tool server arguments status result command truncated")} for row in value.get("turns", [])]}
        cursor = value.get("page", {}).get("nextCursor")
        if cursor:
            page = {"nextCursor": cursor}
    elif tool == "browser":
        if operation in ("inspect-source", "sync-scope"):
            data = pick(value, "localPath includedFiles includedBytes excludedFiles excludedBytes projectIgnoreApplied exceedsTransportLimit")
            data["candidates"] = rows(value.get("candidates", []), "pattern fileCount byteSize selected")
            if operation == "sync-scope" and args.set:
                data["saved"] = True
        elif operation in ("open",):
            def entry(row):
                return pick(row, "ref kind item_type name role contributorName state capabilities description")
            data = [entry(row) for row in value] if isinstance(value, list) else entry(value)
        elif operation in ("use", "sync"):
            data = {"ref": getattr(args, "ref", None) or getattr(args, "item", None), **pick(value, "localPath syncState syncError")}
            data["tree"] = rows(value.get("tree", [])[:500], "path name kind size")
            if len(value.get("tree", [])) > 500:
                data["treeTruncated"] = True
            data["readOnly"] = not value.get("canWithdraw", False)
        elif operation == "session-sources":
            data = rows(value, "id name codingAgent sourcePath updatedAt")
        elif operation == "members":
            data = rows(value, "displayName email role status")
        elif operation in ("create-channel", "update-channel", "share", "withdraw"):
            data = pick(value, "ref state")
            data[{"create-channel": "created", "update-channel": "updated", "share": "shared", "withdraw": "withdrawn"}[operation]] = True
        elif operation == "add-member":
            data = {"user": args.user, "role": args.role, **pick(value, "status emailDelivery")}
        elif operation == "update-member":
            data = {"updated": True, "user": args.user, "role": args.role}
        else:
            data = pick(value, "displayName email role status user state")
    else:
        raise ValueError("Unknown Agent output contract")
    return data, page


def writer(tool, args):
    def success(value, **_legacy):
        data, page = project(tool, args.operation, value, args)
        return emit(data, page=page)
    return success
