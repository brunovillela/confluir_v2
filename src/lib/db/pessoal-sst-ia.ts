import "server-only"

import { gerarJsonIA } from "@/lib/ia"
import {
  CATEGORIAS_RISCO,
  PRESENCAS,
  ROTULO_FREQUENCIA,
} from "@/lib/pessoal-sst-constantes"

/**
 * IA da área Atribuições / SST (itens 5 em diante do pedido). Duas ajudas:
 * - sugerirPlanoCargos: atividades esperadas de uma FUNÇÃO (plano de cargos).
 * - analisarSST: perigos, riscos ocupacionais (+ residual), ferramentas e
 *   medidas (treinamento/EPI) de uma ATIVIDADE, à luz das NRs vigentes.
 *
 * A IA apenas SUGERE — nada é gravado sem o gestor confirmar na tela.
 */

const CATS = CATEGORIAS_RISCO.map((c) => c.valor).join(" | ")

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null
}
function inteiro1a5(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) && n >= 1 && n <= 5 ? Math.round(n) : null
}

// ── Plano de cargos ──────────────────────────────────────────────────────────

const SYSTEM_PLANO = `Você é um especialista em cargos e salários e descrição de funções no Brasil. A partir do NOME de uma função (cargo) e de uma descrição opcional, liste as ATRIBUIÇÕES/ATIVIDADES típicas que quem ocupa essa função deve executar — o que serviria de "plano de cargos" comparável ao contrato de trabalho. Seja realista e específico ao contexto de um sindicato/entidade. Responda SOMENTE com JSON no formato {"atribuicoes": ["...", "..."]} com 6 a 12 itens curtos (uma linha cada), em português, sem numeração.`

export async function sugerirPlanoCargos(entrada: {
  funcao: string
  descricao?: string | null
}): Promise<{ atribuicoes?: string[]; erro?: string }> {
  const funcao = entrada.funcao.trim()
  if (funcao.length < 2) return { erro: "Informe o nome da função." }
  const prompt = `FUNÇÃO: ${funcao}${
    entrada.descricao ? `\nDESCRIÇÃO: ${entrada.descricao}` : ""
  }`
  const { dados, erro } = await gerarJsonIA({ system: SYSTEM_PLANO, prompt })
  if (erro) return { erro }
  const lista = Array.isArray(dados?.atribuicoes) ? dados!.atribuicoes : []
  const atribuicoes = lista
    .map((x) => texto(x))
    .filter((v): v is string => !!v)
    .slice(0, 20)
  if (atribuicoes.length === 0) {
    return { erro: "A IA não retornou atribuições. Tente detalhar a função." }
  }
  return { atribuicoes }
}

// ── Análise SST da atividade ────────────────────────────────────────────────────

const SYSTEM_SST = `Você é um profissional de Segurança e Saúde no Trabalho (SST) no Brasil, familiarizado com as Normas Regulamentadoras (NRs) vigentes. A partir da descrição de uma ATIVIDADE, produza uma análise preliminar de risco.

Regras:
- Categorias de risco ocupacional válidas: ${CATS}.
- probabilidade e severidade são inteiros de 1 a 5.
- Para o risco RESIDUAL (após treinamento e EPI), estime probabilidade_residual e severidade_residual (1 a 5), normalmente menores que os brutos.
- Em perigos, "norma" é a NR de referência quando existir (ex.: "NR-06", "NR-12", "NR-17"); senão null.
- Medidas são de dois tipos: "treinamento" (com recorrencia_meses quando fizer sentido, ex.: 12) e "epi" (com epi opcional).
- Seja conciso e realista. Se a atividade for administrativa/remota, os riscos podem ser sobretudo ergonômicos/psicossociais.

Responda SOMENTE com JSON:
{
  "ferramentas": [{"nome":"...","tipo":"equipamento|sistema|ferramenta_manual|infraestrutura|outro"}],
  "perigos": [{"descricao":"...","fonte":"...","severidade":1-5,"norma":"NR-XX|null"}],
  "riscos": [{"categoria":"${CATS}","probabilidade":1-5,"severidade":1-5,"probabilidade_residual":1-5,"severidade_residual":1-5,"observacao":"..."}],
  "medidas": [{"tipo":"treinamento|epi","descricao":"...","recorrencia_meses":12,"epi":"..."}]
}`

