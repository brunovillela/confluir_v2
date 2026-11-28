import { getSessaoPainel } from "@/lib/auth"
import { relatorioGeralPonto } from "@/lib/db/ponto-relatorio-geral"
import { registrarExportacao } from "@/lib/exportacoes"
import { decimalHoras, hhmm } from "@/lib/horas"
import { podeAcessar } from "@/lib/permissoes"
import { ROTULO_DIVERGENCIA } from "@/lib/ponto-relatorio-geral"

export const maxDuration = 60

/**
 * Relatório do ponto e das horas extras em CSV (;) para o Excel (Ponto, Fase 3
 * — 28/11/2026): uma linha por pessoa e mês, com as duas faixas (horas em
 * HH:MM e em decimal), o valor pago, a origem das horas pagas e as
 * divergências da linha. Sem CPF: para isso há a planilha de cada remessa.
 */
export async function GET(request: Request) {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "pessoal_gestao")) return new Response("Sem acesso", { status: 403 })
  const sp = Object.fromEntries(new URL(request.url).searchParams) as Record<string, string>
  const { relatorio, faixas } = await relatorioGeralPonto(sp)
  const { filtro, linhas, divergencias } = relatorio

  const cel = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const par = (v: number | null) => (v === null ? ["", ""] : [hhmm(v), decimalHoras(v)])
  const dinheiro = (v: number | null) => (v === null ? "" : v.toFixed(2).replace(".", ","))
  const cab = ["Mês", "Funcionário", "Departamento"]
  for (const pct of ["70", "100"] as const) {
    for (const rotulo of ["Saldo anterior", "Realizadas", "Pagas", "Saldo remanescente"]) {
      cab.push(`${rotulo} ${faixas[pct]} (HH:MM)`, `${rotulo} ${faixas[pct]} (decimal)`)
    }
    cab.push(`Valor pago ${faixas[pct]} (R$)`)
  }
  cab.push("Horas pagas", "Divergências")
  const divDe = new Map<string, string[]>()
  for (const d of divergencias) {
    const k = `${d.funcionarioId}|${d.competencia}`
    ;(divDe.get(k) ?? divDe.set(k, []).get(k)!).push(`${ROTULO_DIVERGENCIA[d.tipo].rotulo}: ${d.texto}`)
  }
  const corpo = linhas.map((r) =>
    [
      r.competencia,
      r.nome,
      r.departamento.nome,
      ...par(r.anterior70),
      ...par(r.he70),
      ...par(r.pagas70),
      ...par(r.remanescente70),
      dinheiro(r.valor70),
      ...par(r.anterior100),
      ...par(r.he100),
      ...par(r.pagas100),
      ...par(r.remanescente100),
      dinheiro(r.valor100),
      r.pagas70 + r.pagas100 > 0 ? (r.pagasDoContracheque ? "do contracheque" : "digitadas") : "",
      (divDe.get(`${r.funcionarioId}|${r.competencia}`) ?? []).join(" | "),
    ]
      .map(cel)
      .join(";")
  )

  await registrarExportacao(request, {
    usuarioId: sessao.usuario.id,
    recurso: "ponto_relatorio",
    formato: "csv",
    quantidade: linhas.length,
    filtros: { de: filtro.de, ate: filtro.ate, departamento: filtro.departamento ?? "", funcionario: filtro.funcionario ?? "" },
  })
  return new Response("﻿" + [cab.join(";"), ...corpo].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="relatorio-ponto-${filtro.de}-a-${filtro.ate}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}
