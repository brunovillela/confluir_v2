import type { Metadata } from "next"
import { Link2, Newspaper, QrCode, Sparkles } from "lucide-react"

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
          Notícias do sindicato, resumo de notícias por IA, QR Codes e a página
          de links para as redes sociais.
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
        <CartaoArea
          titulo="QR Codes"
          descricao="Emita QR Codes dinâmicos e baixe a imagem em vários tamanhos para peças digitais e impressas"
          href="/painel/comunicacao/qrcodes"
          icone={QrCode}
        />
        <CartaoArea
          titulo="Página de links"
          descricao="O link na bio do Instagram: uma página pública com os canais e conteúdos da entidade"
          href="/painel/comunicacao/links"
          icone={Link2}
        />
      </div>
    </>
  )
}
