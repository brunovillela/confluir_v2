/**
 * Catálogo da API de saída (onda 5, A9): eventos de webhook e endpoints de
 * leitura. Sem imports de servidor — alimenta a tela de configuração e a
 * página de documentação.
 */

export const EVENTOS_WEBHOOK = [
  { chave: "ordem.autorizada", rotulo: "Ordem de pagamento autorizada", descricao: "Ordem aprovada e liberada para pagamento." },
  { chave: "ordem.paga", rotulo: "Ordem de pagamento paga", descricao: "Pagamento registrado (manual, pelo caixa ou pelo retorno do banco)." },
  { chave: "ordem.devolvida", rotulo: "Ordem devolvida", descricao: "Avaliador devolveu a ordem com motivo." },
  { chave: "filiacao.aprovada", rotulo: "Filiação aprovada", descricao: "Ficha pública aprovada; o cadastro do filiado foi criado ou atualizado." },
  { chave: "cupom.reservado", rotulo: "Cupom de hospedagem reservado", descricao: "O hotel vinculou o cupom a uma reserva." },
  { chave: "cobranca.paga", rotulo: "Contribuição Pix paga", descricao: "Cobrança da contribuição baixada (extrato ou manual)." },
  { chave: "remessa.retornada", rotulo: "Retorno bancário processado", descricao: "Retorno CNAB importado, com pagas e rejeitadas." },
  { chave: "teste", rotulo: "Teste", descricao: "Enviado pelo botão de teste da tela de webhooks." },
] as const

export type EventoWebhook = (typeof EVENTOS_WEBHOOK)[number]["chave"]

export function eventoWebhookValido(v: string): v is EventoWebhook {
  return EVENTOS_WEBHOOK.some((e) => e.chave === v)
}

export type EndpointApi = {
  caminho: string
  descricao: string
  parametros: { nome: string; descricao: string }[]
  campos: string
}

export const ENDPOINTS_API: EndpointApi[] = [
  {
    caminho: "/api/v1/eu",
    descricao: "Identifica a chave: entidade, nome da chave e escopos.",
    parametros: [],
    campos: "entidade { id, nome }, chave { nome, prefixo, escopos }",
  },
  {
    caminho: "/api/v1/filiados",
    descricao: "Cadastros de filiados, paginados.",
    parametros: [
      { nome: "situacao", descricao: "ativas (padrão), todas ou excluidas" },
      { nome: "condicao", descricao: "Ex.: Ativo, Inativo; todas (padrão)" },
      { nome: "busca", descricao: "Nome, CPF ou matrícula" },
      { nome: "pagina", descricao: "A partir de 1" },
    ],
    campos: "linhas[] { id, nome, cpf, matricula, lotacao, condicao, cadastradoEm }, total, pagina, totalPaginas",
  },
  {
    caminho: "/api/v1/arrecadacao",
    descricao: "Arrecadação mensal por tipo e fonte pagadora (camada analítica).",
    parametros: [{ nome: "meses", descricao: "Quantos meses para trás (padrão 12, máximo 60)" }],
    campos: "linhas[] { mes, tipo, fonteId, fonte, valor, lancamentos, pagantes }",
  },
  {
    caminho: "/api/v1/despesas",
    descricao: "Ordens pagas no período, com favorecido, CNPJ/CPF, centro de custo e departamento (o mesmo da exportação contábil).",
    parametros: [
      { nome: "de", descricao: "AAAA-MM-DD (padrão: início do mês anterior)" },
      { nome: "ate", descricao: "AAAA-MM-DD (padrão: fim do mês anterior)" },
    ],
    campos: "linhas[] { id, dataPagamento, vencimento, codigo, tipo, descricao, favorecido, documento, centroCusto, classificador, departamento, formaPagamento, valorPago, valorCobrado, notaFiscal }, total",
  },
  {
    caminho: "/api/v1/agenda",
    descricao: "Compromissos futuros da agenda.",
    parametros: [],
    campos: "linhas[] { id, atividade, tipo, inicio, termino, diaTodo, local, sede, departamento }",
  },
  {
    caminho: "/api/v1/eventos",
    descricao: "Eventos (inscrições, encontros, cursos).",
    parametros: [{ nome: "situacao", descricao: "Ex.: publicado, rascunho, cancelado; todos (padrão)" }],
    campos: "linhas[] { id, titulo, situacao, inicio, termino, local, inscricoesAbremEm, inscricoesFechamEm, limiteInscricoes }",
  },
]
