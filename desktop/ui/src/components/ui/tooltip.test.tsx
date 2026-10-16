// @vitest-environment jsdom
import {afterEach,expect,it} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {TooltipProvider,Tooltip,TooltipTrigger,TooltipContent} from "./tooltip";
afterEach(cleanup);
it("waits at least 300ms even when a caller requests an immediate tooltip",async()=>{
 const user=userEvent.setup();
 render(<TooltipProvider delay={0}><Tooltip><TooltipTrigger delay={0}>Help</TooltipTrigger><TooltipContent>Explanation</TooltipContent></Tooltip></TooltipProvider>);
 await user.hover(screen.getByRole("button",{name:"Help"}));
 await new Promise(resolve=>setTimeout(resolve,250));
 expect(screen.queryByText("Explanation")).toBeNull();
 await screen.findByText("Explanation");
});
