import { getSessaoPainel } from "@/lib/auth"
import { buscarRemessaPonto, registrosDaRemessaPonto } from "@/lib/db/pessoal"
import { registrarExportacao } from "@/lib/exportacoes"
import { decimalHoras, hhmm } from "@/lib/horas"
import { podeAcessar } from "@/lib/permissoes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Remessa de controle de ponto em CSV (;) para o Excel: uma linha por
 * funcionário, cada hora em HH:MM e em decimal (o decimal é o que vai à
 * contabilidade).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "pessoal_gestao")) {
    return new Response("Sem acesso", { status: 403 })
  }
  const { id } = await params
  const [remessa, itens] = await Promise.all([buscarRemessaPonto(id), registrosDaRemessaPonto(id)])
  if (!remessa) return new Response("Remessa não encontrada", { status: 404 })

  // CPF e matrícula (vínculo com a entidade) de quem está na remessa.
  const ids = [...new Set(itens.map((i) => i.funcionario_id).filter((v): v is string => Boolean(v)))]
  const admin = await createAdminClient()
  const [{ data: us }, { data: vs }] = ids.length
    ? await Promise.all([
        admin.from("usuarios").select("id, cpf").in("id", ids),
        admin
          .from("vinculos_trabalhistas")
          .select("trabalhador_id, matricula, contrato_demissao")
          .eq("empregador_id", await tenantAtual())
          .in("trabalhador_id", ids),
      ])
    : [{ data: [] }, { data: [] }]
  const cpf = new Map(((us ?? []) as { id: string; cpf: string | null }[]).map((u) => [u.id, u.cpf]))
  const matricula = new Map<string, string | null>()
  for (const v of (vs ?? []) as { trabalhador_id: string; matricula: string | null; contrato_demissao: string | null }[]) {
    // O vínculo ativo vence o encerrado.
    if (!matricula.has(v.trabalhador_id) || !v.contrato_demissao) matricula.set(v.trabalhador_id, v.matricula)
  }

  const cel = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const par = (v: number | null) => (v === null ? ["", ""] : [hhmm(v), decimalHoras(v)])
  const cab = ["Remessa", "Funcionário", "CPF", "Matrícula"]
  for (const pct of ["70", "100"]) {
    for (const rotulo of ["Saldo anterior", "Realizadas", "Pagas", "Saldo remanescente"]) {
      cab.push(`${rotulo} ${pct}% (HH:MM)`, `${rotulo} ${pct}% (decimal)`)
    }
  }
  cab.push("Liberado", "Espelho anexado")
  const corpo = itens.map((i) =>
    [
      remessa.nome_remessa ?? "",
      i.funcionarioNome ?? "",
      (i.funcionario_id && cpf.get(i.funcionario_id)) ?? "",
      (i.funcionario_id && matricula.get(i.funcionario_id)) ?? "",
      ...par(i.saldo_remessa_anterior_70),
      ...par(i.horas_realizadas_70),
      ...par(i.horas_pagas_70),
      ...par(i.saldo_remanescente_70),
      ...par(i.saldo_remessa_anterior_100),
      ...par(i.horas_realizadas_100),
      ...par(i.horas_pagas_100),
      ...par(i.saldo_remanescente_100),
      i.liberado === true ? "sim" : "não",
      i.arquivo ? "sim" : "não",
    ]
      .map(cel)
      .join(";")
  )

  await registrarExportacao(request, {
    usuarioId: sessao.usuario.id,
    recurso: "ponto_remessa",
    formato: "csv",
    quantidade: itens.length,
    filtros: { remessa: remessa.nome_remessa ?? id },
  })
  const nome = (remessa.nome_remessa ?? "remessa")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w-]+/g, "-")
    .toLowerCase()
  return new Response("﻿" + [cab.join(";"), ...corpo].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome.startsWith("ponto") ? nome : `ponto-${nome}`}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}
