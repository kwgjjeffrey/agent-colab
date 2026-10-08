import { useEffect } from "react";
import { runOperation } from "@/api/operation-runner";
const reloadPage = () => window.location.reload();

export function useGuiVersion(version: string, reload = reloadPage) {
  useEffect(() => {
    let inFlight = false, stopped = false;
    const onFocus = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        await runOperation("system.gui-version", async operation => {
          const response = await operation.fetch(`/ui.json?checkedAt=${Date.now()}`, { cache: "no-store" });
          if (!response.ok || stopped) return;
          const active = await response.json() as { version?: string };
          if (!active.version || active.version === version) return;
          // Inconsistent installation metadata must never create a focus/reload loop.
          const key = `colab:gui-reloaded:${active.version}`;
          if (!stopped && sessionStorage.getItem(key) !== "1") {
            sessionStorage.setItem(key, "1");
            reload();
          }
        });
      } catch { /* Core can be restarting during an update; keep the workspace visible. */ }
      finally { inFlight = false; }
    };
    window.addEventListener("focus", onFocus);
    return () => { stopped = true; window.removeEventListener("focus", onFocus); };
  }, [version, reload]);
}
