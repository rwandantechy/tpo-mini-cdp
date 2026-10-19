import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';

/** Renders model markdown. Raw HTML, images, and links are not executed. */
export function Markdown({ children }: { children: string }) {
  if (children.trim().length === 0) return null;

  return (
    <div className="space-y-2 text-sm leading-6 text-ink">
      <ReactMarkdown components={components}>{children}</ReactMarkdown>
    </div>
  );
}

const components = {
  h1: heading,
  h2: heading,
  h3: heading,
  h4: heading,
  p: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  ul: ({ children }: { children?: ReactNode }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }: { children?: ReactNode }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }: { children?: ReactNode }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }: { children?: ReactNode }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }: { children?: ReactNode }) => <em>{children}</em>,
  code: ({ children }: { children?: ReactNode }) => (
    <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[0.8rem]">{children}</code>
  ),
  pre: ({ children }: { children?: ReactNode }) => (
    <pre className="overflow-x-auto rounded-md border border-line bg-surface-muted px-3 py-2 font-mono text-[0.8rem]">
      {children}
    </pre>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="border-l-2 border-coral pl-3 text-ink-soft">{children}</blockquote>
  ),
  hr: () => <hr className="border-line" />,
  a: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  img: () => null,
};

function heading({ children }: { children?: ReactNode }) {
  return <p className="pt-1 font-semibold text-ink">{children}</p>;
}
