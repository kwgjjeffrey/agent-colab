import { useEffect, useState } from "react";
import type { ThemedToken } from "shiki";
import { Button } from "@/components/ui/button";
import { PreviewMarkdown } from "@/features/workspace/PreviewMarkdown";

const languages: Record<string, string> = {
  c:"c", cc:"cpp", cpp:"cpp", h:"c", hpp:"cpp", cs:"csharp", css:"css", go:"go", html:"html",
  java:"java", js:"javascript", mjs:"javascript", cjs:"javascript", jsx:"jsx", json:"json", jsonl:"json",
  py:"python", rb:"ruby", rs:"rust", sh:"shellscript", bash:"shellscript", zsh:"shellscript", sql:"sql",
  toml:"toml", ts:"typescript", tsx:"tsx", xml:"xml", svg:"xml", yaml:"yaml", yml:"yaml",
  kt:"kotlin", swift:"swift", php:"php", lua:"lua", r:"r", dart:"dart", vue:"vue", svelte:"svelte",
  md:"markdown", markdown:"markdown", mdx:"mdx", dockerfile:"dockerfile", makefile:"makefile",
};
export const textFileExtensions = new Set([...Object.keys(languages), "conf", "csv", "ini", "log", "txt", "env", "properties"]);
export function textFileType(path: string) {
  const name=path.split("/").pop()?.toLowerCase() ?? "";
  return name.split(".").pop() ?? name;
}

/** Render source as React text tokens; file contents never become executable HTML. */
export function TextFilePreview({ content, path }: { content: string; path: string }) {
  const extension=textFileType(path), markdown=extension === "md" || extension === "markdown";
  const [source, setSource]=useState(false);
  useEffect(()=>setSource(false),[path]);
  return <div className="flex size-full min-h-0 flex-col">
    <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
      <span>{markdown ? "Markdown" : languages[extension] ?? "Plain text"}</span>
      {markdown && <div className="flex gap-1">
        <Button size="sm" variant={!source ? "secondary" : "ghost"} aria-pressed={!source} onClick={()=>setSource(false)}>Preview</Button>
        <Button size="sm" variant={source ? "secondary" : "ghost"} aria-pressed={source} onClick={()=>setSource(true)}>Source</Button>
      </div>}
    </div>
    <div className="min-h-0 flex-1 overflow-auto">
      {markdown && !source ? <article className="mx-auto max-w-5xl p-6 [&_h1]:text-2xl [&_h2]:text-xl [&_h3]:text-lg"><PreviewMarkdown>{content}</PreviewMarkdown></article> : <SourceCode content={content} language={languages[extension]} />}
    </div>
  </div>;
}

function SourceCode({ content, language }: { content: string; language?: string }) {
  const [tokens,setTokens]=useState<ThemedToken[][]>();
  useEffect(()=>{
    let active=true;setTokens(undefined);
    // Large text remains readable without expensive grammar processing.
    if (language && content.length <= 200_000) {
      void import("shiki").then(async ({codeToTokens,bundledLanguages})=>{
        if (!(language in bundledLanguages)) return;
        const result=await codeToTokens(content,{lang:language as keyof typeof bundledLanguages,theme:"github-light"});
        if(active)setTokens(result.tokens);
      }).catch(()=>{/* Source remains available when highlighting cannot load. */});
    }
    return ()=>{active=false;};
  },[content,language]);
  const lines=tokens ?? content.split(/\r?\n/).map(line=>[{content:line}]);
  return <pre data-code-preview className="min-w-max p-4 font-mono text-xs leading-6"><code>{lines.map((line,index)=><span key={index} className="flex" data-code-line>
    <span aria-hidden="true" className="mr-5 inline-block w-10 shrink-0 select-none text-right text-muted-foreground/60">{index+1}</span>
    <span>{line.map((token,i)=><span key={i} style={{color:"color" in token && typeof token.color === "string" ? token.color : undefined}}>{token.content}</span>)}{"\n"}</span>
  </span>)}</code></pre>;
}
