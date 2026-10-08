import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Asset views retain ownership of their operations; the workspace owns placement. */
export function WorkspaceActions({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const find = () =>
      setTarget(document.getElementById("workspace-item-actions"));
    find();
    const observer = new MutationObserver(find);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return target ? (
    createPortal(children, target)
  ) : (
    <div className="flex justify-end gap-2">{children}</div>
  );
}
