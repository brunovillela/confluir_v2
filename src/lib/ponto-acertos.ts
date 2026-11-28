/**
 * MARCOS DE ACERTO DO BANCO DE HORAS (27/11/2026) — conta pura, sem banco.
 *
 * Um acerto no mês C zera o saldo de quem está nele no fechamento de C: a
 * remessa seguinte (a primeira com competência depois de C) começa com saldo
 * anterior zero nas faixas zeradas. O saldo zerado fica guardado no item do
 * acerto. Saldo positivo zerado segue o motivo (pago em folha, compensado em
 * folga, vencido…); saldo negativo zerado é sempre descontado em folha.
 */

export type FaixasAcerto = "ambas" | "faixa1" | "faixa2"
export type MotivoAcerto = "pago" | "compensado" | "vencido" | "rescisao" | "acordo" | "outro"
export type AlcanceAcerto = "individual" | "parcial" | "massa"

export const MOTIVOS_ACERTO: { chave: MotivoAcerto; rotulo: string; descricao: string }[] = [
  { chave: "pago", rotulo: "Pago em folha", descricao: "As horas positivas são pagas no contracheque." },
  { chave: "compensado", rotulo: "Compensado em folga", descricao: "As horas positivas foram compensadas com folgas." },
  {
    chave: "vencido",
    rotulo: "Vencido o prazo de compensação",
    descricao: "Passou o prazo do banco (6 meses no acordo individual, 1 ano no coletivo — art. 59 da CLT).",
  },
  { chave: "rescisao", rotulo: "Rescisão", descricao: "Acerto do banco na saída do funcionário." },
  { chave: "acordo", rotulo: "Acordo coletivo (ACT)", descricao: "Zeramento previsto no acordo coletivo." },
  { chave: "outro", rotulo: "Outro", descricao: "Explique na observação." },
]

export const ROTULO_FAIXAS_ACERTO: Record<FaixasAcerto, string> = {
  ambas: "as duas faixas",
  faixa1: "só a faixa 1",
  faixa2: "só a faixa 2",
}

export const ROTULO_ALCANCE: Record<AlcanceAcerto, string> = {
  individual: "Individual",
  parcial: "Parcial",
  massa: "Em massa",
}

export const motivoAcerto = (m: string) => MOTIVOS_ACERTO.find((x) => x.chave === m)

/** Um acerto de uma pessoa (o item), com o que o acerto zera. */
export type AcertoDaPessoa = { acertoId: string; competencia: string; faixas: FaixasAcerto; motivo: MotivoAcerto }

export const zeraFaixa1 = (f: FaixasAcerto) => f !== "faixa2"
export const zeraFaixa2 = (f: FaixasAcerto) => f !== "faixa1"

/**
 * Entre o registro de competência `desde` (inclusive; null = sem registro
 * anterior) e a remessa de competência `ate` (exclusive), algum acerto zerou o
 * saldo? É o que decide se a remessa `ate` começa do zero.
 */
export function zeradoEntre(
  acertos: AcertoDaPessoa[],
  desde: string | null,
  ate: string
): { faixa1: boolean; faixa2: boolean; acerto: AcertoDaPessoa | null } {
  const entre = acertos.filter((a) => (desde === null || a.competencia >= desde) && a.competencia < ate)
  if (!entre.length) return { faixa1: false, faixa2: false, acerto: null }
  return {
    faixa1: entre.some((a) => zeraFaixa1(a.faixas)),
    faixa2: entre.some((a) => zeraFaixa2(a.faixas)),
    acerto: [...entre].sort((a, b) => b.competencia.localeCompare(a.competencia))[0],
  }
}

export type RegistroSaldo = { competencia: string; remessaId: string; saldo70: number | null; saldo100: number | null }

/**
 * O saldo da pessoa no fechamento do mês `competencia`: o remanescente do
 * último registro até esse mês, já descontados os acertos anteriores a ele.
 * `registro` = de onde veio (null: nenhum registro até o mês).
 */
export function saldoNoFechamento(
  registros: RegistroSaldo[],
  acertos: AcertoDaPessoa[],
  competencia: string
): { saldo70: number; saldo100: number; registro: RegistroSaldo | null } {
  const reg = [...registros].filter((r) => r.competencia <= competencia).sort((a, b) => b.competencia.localeCompare(a.competencia))[0] ?? null
  if (!reg) return { saldo70: 0, saldo100: 0, registro: null }
  // Acerto depois do último registro (e antes do mês pedido) já zerou.
  const depois = acertos.filter((a) => a.competencia >= reg.competencia && a.competencia < competencia)
  const z1 = depois.some((a) => zeraFaixa1(a.faixas))
  const z2 = depois.some((a) => zeraFaixa2(a.faixas))
  return { saldo70: z1 ? 0 : (reg.saldo70 ?? 0), saldo100: z2 ? 0 : (reg.saldo100 ?? 0), registro: reg }
}

/** O que acontece com o saldo zerado: pagar (positivo, motivo pago), descontar (negativo) ou nada a lançar na folha. */
export function destinoDoZerado(saldo: number, motivo: MotivoAcerto): "pagar" | "descontar" | "nenhum" {
  if (saldo < 0) return "descontar"
  if (saldo > 0 && (motivo === "pago" || motivo === "rescisao")) return "pagar"
  return "nenhum"
}

/**
 * Meses de acerto recorrente sem o acerto lançado: o mês configurado vira
 * pendência no próprio mês e no seguinte (a remessa do mês chega depois).
 * `lancados` = competências que já têm acerto.
 */
export function acertosRecorrentesPendentes(meses: number[], lancados: Set<string>, hoje: string): string[] {
  const ano = Number(hoje.slice(0, 4))
  const mes = Number(hoje.slice(5, 7))
  const pendentes: string[] = []
  for (const m of meses) {
    for (const [a, distancia] of [
      [ano, mes - m],
      [ano - 1, mes + 12 - m],
    ] as const) {
      if (distancia === 0 || distancia === 1) {
        const comp = `${a}-${String(m).padStart(2, "0")}`
        if (!lancados.has(comp)) pendentes.push(comp)
      }
    }
  }
  return [...new Set(pendentes)].sort()
}

export const rotuloMesAcerto = (c: string) => `${c.slice(5, 7)}/${c.slice(0, 4)}`
