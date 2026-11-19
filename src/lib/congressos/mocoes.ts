/**
 * Congressos — regras puras das moções (Fase 4).
 *
 * Limiar de assinaturas (número, percentual do congresso ou da base de
 * origem, combinados com "ou"/"e") e quem pode assinar, com a prova de onde a
 * pessoa está (local da decisão, plano 6.7). Sem banco: testadas em
 * tests/unidade.
 */

export type MeioAssinatura = "link" | "estacao" | "papel"
export type NivelProva = "A" | "B" | "C" | "D" | "E"
export type RegraLocal = "so_local" | "local_ou_distancia" | "distancia_autorizados" | "so_distancia"

export const ROTULO_MEIO: Record<MeioAssinatura, string> = { link: "Link pessoal", estacao: "Estação da mesa", papel: "Papel" }
export const ROTULO_NIVEL: Record<NivelProva, string> = {
  A: "credenciado no local",
  B: "presente na sessão",
  C: "código da sala",
  D: "estação da mesa",
  E: "papel",
}

export type Alternativa = { rotulo: string; exigido: number; atual: number; atingido: boolean }
export type Limiar = { alternativas: Alternativa[]; combinacao: "ou" | "e"; atingido: boolean; aviso?: string }

/**
 * Progresso nas alternativas do limiar. O percentual é calculado sobre os
 * delegados com direito a assinar (do congresso ou da base de origem) e
 * arredondado para cima: 90% de 23 = 21.
 */
export function calcularLimiar(d: {
  numero: number
  percentual: number
  combinacao: "ou" | "e"
  percentualDe: "congresso" | "base_origem"
  /** Com direito a assinar no congresso / na base de origem da moção. */
  denominadorCongresso: number
  denominadorBase: number | null
  validas: number
  validasDaBase: number
}): Limiar {
  const alternativas: Alternativa[] = []
  let aviso: string | undefined
  if (d.numero > 0) {
    alternativas.push({ rotulo: `${d.numero} assinatura(s)`, exigido: d.numero, atual: d.validas, atingido: d.validas >= d.numero })
  }
  if (d.percentual > 0) {
    if (d.percentualDe === "base_origem") {
      if (d.denominadorBase === null) {
        aviso = "A moção não tem base de origem: o percentual da base não pode ser calculado."
      } else {
        const exigido = Math.max(1, Math.ceil((d.denominadorBase * d.percentual) / 100))
        alternativas.push({
          rotulo: `${d.percentual}% da base de origem (${exigido} de ${d.denominadorBase})`,
          exigido,
          atual: d.validasDaBase,
          atingido: d.denominadorBase > 0 && d.validasDaBase >= exigido,
        })
      }
    } else {
      const exigido = Math.max(1, Math.ceil((d.denominadorCongresso * d.percentual) / 100))
      alternativas.push({
        rotulo: `${d.percentual}% dos delegados (${exigido} de ${d.denominadorCongresso})`,
        exigido,
        atual: d.validas,
        atingido: d.denominadorCongresso > 0 && d.validas >= exigido,
      })
    }
  }
  if (alternativas.length === 0) return { alternativas, combinacao: d.combinacao, atingido: !aviso, aviso }
  const atingido = d.combinacao === "e" ? alternativas.every((a) => a.atingido) && !aviso : alternativas.some((a) => a.atingido)
  return { alternativas, combinacao: d.combinacao, atingido, aviso }
}

/** Quanto falta, em linguagem simples, para a alternativa mais próxima. */
export function quantoFalta(l: Limiar): string | null {
  if (l.atingido) return null
  const faltas = l.alternativas.filter((a) => !a.atingido).map((a) => ({ a, falta: a.exigido - a.atual }))
  if (!faltas.length) return l.aviso ?? null
  if (l.combinacao === "e") return faltas.map((f) => `${f.falta} para ${f.a.rotulo}`).join(" e ")
  const menor = faltas.sort((x, y) => x.falta - y.falta)[0]
  return `Faltam ${menor.falta} para ${menor.a.rotulo}.`
}

/** Níveis de prova aceitos por exigência mínima. */
const ACEITOS: Record<NivelProva, NivelProva[]> = {
  A: ["A", "B", "C", "D", "E"],
  B: ["B", "C", "D", "E"],
  C: ["C", "D", "E"],
  D: ["D", "E"],
  E: ["E"],
}

