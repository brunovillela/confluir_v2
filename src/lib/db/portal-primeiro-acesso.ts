import "server-only"

import { cache } from "react"
import * as Sentry from "@sentry/nextjs"

import {
  camposQueFaltam,
  exigenciasDoPrimeiroAcesso,
  faltaNoPrimeiroAcesso,
  hrefPrimeiroAcesso,
  livreDoPrimeiroAcesso,
  resumoDoPrimeiroAcesso,
  type ItemObrigatorio,
} from "@/app/portal/primeiro-acesso/regras"
import { cpfConfiavel, grafiasDoCpf } from "@/lib/cpf"
import { texto } from "@/lib/db/comum"
import { listarContatosEmergencia } from "@/lib/db/filiacao-contatos-emergencia"
import { configDoPortal } from "@/lib/db/portal-partes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { getVisualizacaoPortal } from "@/lib/visualizacao-filiado"

/**
 * Primeiro acesso (pedido do Bruno, 18/10/2026): "após o cadastro, o filiado
 * só pode usar a área do associado depois de aceitar o termo de LGPD e
 * terminar de preencher o seu cadastro". Liga e desliga em Filiados › Área do
 * associado › Primeiro acesso (opções exigir, exigir_termo e
 * campos_obrigatorios); as regras puras (rotas abertas, endereços, o que
 * conta como dado faltando) estão em src/app/portal/primeiro-acesso/regras.ts.
 *
 * Pendências:
 *  - TERMO: exigir e exigir_termo ligados, há termo LGPD em vigor COM TEXTO
 *    (a mesma linha de termoEmVigor, que registrarAceiteLgpd confere; sem
 *    texto, nenhuma página oferece o aceite) e a versão aceita no cadastro
 *    (filiacoes.tl_lgpd_id, a mesma de consentimentosDoCadastro) é outra —
 *    termo novo publicado pede novo aceite, a mesma régua dos cadastros
 *    pendentes;
 *  - DADOS: só o que o associado pode alterar em Meu cadastro (opção
 *    campos_editaveis; o contato de emergência com o cartão ligado e a
 *    tabela no banco), lido como a página Meu cadastro lê (o registro mais
 *    recente do CPF).
 *
 * Só se exige o que dá para cumprir: portal suspenso ou fora do ar não pede
 * nada (não há como gravar); Meu cadastro suspenso pede só o termo. Na
 * dúvida, não trava: leitura que falha conta como nada pendente — inclusive
 * a da configuração (lerConfigPortal devolve o padrão, com o primeiro acesso
 * ligado, e marca `lida: false`).
 */

export type PendenciasPrimeiroAcesso = {
  /** A entidade exige o primeiro acesso agora (opção ligada, portal habilitado). */
  exigido: boolean
  pendente: boolean
  /** Termo em vigor a aceitar; `renovacao`: a pessoa já tinha aceitado outra versão. */
  termo: { id: string; renovacao: boolean } | null
  /** O que falta nos dados, na ordem do catálogo. */
  dados: ItemObrigatorio[]
  /**
   * Alguma leitura falhou e o que ela decidiria ficou sem pendência (na
   * dúvida, não trava). A falha vai ao Sentry; o "Ver como filiado" diz que
   * não deu para conferir, em vez de "Nada pendente".
   */
  incompleto: boolean
}

const NADA: PendenciasPrimeiroAcesso = { exigido: false, pendente: false, termo: null, dados: [], incompleto: false }

/** Leitura que falhou: no log e no Sentry — o portão abre em silêncio, a equipe não. */
function registrarFalha(etapa: string, e: unknown): void {
  console.error(`primeiro acesso (${etapa}):`, e instanceof Error ? e.message : e)
  Sentry.captureException(e instanceof Error ? e : new Error(String(e)), { tags: { area: "primeiro-acesso", etapa } })
}

/**
 * O começo da recusa das ações (bloqueioDaParte) enquanto há pendência; o
 * resto diz o que falta à pessoa (mensagemDoPrimeiroAcesso). É por ele que
 * as páginas reconhecem a recusa (ehBloqueioDoPrimeiroAcesso).
 */
