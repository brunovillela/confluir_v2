/**
 * AJUSTE DAS MARCAÇÕES DO ESPELHO (16/11/2026) — a parte pura.
 *
 * As marcações de cada dia vêm da leitura do espelho pela IA (ou do relatório
 * do relógio importado) e ficam em `pessoal_registro_ponto.marcacoes` (jsonb).
 * A gestão de pessoal corrige um dia lido errado ou inclui um dia que faltou;
 * o dia passa a valer como AJUSTADO e o histórico (`ajustes`) guarda o antes e
 * o depois, com quem e quando. Uma nova leitura do espelho não apaga o que foi
 * ajustado à mão (`mesclarLeitura`). Sem migração: tudo dentro do jsonb.
 */

export type DiaMarcado = {
  /** AAAA-MM-DD */
  data: string
  /** Texto da ocorrência do dia (Feriado, Férias, Falta, Atestado, Folga…) ou null. */
  ocorrencia: string | null
  /** Batidas em ordem: entrada, saída, entrada, saída… (HH:MM). */
  marcacoes: string[]
  /** Corrigido ou incluído à mão — vale sobre a leitura do espelho. */
  ajustado?: boolean
}

export type AjusteMarcacao = {
  data: string
  /** Como estava antes (null = o dia não existia). */
  antes: { ocorrencia: string | null; marcacoes: string[] } | null
  /** Como ficou (null = o dia foi retirado). */
  depois: { ocorrencia: string | null; marcacoes: string[] } | null
  motivo: string | null
  por: string | null
  porNome: string | null
  em: string
  /** "desfeito" quando o dia voltou ao lido do espelho. */
  tipo?: "ajuste" | "desfeito"
}

export type MarcacoesEspelho = {
  departamento: string | null
  carga_diaria: string | null
  dias: DiaMarcado[]
  ajustes?: AjusteMarcacao[]
}

const HORA = /^([01]?\d|2[0-3])[:hH]?([0-5]\d)$/

/**
 * "08:00 12:00 13:00 17:30" (ou separado por vírgula, ponto e vírgula, traço;
 * "8h", "0800" e "8:00" também valem) → batidas HH:MM na ordem digitada.
 */
export function lerBatidas(texto: string): { batidas: string[] } | { erro: string } {
  const partes = texto
    .split(/[\s,;|/–—-]+/)
    .map((p) => p.trim())
    .filter(Boolean)
  const batidas: string[] = []
  for (const p of partes) {
    const so = /^([01]?\d|2[0-3])[hH]$/.exec(p)
    if (so) {
      batidas.push(`${so[1].padStart(2, "0")}:00`)
      continue
    }
    const m = HORA.exec(p)
    if (!m) return { erro: `"${p}" não é um horário (use HH:MM).` }
    batidas.push(`${m[1].padStart(2, "0")}:${m[2]}`)
  }
  if (batidas.length > 12) return { erro: "No máximo 12 batidas por dia." }
  return { batidas }
}

const copia = (d: DiaMarcado | undefined) => (d ? { ocorrencia: d.ocorrencia, marcacoes: [...d.marcacoes] } : null)

export const vazio = (): MarcacoesEspelho => ({ departamento: null, carga_diaria: null, dias: [], ajustes: [] })

/**
 * Grava o dia (corrige ou inclui) ou retira-o (`retirar`). Devolve o novo
 * conjunto, com o dia marcado como ajustado e o ajuste no histórico.
 */
export function aplicarAjuste(
  atual: MarcacoesEspelho | null,
  dia: { data: string; marcacoes: string[]; ocorrencia: string | null; retirar?: boolean },
  quem: { id: string | null; nome: string | null; motivo: string | null; em: string }
): MarcacoesEspelho {
  const base = atual ?? vazio()
  const anterior = base.dias.find((d) => d.data === dia.data)
  const ocorrencia = dia.ocorrencia?.trim() || null
  const novo: DiaMarcado | null = dia.retirar ? null : { data: dia.data, ocorrencia, marcacoes: [...dia.marcacoes], ajustado: true }
  const dias = base.dias.filter((d) => d.data !== dia.data)
  if (novo) dias.push(novo)
  dias.sort((a, b) => a.data.localeCompare(b.data))
  return {
    ...base,
    dias,
    ajustes: [
      ...(base.ajustes ?? []),
      {
        data: dia.data,
        antes: copia(anterior),
        depois: novo ? { ocorrencia: novo.ocorrencia, marcacoes: [...novo.marcacoes] } : null,
        motivo: quem.motivo?.trim() || null,
        por: quem.id,
        porNome: quem.nome,
        em: quem.em,
        tipo: "ajuste",
      },
    ],
  }
}

/** Como o dia estava antes do PRIMEIRO ajuste (o lido do espelho); null = não existia. undefined = nunca ajustado. */
export function lidoOriginal(m: MarcacoesEspelho | null, data: string): { ocorrencia: string | null; marcacoes: string[] } | null | undefined {
  const primeiro = (m?.ajustes ?? []).find((a) => a.data === data && a.tipo !== "desfeito")
  return primeiro ? primeiro.antes : undefined
}

/** Volta o dia ao que o espelho trazia antes dos ajustes. */
export function desfazerAjustes(
  atual: MarcacoesEspelho,
  data: string,
  quem: { id: string | null; nome: string | null; em: string }
): MarcacoesEspelho {
  const original = lidoOriginal(atual, data)
  if (original === undefined) return atual
  const anterior = atual.dias.find((d) => d.data === data)
  const dias = atual.dias.filter((d) => d.data !== data)
  if (original) dias.push({ data, ocorrencia: original.ocorrencia, marcacoes: [...original.marcacoes] })
  dias.sort((a, b) => a.data.localeCompare(b.data))
  return {
    ...atual,
    dias,
    ajustes: [
      ...(atual.ajustes ?? []),
      { data, antes: copia(anterior), depois: original, motivo: null, por: quem.id, porNome: quem.nome, em: quem.em, tipo: "desfeito" },
    ],
  }
}

/**
 * Nova leitura do espelho sobre a anterior: os dias ajustados à mão
 * continuam como estão (inclusive os retirados), e o histórico é mantido.
 */
export function mesclarLeitura(nova: MarcacoesEspelho, anterior: MarcacoesEspelho | null): MarcacoesEspelho {
  if (!anterior?.ajustes?.length) return nova
  // Último estado de cada dia mexido à mão (a não ser que tenha sido desfeito).
  const ultimo = new Map<string, AjusteMarcacao>()
  for (const a of anterior.ajustes) ultimo.set(a.data, a)
  const manuais = [...ultimo.values()].filter((a) => a.tipo !== "desfeito")
  const datas = new Set(manuais.map((a) => a.data))
  const dias = nova.dias.filter((d) => !datas.has(d.data))
  for (const a of manuais) {
    if (a.depois) dias.push({ data: a.data, ocorrencia: a.depois.ocorrencia, marcacoes: [...a.depois.marcacoes], ajustado: true })
  }
  dias.sort((a, b) => a.data.localeCompare(b.data))
  return { ...nova, dias, ajustes: anterior.ajustes }
}
