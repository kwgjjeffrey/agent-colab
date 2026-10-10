// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AddMentionItem } from "./AddMentionItem";
vi.mock("@/features/workspace/ItemIcon",()=>({ItemIcon:()=>null}));
afterEach(cleanup);
it('opens the standard menu on hover and dispatches every supported item type',async()=>{
 const choose=vi.fn();render(<AddMentionItem onChoose={choose}/>);const user=userEvent.setup();
 for(const [label,kind] of [['Sessions','session'],['Files','files'],['Skills','skill']]){
  await user.hover(screen.getByRole('button',{name:'Add new item'}));
  fireEvent.click(await screen.findByRole('menuitem',{name:label}));
  expect(choose).toHaveBeenLastCalledWith(kind);
  await user.unhover(screen.getByRole('button',{name:'Add new item'}));
 }
});
