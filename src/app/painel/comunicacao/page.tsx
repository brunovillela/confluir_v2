import type { Metadata } from "next"
import { Newspaper, Sparkles } from "lucide-react"

import { CartaoArea } from "@/components/cartao-area"
import { requirePermissao } from "@/lib/auth"

export const metadata: Metadata = { title: "Comunicação — Confluir" }

export default async function ComunicacaoPage() {
  await requirePermissao("noticias")

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Comunicação</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Notícias do sindicato e o resumo de notícias gerado por IA a partir de
          sites escolhidos.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <CartaoArea
          titulo="Notícias"
          descricao="Publique manchetes exibidas no painel e no portal do filiado"
          href="/painel/comunicacao/noticias"
          icone={Newspaper}
        />
        <CartaoArea
          titulo="Resumo de notícias"
          descricao="A IA lê os sites indicados e gera um resumo para o painel"
          href="/painel/comunicacao/resumo"
          icone={Sparkles}
        />
      </div>
    </>
  )
}
