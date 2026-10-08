import { useState, type SetStateAction } from "react";
const channelKey = "colab:last-channel";
const tabKey = (id?: string) => `colab:channel-tab:${id}`;
function savedTab(id?: string) {
  const value = localStorage.getItem(tabKey(id));
  return value && ["home", "messages", "sessions", "files", "skills", "canvas", "settings"].includes(value) ? value : "home";
}
export function useWorkspaceNavigation() {
  const [navigation, setNavigation] = useState(() => {
    const channelId = localStorage.getItem(channelKey) ?? undefined;
    return { channelId, tab: savedTab(channelId) as string | number };
  });
  function setSelectedId(action: SetStateAction<string | undefined>) {
    setNavigation(current => {
      const channelId = typeof action === "function" ? action(current.channelId) : action;
      if (channelId === current.channelId) return current;
      if (channelId) localStorage.setItem(channelKey, channelId); else localStorage.removeItem(channelKey);
      return { channelId, tab: savedTab(channelId) };
    });
  }
  function setWorkspaceTab(action: SetStateAction<string | number>) {
    setNavigation(current => {
      const tab = typeof action === "function" ? action(current.tab) : action;
      if (current.channelId) localStorage.setItem(tabKey(current.channelId), String(tab));
      return { ...current, tab };
    });
  }
  return { selectedId: navigation.channelId, workspaceTab: navigation.tab, setSelectedId, setWorkspaceTab };
}
