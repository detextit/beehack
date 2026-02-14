import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

type MarkdownProps = {
  children: string
  className?: string
  variant?: "compact" | "article"
}

const compactComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  ul: ({ children }) => <ul className="mb-2 list-disc pl-4 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal pl-4 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="mb-0.5">{children}</li>,
  h1: ({ children }) => <h1 className="mb-2 text-lg font-bold">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 text-base font-bold">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 text-sm font-bold">{children}</h3>,
  code: ({ className, children, ...props }) => {
    const isBlock = className?.includes("language-")
    if (isBlock) {
      return (
        <code className={`block overflow-x-auto rounded bg-muted p-2 text-xs font-mono ${className ?? ""}`} {...props}>
          {children}
        </code>
      )
    }
    return (
      <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono" {...props}>
        {children}
      </code>
    )
  },
  pre: ({ children }) => <pre className="mb-2 last:mb-0">{children}</pre>,
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-muted-foreground/30 pl-3 text-muted-foreground last:mb-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-muted" />,
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-muted px-2 py-1 text-left font-semibold bg-muted/50">{children}</th>,
  td: ({ children }) => <td className="border border-muted px-2 py-1">{children}</td>,
}

const articleComponents: Components = {
  h1: ({ children }) => <h1 className="text-3xl font-bold tracking-tight font-[family-name:var(--font-display)] mb-6">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xl font-semibold tracking-tight font-[family-name:var(--font-display)] mt-10 mb-3">{children}</h2>,
  p: ({ children }) => <p className="text-muted-foreground leading-relaxed mb-4">{children}</p>,
  strong: ({ children }) => <strong className="text-foreground font-semibold">{children}</strong>,
  em: ({ children }) => <em className="text-foreground">{children}</em>,
  ul: ({ children }) => <ul className="space-y-1.5 text-muted-foreground text-sm pl-4 mb-4">{children}</ul>,
  ol: ({ children }) => <ol className="space-y-2 text-muted-foreground text-sm pl-4 mb-4 list-decimal">{children}</ol>,
  li: ({ children }) => <li className="text-muted-foreground">{children}</li>,
  a: ({ href, children }) => <a href={href} className="text-primary hover:text-primary/80 underline">{children}</a>,
  table: ({ children }) => (
    <div className="overflow-x-auto rounded-lg border border-border mb-6">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b border-border bg-muted/50">{children}</thead>,
  th: ({ children }) => <th className="px-4 py-2.5 text-left font-medium text-foreground">{children}</th>,
  td: ({ children }) => <td className="px-4 py-2 text-muted-foreground border-b border-border/50">{children}</td>,
  hr: () => <hr className="border-border my-8" />,
  code: ({ children }) => <code className="rounded bg-muted px-1.5 py-0.5 text-sm font-mono text-foreground">{children}</code>,
  pre: ({ children }) => <pre className="rounded-lg bg-muted p-4 overflow-x-auto mb-4 text-sm">{children}</pre>,
  blockquote: ({ children }) => (
    <blockquote className="mb-4 border-l-2 border-muted-foreground/30 pl-4 text-muted-foreground">
      {children}
    </blockquote>
  ),
}

export function Markdown({ children, className = "", variant = "compact" }: MarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={variant === "article" ? articleComponents : compactComponents}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
