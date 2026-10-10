import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronRightIcon } from "lucide-react";
import { runOperation } from "@/api/operation-runner";

/** Old installers may activate a new Core before learning about this added artifact. */
export function WorkbenchEntry() {
  const [opening, setOpening] = useState(false), [error, setError] = useState<string>();
  async function open() {
    setOpening(true); setError(undefined);
    // Reserve the native child window during the click, before asynchronous installation.
    const workbench = window.open("", "colab-operation-workbench", "width=1280,height=820");
    try {
      if (!workbench) throw new Error("Please allow opening the Operation Workbench window.");
      await runOperation("workbench.open", async operation => {
        const status = await operation.json<{components:Record<string,{installedVersion?:string}>}>("/v1/system/installation");
        if (!status.components["operation-workbench"]?.installedVersion) {
          await operation.json("/v1/system/operation-workbench/update", {method:"POST",headers:{"content-type":"application/json"},body:"{}"});
        }
        // Electron creates a separate BrowserWindow; both windows share the loopback cookie.
        workbench.location.replace("/operation-workbench/");
        workbench.focus();
      });
    } catch (e) {
      if (workbench && workbench.location.href === "about:blank") workbench.close();
      setError(String(e));
    } finally { setOpening(false); }
  }
  return <div><Button variant="ghost" className="w-full justify-start px-2" data-trace-target="workbench.open" disabled={opening} onClick={()=>void open()}>{opening?"正在准备工作台…":"Operation Workbench"}<ChevronRightIcon data-icon="inline-end"/></Button>{error&&<p role="alert" className="text-xs text-destructive">{error}</p>}</div>;
}