export const MENSAGEM_PRIMEIRO_ACESSO = "Antes de usar o portal, conclua o primeiro acesso"

/**
 * A recusa com o que falta de verdade ("… falta aceitar o termo de
 * privacidade") — quem estava com o portal aberto quando o primeiro acesso
 * passou a valer lê o motivo, não um texto genérico.
 */
function mensagemDoPrimeiroAcesso(p: PendenciasPrimeiroAcesso): string {
  const falta = resumoDoPrimeiroAcesso(p)
  return falta
    ? `${MENSAGEM_PRIMEIRO_ACESSO}: falta ${falta}.`
    : `${MENSAGEM_PRIMEIRO_ACESSO}: aceite o termo de privacidade e complete seus dados.`
}

const CAMPOS_REGISTRO =
  "tl_lgpd_id, email_pessoal, email_corporativo, telefone_1, telefone_2, endereco_cep, endereco_logradouro, endereco_numero, endereco_bairro, endereco_cidade, endereco_estado"

type Registro = Record<string, string | null> & { lgpdId: string | null }

/**
 * Uma leitura dos registros do CPF para as duas pendências: os dados do mais
 * recente (o que Meu cadastro mostra — cadastroDoFiliado) e a versão do termo
 * aceita (o primeiro registro que a tem — consentimentosDoCadastro). Aqui a
 * falha SOBE, para não virar "nunca aceitou" (consentimentosDoCadastro a
 * engole e devolveria vazio).
 */
async function lerRegistro(cpfBruto: string): Promise<Registro | null> {
  const cpf = cpfConfiavel(cpfBruto)
  if (!cpf) return null
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("filiacoes")
    .select(CAMPOS_REGISTRO)
    .in("cpf", grafiasDoCpf(cpf))
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("filiacao_excluida", "is", true)
    .order("updated_at", { ascending: false, nullsFirst: false })
  if (error) throw new Error(`primeiro acesso: falha ao ler o cadastro: ${error.message}`)
  const linhas = (data ?? []) as Record<string, unknown>[]
  if (linhas.length === 0) return null
  const atual: Record<string, string | null> = {}
  for (const [k, v] of Object.entries(linhas[0])) atual[k] = typeof v === "string" ? v : null
  return { ...atual, lgpdId: linhas.map((l) => texto(l.tl_lgpd_id)).find(Boolean) ?? null }
}

/**
 * O termo LGPD em vigor que dá para aceitar: a mesma linha de termoEmVigor
 * (mesma consulta e mesma ordem — é ela que registrarAceiteLgpd confere),
 * mas só com texto. Versão sem texto (migrada do Bubble) não tem formulário
 * de aceite em página nenhuma, então não vira pendência.
 */
async function termoLgpdAceitavel(): Promise<string | null> {
  return lerTermoLgpdAceitavel().catch(() => null)
}

/**
 * Há termo LGPD em vigor COM TEXTO (o único que o primeiro acesso pede)? Para
 * o cartão do painel dizer o que vale de fato. Na dúvida (leitura que falha),
 * sim — o painel não afirma que o termo não é pedido sem ter conferido.
 */
export async function temTermoLgpdAceitavel(): Promise<boolean> {
  return lerTermoLgpdAceitavel()
    .then(Boolean)
    .catch(() => true)
}

/** O mesmo, mas a falha da leitura SOBE (não vira "sem termo"). */
async function lerTermoLgpdAceitavel(): Promise<string | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("filiacao_tl_lgpd")
    .select("id, texto")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("em_vigor", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`primeiro acesso: falha ao ler o termo em vigor: ${error.message}`)
  if (!data?.id || !texto(data.texto)) return null
  return String(data.id)
}

