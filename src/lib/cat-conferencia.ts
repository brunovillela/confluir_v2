import { BLOCOS, CAMPOS_CAT, nomeCampo, type Bloco } from "@/lib/saude-campos"

/**
 * Estado de cada campo na conferência em fila (/painel/saude/cat/conferir),
 * derivado do que a IA deixou: os avisos da leitura ("Campo N (…): …") e os
 * obrigatórios vazios. Não chama a IA — só lê o que já está gravado.
 */

/** Sem eles a CAT não é salva (o mesmo * do formulário). */
export const CAMPOS_OBRIGATORIOS = new Set([11, 19])

export type EstadoCampo =
  | { tipo: "ok" }
  | { tipo: "conferir"; avisos: string[] }
  | { tipo: "vazio_obrigatorio" }

export type EstadosConferencia = {
  porCampo: Map<number, EstadoCampo>
  /** Quantos campos pedem atenção em cada bloco. */
  porBloco: Map<Bloco, number>
  /** Avisos que não são de um campo (vão no aviso geral da leitura). */
  gerais: string[]
  total: number
}

const DO_CAMPO = /^Campo (\d+) \(/

export function estadosDosCampos(valores: Record<string, string>, avisos: string[]): EstadosConferencia {
  const doCampo = new Map<number, string[]>()
  const gerais: string[] = []
  for (const aviso of avisos) {
    const m = DO_CAMPO.exec(aviso)
    const n = m ? Number(m[1]) : NaN
    if (CAMPOS_CAT.some((c) => c.n === n)) doCampo.set(n, [...(doCampo.get(n) ?? []), aviso])
    else gerais.push(aviso)
  }

  const porCampo = new Map<number, EstadoCampo>()
  const porBloco = new Map<Bloco, number>(BLOCOS.map((b) => [b, 0]))
  for (const campo of CAMPOS_CAT) {
    const vazio = !(valores[nomeCampo(campo)] ?? "").trim()
    const estado: EstadoCampo =
      vazio && CAMPOS_OBRIGATORIOS.has(campo.n)
        ? { tipo: "vazio_obrigatorio" }
        : doCampo.has(campo.n)
          ? { tipo: "conferir", avisos: doCampo.get(campo.n)! }
          : { tipo: "ok" }
    porCampo.set(campo.n, estado)
    if (estado.tipo !== "ok") porBloco.set(campo.bloco, (porBloco.get(campo.bloco) ?? 0) + 1)
  }
  const total = [...porBloco.values()].reduce((s, n) => s + n, 0)
  return { porCampo, porBloco, gerais, total }
}
