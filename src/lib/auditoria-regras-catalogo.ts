/**
 * Catálogo das REGRAS DE VERIFICAÇÃO das ordens de pagamento — o que o sistema
 * confere antes de criar uma ordem, por ORIGEM (a fonte da ordem). A resposta
 * de cada regra é configurada por tenant e por origem em Financeiro →
 * Auditoria das ordens (tabela `auditoria_regras`); sem configuração vale o
 * padrão daqui. Sem "server-only": a tela de configuração também usa.
 */

export type OrigemOrdem =
  | "compras"
  | "contrato"
  | "rpa"
  | "folha"
  | "diaria"
  | "custeio"
  | "reembolso"
  | "hospedagem"
  | "multa"
  | "locacao"

export const ORIGENS_ORDEM: {
  chave: OrigemOrdem
  rotulo: string
  descricao: string
  /** Valores de `ordens_pagamento.tipo` desta origem. */
  tipos: string[]
}[] = [
  { chave: "compras", rotulo: "Compras", descricao: "Aquisição direta, compra via setor de Compras e faturas de agência de viagens", tipos: ["Compras"] },
  { chave: "contrato", rotulo: "Contratos e ajudas", descricao: "Parcelas de contratos com fornecedores e de ajudas institucionais", tipos: ["Contrato"] },
  { chave: "rpa", rotulo: "RPA", descricao: "Pagamentos a autônomos por recibo (RPA)", tipos: ["RPA"] },
  { chave: "folha", rotulo: "Folha de pagamento", descricao: "Contracheques dos funcionários", tipos: ["Folha de pagamento"] },
  { chave: "diaria", rotulo: "Diárias", descricao: "Diárias de funcionários e de diretores", tipos: ["Diária"] },
  { chave: "custeio", rotulo: "Custeio institucional", descricao: "Custeios a diretores, filiados e convidados", tipos: ["Custeio"] },
  { chave: "reembolso", rotulo: "Reembolsos", descricao: "Reembolsos a filiados e ao escritório jurídico", tipos: ["Reembolso"] },
  { chave: "hospedagem", rotulo: "Hospedagem", descricao: "Faturas emitidas pelos hotéis conveniados", tipos: ["Hospedagem"] },
  { chave: "multa", rotulo: "Multas de trânsito", descricao: "Pagamento de infrações dos veículos da entidade", tipos: ["Multa de trânsito"] },
  { chave: "locacao", rotulo: "Locação de veículos", descricao: "Mensalidades dos contratos de locação", tipos: ["Locação de veículos - Mensalidade"] },
]

export function origemDoTipo(tipo: string | null | undefined): OrigemOrdem | null {
  return ORIGENS_ORDEM.find((o) => o.tipos.includes(tipo ?? ""))?.chave ?? null
}

export type Severidade = "aceitar" | "alertar" | "bloquear"

export const SEVERIDADES: { valor: Severidade; rotulo: string; descricao: string }[] = [
  { valor: "aceitar", rotulo: "Aceitar", descricao: "Não verifica" },
  { valor: "alertar", rotulo: "Aceitar com alerta", descricao: "Cria a ordem e registra o alerta para quem autoriza" },
  { valor: "bloquear", rotulo: "Bloquear", descricao: "Não deixa criar a ordem" },
]

export type ParametroRegra = {
  chave: string
  rotulo: string
  tipo: "moeda" | "dias" | "texto" | "sim_nao"
  padrao: number | string | boolean
  ajuda?: string
}

export type RegraCatalogo = {
  codigo: string
  titulo: string
  /** A pergunta que a configuração responde. */
  pergunta: string
  explicacao: string
  origens: OrigemOrdem[]
  /** Resposta padrão por origem ("*" = as demais). */
  padrao: Partial<Record<OrigemOrdem | "*", Severidade>>
  parametros?: ParametroRegra[]
  /** Usa a IA (custo e latência na criação). */
  ia?: boolean
}

const TODAS: OrigemOrdem[] = ORIGENS_ORDEM.map((o) => o.chave)
const COM_FORNECEDOR: OrigemOrdem[] = ["compras", "contrato", "rpa", "hospedagem", "locacao", "reembolso"]
const COM_CONTRATO: OrigemOrdem[] = ["contrato", "rpa", "hospedagem", "locacao"]

export const CRITERIOS_DESCRICAO_PADRAO =
  "O que está sendo pago ou adquirido; quantidade e unidade, quando houver; a finalidade ou justificativa da despesa."

