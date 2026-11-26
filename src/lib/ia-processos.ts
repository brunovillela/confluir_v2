/**
 * Catálogo dos processos que chamam a IA (lib/ia.ts) e do módulo de cada um.
 *
 * Cada chamada a gerarTextoIA / gerarJsonIA / gerarJsonIADePdf /
 * gerarJsonIADeImagem passa `processo` com uma chave daqui. O registro de uso
 * (tabela ia_uso) grava a chave e o módulo; a Gestão › Inteligência
 * Artificial agrupa o consumo por eles e desliga a IA por módulo.
 *
 * Processo novo: acrescente aqui (chave estável, rótulo em linguagem de
 * usuário e módulo; `simples` se um modelo menor dá conta). Chave que não está no catálogo aparece como "Processo
 * não identificado" e cai no módulo "Outros".
 */

export type ModuloIA = {
  slug: string
  titulo: string
}

export const MODULOS_IA: ModuloIA[] = [
  { slug: "filiados", titulo: "Filiados" },
  { slug: "representacao", titulo: "Representação" },
  { slug: "comunicacao", titulo: "Comunicação" },
  { slug: "compras", titulo: "Compras e contratos" },
  { slug: "financeiro", titulo: "Financeiro" },
  { slug: "pessoal", titulo: "Pessoal" },
  { slug: "saude", titulo: "Saúde" },
  { slug: "veiculos", titulo: "Veículos" },
  { slug: "institucional", titulo: "Institucional" },
  { slug: "ferramentas", titulo: "Ferramentas" },
  { slug: "espacos", titulo: "Cessão de espaços" },
  { slug: "painel", titulo: "Painel e ajuda" },
  { slug: "telegram", titulo: "Bot do Telegram" },
  { slug: "outros", titulo: "Outros" },
]

export type ProcessoIA = {
  chave: string
  titulo: string
  modulo: string
  /**
   * Tarefa leve (texto curto, conversa, cupom padronizado): um modelo menor
   * costuma dar conta. A Gestão sugere a troca de modelo só nesses processos.
   */
  simples?: true
}

