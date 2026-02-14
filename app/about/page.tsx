import fs from "fs"
import path from "path"
import { GettingStartedCard } from "@/components/beehack/getting-started-card"
import { Markdown } from "@/components/ui/markdown"

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
                <Markdown variant="article">{visionMd}</Markdown>
            </section>

            {/* ─── Copyright ─── */}
            <footer className="mt-16 border-t border-border pt-6 pb-8 text-center text-xs text-muted-foreground">
                © {new Date().getFullYear()} bee:hack. All rights reserved.
            </footer>
        </main>
    )
}
