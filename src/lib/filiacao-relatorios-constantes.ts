/**
 * Relatórios de filiados — o que o CLIENTE também precisa (modelos, colunas,
 * opções de filtro). A apuração mora em lib/db/filiacao-relatorios.ts.
 */

export const MODELOS_RELATORIO = [
  "carencia",
  "plenos",
  "inadimplentes",
  "personalizado",
] as const
export type ModeloRelatorio = (typeof MODELOS_RELATORIO)[number]

export const ROTULO_MODELO: Record<
  ModeloRelatorio,
  { titulo: string; descricao: string }
> = {
  carencia: {
    titulo: "Filiados em carência",
    descricao: "Ativos que ainda não cumpriram a carência de voto",
  },
  plenos: {
    titulo: "Filiados plenos",
    descricao: "Ativos com a carência de voto cumprida",
  },
  inadimplentes: {
    titulo: "Filiados inadimplentes",
    descricao: "Ativos na condição definida pelas regras de inadimplência",
  },
  personalizado: {
    titulo: "Relatório personalizado",
    descricao: "Monte o recorte com os filtros e escolha as colunas",
  },
}

/** Colunas disponíveis, na ordem em que aparecem na tabela e no CSV. */
export const COLUNAS_RELATORIO = [
  { chave: "nome", rotulo: "Nome" },
  { chave: "cpf", rotulo: "CPF" },
  { chave: "matricula", rotulo: "Matrícula sindical" },
  { chave: "condicao", rotulo: "Condição sindical" },
  { chave: "sexo", rotulo: "Sexo" },
  { chave: "idade", rotulo: "Idade" },
  { chave: "nascimento", rotulo: "Nascimento" },
  { chave: "fonte", rotulo: "Fonte pagadora" },
  { chave: "condicaoFonte", rotulo: "Condição na fonte" },
  { chave: "regime", rotulo: "Regime de trabalho" },
  { chave: "lotacao", rotulo: "Lotação" },
  { chave: "cargo", rotulo: "Cargo" },
  { chave: "matriculaFonte", rotulo: "Matrícula na fonte" },
  { chave: "filiacao", rotulo: "Filiação (mais recente)" },
  { chave: "primeiraFiliacao", rotulo: "Primeira filiação" },
  { chave: "carencia", rotulo: "Carência de voto" },
  { chave: "liberaEm", rotulo: "Carência libera em" },
  { chave: "diasRestantes", rotulo: "Dias restantes" },
  { chave: "inadimplencia", rotulo: "Inadimplência" },
  { chave: "faltas", rotulo: "Contribuições em falta" },
  { chave: "remessasEmFalta", rotulo: "Remessas em falta" },
  { chave: "ultimoPagamento", rotulo: "Último pagamento" },
  { chave: "suspenso", rotulo: "Efeito suspensivo" },
  { chave: "ficha", rotulo: "Ficha de filiação" },
  { chave: "lgpd", rotulo: "Termo LGPD" },
  { chave: "desconto", rotulo: "Termo de desconto" },
  { chave: "cidade", rotulo: "Cidade" },
  { chave: "uf", rotulo: "UF" },
  { chave: "email", rotulo: "E-mail" },
  { chave: "telefone", rotulo: "Telefone" },
  { chave: "cadastro", rotulo: "Cadastro em" },
] as const
export type ColunaRelatorio = (typeof COLUNAS_RELATORIO)[number]["chave"]

export const COLUNAS_PADRAO: Record<ModeloRelatorio, ColunaRelatorio[]> = {
  carencia: ["nome", "cpf", "matricula", "fonte", "filiacao", "liberaEm", "diasRestantes"],
  plenos: ["nome", "cpf", "matricula", "fonte", "filiacao", "condicaoFonte", "regime"],
  inadimplentes: [
    "nome",
    "cpf",
    "matricula",
    "inadimplencia",
    "faltas",
    "remessasEmFalta",
    "ultimoPagamento",
    "suspenso",
  ],
  personalizado: ["nome", "cpf", "matricula", "condicao", "fonte", "filiacao", "carencia", "inadimplencia"],
}

export const ORDENS_RELATORIO = [
  { chave: "nome", rotulo: "Nome" },
  { chave: "filiacao", rotulo: "Data de filiação" },
  { chave: "idade", rotulo: "Idade" },
  { chave: "matricula", rotulo: "Matrícula sindical" },
  { chave: "diasRestantes", rotulo: "Dias restantes de carência" },
  { chave: "faltas", rotulo: "Contribuições em falta" },
] as const
export type OrdemRelatorio = (typeof ORDENS_RELATORIO)[number]["chave"]

/** Opções fixas de filtro (as dinâmicas — fontes, UFs — vêm do banco). */
export const OPCOES_TERNARIAS = {
  carencia: [
    { valor: "todas", rotulo: "Todos" },
    { valor: "cumprida", rotulo: "Carência cumprida (plenos)" },
    { valor: "em_carencia", rotulo: "Em carência" },
    { valor: "sem_data", rotulo: "Sem data para contar" },
  ],
  inadimplente: [
    { valor: "todas", rotulo: "Todos" },
    { valor: "sim", rotulo: "Inadimplentes" },
    { valor: "nao", rotulo: "Em dia" },
  ],
  ficha: [
    { valor: "todas", rotulo: "Todos" },
    { valor: "com", rotulo: "Com ficha no vínculo corrente" },
    { valor: "sem", rotulo: "Sem ficha" },
  ],
  lgpd: [
    { valor: "todas", rotulo: "Todos" },
    { valor: "aceito", rotulo: "Aceito (versão em vigor)" },
    { valor: "nao", rotulo: "Não aceito" },
  ],
  desconto: [
    { valor: "todas", rotulo: "Todos" },
    { valor: "aceito", rotulo: "Aceito (versão em vigor)" },
    { valor: "nao", rotulo: "Não aceito" },
  ],
  vinculo: [
    { valor: "todas", rotulo: "Todos" },
    { valor: "aberto", rotulo: "Com vínculo em aberto" },
    { valor: "sem_aberto", rotulo: "Sem vínculo em aberto" },
  ],
  situacao: [
    { valor: "ativas", rotulo: "Cadastros não excluídos" },
    { valor: "excluidas", rotulo: "Só excluídos do quadro" },
    { valor: "todas", rotulo: "Todos os cadastros" },
  ],
} as const
