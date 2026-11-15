import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { obterCampanhaPublica } from "@/lib/db/oposicao"
import { cartaDaEntidade, versoesDaCarta } from "@/lib/db/oposicao-carta"
import { podeNaOposicao, requireOposicao } from "@/lib/db/oposicao-regras"

import { opcoesDeVersao, VersoesCarta } from "../../../versoes-carta"

export const metadata: Metadata = { title: "Versões da carta da campanha — Oposição — Confluir" }

/** As versões do texto da carta de uma campanha, com comparação (15/11/2026). */
export default async function VersoesCartaCampanhaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ a?: string; b?: string }>
}) {
  const { id } = await params
  const sessao = await requireOposicao("consultar", id)
  const [{ a, b }, campanha, versoes, versoesEntidade, entidade] = await Promise.all([
    searchParams,
    obterCampanhaPublica(id),
    versoesDaCarta(id),
    versoesDaCarta(null),
    cartaDaEntidade(),
  ])
  if (!campanha) notFound()
  const opcoes = opcoesDeVersao({ campanha: true, versoes, versoesEntidade, entidadeAtual: entidade.modelo })
  const editor = `/painel/representacao/oposicao/${id}/carta`

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={editor}>
            <ArrowLeft />
            Carta da campanha
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Versões da carta da campanha</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {campanha.nome ?? "Campanha"}: cada texto salvo nesta campanha, com quem salvou e quando. Compare com a
          versão anterior ou com o texto da entidade.
        </p>
      </div>
      <VersoesCarta
        opcoes={opcoes}
        a={a}
        b={b}
        aqui={`${editor}/versoes`}
        editorHref={editor}
        podeEditar={podeNaOposicao(sessao.permissoes, "configurar", campanha.regras.segregacao)}
      />
    </>
  )
}
