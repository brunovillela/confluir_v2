/**
 * Tela de confirmação da auditoria antes de gravar uma ordem de pagamento —
 * tipos compartilhados entre o motor (lib/db/ordens-verificacao.ts) e os
 * formulários (components/confirmacao-auditoria.tsx). Client-safe.
 */

/** Outra ordem citada pelo alerta (ex.: a possível duplicada), para conferir lado a lado. */
export type OrdemRelacionada = {
  id: string
  codigo: string | null
  descricao: string | null
  vencimento: string | null
  situacao: string | null
  valor: number | null
}

/** Mínimo de caracteres da justificativa de um alerta confirmado. */
export const JUSTIFICATIVA_MINIMA = 10

/**
 * Exemplo do que se espera na justificativa de cada regra (23/11/2026): parte
 * das justificativas era a descrição colada ou um e-mail, que não dizem a
 * quem autoriza por que registrar mesmo assim.
 */
export const EXEMPLO_JUSTIFICATIVA: Record<string, string> = {
  duplicidade: "Ex.: são duas corridas diferentes — ida no dia 6 e volta no dia 7.",
  fracionamento: "Ex.: compras para eventos diferentes, cada uma com a sua necessidade.",
  direta_limite: "Ex.: fornecedor único na cidade; o evento é no sábado e não há tempo de cotar.",
  pix_divergente: "Ex.: a chave é do dono do MEI, o mesmo CPF da nota.",
  conta_outro_titular: "Ex.: a conta é do sócio, indicada pelo fornecedor por escrito.",
  fornecedor_recente: "Ex.: cadastrado hoje para esta compra; único que atende no local.",
  vencimento_passado: "Ex.: compra paga no ato, lançada depois; o recibo é do dia 10.",
  descricao_ia: "Ex.: a finalidade está na observação; a quantidade é o serviço inteiro.",
  favorecido_documento: "Ex.: fornecedor do exterior, sem CNPJ; o documento dele está na nota.",
  sem_documento_fiscal: "Ex.: o fornecedor manda a nota na semana que vem; aviso quando chegar.",
  compra_valor_excedido: "Ex.: o frete foi cobrado à parte, como está no orçamento.",
  proposta_unica: "Ex.: só este fornecedor atende no prazo; os outros dois não responderam.",
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^compra direta\s*[—-]\s*/, "")
    .replace(/[^a-z0-9@.]+/g, " ")
    .trim()
}

/**
 * A justificativa não explica nada? Devolve o motivo, ou null. Recusa a que
 * repete a descrição da ordem (colada inteira ou um trecho dela) e a que é só
 * um e-mail, um endereço ou um número. Puro, para os testes de unidade.
 */
export function motivoJustificativaFraca(justificativa: string, descricoes: (string | null | undefined)[]): string | null {
  const j = normalizar(justificativa)
  if (!j) return null
  if (/^(\S+@\S+|https?:\/\/\S+|www\.\S+|[\d.,\s/-]+)$/i.test(justificativa.trim())) {
    return "A justificativa é só um e-mail, endereço ou número. Diga por que registrar mesmo assim."
  }
  const palavras = j.split(" ").filter((p) => p.length > 2)
  for (const d of descricoes) {
    const desc = normalizar(d ?? "")
    if (!desc) continue
    if (j.length >= 20 && (desc.includes(j) || j.includes(desc))) {
      return "A justificativa repete a descrição. Diga por que registrar mesmo assim."
    }
    if (palavras.length >= 4) {
      const naDescricao = new Set(desc.split(" "))
      const repetidas = palavras.filter((p) => naDescricao.has(p)).length
      if (repetidas / palavras.length >= 0.85) {
        return "A justificativa repete a descrição. Diga por que registrar mesmo assim."
      }
    }
  }
  return null
}

/**
 * O que a IA disse faltar na descrição ("Falta: a finalidade; a quantidade."),
 * um item por linha da tela de confirmação. Vazio quando o parecer não lista.
 */
export function faltasDaDescricao(detalhe: string): string[] {
  const m = /^Falta:\s*(.+?)\.(?:\s|$)/.exec(detalhe.trim())
  if (!m) return []
  return m[1]
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4)
}

/** Junta as respostas ao que faltava num complemento da descrição. */
export function complementoDaDescricao(respostas: Record<string, string>): string {
  return Object.entries(respostas)
    .map(([falta, v]) => [falta.replace(/^(a|o|as|os)\s+/i, ""), v.trim()] as const)
    .filter(([, v]) => v)
    .map(([falta, v]) => `${falta.charAt(0).toUpperCase()}${falta.slice(1)}: ${v.replace(/\.+$/, "")}.`)
    .join(" ")
}

/** O que a tela de confirmação mostra: cada ponto não ok, uma vez. */
export type Apontamento = {
  codigo: string
  titulo: string
  detalhe: string
  /** Regra "bloquear": não se confirma, só se ajusta. */
  bloqueia: boolean
  /** Já confirmado antes (continua na lista para quem registra ver). */
  confirmado: boolean
  /** Confirmar pede justificativa (regra com "Exigir justificativa" ligado). */
  pedeJustificativa?: boolean
  /** A justificativa já enviada, se houver. */
  justificativa?: string
  /** Por que a justificativa enviada não vale (repete a descrição, só um e-mail…). */
  justificativaRecusada?: string
  /** Ordens que o alerta cita (duplicidade): para abrir e comparar. */
  relacionadas?: OrdemRelacionada[]
}

/** Estado das actions que registram ordem com confirmação. */
export type EstadoComApontamentos = {
  erro?: string
  /** `name` do campo que causou o erro (components/ui/erro-no-campo). */
  campo?: string
  ok?: string
  apontamentos?: Apontamento[]
}
