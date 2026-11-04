import { timingSafeEqual } from "node:crypto"

/**
 * Saúde — quem pode ler e gravar o relatório clínico.
 *
 * Regra pura, separada de saude-sigilo.ts (que cifra e é server-only) para
 * poder ser testada: tests/unidade/saude-acesso.spec.ts.
 */

/**
 * Por que o acesso foi concedido. Vai para a trilha de auditoria.
 *
 * Só há motivos PROFISSIONAIS: o relatório clínico não é lido por quem foi
 * atendido nem por quem administra. A pessoa atendida acompanha o próprio
 * histórico pela área do filiado, onde vê a observação aberta — que fica em
 * `saude_atendimentos` e nunca passa por este arquivo.
 */
export type MotivoAcesso = "autor" | "profissional_mesmo_tipo" | "coordenacao"

export type PerfilClinico = {
  usuarioId: string
  /** Cadastro em saude_profissionais, se houver. */
  profissional: {
    id: string
    tipoId: string | null
    acessoTodosTipos: boolean
    inativo: boolean
  } | null
}

export type AtendimentoParaAcesso = {
  tipoId: string | null
  profissionalId: string | null
  atendenteId: string | null
}

/**
 * Decide se este usuário pode ler o relatório, e por quê.
 *
 * TODO caminho exige cadastro de profissional ATIVO (decisão do usuário,
 * 04/11/2026). Registrar o atendimento é tarefa administrativa e, sozinho, não
 * abre conteúdo clínico; e quem fica Inativo perde o acesso, inclusive ao que
 * escreveu. Isso substitui o combinado anterior de que "o autor sempre lê".
 *
 * Com o cadastro ativo:
 *  • AUTOR: o profissional indicado no atendimento, ou quem o registrou;
 *  • profissional do MESMO TIPO do atendimento;
 *  • coordenação clínica (acesso_todos_tipos), que atravessa os tipos.
 *
 * NÃO concede acesso, deliberadamente:
 *
 *  • `saude_gestao`. É permissão administrativa. Deixá-la abrir relatório
 *    clínico tornaria todo o resto decorativo, já que na prática o
 *    administrativo acaba com esse flag. Quem administra vê que houve
 *    atendimento, quem atendeu e quando — nunca o conteúdo. Na NR-7 o
 *    médico do trabalho informa aptidão ao empregador, não diagnóstico, e
 *    o sindicato é empregador do próprio quadro.
 *
 *  • a própria pessoa atendida. Ela acompanha o histórico pela área do
 *    filiado, onde vê a OBSERVAÇÃO ABERTA. O relatório fica sob guarda
 *    profissional. Pedido formal de acesso ao prontuário (LGPD Art. 18)
 *    continua existindo fora do sistema, mediado pelo profissional — a
 *    interface não expor o campo não extingue o direito.
 */
export function motivoDeAcesso(
  perfil: PerfilClinico,
  atendimento: AtendimentoParaAcesso
): MotivoAcesso | null {
  const { profissional } = perfil
  if (!profissional || profissional.inativo) return null

  const registrou =
    atendimento.atendenteId && igual(atendimento.atendenteId, perfil.usuarioId)
  const indicado =
    atendimento.profissionalId &&
    igual(atendimento.profissionalId, profissional.id)
  if (registrou || indicado) return "autor"

  if (profissional.acessoTodosTipos) return "coordenacao"
  if (
    profissional.tipoId &&
    atendimento.tipoId &&
    igual(profissional.tipoId, atendimento.tipoId)
  ) {
    return "profissional_mesmo_tipo"
  }

  return null
}

/** Comparação de uuid em tempo constante — evita distinguir por latência. */
function igual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
