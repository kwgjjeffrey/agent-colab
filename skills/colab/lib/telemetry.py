"""Optional packaged OTel adapter. No vendor credential or business use case lives here.

CLI output/exit behavior remains authoritative even when observation fails. The SDK is
vendored into the immutable Skill artifact, never installed into the user's Python.
"""
from __future__ import annotations
import json
import contextlib
import os
import pathlib
import sys
import time

_provider = None
_tracer = None
_epoch = time.time_ns()
_monotonic = time.monotonic_ns()
_offset_ns = 0
_uncertainty_ms = None
_clock_quality = "uncalibrated"
_upstream_entry = None

def _code_revision():
    try:
        return json.loads((pathlib.Path(__file__).parents[1] / "installed.json").read_text()).get("codeRevision", "unknown")
    except (OSError, ValueError):
        return os.environ.get("COLAB_CODE_REVISION", "unknown")

def now_ns():
    return _epoch + time.monotonic_ns() - _monotonic + _offset_ns

def _initialize():
    global _provider, _tracer, _offset_ns, _uncertainty_ms, _clock_quality
    if _provider is not None:
        return
    from local_api import discovery, _OPENER
    import json
    import urllib.request
    core, bearer = discovery()
    headers = {"authorization": "Bearer " + bearer}
    def get(path):
        req = urllib.request.Request(core + path, headers=headers)
        with _OPENER.open(req, timeout=0.5) as response:
            return json.load(response)
    if not get("/v1/observability/config").get("enabled"):
        return
    samples = []
    for _ in range(3):
        t1 = now_ns() / 1_000_000
        c = get("/v1/observability/clock")
        t4 = now_ns() / 1_000_000
        t2, t3 = c["receivedMs"], c["sentMs"]
        rtt = (t4-t1)-(t3-t2)
        if rtt >= 0:
            samples.append((rtt, ((t2-t1)+(t3-t4))/2, (c.get("calibration") or {}).get("uncertaintyMs", 0), c.get("reference", "local")))
    if samples:
        rtt, offset, upstream, reference = min(samples)
        _clock_quality = "local_only" if reference == "local" else "estimated"
        _offset_ns = round(offset * 1_000_000)
        _uncertainty_ms = rtt / 2 + upstream
    vendor = pathlib.Path(__file__).parent / "vendor"
    if vendor.is_dir():
        sys.path.insert(0, str(vendor))
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.sdk.resources import Resource
    import warnings
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", message="urllib3 v2 only supports OpenSSL.*")
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        import requests
    import logging
    for name in ("opentelemetry.sdk._shared_internal", "opentelemetry.exporter.otlp.proto.http.trace_exporter"):
        logger = logging.getLogger(name)
        logger.addHandler(logging.NullHandler())
        logger.propagate = False
    session = requests.Session()
    session.trust_env = False  # Loopback must never pass through a corporate proxy.
    version_path = pathlib.Path(__file__).parents[1] / "installed.json"
    version = json.loads(version_path.read_text()).get("version", "development") if version_path.exists() else "development"
    _provider = TracerProvider(resource=Resource({"service.name": "colab-skill", "service.version": version}))
    _provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=core + "/v1/observability/traces", headers=headers, session=session, timeout=1), max_queue_size=128, max_export_batch_size=32, schedule_delay_millis=500))
    _tracer = _provider.get_tracer("agent-colab.cli")

@contextlib.contextmanager
def request_span(method, headers):
    if _tracer is None:
        yield
        return
    from opentelemetry.trace import SpanKind, Status, StatusCode
    from opentelemetry.propagate import inject
    start, tick = now_ns(), time.monotonic_ns()
    with _tracer.start_as_current_span("colab.http.request", kind=SpanKind.CLIENT, start_time=start, end_on_exit=False, record_exception=False, set_status_on_exception=False) as span:
        inject(headers)
        from opentelemetry import baggage
        entry=baggage.get_baggage("trace.entry.id")
        if entry:
            span.set_attribute("trace.entry.id",entry)
        span.set_attributes({"code.file.path":"skills/colab/lib/local_api.py","code.function.name":"request", "code.revision": _code_revision()})
        span.set_attribute("http.request.method", method)
        try:
            yield
        except BaseException:
            span.set_status(Status(StatusCode.ERROR))
            span.set_attribute("colab.outcome", "error")
            raise
        finally:
            elapsed = time.monotonic_ns()-tick
            span.set_attribute("colab.duration_ms", elapsed/1_000_000)
            span.end(end_time=start+elapsed)

