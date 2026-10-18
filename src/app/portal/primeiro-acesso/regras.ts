import { destinoDoPortal } from "@/lib/portal-destino"

/**
 * Primeiro acesso (Filiados › Área do associado › Primeiro acesso): as regras
 * puras, iguais no navegador e no servidor — as rotas que continuam abertas
 * enquanto há pendência, os endereços de ida e volta e o que conta como dado
 * faltando. Sem "use server" nem import de servidor: servem ao portão da
 * casca (cliente), à página, ao formulário de Meu cadastro e às actions.
 *
 * O cálculo das pendências de cada associado mora em
 * src/lib/db/portal-primeiro-acesso.ts.
 */

export const ROTA_PRIMEIRO_ACESSO = "/portal/primeiro-acesso"

/**
 * O que abre mesmo com o primeiro acesso pendente: a própria página, os dois
 * caminhos de cumpri-lo (Meu cadastro e Privacidade e dados), os direitos com
 * prazo (desistência da filiação coletiva, contribuição assistencial), o
 * desligar dos avisos e a Ajuda — e o pedido de desfiliação pelo
 * Atendimento, pela marca abaixo. "Sair" é da casca e nunca some. Rotas
 * públicas, fora de /portal, não passam pelo portão.
 */
export const ROTAS_LIVRES_DO_PRIMEIRO_ACESSO: readonly string[] = [
  ROTA_PRIMEIRO_ACESSO,
  "/portal/cadastro",
  "/portal/lgpd",
  "/portal/desfiliacao",
  "/portal/oposicao",
  "/portal/avisos/preferencias",
  "/portal/ajuda",
]

/**
 * O pedido de desfiliação é direito do associado e não espera o primeiro
 * acesso. O botão de Minha filiação leva ao Atendimento com esta marca
 * (?motivo=desfiliacao), que o formulário de nova solicitação carrega num
 * campo oculto. A marca só dispensa o primeiro acesso — o Atendimento e o
 * portal suspensos ou desabilitados continuam valendo.
 */
export const MOTIVO_DESFILIACAO = "desfiliacao"

/**
 * O resumo que o servidor grava no pedido aberto com a marca
 * (abrirAtendimentoAction): a marca não abre o Atendimento para outro
 * assunto — o que se abre com ela chega à entidade como desfiliação.
 */
export const TITULO_DESFILIACAO = "Desfiliação"

/**
 * A solicitação é o pedido de desfiliação? Pelo resumo gravado (o assunto
 * varia com os que a entidade oferece). Só nela a marca vale depois de
 * aberta: avisos da conversa, responder, encerrar e reabrir.
 */
export function ehPedidoDeDesfiliacao(titulo: string | null | undefined): boolean {
  return (titulo ?? "").trim().startsWith(TITULO_DESFILIACAO)
}

const ROTA_ATENDIMENTO = "/portal/atendimento"

/**
 * Atendimento com a marca da desfiliação: a lista (onde o pedido se abre) e
 * a solicitação aberta por ela (para onde a action e os avisos da conversa
 * levam, com a marca). Ver uma solicitação com a marca é só leitura: a
 * página e as actions só dispensam o primeiro acesso no pedido de
 * desfiliação (ehPedidoDeDesfiliacao).
 */
function pedidoDeDesfiliacao(caminho: string, busca: string): boolean {
  if (caminho !== ROTA_ATENDIMENTO && !/^\/portal\/atendimento\/[^/]+$/.test(caminho)) return false
  return new URLSearchParams(busca).get("motivo") === MOTIVO_DESFILIACAO
}

/**
 * O caminho abre mesmo com o primeiro acesso pendente? A busca só conta para
 * a marca da desfiliação no Atendimento; a âncora nunca.
 */
export function livreDoPrimeiroAcesso(caminho: string): boolean {
  const semAncora = caminho.split("#")[0]
  const i = semAncora.indexOf("?")
  const c = i < 0 ? semAncora : semAncora.slice(0, i)
  if (ROTAS_LIVRES_DO_PRIMEIRO_ACESSO.some((r) => c === r || c.startsWith(`${r}/`))) return true
  return i >= 0 && pedidoDeDesfiliacao(c, semAncora.slice(i + 1))
}

const INICIO = "/portal/inicio"

/**
 * Para onde ir ao concluir: o destino pedido, se for do portal (validado como
 * o `next` da entrada), ou o Início. Nunca a própria página do primeiro acesso.
 */
export function destinoAoConcluir(bruto: unknown): string {
  const d = destinoDoPortal(bruto)
  if (!d || d.split("?")[0] === ROTA_PRIMEIRO_ACESSO) return INICIO
  return d
}

