import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Typography for AI agent replies: GitHub-flavoured markdown rendered with
 * the app's design tokens — compact headings, tokenised tables, code chips,
 * and comfortable reading rhythm inside chat bubbles.
 */
export const AiMessageText = memo(function AiMessageText({ text }: { text: string }) {
  return (
    <div className="text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="my-2 first:mt-0 last:mb-0">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => <em>{children}</em>,
          del: ({ children }) => (
            <del className="text-muted-foreground line-through">{children}</del>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-primary underline underline-offset-2"
            >
              {children}
            </a>
          ),
          h1: ({ children }) => (
            <h3 className="mb-1.5 mt-4 text-base font-semibold text-foreground first:mt-0">
              {children}
            </h3>
          ),
          h2: ({ children }) => (
            <h3 className="mb-1.5 mt-4 text-base font-semibold text-foreground first:mt-0">
              {children}
            </h3>
          ),
          h3: ({ children }) => (
            <h4 className="mb-1.5 mt-3 text-sm font-semibold text-foreground first:mt-0">
              {children}
            </h4>
          ),
          h4: ({ children }) => (
            <h5 className="mb-1.5 mt-3 text-sm font-semibold text-foreground/90 first:mt-0">
              {children}
            </h5>
          ),
          ul: ({ children }) => (
            <ul className="my-2 list-disc space-y-1 pl-5 marker:text-muted-foreground/60">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 list-decimal space-y-1 pl-5 marker:font-medium marker:text-muted-foreground/70">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="pl-0.5 leading-relaxed [&>p]:my-0">{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-primary/40 pl-3 italic text-muted-foreground">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-border" />,
          code: ({ className, children }) => {
            const isBlock = /language-/.test(className ?? "");
            if (isBlock)
              return (
                <code className={`${className ?? ""} font-mono text-xs`}>
                  {children}
                </code>
              );
            return (
              <code className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[12px] text-foreground">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-3 text-xs leading-relaxed">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-md border border-border/60">
              <table className="w-full border-collapse text-[13px]">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
          th: ({ children }) => (
            <th className="border-b border-border px-2.5 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border/50 px-2.5 py-1.5 align-top tabular-nums last:border-b-0">
              {children}
            </td>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
