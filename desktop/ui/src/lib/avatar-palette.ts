// A restrained, contrast-safe identity palette shared by every initials fallback.
export const avatarPalette = ["#355C7D", "#486A5B", "#66558C", "#9B4E64", "#A45D35", "#386F75", "#59678C", "#827047"] as const;
export function avatarBackground(identity: string) {
  let hash = 2166136261;
  for (const character of identity.trim().toLocaleUpperCase()) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return avatarPalette[(hash >>> 0) % avatarPalette.length];
}
