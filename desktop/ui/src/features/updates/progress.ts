export type UpdateProgress = {
  state: string; running?: boolean; restartRequired?: boolean; previousPid?: number;
  artifact?: string; received?: number; total?: number; bytesPerSecond?: number;
  etaSeconds?: number; resumedFrom?: number; cached?: boolean; error?: string;
};

// Legacy Core exposes transfer state only; new Core reports the OS lock explicitly.
export function isUpdateRunning(progress?: UpdateProgress) {
  if (progress?.running !== undefined) return progress.running;
  return ["downloading", "verifying", "installing"].includes(progress?.state ?? "");
}

export async function readUpdateProgress(fetcher: typeof fetch = fetch): Promise<UpdateProgress> {
  const response = await fetcher(`/v1/system/update-progress?at=${Date.now()}`, {cache: "no-store"});
  if (!response.ok) throw new Error(`Update status unavailable: HTTP ${response.status}`);
  return response.json();
}
