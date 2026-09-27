import "server-only"

import {
  PAPEIS_ENTIDADE,
  rotuloTipoMinuta,
  type ParametrosMinuta,
} from "@/lib/contratos-minutas-constantes"
import { type Qualificacoes } from "@/lib/db/contratos-minutas"
import { gerarTextoIA } from "@/lib/ia"

/**
 * Prompts do assistente de minutas. A IA redige; quem decide é a entidade —
 * por isso a regra central é NÃO INVENTAR: dado que não veio vira
 * [PREENCHER: …], e a tela lista essas pendências.
 */

// Contrato completo passa fácil de 4 mil tokens; 16 mil cobre com folga.
const MAX_TOKENS_MINUTA = 16000

const SYSTEM = `Você é advogado(a) brasileiro(a) experiente em contratos de entidades sindicais e associações civis sem fins lucrativos. Redige minutas claras, equilibradas e completas, em português jurídico acessível, de acordo com o Código Civil brasileiro e, quando houver tratamento de dados pessoais, com a Lei Geral de Proteção de Dados.

REGRAS:
- NÃO INVENTE DADOS. Nome, CPF/CNPJ, endereço, valor, data, prazo, índice ou qualquer informação que não tenha sido fornecida vira um marcador no formato [PREENCHER: o que falta]. Nunca use dados fictícios de exemplo.
- Não cite número de artigo ou de lei de que não tenha certeza; prefira descrever a regra.
- Estrutura: título do contrato em CAIXA ALTA; qualificação completa das partes; cláusulas numeradas por extenso com título em CAIXA ALTA, cada uma em sua própria linha (ex.: "CLÁUSULA PRIMEIRA – DO OBJETO"); parágrafos e incisos quando necessário; local e data; linhas de assinatura das partes e de duas testemunhas (nome e CPF a preencher).
- Cubra, conforme o tipo: objeto, obrigações de cada parte, preço e forma de pagamento, reajuste, prazo e vigência, rescisão e multa, responsabilidades, confidencialidade e proteção de dados quando couber, ausência de vínculo empregatício quando couber, comunicações entre as partes e foro.
- Siga as instruções específicas do usuário; se alguma conflitar com a lei ou deixar a entidade exposta, redija de forma segura e deixe uma observação no marcador [PREENCHER: revisar — motivo].
- Responda SOMENTE com o texto da minuta, sem markdown (sem #, **, listas com hífen no início das cláusulas), sem comentários antes ou depois.`

function linha(rotulo: string, valor: string | null | undefined): string | null {
  return valor && valor.trim() ? `${rotulo}: ${valor.trim()}` : null
}

function dadosDoPedido(p: ParametrosMinuta, q: Qualificacoes): string {
  const papel = PAPEIS_ENTIDADE.find((x) => x.chave === p.papelEntidade) ?? PAPEIS_ENTIDADE[0]
  const outroPapel = papel.chave === "contratante" ? "CONTRATADA" : "CONTRATANTE"
  return [
    `Tipo de contrato: ${rotuloTipoMinuta(p.tipo)}`,
    `A entidade é a ${papel.rotulo.toUpperCase()}: ${q.entidade}`,
    linha("Quem assina pela entidade", q.assinante),
    `A outra parte é a ${outroPapel}: ${q.outraParte || "[não informada]"}`,
    linha("Objeto", p.objeto),
    linha("Valor", p.valor),
    linha("Forma e prazo de pagamento", p.pagamento),
    linha("Vigência / prazo", p.vigencia),
    linha("Reajuste", p.reajuste),
    linha("Obrigações e cláusulas específicas desejadas", p.obrigacoes),
    linha("Multas e penalidades", p.penalidades),
    linha("Foro", p.foro ?? (q.cidade ? `comarca de ${q.cidade}` : null)),
    linha("Cidade para local e data", q.cidade),
    linha("Instruções adicionais", p.instrucoes),
  ]
    .filter(Boolean)
    .join("\n")
}

export async function redigirMinutaIA(
  p: ParametrosMinuta,
  q: Qualificacoes
): Promise<{ texto?: string; erro?: string; truncado?: boolean }> {
  return gerarTextoIA({
    system: SYSTEM,
    maxTokens: MAX_TOKENS_MINUTA,
    prompt: `Redija a minuta completa com os dados abaixo. O que não estiver aqui vira [PREENCHER: …].\n\n${dadosDoPedido(p, q)}`,
  })
}

export async function ajustarMinutaIA(
  texto: string,
  pedido: string,
  p: ParametrosMinuta,
  q: Qualificacoes
): Promise<{ texto?: string; erro?: string; truncado?: boolean }> {
  return gerarTextoIA({
    system: SYSTEM,
    maxTokens: MAX_TOKENS_MINUTA,
    prompt: `Abaixo está a minuta atual e o ajuste pedido. Devolva a minuta INTEIRA já ajustada, mantendo tudo o que não foi pedido para mudar (inclusive a numeração coerente das cláusulas e os marcadores [PREENCHER: …] ainda sem resposta).

AJUSTE PEDIDO:
${pedido}

DADOS DO CONTRATO (referência):
${dadosDoPedido(p, q)}

MINUTA ATUAL:
${texto}`,
  })
}
