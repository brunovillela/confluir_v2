import { getSessaoPainel } from "@/lib/auth"
import { competenciaValida, usoForaDoExpediente, usoForaPorMeses, type MesUsoFora } from "@/lib/db/uso-fora-expediente"
import { registrarExportacao } from "@/lib/exportacoes"
import { decimalHoras, hhmm } from "@/lib/horas"
import { podeAcessar } from "@/lib/permissoes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { CATEGORIAS_FORA, horaDoDia, LIMITE_AVISO_MES_MIN, TOLERANCIA_DIARIA_MIN } from "@/lib/uso-fora-expediente"

/**
 * Uso fora do expediente do mês em CSV (;) para o Excel (22/11/2026).
 * ?mes=AAAA-MM; ?detalhe=dias troca a linha por funcionário pela linha por
 * dia com tempo a considerar (trechos fora e motivo informado). Horas em
 * HH:MM e em decimal. Sem CPF: a matrícula identifica.
 */
export async function GET(request: Request) {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "pessoal_gestao")) {
    return new Response("Sem acesso", { status: 403 })
  }
  const url = new URL(request.url)
  const mes = competenciaValida(url.searchParams.get("mes"))
  if (!mes) return new Response("Mês inválido (use AAAA-MM).", { status: 400 })
  const porDia = url.searchParams.get("detalhe") === "dias"

  const dados = await usoForaDoExpediente(mes)
  if (!dados.disponivel) return new Response("O registro do uso não está ligado nesta entidade.", { status: 404 })
  const ids = dados.linhas.map((l) => l.usuarioId)
  const matricula = await matriculas(ids)

  const cel = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  // Minutos → HH:MM e decimal; zero fica em branco no HH:MM para a planilha ficar legível.
  const par = (min: number) => [min ? hhmm(min / 60) : "", decimalHoras(min / 60)]
  const rotuloMes = `${mes.slice(5, 7)}/${mes.slice(0, 4)}`
  const cab: string[] = []
  const corpo: string[][] = []

  if (!porDia) {
    cab.push("Mês", "Funcionário", "Matrícula", "Jornada", "Uso no mês (HH:MM)", "Uso no mês (decimal)")
    for (const c of CATEGORIAS_FORA) cab.push(`${c.rotulo} (HH:MM)`, `${c.rotulo} (decimal)`)
    cab.push(
      "A considerar (HH:MM)",
      "A considerar (decimal)",
      "Dias acima da tolerância",
      "Dias com uso fora",
      "Dias com motivo informado",
      `Acima de ${LIMITE_AVISO_MES_MIN / 60} h no mês`,
      "Dias em férias ou afastamento com uso"
    )
    for (const l of dados.linhas) {
      const r = l.resumo
      corpo.push([
        rotuloMes,
        l.nome,
        matricula.get(l.usuarioId) ?? "",
        l.jornada,
        ...par(r.total),
        ...CATEGORIAS_FORA.flatMap((c) => par(r.fora[c.chave])),
        ...par(r.considerado),
        String(r.diasAcimaTolerancia),
        String(r.diasComFora),
        String(l.diasComMotivo),
        l.aviso.acimaDoLimite ? "sim" : "não",
        String(l.aviso.diasEmAfastamento),
      ])
    }
  } else {
    cab.push("Mês", "Funcionário", "Matrícula", "Data", "Dia", "Situação", "Uso no dia (HH:MM)", "Dentro da jornada (HH:MM)")
    for (const c of CATEGORIAS_FORA) cab.push(`${c.rotulo} (HH:MM)`)
    cab.push("A considerar (HH:MM)", "A considerar (decimal)", "Horários fora da jornada", "Motivo informado")
    const nomes = new Map(dados.linhas.map((l) => [l.usuarioId, l.nome]))
    const mapa = (await usoForaPorMeses(ids, [mes])) ?? new Map<string, MesUsoFora[]>()
    for (const id of ids) {
      for (const m of mapa.get(id) ?? []) {
        for (const { dia, motivo } of m.dias) {
          corpo.push([
            rotuloMes,
            nomes.get(id) ?? "",
            matricula.get(id) ?? "",
            dia.data.split("-").reverse().join("/"),
            dia.nomeDia,
            dia.situacao ?? "",
            par(dia.total)[0],
            par(dia.dentro)[0],
            ...CATEGORIAS_FORA.map((c) => par(dia.fora[c.chave])[0]),
            ...par(dia.considerado),
            dia.trechos
              .filter((t) => t.categoria !== "dentro")
              .map((t) => `${horaDoDia(t.inicio)}-${horaDoDia(t.fim)}`)
              .join(", "),
            motivo ?? "",
          ])
        }
      }
    }
  }

  await registrarExportacao(request, {
    usuarioId: sessao.usuario.id,
    recurso: "ponto_uso_fora",
    formato: "csv",
    quantidade: corpo.length,
    filtros: { mes, detalhe: porDia ? "dias" : "funcionarios" },
  })
  const nota = porDia
    ? `Dias com tempo a considerar (dias de trabalho com até ${TOLERANCIA_DIARIA_MIN} min fora não entram).`
    : `A considerar: sem os dias de trabalho com até ${TOLERANCIA_DIARIA_MIN} min fora.`
  const linhas = [cab.map(cel).join(";"), ...corpo.map((l) => l.map(cel).join(";")), "", cel(nota)]
  return new Response("﻿" + linhas.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="uso-fora-do-expediente-${mes}${porDia ? "-dias" : ""}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}

/** Matrícula do vínculo com a entidade (o ativo vence o encerrado). */
async function matriculas(ids: string[]): Promise<Map<string, string | null>> {
  const mapa = new Map<string, string | null>()
  if (ids.length === 0) return mapa
  const admin = await createAdminClient()
  const { data } = await admin
    .from("vinculos_trabalhistas")
    .select("trabalhador_id, matricula, contrato_demissao")
    .eq("empregador_id", await tenantAtual())
    .in("trabalhador_id", ids)
  for (const v of (data ?? []) as { trabalhador_id: string; matricula: string | null; contrato_demissao: string | null }[]) {
    if (!mapa.has(v.trabalhador_id) || !v.contrato_demissao) mapa.set(v.trabalhador_id, v.matricula)
  }
  return mapa
}
