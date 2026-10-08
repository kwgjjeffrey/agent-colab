import { useEffect,useRef,useState,type ReactNode } from "react";
import { draggable,dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import type { CatalogItem } from "./CatalogWorkspace";

export type DropPosition="before"|"after"|"inside";
export function CatalogDragTarget({item,channelId,disabled,children,onDrop}:{item?:CatalogItem;channelId:string;disabled:boolean;children:ReactNode;onDrop:(source:CatalogItem,position:DropPosition)=>void}) {
  const ref=useRef<HTMLDivElement>(null);
  const [position,setPosition]=useState<DropPosition>();
  useEffect(()=>{
    const element=ref.current;if(!element)return;
    const target=dropTargetForElements({element,
      canDrop:({source})=>!disabled&&source.data.channelId===channelId&&source.data.item!==undefined&&(source.data.item as CatalogItem).id!==item?.id,
      getData:({input})=>{
        const rect=element.getBoundingClientRect();const y=(input.clientY-rect.top)/rect.height;
        return {position:!item?"inside":item.kind==="catalog"&&y>0.25&&y<0.75?"inside":y<0.5?"before":"after"};
      },
      onDrag:({self,location})=>setPosition(location.current.dropTargets[0]?.element===element?self.data.position as DropPosition:undefined),
      onDragLeave:()=>setPosition(undefined),
      onDrop:({source,self,location})=>{setPosition(undefined);if(location.current.dropTargets[0]?.element===element)onDrop(source.data.item as CatalogItem,self.data.position as DropPosition);},
    });
    return combine(target,item?draggable({element,canDrag:()=>!disabled&&item.canMove!==false,getInitialData:()=>({item,channelId})}):()=>{});
  },[item,channelId,disabled,onDrop]);
  return <div ref={ref} data-drop-position={position} className="catalog-drop-target relative min-w-0">{children}</div>;
}