export const PROCESSOS_IA: ProcessoIA[] = [
  // Filiados
  { chave: "filiados.receitas_relatorio", titulo: "Leitura do relatório de recebimento da fonte", modulo: "filiados" },
  { chave: "filiados.termos_redacao", titulo: "Redação dos termos de filiação", modulo: "filiados", simples: true },
  { chave: "filiados.lista_trabalhadores", titulo: "Leitura de lista de trabalhadores (aptos e atualização de cadastros)", modulo: "filiados" },
  // Representação
  { chave: "representacao.acordos_leitura", titulo: "Leitura do PDF do acordo coletivo", modulo: "representacao" },
  { chave: "representacao.acordos_extracao", titulo: "Extração das cláusulas do acordo", modulo: "representacao" },
  { chave: "representacao.acordos_comparacao", titulo: "Comparação de acordos coletivos", modulo: "representacao" },
  { chave: "representacao.empregador_reuniao_ata", titulo: "Leitura da ata de reunião com o empregador", modulo: "representacao" },
  { chave: "representacao.congresso_importacao", titulo: "Importação de participantes de congresso", modulo: "representacao" },
  { chave: "representacao.congresso_relatoria", titulo: "Sugestões na relatoria do congresso (redação, fusão, eixo, contradições, síntese)", modulo: "representacao" },
  { chave: "representacao.congresso_mocao", titulo: "Triagem de moção de congresso", modulo: "representacao" },
  { chave: "representacao.congresso_documentos", titulo: "Leitura do caderno de teses e do regimento do congresso", modulo: "representacao" },
  // Comunicação
  { chave: "comunicacao.resumo_noticias", titulo: "Resumo de notícias", modulo: "comunicacao", simples: true },
  { chave: "comunicacao.resumo_prompt", titulo: "Melhoria do prompt do resumo", modulo: "comunicacao", simples: true },
  { chave: "comunicacao.textos_geracao", titulo: "Assistente de redação: gerar texto", modulo: "comunicacao" },
  { chave: "comunicacao.politica_editorial", titulo: "Política editorial", modulo: "comunicacao" },
  { chave: "comunicacao.aniversariantes", titulo: "Mensagens de aniversário", modulo: "comunicacao", simples: true },
  // Compras e contratos
  { chave: "compras.descricao", titulo: "Redação da descrição da compra", modulo: "compras", simples: true },
  { chave: "compras.nota_fiscal", titulo: "Leitura da nota fiscal da compra", modulo: "compras" },
  { chave: "compras.minuta_contrato", titulo: "Minuta de contrato", modulo: "compras" },
  { chave: "compras.fornecedor_cnpj", titulo: "Preenchimento do fornecedor pelo CNPJ", modulo: "compras", simples: true },
  // Financeiro
  { chave: "financeiro.tributos_guia", titulo: "Leitura de guia de tributo", modulo: "financeiro" },
  { chave: "financeiro.comprovantes_distribuicao", titulo: "Distribuição de comprovantes nas ordens", modulo: "financeiro" },
  { chave: "financeiro.ordens_verificacao", titulo: "Verificação (auditoria) das ordens", modulo: "financeiro" },
  // Pessoal
  { chave: "pessoal.contracheque_leitura", titulo: "Leitura da folha / contracheque em PDF", modulo: "pessoal" },
  { chave: "pessoal.ponto_cartao", titulo: "Leitura do cartão de ponto", modulo: "pessoal" },
  { chave: "pessoal.ponto_marcacoes", titulo: "Ajuste das marcações de ponto", modulo: "pessoal" },
  { chave: "pessoal.ponto_resenha", titulo: "Resenha do ponto", modulo: "pessoal" },
  { chave: "pessoal.sst", titulo: "Atribuições e SST", modulo: "pessoal" },
  { chave: "pessoal.plano_saude_fatura", titulo: "Leitura da fatura do plano de saúde", modulo: "pessoal" },
  // Saúde
  { chave: "saude.cat_leitura", titulo: "Leitura de CAT em PDF", modulo: "saude" },
  // Veículos
  { chave: "veiculos.abastecimento", titulo: "Leitura do cupom de abastecimento", modulo: "veiculos", simples: true },
  { chave: "veiculos.contrato_locacao", titulo: "Leitura do contrato de locação", modulo: "veiculos" },
  { chave: "veiculos.cnh", titulo: "Leitura da CNH do condutor", modulo: "veiculos" },
  // Institucional
  { chave: "institucional.atas_leitura", titulo: "Leitura das atas de reunião", modulo: "institucional" },
  { chave: "institucional.relatorio_diretoria", titulo: "Relatório mensal da diretoria", modulo: "institucional" },
  // Ferramentas
  { chave: "ferramentas.oficios", titulo: "Redação de ofícios", modulo: "ferramentas" },
  // Cessão de espaços
  { chave: "espacos.termo", titulo: "Termo de cessão de espaço", modulo: "espacos" },
  // Painel e ajuda
  { chave: "painel.ajuda", titulo: "Pergunte à ajuda", modulo: "painel", simples: true },
  // Telegram
  { chave: "telegram.conversa", titulo: "Conversa com o bot", modulo: "telegram", simples: true },
  { chave: "telegram.comprovante", titulo: "Comprovante enviado ao bot (foto/PDF)", modulo: "telegram" },
  // Gestão
  { chave: "gestao.teste_chave", titulo: "Teste da chave de IA", modulo: "outros" },
]

const POR_CHAVE = new Map(PROCESSOS_IA.map((p) => [p.chave, p]))
const MODULO_POR_SLUG = new Map(MODULOS_IA.map((m) => [m.slug, m]))

export const PROCESSO_NAO_IDENTIFICADO = "nao_identificado"

export function processoIA(chave: string | null | undefined): ProcessoIA {
  return (
    (chave && POR_CHAVE.get(chave)) || {
      chave: chave || PROCESSO_NAO_IDENTIFICADO,
      titulo: "Processo não identificado",
      modulo: "outros",
    }
  )
}

export function tituloModuloIA(slug: string | null | undefined): string {
  return (slug && MODULO_POR_SLUG.get(slug)?.titulo) || "Outros"
}
