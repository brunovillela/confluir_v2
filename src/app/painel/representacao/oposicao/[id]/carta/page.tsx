import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { obterCampanhaPublica } from "@/lib/db/oposicao"
import { cartaDaCampanha, oposicoesRegistradas, versoesDaCarta } from "@/lib/db/oposicao-carta"
import { podeNaOposicao, requireOposicao } from "@/lib/db/oposicao-regras"
import { nomeEntidade } from "@/lib/db/organizacao"
import { formatarDataHora } from "@/lib/formato"
import { DECLARACAO_PADRAO } from "@/lib/oposicao-constantes"

import { EditorCarta } from "../../editor-carta"
import { opcoesDeVersao } from "../../versoes-carta"

export const metadata: Metadata = { title: "Carta da campanha — Oposição — Confluir" }

/**
 * O texto da carta numa campanha (14/11/2026): segue o da entidade ou tem o
 * seu. Cada oposição guarda o texto que valia quando foi registrada.
 */
export default async function CartaDaCampanhaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ versao?: string }>
}) {
  const { id } = await params
  const sessao = await requireOposicao("consultar", id)
  const [{ versao }, campanha, carta, nome, registradas] = await Promise.all([
    searchParams,
    obterCampanhaPublica(id),
    cartaDaCampanha(id),
    nomeEntidade(),
    oposicoesRegistradas(id),
  ])
  if (!campanha || !carta) notFound()
  // "Abrir no editor" numa versão antiga (15/11/2026): o texto dela, ainda não salvo.
  const aberta = versao
    ? opcoesDeVersao({
        campanha: true,
        versoes: await versoesDaCarta(id),
        versoesEntidade: await versoesDaCarta(null),
        entidadeAtual: carta.entidade.modelo,
      }).find((o) => o.id === versao && o.versao)
    : undefined
  const podeEditar = podeNaOposicao(sessao.permissoes, "configurar", campanha.regras.segregacao)
  const aqui = `/painel/representacao/oposicao/${id}`
  const situacao =
    carta.origem === "campanha"
      ? `texto próprio da campanha${carta.campanha.em ? `, alterado em ${formatarDataHora(carta.campanha.em)}` : ""}${carta.campanha.porNome ? ` por ${carta.campanha.porNome}` : ""}.`
      : carta.origem === "entidade"
        ? "segue o texto da entidade. Altere aqui para esta campanha ter o seu."
        : "segue o texto padrão do sistema. Altere aqui para esta campanha ter o seu."

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={aqui}>
            <ArrowLeft />
            Campanha
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Carta da campanha</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {campanha.nome ?? "Campanha"}: {situacao}{" "}
          <Link href="/painel/representacao/oposicao/carta" className="text-primary underline underline-offset-4">
            Ver o texto da entidade
          </Link>
          .
        </p>
      </div>

      <EditorCarta
        campanhaId={id}
        inicial={carta.vigente}
        proprio={carta.origem === "campanha"}
        podeEditar={podeEditar}
        rotuloRestaurar="Voltar a usar o texto da entidade"
        exemplo={{
          ENTIDADE: nome,
          CAMPANHA: campanha.nome,
          DETALHE_DESCONTO: campanha.detalhe_desconto,
          DECLARACAO: campanha.texto_declaracao ?? DECLARACAO_PADRAO,
        }}
        pdfHref={`/painel/representacao/oposicao/carta/exemplo?campanha=${id}`}
        versoesHref={`/painel/representacao/oposicao/${id}/carta/versoes`}
        rascunho={aberta?.texto ?? null}
        aviso={
          aberta
            ? `Aberta a versão de ${aberta.rotulo}. Nada mudou ainda: revise e salve para ela voltar a valer.`
            : null
        }
        avisoAoSalvar={
          registradas > 0
            ? `${registradas.toLocaleString("pt-BR")} ${registradas === 1 ? "pessoa já registrou" : "pessoas já registraram"} oposição nesta campanha e ${registradas === 1 ? "mantém" : "mantêm"} a carta com o texto anterior. O novo texto vale só para quem registrar daqui em diante.`
            : "Ninguém registrou oposição nesta campanha ainda: o novo texto vale para todos."
        }
      />
    </>
  )
}
