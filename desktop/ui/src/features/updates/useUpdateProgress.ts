import {useCallback, useEffect, useState} from "react";
import {isUpdateRunning, readUpdateProgress, type UpdateProgress} from "./progress";

export function useUpdateProgress(enabled: boolean) {
  const [progress, setProgress] = useState<UpdateProgress>();
  const [resolved, setResolved] = useState(false);
  const refresh = useCallback(async () => {
    const next = await readUpdateProgress();
    setProgress(next); setResolved(true);
    return next;
  }, []);
  const watching = enabled || isUpdateRunning(progress);
  useEffect(() => {
    if (!watching) return;
    let stopped = false, inFlight = false;
    const poll = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      try {
        const next = await readUpdateProgress();
        if (!stopped) {setProgress(next); setResolved(true);}
      } catch {
        // Preserve the last known running state across Core replacement/connection loss.
        // Failure to read status is not evidence that the updater stopped.
      } finally {inFlight = false;}
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1000);
    window.addEventListener("focus", poll);
    return () => {stopped = true; window.clearInterval(timer); window.removeEventListener("focus", poll);};
  }, [watching]);
  return {progress, resolved, refresh};
}
