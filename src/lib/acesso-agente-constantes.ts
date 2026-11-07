/**
 * Lista de verificação da conexão com o controle de acesso (proposta do
 * autoatendimento de visitantes, seção "Instalação e verificação da conexão").
 * As duas primeiras o Confluir confere sozinho; as outras quatro vêm do agente
 * da sede, que as roda contra o sistema de catracas (conector).
 */

export type IdVerificacao = "pareado" | "online" | "servidor" | "login" | "permissao" | "teste"

export type Verificacao = {
  id: IdVerificacao
  rotulo: string
  confere: string
  seFalhar: string
  /** Feita pelo agente na sede (true) ou pelo próprio Confluir (false). */
  doAgente: boolean
}

export const VERIFICACOES: Verificacao[] = [
  { id: "pareado", rotulo: "Agente pareado", confere: "O agente se apresentou com o código da sede", seFalhar: "Instale o agente no computador da recepção e digite o código de pareamento.", doAgente: false },
  { id: "online", rotulo: "Agente online", confere: "Último contato há menos de 1 minuto", seFalhar: "O computador da recepção está desligado, sem internet ou com o agente parado.", doAgente: false },
  { id: "servidor", rotulo: "Servidor alcançado", confere: "O agente encontra o servidor do controle de acesso na rede", seFalhar: "Confira o endereço do servidor com o técnico do controle de acesso.", doAgente: true },
  { id: "login", rotulo: "Login no sistema", confere: "O usuário de integração entra", seFalhar: "Usuário ou senha do usuário de integração incorretos.", doAgente: true },
  { id: "permissao", rotulo: "Permissão", confere: "O usuário pode criar e remover visitantes", seFalhar: "Peça ao técnico para dar ao usuário de integração a permissão de cadastrar visitantes.", doAgente: true },
  { id: "teste", rotulo: "Teste completo", confere: "Cadastra um visitante fictício com foto e o apaga", seFalhar: "O sistema de catracas recusou o cadastro de teste.", doAgente: true },
]

export const CONECTORES = [
  { chave: "simulado", rotulo: "Simulado (teste, sem catraca)" },
  { chave: "controlid_local", rotulo: "Control iD com servidor local" },
] as const

export type Conector = (typeof CONECTORES)[number]["chave"]

/** Sem contato há mais que isso → offline. */
export const ONLINE_ATE_MS = 60_000

/** Validade do código de pareamento. */
export const CODIGO_VALE_MS = 15 * 60_000

/** Formato do token do agente: `ca_<prefixo 8>_<segredo 40 hex>`. */
export const FORMATO_TOKEN_AGENTE = /^ca_[A-Za-z0-9]{8}_[0-9a-f]{40}$/
