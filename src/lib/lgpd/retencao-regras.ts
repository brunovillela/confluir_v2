/**
 * Catálogo das regras do MOTOR DE RETENÇÃO (seção 4 de docs/lgpd/retencao.md).
 *
 * Cada código RT ligado ao motor aparece aqui com o texto da tela e os números
 * que a migração 20261018191616_motor_retencao.sql semeou em
 * `lgpd_regras_retencao`. Entidade nova recebe a linha pelo motor (upsert ao
 * simular). O QUE cada regra faz no banco está em `retencao-motor.ts`.
 *
 * Para ativar um código novo: a definição aqui, o executor no motor e a
 * coluna "Hoje" de retencao.md.
 */

export type AcaoRetencao = "eliminar" | "anonimizar"

export type DefinicaoRegra = {
  codigo: string
  titulo: string
  /** O que sai, em uma frase para a tela. */
  descricao: string
  tabela: string
  colunaAncora: string
  prazoPadraoDias: number
  prazoMinimoDias: number
  acao: AcaoRetencao
  fundamento: string
  /** Quando o prazo é configurado em outro módulo: rótulo e link. */
  prazoNoModulo?: { rotulo: string; href: string }
}

export const REGRAS_RETENCAO: readonly DefinicaoRegra[] = [
  {
    codigo: "RT30",
    titulo: "Foto do inscrito em evento",
    descricao:
      "Apaga do Storage a foto enviada na inscrição (conferência ou biometria) e marca a inscrição como foto expurgada. A inscrição continua.",
    tabela: "eventos_inscricoes",
    colunaAncora: "foto_capturada_em",
    prazoPadraoDias: 30,
    prazoMinimoDias: 1,
    acao: "eliminar",
    fundamento: "Consentimento: a foto só serve ao evento",
    prazoNoModulo: { rotulo: "Eventos › Configuração", href: "/painel/eventos/configuracao" },
  },
  {
    codigo: "RT31",
    titulo: "Registros de tentativas de acesso",
    descricao:
      "Elimina as contagens de senha errada e de códigos pedidos (login_tentativas) e o registro de códigos enviados por e-mail (auth_codigos_envios).",
    tabela: "login_tentativas",
    colunaAncora: "ultima_falha_em",
    prazoPadraoDias: 183,
    prazoMinimoDias: 183,
    acao: "eliminar",
    fundamento: "Marco Civil, art. 15 (6 meses)",
  },
  {
    codigo: "RT02",
    titulo: "Fichas públicas não concluídas",
    descricao:
      "Elimina a ficha de filiação pública que parou antes da avaliação (e-mail não confirmado, ficha assinada não enviada ou desistência), com o histórico de etapas e o PDF, se houver.",
    tabela: "filiacao_solicitacoes",
    colunaAncora: "updated_at",
    prazoPadraoDias: 365,
    prazoMinimoDias: 90,
    acao: "eliminar",
    fundamento: "Finalidade esgotada",
  },
]

export function definicaoRegra(codigo: string): DefinicaoRegra | null {
  return REGRAS_RETENCAO.find((r) => r.codigo === codigo) ?? null
}

/** Simulação mais velha que isto não serve para ligar a execução real. */
export const VALIDADE_SIMULACAO_DIAS = 45
