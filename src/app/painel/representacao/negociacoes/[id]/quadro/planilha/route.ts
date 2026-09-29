import { ROTULO_TEMA, temaClausula } from "@/lib/acordos-constantes"
import { getSessaoPainel } from "@/lib/auth"
import { dadosDoQuadro, obterNegociacao, type ClausulaQuadro } from "@/lib/db/negociacoes"
import { ROTULO_PAPEL } from "@/lib/negociacoes-constantes"
import { montarQuadro, ROTULO_LEITURA_PAUTA, ROTULO_LEITURA_PROPOSTA } from "@/lib/negociacoes-quadro"
import { podeAcessar } from "@/lib/permissoes"

export const runtime = "nodejs"

/** Célula de CSV (Excel pt-BR: separador ";"). */
function celula(v: string | null | undefined): string {
  const t = (v ?? "").replace(/\r?\n/g, "\n")
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

const rotulo = (c: ClausulaQuadro | null) => (c ? [c.numero, c.titulo].filter(Boolean).join(" – ") : "")

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "negociacoes")) {
    return new Response("Sem acesso", { status: 403 })
  }
  const { id } = await ctx.params
  const n = await obterNegociacao(id)
  if (!n) return new Response("Negociação não encontrada", { status: 404 })
  const q = await dadosDoQuadro(n, new URL(req.url).searchParams.get("proposta"))
  const linhas = montarQuadro(q.vigente, q.pauta, q.proposta)

  const nomeProposta = q.propostaDoc
    ? `${ROTULO_PAPEL[q.propostaDoc.papel]}${q.propostaDoc.rodada ? ` ${q.propostaDoc.rodada}ª rodada` : ""}`
    : "Proposta"
  const cabecalho = [
    "Proposta × vigente",
    "Proposta × pauta",
    "Tema",
    `Vigente (${n.acordoVigente?.titulo ?? "—"})`,
    "Pauta",
    nomeProposta,
    "Texto vigente",
    "Texto pauta",
    `Texto ${nomeProposta.toLowerCase()}`,
  ]
  const corpo = linhas.map((l) => {
    const tema = temaClausula((l.vigente ?? l.pauta ?? l.proposta)?.tema)
    return [
      l.leituraProposta === "sem_proposta" ? "" : ROTULO_LEITURA_PROPOSTA[l.leituraProposta],
      l.leituraPauta ? ROTULO_LEITURA_PAUTA[l.leituraPauta] : "",
      tema ? ROTULO_TEMA[tema] : "",
      rotulo(l.vigente),
      rotulo(l.pauta),
      rotulo(l.proposta),
      l.vigente?.texto ?? "",
      l.pauta?.texto ?? "",
      l.proposta?.texto ?? "",
    ]
  })
  const csv = [cabecalho, ...corpo].map((l) => l.map(celula).join(";")).join("\r\n")
  return new Response("﻿" + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="quadro-negociacao.csv"`,
    },
  })
}
