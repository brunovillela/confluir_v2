import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { campanhasQueSeguemAEntidade, cartaDaEntidade } from "@/lib/db/oposicao-carta"
import { podeNaOposicao, regrasDaEntidade, requireOposicao } from "@/lib/db/oposicao-regras"
import { nomeEntidade } from "@/lib/db/organizacao"
import { formatarDataHora } from "@/lib/formato"
import { DECLARACAO_PADRAO } from "@/lib/oposicao-constantes"
import { CARTA_PADRAO } from "@/lib/oposicao-carta"

import { EditorCarta } from "../editor-carta"

export const metadata: Metadata = { title: "Carta de oposição — Oposição — Confluir" }

/**
 * O texto padrão da carta de oposição da entidade (14/11/2026), com as
 * referências que viram os dados de cada pessoa. Vale para as campanhas sem
 * texto próprio.
 */
export default async function CartaOposicaoPage() {
  const sessao = await requireOposicao("consultar")
  const [carta, entidade, nome, seguem] = await Promise.all([
    cartaDaEntidade(),
    regrasDaEntidade(),
    nomeEntidade(),
    campanhasQueSeguemAEntidade(),
  ])
  const abertas = seguem.filter((c) => c.situacao === "aberta")
  const avisoAoSalvar =
    seguem.length === 0
      ? "Nenhuma campanha em andamento segue o texto da entidade agora: o novo texto vale para as próximas campanhas sem texto próprio."
      : `Vale para ${seguem.length === 1 ? "a campanha" : `as ${seguem.length} campanhas`} sem texto próprio (${seguem
          .map((c) => c.nome ?? "sem nome")
          .join(", ")})${abertas.length > 0 ? `, ${abertas.length === 1 ? "uma delas aberta" : `${abertas.length} delas abertas`}` : ""}. Quem já registrou oposição mantém a carta com o texto anterior.`
  const podeEditar = podeNaOposicao(sessao.permissoes, "configurar", entidade.regras.segregacao)
  const situacao = carta.modelo
    ? `Texto da entidade${carta.em ? `, alterado em ${formatarDataHora(carta.em)}` : ""}${carta.porNome ? ` por ${carta.porNome}` : ""}.`
    : "Texto padrão do sistema."

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/representacao/oposicao">
            <ArrowLeft />
            Oposição
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Carta de oposição</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          O texto que o trabalhador assina, com as referências trocadas pelos dados dele. Vale para as campanhas que
          não têm texto próprio (na página da campanha › Carta).
        </p>
        <p className="text-muted-foreground mt-1 text-xs">{situacao}</p>
      </div>

      <EditorCarta
        inicial={carta.modelo ?? CARTA_PADRAO}
        proprio={Boolean(carta.modelo)}
        podeEditar={podeEditar}
        rotuloRestaurar="Voltar ao texto padrão do sistema"
        exemplo={{ ENTIDADE: nome, DECLARACAO: DECLARACAO_PADRAO }}
        pdfHref="/painel/representacao/oposicao/carta/exemplo"
        avisoAoSalvar={avisoAoSalvar}
      />
    </>
  )
}
