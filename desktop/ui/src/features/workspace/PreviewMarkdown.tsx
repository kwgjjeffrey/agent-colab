import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Shared reading surface; raw HTML stays disabled and content is never executed. */
export function PreviewMarkdown({ children }: { children: string }) {
  return <div className="min-w-0 break-words text-sm leading-6 [&_p]:my-3 [&_h1]:my-4 [&_h1]:font-semibold [&_h2]:my-4 [&_h2]:font-semibold [&_h3]:my-3 [&_h3]:font-semibold [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_pre]:my-3 [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_code]:font-mono [&_code]:text-xs [&_table]:w-full [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 [&_a]:underline">
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
  </div>;
}