export const REGRAS_AUDITORIA: RegraCatalogo[] = [
  // ── Gerais ──
  {
    codigo: "favorecido_documento",
    titulo: "CPF/CNPJ do favorecido",
    pergunta: "Aceita criar a ordem para um favorecido sem CPF/CNPJ válido no cadastro?",
    explicacao: "Confere os dígitos verificadores do CPF/CNPJ de quem vai receber.",
    origens: TODAS,
    padrao: { "*": "alertar" },
  },
  {
    codigo: "fornecedor_bloqueado",
    titulo: "Fornecedor bloqueado",
    pergunta: "Aceita ordem para um fornecedor marcado como bloqueado no cadastro?",
    explicacao: "Fornecedor bloqueado é o que a entidade decidiu não contratar.",
    origens: COM_FORNECEDOR,
    padrao: { "*": "bloquear" },
  },
  {
    codigo: "fornecedor_recente",
    titulo: "Fornecedor recém-cadastrado",
    pergunta: "Aceita ordem para fornecedor cadastrado há poucos dias?",
    explicacao: "Pagamento logo após o cadastro de um fornecedor novo é um sinal clássico de fraude.",
    origens: ["compras", "contrato", "rpa", "hospedagem", "locacao"],
    padrao: { "*": "alertar" },
    parametros: [{ chave: "dias", rotulo: "Cadastrado há menos de (dias)", tipo: "dias", padrao: 30 }],
  },
  {
    codigo: "pix_divergente",
    titulo: "Chave Pix de outro titular",
    pergunta: "Aceita pagar por Pix numa chave (ou QR Code) cujo CPF/CNPJ é diferente do favorecido?",
    explicacao: "Compara a chave Pix informada — ou a chave dentro do QR Code — com o CPF/CNPJ do favorecido. Chave de e-mail, telefone ou aleatória não permite a comparação.",
    origens: TODAS,
    padrao: { "*": "alertar" },
    parametros: [
      {
        chave: "exigir_documento",
        rotulo: "Exigir que a chave Pix seja o próprio CPF/CNPJ do favorecido",
        tipo: "sim_nao",
        padrao: false,
        ajuda: "Ligado, chave de e-mail, telefone ou aleatória também conta como divergente.",
      },
    ],
  },
  {
    codigo: "sem_centro_custo",
    titulo: "Despesa sem centro de custo",
    pergunta: "Aceita criar a ordem sem centro de custo da despesa?",
    explicacao: "Sem centro de custo a despesa não é classificada na contabilidade.",
    origens: TODAS,
    padrao: { "*": "alertar" },
  },
  {
    codigo: "duplicidade",
    titulo: "Cobrança em duplicidade",
    pergunta: "Aceita ordem com o mesmo favorecido e o mesmo valor de outra já existente, em datas próximas?",
    explicacao: "Procura outra ordem não cancelada do mesmo favorecido, mesmo valor, com vencimento próximo.",
    origens: TODAS,
    padrao: { "*": "alertar" },
    parametros: [{ chave: "dias", rotulo: "Janela (dias antes e depois do vencimento)", tipo: "dias", padrao: 7 }],
  },
  {
    codigo: "vencimento_passado",
    titulo: "Vencimento já passado",
    pergunta: "Aceita criar ordem com vencimento anterior a hoje?",
    explicacao: "Ordem que nasce vencida costuma significar multa, juros ou lançamento atrasado.",
    origens: TODAS,
    padrao: { "*": "alertar" },
    parametros: [{ chave: "tolerancia", rotulo: "Tolerância (dias)", tipo: "dias", padrao: 0 }],
  },
  {
    codigo: "descricao_ia",
    titulo: "Qualidade da descrição (IA)",
    pergunta: "A descrição traz o mínimo para quem autoriza e para a auditoria?",
    explicacao: "A IA lê a descrição e confere se ela atende aos critérios mínimos abaixo.",
    origens: ["compras", "contrato", "rpa", "custeio", "reembolso"],
    padrao: { compras: "alertar", "*": "aceitar" },
    ia: true,
    parametros: [
      { chave: "criterios", rotulo: "Informações mínimas da descrição", tipo: "texto", padrao: CRITERIOS_DESCRICAO_PADRAO },
      { chave: "valor_minimo", rotulo: "Verificar a partir de (R$)", tipo: "moeda", padrao: 0, ajuda: "Ordens abaixo deste valor não são avaliadas pela IA." },
    ],
  },
  // ── Compras ──
  {
    codigo: "proposta_unica",
    titulo: "Compra com uma só proposta",
    pergunta: "Compra pelo setor de Compras com apenas UMA proposta é aceita até que valor?",
    explicacao: "Acima do valor, exige-se mais de uma proposta (cotação) — senão vale a resposta escolhida.",
    origens: ["compras"],
    padrao: { compras: "alertar" },
    parametros: [{ chave: "valor", rotulo: "Aceita uma só proposta até (R$)", tipo: "moeda", padrao: 5000 }],
  },
  {
    codigo: "direta_limite",
    titulo: "Aquisição direta acima do limite",
    pergunta: "Aquisição direta (sem cotação) é aceita até que valor?",
    explicacao: "Acima do valor, a compra deveria passar pela cotação do setor de Compras.",
    origens: ["compras"],
    padrao: { compras: "alertar" },
    parametros: [{ chave: "valor", rotulo: "Aquisição direta até (R$)", tipo: "moeda", padrao: 10000 }],
  },
  {
    codigo: "sem_documento_fiscal",
    titulo: "Sem nota fiscal",
    pergunta: "Aceita ordem sem nota fiscal ou documento equivalente anexado?",
    explicacao: "O documento fiscal comprova a despesa perante a contabilidade e a auditoria.",
    origens: ["compras", "hospedagem"],
    padrao: { "*": "alertar" },
  },
  // ── Contratos ──
  {
    codigo: "contrato_vencido",
    titulo: "Contrato fora da vigência",
    pergunta: "Aceita pagamento com vencimento fora da vigência do contrato (contrato vencido ou ainda não iniciado)?",
    explicacao: "Compara o vencimento da ordem com o início e o fim da vigência do contrato.",
    origens: COM_CONTRATO,
    padrao: { "*": "bloquear" },
    parametros: [{ chave: "tolerancia", rotulo: "Tolerância após o fim da vigência (dias)", tipo: "dias", padrao: 0 }],
  },
  {
    codigo: "valor_diferente_contrato",
    titulo: "Valor diferente do contratado",
    pergunta: "Aceita parcela com valor diferente do contratado (pagamento extraordinário)?",
    explicacao: "Parcela diferente do valor do contrato é pagamento extraordinário — além disso, vai para a alçada.",
    origens: ["contrato", "locacao"],
    padrao: { "*": "alertar" },
  },
  {
    codigo: "contrato_sem_documento",
    titulo: "Contrato sem documento assinado",
    pergunta: "Aceita pagamento de contrato que não tem o documento assinado anexado?",
    explicacao: "O contrato assinado é o que sustenta o pagamento perante a auditoria.",
    origens: COM_CONTRATO,
    padrao: { "*": "alertar" },
  },
  // ── Origens específicas ──
  {
    codigo: "rpa_teto_mensal",
    titulo: "Teto mensal por autônomo",
    pergunta: "Até quanto um mesmo autônomo pode receber por RPA no mesmo mês?",
    explicacao: "Pagamentos recorrentes e altos a um autônomo podem caracterizar vínculo empregatício.",
    origens: ["rpa"],
    padrao: { rpa: "alertar" },
    parametros: [{ chave: "valor", rotulo: "Teto no mês (R$)", tipo: "moeda", padrao: 5000 }],
  },
  {
    codigo: "folha_sem_conta",
    titulo: "Funcionário sem conta para pagamento",
    pergunta: "Aceita ordem de folha para funcionário sem conta bancária nem chave Pix cadastrada?",
    explicacao: "Sem conta ou chave, o Financeiro não tem para onde pagar.",
    origens: ["folha"],
    padrao: { folha: "alertar" },
  },
  {
    codigo: "diaria_retroativa",
    titulo: "Diária retroativa",
    pergunta: "Aceita diária cujo período começou há muitos dias?",
    explicacao: "Diária lançada muito depois da viagem dificulta a comprovação.",
    origens: ["diaria"],
    padrao: { diaria: "alertar" },
    parametros: [{ chave: "dias", rotulo: "Período iniciado há mais de (dias)", tipo: "dias", padrao: 30 }],
  },
  {
    codigo: "multa_sem_condutor",
    titulo: "Multa sem condutor identificado",
    pergunta: "Aceita pagar multa sem o condutor infrator identificado?",
    explicacao: "Sem condutor, não há de quem cobrar nem a quem indicar a pontuação.",
    origens: ["multa"],
    padrao: { multa: "alertar" },
  },
  {
    codigo: "reembolso_sem_comprovante",
    titulo: "Reembolso sem comprovante",
    pergunta: "Aceita reembolso sem o comprovante da despesa anexado?",
    explicacao: "Vale para os reembolsos que têm comprovante (escritório jurídico).",
    origens: ["reembolso"],
    padrao: { reembolso: "alertar" },
  },
]

export function regrasDaOrigem(origem: OrigemOrdem): RegraCatalogo[] {
  return REGRAS_AUDITORIA.filter((r) => r.origens.includes(origem))
}

export function severidadePadrao(regra: RegraCatalogo, origem: OrigemOrdem): Severidade {
  return regra.padrao[origem] ?? regra.padrao["*"] ?? "alertar"
}

export function parametrosPadrao(regra: RegraCatalogo): Record<string, number | string | boolean> {
  return Object.fromEntries((regra.parametros ?? []).map((p) => [p.chave, p.padrao]))
}
