// Aku assistant markdown rendering (WI-053). Assistant replies are markdown;
// we render them with react-markdown + remark-gfm. react-markdown escapes HTML
// by default (no rehype-raw), so model output can't inject markup — safe for
// untrusted LLM text. Styling is token-based and compact for a chat bubble;
// code blocks get a copy button. Feature-local (chat rendering is app-specific,
// not a design-system primitive — DR-design-024).

import { IconCheck, IconCopy } from "@weave/design-system";
import { type ReactNode, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

function CodeBlock({ children }: { readonly children?: ReactNode }): JSX.Element {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    const text = ref.current?.textContent ?? "";
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      },
      () => {
        /* clipboard blocked — no-op */
      },
    );
  };
  return (
    <div className="relative my-1.5 group/code">
      <pre
        ref={ref}
        data-aku-code-block
        className="overflow-x-auto rounded-[var(--radius-sm)] bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)] px-3 py-2 text-[12px] leading-[1.5] font-mono"
      >
        {children}
      </pre>
      <button
        type="button"
        aria-label="코드 복사"
        data-aku-code-copy
        onClick={copy}
        className="absolute top-1.5 right-1.5 inline-flex items-center justify-center w-6 h-6 rounded-[var(--radius-sm)] bg-[color:var(--surface-1)] border border-[color:var(--surface-2-border)] text-[color:var(--text-soft)] opacity-0 group-hover/code:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] transition-opacity"
      >
        {copied ? (
          <IconCheck size={13} className="text-[color:var(--accent)]" />
        ) : (
          <IconCopy size={13} />
        )}
      </button>
    </div>
  );
}

export function MarkdownMessage({ text }: { readonly text: string }): JSX.Element {
  return (
    <div className="aku-markdown text-[13px] leading-[1.55] break-words [&_*:first-child]:mt-0 [&_*:last-child]:mb-0">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-1.5">{children}</p>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[color:var(--accent)] underline underline-offset-2"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="my-1.5 pl-4 list-disc space-y-0.5">{children}</ul>,
          ol: ({ children }) => (
            <ol className="my-1.5 pl-4 list-decimal space-y-0.5">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-[1.5]">{children}</li>,
          h1: ({ children }) => <h4 className="mt-2 mb-1 text-[14px] font-semibold">{children}</h4>,
          h2: ({ children }) => <h4 className="mt-2 mb-1 text-[14px] font-semibold">{children}</h4>,
          h3: ({ children }) => <h4 className="mt-2 mb-1 text-[13px] font-semibold">{children}</h4>,
          h4: ({ children }) => <h4 className="mt-2 mb-1 text-[13px] font-semibold">{children}</h4>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          blockquote: ({ children }) => (
            <blockquote className="my-1.5 border-l-2 border-[color:var(--surface-2-border)] pl-2.5 text-[color:var(--text-soft)]">
              {children}
            </blockquote>
          ),
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          code: ({ className, children }) => {
            const isBlock = (className ?? "").startsWith("language-");
            if (isBlock) return <code className={className}>{children}</code>;
            return (
              <code className="font-mono text-[0.9em] rounded-[3px] px-1 py-0.5 bg-[color:var(--surface-2)] border border-[color:var(--surface-2-border)]">
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="my-1.5 overflow-x-auto">
              <table className="text-[12px] border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-[color:var(--surface-2-border)] px-2 py-1 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-[color:var(--surface-2-border)] px-2 py-1">{children}</td>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
