// @vitest-environment jsdom
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import { expect, it } from "vitest";
import { createMention } from "./create-mention";
import type { ContextResource } from "./context-model";

function editor() { return new Editor({extensions:[StarterKit, Mention.extend({addAttributes(){return {...this.parent?.(),kind:{default:'agent'},mentionId:{default:null}}}})],content:'<p>Before @ after</p>'}); }
const item:ContextResource={kind:'skill',id:'stable-id',name:'Shared skill',channelId:'channel'};
it('inserts the created stable reference at the saved @, preserving surrounding text',async()=>{
 const e=editor();await createMention(e,{from:8,to:9},async()=>item);
 expect(e.getJSON().content?.[0].content).toEqual(expect.arrayContaining([expect.objectContaining({type:'mention',attrs:expect.objectContaining({id:item.id,kind:'skill',label:item.name})})]));
 expect(e.getText()).toBe('Before @Shared skill  after');e.destroy();
});
it('maps the insertion through concurrent edits before the saved range',async()=>{
 const e=editor();let finish!:(item:ContextResource)=>void;
 const task=createMention(e,{from:8,to:9},()=>new Promise(resolve=>{finish=resolve;}));
 e.commands.insertContentAt(1,'New ');finish(item);await task;
 expect(e.getText()).toBe('New Before @Shared skill  after');e.destroy();
});
it('does not insert on cancellation or into an edited trigger',async()=>{
 const e=editor();expect(await createMention(e,{from:8,to:9},async()=>undefined)).toBe(false);
 let finish!:(item:ContextResource)=>void;const task=createMention(e,{from:8,to:9},()=>new Promise(resolve=>{finish=resolve;}));
 e.commands.insertContentAt({from:8,to:9},'changed');finish(item);expect(await task).toBe(false);expect(e.getText()).toBe('Before changed after');e.destroy();
});
it('does not insert after editor destruction and releases mapping on failure',async()=>{
 const e=editor();let finish!:(item:ContextResource)=>void;const task=createMention(e,{from:8,to:9},()=>new Promise(resolve=>{finish=resolve;}));e.destroy();finish(item);expect(await task).toBe(false);
 const other=editor();await expect(createMention(other,{from:8,to:9},async()=>{throw Error('share failed')})).rejects.toThrow('share failed');expect(other.getText()).toBe('Before @ after');other.destroy();
});
