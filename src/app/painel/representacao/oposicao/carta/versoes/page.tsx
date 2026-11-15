import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cartaDaEntidade, versoesDaCarta } from "@/lib/db/oposicao-carta"
import { podeNaOposicao, regrasDaEntidade, requireOposicao } from "@/lib/db/oposicao-regras"

import { opcoesDeVersao, VersoesCarta } from "../../versoes-carta"

export const metadata: Metadata = { title: "Versões da carta — Oposição — Confluir" }

/** As versões do texto padrão da carta da entidade, com comparação (15/11/2026). */
export default async function VersoesCartaEntidadePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>
}) {
  const sessao = await requireOposicao("consultar")
  const [{ a, b }, versoes, carta, entidade] = await Promise.all([
    searchParams,
    versoesDaCarta(null),
    cartaDaEntidade(),
    regrasDaEntidade(),
  ])
  const opcoes = opcoesDeVersao({ campanha: false, versoes, versoesEntidade: versoes, entidadeAtual: carta.modelo })
  const editor = "/painel/representacao/oposicao/carta"

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={editor}>
            <ArrowLeft />
            Carta de oposição
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Versões da carta</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Cada texto salvo do padrão da entidade, com quem salvou e quando. Compare duas para ver o que entrou e o que
          saiu.
        </p>
      </div>
      <VersoesCarta
        opcoes={opcoes}
        a={a}
        b={b}
        aqui={`${editor}/versoes`}
        editorHref={editor}
        podeEditar={podeNaOposicao(sessao.permissoes, "configurar", entidade.regras.segregacao)}
      />
    </>
  )
}