async function calcularPendencias(cpf: string, filiadoId: string): Promise<PendenciasPrimeiroAcesso> {
  const cfg = await configDoPortal().catch((e) => {
    registrarFalha("configuracao", e)
    return null
  })
  if (!cfg) return { ...NADA, incompleto: true }
  // Configuração que não leu: na dúvida, não trava. Sem a tabela (migração por
  // aplicar) não é falha — o primeiro acesso só não existe ainda.
  if (!cfg.lida) {
    if (cfg.disponivel) registrarFalha("configuracao", new Error("a leitura de portal_partes falhou"))
    return { ...NADA, incompleto: cfg.disponivel }
  }
  // O que vale de fato (a mesma regra do cartão do painel): portal suspenso
  // ou fora do ar não pede nada; Meu cadastro suspenso, só o termo; um dado
  // só se exige se o associado pode alterá-lo em Meu cadastro.
  const ex = exigenciasDoPrimeiroAcesso(cfg)
  if (!ex.ativo) return NADA
  const { itens, editaveis: editaveisDoCadastro } = ex
  const doFormulario = itens.filter((i) => i !== "contato_emergencia")
  const querTermo = ex.termo
  if (!querTermo && itens.length === 0) return { ...NADA, exigido: true }

  // Cada leitura falha sozinha, e o que ela decide fica sem pendência — mas
  // a falha vai ao Sentry e a conta sai marcada como incompleta.
  let incompleto = false
  const falhou = (etapa: string) => (e: unknown) => {
    incompleto = true
    registrarFalha(etapa, e)
    return null
  }
  const [termoId, registro, emergencia] = await Promise.all([
    querTermo ? lerTermoLgpdAceitavel().catch(falhou("termo")) : Promise.resolve(null),
    querTermo || doFormulario.length > 0 ? lerRegistro(cpf).catch(falhou("cadastro")) : Promise.resolve(null),
    itens.includes("contato_emergencia")
      ? listarContatosEmergencia({ cpf, filiadoId }).catch(falhou("contatos"))
      : Promise.resolve(null),
  ])

  const termo =
    termoId && registro && registro.lgpdId !== termoId ? { id: termoId, renovacao: registro.lgpdId !== null } : null
  // Dado que existe mas não serve (telefone sem DDD, e-mail inválido) também
  // falta: a régua de Meu cadastro (faltaNoPrimeiroAcesso).
  const dados = itens.filter((i) =>
    i === "contato_emergencia"
      ? Boolean(emergencia?.disponivel && emergencia.contatos.length === 0)
      : registro !== null && faltaNoPrimeiroAcesso(i, registro, editaveisDoCadastro)
  )
  return { exigido: true, pendente: Boolean(termo) || dados.length > 0, termo, dados, incompleto }
}

/** O que a oposição exige do filiado nos dados (30/10/2026). */
export const DADOS_DA_OPOSICAO: readonly ItemObrigatorio[] = ["email", "telefone", "endereco"]

export type PendenciasDaOposicao = {
  /** Termo de privacidade geral da entidade a aceitar (ou null). */
  termo: { id: string; renovacao: boolean } | null
  /** Os itens obrigatórios que o filiado pode preencher pelo portal. */
  exigidos: ItemObrigatorio[]
  /** Desses, os que faltam. */
  faltam: ItemObrigatorio[]
}

/**
 * Oposição do filiado (pedido do Bruno, 30/10/2026): antes de se opor, aceitar
 * o termo de privacidade geral da entidade e ter e-mail, telefone e endereço
 * — independentemente da opção do primeiro acesso. Só se exige o que dá para
 * cumprir: com Meu cadastro (ou o portal) sem gravar, ou o campo travado pela
 * entidade, aquele item não é exigido. Diferente do portão do portal, a
 * leitura que falha SOBE: a action da oposição decide (e recusa) na dúvida.
 */
