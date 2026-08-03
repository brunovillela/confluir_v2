import type { Metadata } from "next"

import { Marca } from "@/components/marca"
import { ThemeToggle } from "@/components/theme-toggle"

import { StyleGuideContent } from "./style-guide-content"

export const metadata: Metadata = {
  title: "Style Guide — Confluir",
  description:
    "Página de referência do design system: paleta, tipografia, espaçamento, elevação e todos os componentes nos dois temas.",
}

/** Painel com tema forçado — os tokens semânticos reagem ao data-theme. */
function PainelTema({
  tema,
  rotulo,
}: {
  tema: "light" | "dark"
  rotulo: string
}) {
  return (
    <div
      data-theme={tema}
      className="bg-background text-foreground min-w-0 rounded-xl border p-4 sm:p-6"
    >
      <p className="text-muted-foreground mb-6 text-xs font-semibold tracking-widest uppercase">
        {rotulo}
      </p>
      <StyleGuideContent />
    </div>
  )
}

export default function StyleGuidePage() {
  return (
    <main className="mx-auto w-full max-w-[110rem] p-4 sm:p-6">
      <header className="mb-6 flex items-center justify-between gap-4">
        <Marca variante="completa" />
        <div className="flex items-center gap-3">
          <h1 className="text-muted-foreground text-sm font-medium">
            Design System · Style Guide
          </h1>
          <ThemeToggle />
        </div>
      </header>
      <div className="grid gap-6 xl:grid-cols-2">
        <PainelTema tema="light" rotulo="Tema claro" />
        <PainelTema tema="dark" rotulo="Tema escuro" />
      </div>
    </main>
  )
}
