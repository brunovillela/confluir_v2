import type { FrotaTelegram, VeiculoFrotaTelegram } from "@/lib/db/telegram"
import { horaSP } from "@/lib/veiculos-constantes"

/**
 * Texto do /carros no Telegram (HTML): a frota no momento da consulta, com os
 * disponíveis por sede e com quem estão os que saíram. Puro, para testar.
 */

/** HTML do Telegram: só &, < e > precisam de escape. */
function esc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function dataCurtaSP(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(iso))
}

/** "15/09" a partir de "2026-09-15" (data pura, sem fuso). */
function diaMes(data: string): string {
  const [, m, d] = data.slice(0, 10).split("-")
  return d && m ? `${d}/${m}` : data
}

function rotuloVeiculo(v: VeiculoFrotaTelegram): string {
  // Só a placa: o código do cadastro é código de processo e se repete entre carros.
  const detalhe = v.placa ?? v.codigo
  return `<b>${esc(v.marcaModelo ?? "Veículo")}</b>${detalhe ? ` — ${esc(detalhe)}` : ""}`
}

/** Retrato da frota na hora do /carros: disponíveis por sede e com quem estão os demais. */
export function mensagemFrota(frota: FrotaTelegram, agora: Date): string {
  const hora = `${dataCurtaSP(agora.toISOString())} às ${horaSP(agora.toISOString())}`
  const disponiveis = frota.porSede.reduce((s, g) => s + g.veiculos.length, 0)
  const linhas: string[] = [`🚗 <b>Frota agora</b> — ${hora}`, ""]

  linhas.push(`✅ <b>Disponíveis (${disponiveis})</b>`)
  if (disponiveis === 0) {
    linhas.push("Nenhum veículo disponível no momento.")
  }
  for (const grupo of frota.porSede) {
    linhas.push("", `📍 <b>${esc(grupo.sede ?? "Sem sede registrada")}</b> (${grupo.veiculos.length})`)
    for (const v of grupo.veiculos) linhas.push(`• ${rotuloVeiculo(v)}`)
  }

  linhas.push("", `🔑 <b>Em uso (${frota.emUso.length})</b>`)
  if (frota.emUso.length === 0) linhas.push("Nenhum veículo fora.")
  for (const v of frota.emUso) {
    const saida = v.saidaEm
      ? `${dataCurtaSP(v.saidaEm)} às ${horaSP(v.saidaEm)}`
      : v.saidaData
        ? diaMes(v.saidaData)
        : null
    const detalhes = [
      `com <b>${esc(v.condutor ?? "condutor não informado")}</b>`,
      saida ? `desde ${saida}${v.sedeSaida ? ` (${esc(v.sedeSaida)})` : ""}` : null,
      v.destino ? `destino: ${esc(v.destino)}` : null,
      v.previsaoRetorno ? `volta prevista ${diaMes(v.previsaoRetorno)}` : null,
    ].filter(Boolean)
    linhas.push(`• ${rotuloVeiculo(v)}`, `   ${detalhes.join(" · ")}`)
  }

  if (frota.emManutencao.length > 0) {
    linhas.push("", `🔧 <b>Em manutenção (${frota.emManutencao.length})</b>`)
    for (const v of frota.emManutencao) linhas.push(`• ${rotuloVeiculo(v)}`)
  }
  return linhas.join("\n")
}