_registry_path = pathlib.Path(__file__).resolve().parents[1] / "tracing/registry.json"
def command_definition(args=None):
    """Resolve parsed vocabulary, never infer commands from arbitrary argv values."""
    executable = pathlib.Path(sys.argv[0]).name.removesuffix(".cmd")
    path = [] if executable == "colab-open" else [getattr(args, key) for key in ("group", "operation") if getattr(args, key, None)]
    registry = json.loads(_registry_path.read_text())
    return next((row for row in registry["operations"] if row["entry"]["executable"] == executable and row["entry"]["args"] == path), None)

def select_operation(args):
    if _tracer is None:
        return
    definition = command_definition(args)
    if definition is None:
        return
    from opentelemetry import trace, baggage, context
    span = trace.get_current_span()
    span.update_name("colab." + definition["id"])
    entry_id = _upstream_entry or definition["id"]
    span.set_attributes({"trace.entry.id": entry_id, "trace.operation.id": definition["id"], "colab.operation": definition["id"], "code.file.path": definition["source"]["path"], "code.function.name": definition["source"]["function"]})
    # The command's whole invocation owns this attachment; run() detaches it on every exit.
    _selection_tokens.append(context.attach(baggage.set_baggage("trace.entry.id", entry_id)))

_selection_tokens = []

def run(main):
    global _upstream_entry
    entry_tick = time.monotonic_ns()
    try:
        _initialize()
    except Exception:
        pass
    if _tracer is None:
        return main()
    from opentelemetry.trace import Status, StatusCode
    # Only command vocabulary enters span names; never export raw argv or resource refs.
    command = pathlib.Path(sys.argv[0]).name.replace("colab-", "")
    allowed = {"list", "read", "search", "open", "use", "create", "update", "remove", "share", "withdraw", "sync", "send", "context", "reply", "receive", "revoke", "apply-patch", "blueprint", "request", "sources", "status", "ensure", "install", "uninstall", "check-update"}
    subcommand = sys.argv[1] if len(sys.argv)>1 and sys.argv[1] in allowed else "invoke"
    name = "skill.open.gui" if command == "open" else command + "." + subcommand
    tick, code = entry_tick, 1
    start = now_ns() - (time.monotonic_ns() - entry_tick)
    registry_path=pathlib.Path(__file__).resolve().parents[1] / "tracing/registry.json"
    registry=json.loads(registry_path.read_text()) if registry_path.exists() else {}
    definition=next((o for o in registry.get("operations",[]) if o["id"]==name),None)
    from opentelemetry import baggage, context
    from opentelemetry.propagate import extract
    from opentelemetry import trace
    parent=extract({"traceparent":os.environ.get("COLAB_TRACEPARENT", "")})
    candidate=os.environ.get("COLAB_TRACE_ENTRY_ID", "")
    _upstream_entry = candidate if trace.get_current_span(parent).get_span_context().is_valid and 0<len(candidate)<=128 and all(c.isascii() and (c.isalnum() or c in "._-") for c in candidate) else None
    entry_id=_upstream_entry or name
    parent=baggage.set_baggage("trace.entry.id",entry_id,context=parent)
    token=context.attach(parent)
    with _tracer.start_as_current_span("colab."+name, context=parent, start_time=start, end_on_exit=False, record_exception=False, set_status_on_exception=False) as span:
        span.set_attributes({"trace.entry.id":entry_id, "trace.registry.digest":registry.get("digest","unknown"), "code.revision":_code_revision(), **({"code.file.path":definition["source"]["path"], "code.function.name":definition["source"]["function"]} if definition else {}), "colab.operation": name, "colab.origin": "skill", "colab.coverage": "terminal", "colab.clock.quality": _clock_quality, "colab.clock.offset_ms": _offset_ns/1_000_000, "colab.telemetry.init_ms": (time.monotonic_ns()-entry_tick)/1_000_000})
        if _uncertainty_ms is not None:
            span.set_attribute("colab.clock.uncertainty_ms", _uncertainty_ms)
        try:
            code = main()
            sys.stdout.flush()
            return code
        except SystemExit as error:
            code = error.code if isinstance(error.code, int) else 1
            raise
        except BaseException:
            code = 1
            raise
        finally:
            elapsed=time.monotonic_ns()-tick
            span.set_attributes({"colab.exit_code": code or 0, "colab.outcome": "success" if not code else "error", "colab.phase": "result.written", "colab.duration_ms": elapsed/1_000_000})
            if code:
                span.set_status(Status(StatusCode.ERROR))
            span.end(end_time=start+elapsed)
            # The observation is optional; an unavailable gateway cannot hold CLI exit indefinitely.
            try:
                while _selection_tokens:
                    context.detach(_selection_tokens.pop())
                context.detach(token)
                _provider.force_flush(timeout_millis=1000)
            except Exception:
                pass
