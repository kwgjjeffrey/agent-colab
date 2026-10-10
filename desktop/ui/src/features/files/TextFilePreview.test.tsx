// @vitest-environment jsdom
import {render,screen,fireEvent,cleanup} from "@testing-library/react";
import {it,expect,afterEach} from "vitest";
import {TextFilePreview} from "./TextFilePreview";
afterEach(cleanup);
it("renders Markdown tables and headings and preserves a selectable source view",async()=>{
 const content="# Test report\n\n| Metric | Value |\n| --- | --- |\n| Passed | 28 |\n\n<script>alert(1)</script>";
 render(<TextFilePreview path="report.md" content={content}/>);
 expect(screen.getByRole("heading",{name:"Test report"})).toBeTruthy();expect(screen.getByRole("table")).toBeTruthy();
 expect(document.querySelector("article script")).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"Source"}));expect(screen.queryByRole("heading")).toBeNull();
 expect(document.querySelector('[data-code-preview]')?.textContent).toContain("# Test report");
 fireEvent.click(screen.getByRole("button",{name:"Preview"}));expect(screen.getByRole("heading")).toBeTruthy();
});
it("highlights actual code as escaped text with line numbers",async()=>{
 render(<TextFilePreview path="test.ts" content={'const answer = 42;\nconst html = "<script>";'}/>);
 expect(document.querySelectorAll('[data-code-line]')).toHaveLength(2);
 await screen.findByText("answer");
 expect(document.querySelector('[data-code-preview] script')).toBeNull();
 expect(document.querySelector('[data-code-preview] [style]')).toBeTruthy();
});