export async function pendenciasDaOposicao(cpf: string): Promise<PendenciasDaOposicao> {
  const cfg = await configDoPortal()
  const cadastro = cfg.partes.cadastro
  const grava = cfg.partes.portal.estado === "habilitada" && cadastro.estado === "habilitada"
  const editaveis = cadastro.opcoes.campos_editaveis
  const podeAlterar: Record<ItemObrigatorio, boolean> = {
    email: editaveis.includes("email_pessoal") || editaveis.includes("email_corporativo"),
    telefone: editaveis.includes("telefones"),
    endereco: editaveis.includes("endereco"),
    contato_emergencia: false,
  }
  const exigidos = grava ? DADOS_DA_OPOSICAO.filter((i) => podeAlterar[i]) : []
  const [termoId, registro] = await Promise.all([termoLgpdAceitavel(), lerRegistro(cpf)])
  // O aceite também só grava com o portal habilitado (bloqueioDaParte("lgpd")).
  const termo =
    cfg.partes.portal.estado === "habilitada" && termoId && registro && registro.lgpdId !== termoId
      ? { id: termoId, renovacao: registro.lgpdId !== null }
      : null
  const faltam = registro ? exigidos.filter((i) => camposQueFaltam([i], registro).length > 0) : [...exigidos]
  return { termo, exigidos, faltam }
}

/**
 * Uma conta por requisição, dividida entre a casca (o portão), a página e o
 * bloqueioDaParte das páginas e ações. Nunca rejeita: na dúvida, nada pendente
 * (e `incompleto`, com a falha no Sentry).
 */
export const pendenciasDoPrimeiroAcesso = cache(
  (cpf: string, filiadoId: string): Promise<PendenciasPrimeiroAcesso> =>
    calcularPendencias(cpf, filiadoId).catch((e) => {
      registrarFalha("calculo", e)
      return { ...NADA, incompleto: true }
    })
)

/**
 * Para o bloqueioDaParte (src/lib/db/portal-partes.ts, por import dinâmico):
 * a recusa quando a pessoa EXIBIDA tem o primeiro acesso pendente — a mesma
 * régua do portão da casca. Fora do "Ver como filiado" é o próprio associado
 * logado; nele, o associado visto (não a gestão, que pode ser filiada e ter a
 * própria pendência), para as páginas mostrarem o que ele vê. As ações no
 * preview continuam recusadas ou inertes pelo caminho de sempre. Fora de
 * requisição (sem cookies) ou com falha, não trava.
 */
export async function bloqueioDoPrimeiroAcesso(): Promise<string | null> {
  const p = await primeiroAcessoDaSessao()
  return p.pendente ? mensagemDoPrimeiroAcesso(p) : null
}

/**
 * As pendências da pessoa EXIBIDA (a mesma régua de bloqueioDoPrimeiroAcesso),
 * para as páginas que abrem antes do primeiro acesso e precisam dizer o que
 * falta: Hospedagem e Eventos (só para cancelar) e a saída da Ajuda. Fora de
 * requisição ou com falha, nada pendente.
 */
export async function primeiroAcessoDaSessao(): Promise<PendenciasPrimeiroAcesso> {
  try {
    const vis = await getVisualizacaoPortal()
    if (!vis) return NADA
    return await pendenciasDoPrimeiroAcesso(vis.filiado.cpf, vis.filiado.filiacaoId)
  } catch {
    return NADA
  }
}

/**
 * A recusa do bloqueioDaParte veio do primeiro acesso (e não de uma pausa da
 * parte ou do portal)? As páginas abertas só para cancelar trocam o texto da
 * pausa pelo aviso de concluir o primeiro acesso.
 */
export function ehBloqueioDoPrimeiroAcesso(recusa: string | null | undefined): boolean {
  return !!recusa && recusa.startsWith(MENSAGEM_PRIMEIRO_ACESSO)
}

/**
 * Para onde a entrada leva quem acabou de provar a identidade: com pendência,
 * ao primeiro acesso, levando o destino pedido junto (vale ao concluir); sem
 * ela — ou com destino que abre de qualquer jeito, como a Oposição —, ao
 * próprio destino. Nunca rejeita.
 */
export async function destinoAoEntrar(pessoa: { cpf: string; filiacaoId: string }, destino: string): Promise<string> {
  if (livreDoPrimeiroAcesso(destino)) return destino
  const p = await pendenciasDoPrimeiroAcesso(pessoa.cpf, pessoa.filiacaoId)
  return p.pendente ? hrefPrimeiroAcesso(destino) : destino
}
