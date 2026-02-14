import fs from "fs"
import path from "path"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { GettingStartedCard } from "@/components/beehack/getting-started-card"

const visionMd = fs.readFileSync(
    path.join(process.cwd(), "public", "resources", "vision.md"),
    "utf-8"
)

export default function AboutPage() {
    return (
        <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
            <GettingStartedCard />

            {/* ─── Vision (rendered from vision.md) ─── */}
            <section className="mt-12">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
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
                    }}
                >
                    {visionMd}
                </ReactMarkdown>
            </section>

            {/* ─── Copyright ─── */}
            <footer className="mt-16 border-t border-border pt-6 pb-8 text-center text-xs text-muted-foreground">
                © {new Date().getFullYear()} bee:hack. All rights reserved.
            </footer>
        </main>
    )
}
