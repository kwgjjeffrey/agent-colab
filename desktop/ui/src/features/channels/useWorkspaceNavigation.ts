import { useState, type SetStateAction } from "react";
const channelKey = "colab:last-channel";
const tabKey = (id?: string) => `colab:channel-tab:${id}`;
type WorkspaceItem = {id:string;kind:string;name:string};
const itemKey=(id?:string)=>`colab:channel-item:${id}`;
function savedItem(id?:string):WorkspaceItem|undefined {
  try {const item=JSON.parse(localStorage.getItem(itemKey(id))??"null");return item&&typeof item.id==="string"&&typeof item.name==="string"&&["catalog","canvas","session","files","skill"].includes(item.kind)?item:undefined;}catch{return undefined;}
}
function savedTab(id?: string) {
  const value = localStorage.getItem(tabKey(id));
  return value && ["home", "messages", "sessions", "files", "skills", "canvas", "catalog"].includes(value) ? value : "home";
}
export function useWorkspaceNavigation() {
  const [navigation, setNavigation] = useState(() => {
    const channelId = localStorage.getItem(channelKey) ?? undefined;
    return { channelId, tab: savedTab(channelId) as string | number, item:savedItem(channelId) };
  });
  function setSelectedId(action: SetStateAction<string | undefined>) {
    setNavigation(current => {
      const channelId = typeof action === "function" ? action(current.channelId) : action;
      if (channelId === current.channelId) return current;
      if (channelId) localStorage.setItem(channelKey, channelId); else localStorage.removeItem(channelKey);
      return { channelId, tab: savedTab(channelId), item:savedItem(channelId) };
    });
  }
  function setWorkspaceTab(action: SetStateAction<string | number>) {
    setNavigation(current => {
      const tab = typeof action === "function" ? action(current.tab) : action;
      if (current.channelId) localStorage.setItem(tabKey(current.channelId), String(tab));
      return { ...current, tab };
    });
  }
  function setWorkspaceItem(item:WorkspaceItem|undefined) {
    setNavigation(current=>{if(current.channelId){if(item)localStorage.setItem(itemKey(current.channelId),JSON.stringify(item));else localStorage.removeItem(itemKey(current.channelId));}return {...current,item};});
  }
  function openChannelHome(channelId:string) {
    localStorage.setItem(channelKey, channelId);
    localStorage.setItem(tabKey(channelId), "home");
    localStorage.removeItem(itemKey(channelId));
    setNavigation({channelId, tab:"home", item:undefined});
  }
  return { selectedId: navigation.channelId, workspaceTab: navigation.tab, workspaceItem:navigation.item, setSelectedId, setWorkspaceTab, setWorkspaceItem, openChannelHome };
}