export type PedidoAssinatura = {
  situacao: string
  prazo: string | null
  agora?: number
  direito: boolean
  categoria: string | null
  emExercicio: boolean
  credenciado: boolean
  modalidade: "presencial" | "distancia"
  meio: MeioAssinatura
  meioPermitido: "ambos" | "eletronico" | "papel"
  regraLocal: RegraLocal
  provaExigida: NivelProva
  /** Presença registrada na sessão em curso (nível B). */
  presenteNaSessao: boolean
  /** Leu o código vigente da sala (nível C). */
  codigoValido: boolean
}

export type Resposta = { pode: boolean; motivo?: string; nivel: NivelProva | null; precisaCodigo?: boolean }

/**
 * Pode assinar? Diz o motivo quando não pode — a tela mostra isso em vez de
 * um botão que não funciona — e o nível de prova que a assinatura terá.
 */
export function podeAssinar(p: PedidoAssinatura): Resposta {
  const nao = (motivo: string, extra: Partial<Resposta> = {}): Resposta => ({ pode: false, motivo, nivel: null, ...extra })
  if (p.situacao !== "coleta") return nao("A coleta de assinaturas desta moção está encerrada.")
  if (p.prazo) {
    const t = Date.parse(p.prazo)
    if (Number.isFinite(t) && (p.agora ?? Date.now()) > t) return nao("O prazo das moções já passou.")
  }
  if (!p.direito) return nao("O seu papel no congresso não assina moções.")
  if (p.categoria === "suplente" && !p.emExercicio) return nao("Suplente assina só depois de assumir a vaga de um titular.")
  if (!p.credenciado) return nao("A assinatura vale depois do credenciamento. Procure a mesa.")
  if (p.meioPermitido === "papel" && p.meio !== "papel") return nao("Neste congresso a moção é assinada no papel; a mesa lança os nomes.")
  if (p.meioPermitido === "eletronico" && p.meio === "papel") return nao("Este congresso não aceita assinatura em papel.")

  if (p.modalidade === "distancia") {
    if (p.regraLocal === "so_local") return nao("Esta moção só aceita assinatura de quem está no local.")
    return { pode: true, nivel: null }
  }
  // Presencial: o nível alcançado depende do meio e da prova disponível.
  const nivel: NivelProva = p.meio === "papel" ? "E" : p.meio === "estacao" ? "D" : p.codigoValido ? "C" : p.presenteNaSessao ? "B" : "A"
  if (p.regraLocal === "so_distancia" || p.regraLocal === "local_ou_distancia") return { pode: true, nivel }
  if (ACEITOS[p.provaExigida].includes(nivel)) return { pode: true, nivel }
  if (p.provaExigida === "C" && p.meio === "link") {
    return nao("Esta assinatura só vale no local: leia o código exibido na mesa ou no telão.", { precisaCodigo: true })
  }
  if (p.provaExigida === "B" && p.meio === "link") return nao("Registre a sua presença na sessão antes de assinar.")
  if (p.provaExigida === "D") return nao("Esta moção é assinada na estação da mesa, com o seu crachá.")
  if (p.provaExigida === "E") return nao("Esta moção é assinada no papel, na mesa.")
  return nao("A prova de presença exigida pelo regimento não foi atingida.")
}

/** Gera o código público da moção (sem caracteres ambíguos). */
export function codigoMocao(aleatorio: Uint8Array): string {
  const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let c = "M"
  for (let i = 0; i < 7; i++) c += ALFABETO[aleatorio[i] % ALFABETO.length]
  return c
}

/** Lê o código da moção de um QR: URL /congresso/mocao/XXXX, "CGRM:XXXX" ou o próprio código. */
export function lerCodigoMocao(texto: string): string | null {
  const t = texto.trim()
  const url = t.match(/\/congresso\/mocao\/(M[A-Z0-9]{7})\b/i)
  if (url) return url[1].toUpperCase()
  const pre = t.match(/^CGRM:(M[A-Z0-9]{7})$/i)
  if (pre) return pre[1].toUpperCase()
  if (/^M[A-Z0-9]{7}$/i.test(t)) return t.toUpperCase()
  return null
}

export function tiposDeMocao(texto: string | null | undefined): string[] {
  return [...new Set((texto ?? "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean))]
}