/** Os avisos de passo concluído que a página mostra ao voltar (?feito=…). */
export const PASSOS_FEITOS = ["termo", "dados", "contato"] as const
export type PassoFeito = (typeof PASSOS_FEITOS)[number]

/** /portal/primeiro-acesso, com o destino (o Início fica implícito) e o passo concluído. */
export function hrefPrimeiroAcesso(destino?: string | null, feito?: PassoFeito): string {
  const busca = new URLSearchParams()
  const d = destino ? destinoAoConcluir(destino) : INICIO
  if (d !== INICIO) busca.set("next", d)
  if (feito) busca.set("feito", feito)
  const q = busca.toString()
  return q ? `${ROTA_PRIMEIRO_ACESSO}?${q}` : ROTA_PRIMEIRO_ACESSO
}

/**
 * O campo `voltar` dos formulários reaproveitados (aceite do termo, Meu
 * cadastro, contatos de emergência): vem do cliente, então só vale a página
 * do primeiro acesso — remontada aqui só com o destino validado e o passo
 * conhecido. Qualquer outra coisa é ignorada, e a action segue como sempre.
 */
export function voltarAoPrimeiroAcesso(bruto: unknown): string | null {
  if (typeof bruto !== "string" || bruto.length > 2048) return null
  let url: URL
  try {
    url = new URL(bruto, "http://portal.invalido")
  } catch {
    return null
  }
  if (url.origin !== "http://portal.invalido" || url.pathname !== ROTA_PRIMEIRO_ACESSO) return null
  const feito = url.searchParams.get("feito")
  return hrefPrimeiroAcesso(
    url.searchParams.get("next"),
    (PASSOS_FEITOS as readonly string[]).includes(feito ?? "") ? (feito as PassoFeito) : undefined
  )
}

// ── Dados obrigatórios ─────────────────────────────────────────────────────

/** Os itens da opção `campos_obrigatorios` (catálogo da Área do associado). */
export type ItemObrigatorio = "email" | "telefone" | "endereco" | "contato_emergencia"

/** Os itens que o formulário de Meu cadastro preenche (o contato de emergência tem cartão próprio). */
export type ItemDoFormulario = Exclude<ItemObrigatorio, "contato_emergencia">

/** O endereço completo: o complemento é o único que pode ficar em branco. */
export const CAMPOS_DO_ENDERECO = [
  "endereco_cep",
  "endereco_logradouro",
  "endereco_numero",
  "endereco_bairro",
  "endereco_cidade",
  "endereco_estado",
] as const

type Valores = Partial<Record<string, string | null | undefined>>

const vazio = (v: string | null | undefined) => !(v ?? "").trim()

/**
 * Os campos que faltam para cumprir os itens: um e-mail (o pessoal marca),
 * um telefone (o primeiro marca) e cada parte do endereço em branco. Lista
 * vazia = itens cumpridos. A mesma regra no cálculo das pendências (servidor)
 * e na conferência do formulário (navegador).
 */
export function camposQueFaltam(itens: readonly ItemObrigatorio[], v: Valores): string[] {
  const faltam: string[] = []
  if (itens.includes("email") && vazio(v.email_pessoal) && vazio(v.email_corporativo)) faltam.push("email_pessoal")
  if (itens.includes("telefone") && vazio(v.telefone_1) && vazio(v.telefone_2)) faltam.push("telefone_1")
  if (itens.includes("endereco")) for (const c of CAMPOS_DO_ENDERECO) if (vazio(v[c])) faltam.push(c)
  return faltam
}

/** "a, b e c" */
export function juntarComE(itens: string[]): string {
  return itens.length <= 1 ? (itens[0] ?? "") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`
}

const NOME_DO_ITEM: Record<ItemObrigatorio, string> = {
  email: "um e-mail",
  telefone: "um telefone",
  endereco: "o endereço completo",
  contato_emergencia: "um contato de emergência",
}

/** "um telefone e o endereço completo" */
export function oQueFalta(itens: readonly ItemObrigatorio[]): string {
  return juntarComE(itens.map((i) => NOME_DO_ITEM[i]))
}

/**
 * O resumo do que falta, para o portão e a página: "aceitar o termo de
 * privacidade e completar seus dados".
 */
export function resumoDoPrimeiroAcesso(p: { termo: { renovacao: boolean } | null; dados: readonly unknown[] }): string {
  const partes: string[] = []
  if (p.termo) partes.push(p.termo.renovacao ? "aceitar a nova versão do termo de privacidade" : "aceitar o termo de privacidade")
  if (p.dados.length > 0) partes.push("completar seus dados")
  return juntarComE(partes)
}
