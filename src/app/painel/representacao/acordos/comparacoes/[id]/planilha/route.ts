import { ROTULO_AVALIACAO, ROTULO_SITUACAO } from "@/lib/acordos-comparar"
import { ROTULO_TEMA } from "@/lib/acordos-constantes"
import { getSessaoPainel } from "@/lib/auth"
import { comparacaoPermitida, obterComparacao } from "@/lib/db/acordos-comparacoes"
import { podeAcessar } from "@/lib/permissoes"

export const runtime = "nodejs"

/** Célula de CSV (Excel pt-BR: separador ";"). */
function celula(v: string | null | undefined): string {
  const t = (v ?? "").replace(/\r?\n/g, "\n")
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "acordos_coletivos", ["negociacoes"])) {
    return new Response("Sem acesso", { status: 403 })
  }
  const { id } = await ctx.params
  if (!(await comparacaoPermitida(id, sessao.permissoes))) return new Response("Sem acesso", { status: 403 })
  const c = await obterComparacao(id)
  if (!c) return new Response("Comparação não encontrada", { status: 404 })

  const cabecalho = [
    "Situação",
    "Avaliação p/ o trabalhador",
    "Tema",
    `Cláusula em A (${c.acordoA.titulo ?? ""})`,
    `Cláusula em B (${c.acordoB.titulo ?? ""})`,
    "O que mudou",
    "Motivo da avaliação",
    "Texto em A",
    "Texto em B",
  ]
  const lado = (l: (typeof c.pares)[number]["a"]) =>
    l ? [l.numero, l.titulo].filter(Boolean).join(" – ") : ""
  const linhas = c.pares.map((p) => [
    ROTULO_SITUACAO[p.situacao],
    p.avaliacao ? ROTULO_AVALIACAO[p.avaliacao] + (p.avaliacaoManual ? " (conferida)" : "") : "",
    p.tema ? ROTULO_TEMA[p.tema] : "",
    lado(p.a),
    lado(p.b),
    p.resumo ?? "",
    p.avaliacaoMotivo ?? "",
    p.a?.texto ?? "",
    p.b?.texto ?? "",
  ])
  const csv = [cabecalho, ...linhas].map((l) => l.map(celula).join(";")).join("\r\n")
  return new Response("﻿" + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="comparacao-acordos.csv"`,
    },
  })
}