export type SugestaoSST = {
  ferramentas: { nome: string; tipo: string | null }[]
  perigos: {
    descricao: string
    fonte: string | null
    severidade: number | null
    norma: string | null
  }[]
  riscos: {
    categoria: string | null
    probabilidade: number | null
    severidade: number | null
    probabilidade_residual: number | null
    severidade_residual: number | null
    observacao: string | null
  }[]
  medidas: {
    tipo: string
    descricao: string
    recorrencia_meses: number | null
    epi_ca: string | null
  }[]
}

const CATS_VALIDAS = new Set(CATEGORIAS_RISCO.map((c) => c.valor))

export async function analisarSST(entrada: {
  atividade: string
  descricao?: string | null
  presenca?: string | null
  frequencia?: string | null
  ferramentas?: string[]
}): Promise<{ sugestao?: SugestaoSST; erro?: string }> {
  const atividade = entrada.atividade.trim()
  if (atividade.length < 2) return { erro: "Informe o nome da atividade." }

  const presencaRotulo = entrada.presenca
    ? (PRESENCAS.find((p) => p.valor === entrada.presenca)?.rotulo ?? entrada.presenca)
    : null
  const prompt = `ATIVIDADE: ${atividade}
${entrada.descricao ? `DESCRIÇÃO: ${entrada.descricao}\n` : ""}${
    presencaRotulo ? `PRESENÇA: ${presencaRotulo}\n` : ""
  }${
    entrada.frequencia
      ? `FREQUÊNCIA: ${ROTULO_FREQUENCIA[entrada.frequencia] ?? entrada.frequencia}\n`
      : ""
  }${
    entrada.ferramentas && entrada.ferramentas.length
      ? `FERRAMENTAS JÁ INFORMADAS: ${entrada.ferramentas.join(", ")}\n`
      : ""
  }`

  const { dados, erro } = await gerarJsonIA({ system: SYSTEM_SST, prompt })
  if (erro) return { erro }
  if (!dados) return { erro: "A IA não retornou uma análise." }

  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
  const obj = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" ? (v as Record<string, unknown>) : {}

  const sugestao: SugestaoSST = {
    ferramentas: arr(dados.ferramentas)
      .map((f) => obj(f))
      .map((f) => ({ nome: texto(f.nome), tipo: texto(f.tipo) }))
      .filter((f): f is { nome: string; tipo: string | null } => !!f.nome),
    perigos: arr(dados.perigos)
      .map((p) => obj(p))
      .map((p) => ({
        descricao: texto(p.descricao),
        fonte: texto(p.fonte),
        severidade: inteiro1a5(p.severidade),
        norma: texto(p.norma),
      }))
      .filter(
        (p): p is SugestaoSST["perigos"][number] => !!p.descricao
      ),
    riscos: arr(dados.riscos)
      .map((r) => obj(r))
      .map((r) => {
        const cat = texto(r.categoria)
        return {
          categoria: cat && CATS_VALIDAS.has(cat) ? cat : null,
          probabilidade: inteiro1a5(r.probabilidade),
          severidade: inteiro1a5(r.severidade),
          probabilidade_residual: inteiro1a5(r.probabilidade_residual),
          severidade_residual: inteiro1a5(r.severidade_residual),
          observacao: texto(r.observacao),
        }
      })
      .filter((r) => r.categoria || r.probabilidade || r.severidade),
    medidas: arr(dados.medidas)
      .map((m) => obj(m))
      .map((m) => {
        const tipo = texto(m.tipo)
        const meses = Number(m.recorrencia_meses)
        return {
          tipo: tipo === "epi" ? "epi" : "treinamento",
          descricao: texto(m.descricao),
          recorrencia_meses:
            Number.isFinite(meses) && meses > 0 ? Math.round(meses) : null,
          epi_ca: texto(m.epi),
        }
      })
      .filter((m): m is SugestaoSST["medidas"][number] => !!m.descricao),
  }

  return { sugestao }
}
