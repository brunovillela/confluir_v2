import "server-only"

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto"

/**
 * Saúde — sigilo do relatório clínico.
 *
 * Decisão do Bruno (20/07/2026): "o banco de dados não deve ser um local
 * onde os dados sejam acessados". Por isso o relatório é cifrado AQUI, na
 * aplicação, com chave que vive em variável de ambiente. Nem pgcrypto nem
 * Supabase Vault serviriam: nos dois a chave fica ao alcance de quem tem o
 * banco, que é exatamente o que se quer excluir.
 *
 * O QUE ISTO PROTEGE: dashboard do Supabase, backups, dumps, service role
 * key vazada, acesso de suporte do provedor. Tudo isso passa a ver base64
 * sem sentido.
 *
 * O QUE NÃO PROTEGE: servidor da aplicação comprometido, porque é ele quem
 * decifra para exibir. Mitigação é o controle de acesso abaixo mais a
 * trilha de auditoria — não a criptografia.
 *
 * ATENÇÃO OPERACIONAL: perder SAUDE_RELATORIO_CHAVE é perder os relatórios,
 * sem recuperação possível. A chave precisa de backup FORA do repositório e
 * FORA do banco. Backup do Postgres sozinho não restaura este conteúdo.
 */

const ALGORITMO = "aes-256-gcm"
const TAM_IV = 12
const TAM_TAG = 16

/** Versão corrente da chave — gravada junto para permitir rotação. */
export const CHAVE_VERSAO_ATUAL = 1

function chave(): Buffer {
  const bruta = process.env.SAUDE_RELATORIO_CHAVE
  if (!bruta) {
    throw new Error(
      "SAUDE_RELATORIO_CHAVE não configurada. Sem ela o relatório clínico não pode ser gravado nem lido. Gere com: openssl rand -base64 32"
    )
  }
  const buf = Buffer.from(bruta, "base64")
  if (buf.length !== 32) {
    throw new Error(
      `SAUDE_RELATORIO_CHAVE deve ter 32 bytes em base64 (tem ${buf.length}). Gere com: openssl rand -base64 32`
    )
  }
  return buf
}

/** Configuração presente e válida? Usado para degradar a interface. */
export function sigiloConfigurado(): boolean {
  try {
    chave()
    return true
  } catch {
    return false
  }
}

/**
 * Cifra o relatório. O id do atendimento entra como dado autenticado
 * adicional: um relatório movido para outro atendimento não decifra, o que
 * impede trocar registros por dentro do banco sem deixar rastro.
 */
export function cifrarRelatorio(texto: string, atendimentoId: string): string {
  const iv = randomBytes(TAM_IV)
  const cipher = createCipheriv(ALGORITMO, chave(), iv)
  cipher.setAAD(Buffer.from(atendimentoId, "utf8"))
  const dados = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), dados]).toString("base64")
}

/** Decifra. Devolve null se o conteúdo foi adulterado ou a chave não bate. */
export function decifrarRelatorio(
  cifrado: string,
  atendimentoId: string
): string | null {
  try {
    const buf = Buffer.from(cifrado, "base64")
    if (buf.length <= TAM_IV + TAM_TAG) return null
    const decipher = createDecipheriv(
      ALGORITMO,
      chave(),
      buf.subarray(0, TAM_IV)
    )
    decipher.setAAD(Buffer.from(atendimentoId, "utf8"))
    decipher.setAuthTag(buf.subarray(TAM_IV, TAM_IV + TAM_TAG))
    return Buffer.concat([
      decipher.update(buf.subarray(TAM_IV + TAM_TAG)),
      decipher.final(),
    ]).toString("utf8")
  } catch {
    // GCM falha na verificação de integridade quando o texto foi alterado.
    return null
  }
}

// ---------------------------------------------------------------------------
// Controle de acesso
// ---------------------------------------------------------------------------

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
 * Regras acordadas com o Bruno:
 *  • o AUTOR sempre lê o que escreveu;
 *  • profissional habilitado do MESMO TIPO do atendimento lê;
 *  • coordenação clínica (acesso_todos_tipos) atravessa tipos — previsto,
 *    ainda sem ninguém marcado.
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

  if (
    atendimento.atendenteId &&
    igual(atendimento.atendenteId, perfil.usuarioId)
  ) {
    return "autor"
  }

  if (profissional && !profissional.inativo) {
    if (
      atendimento.profissionalId &&
      igual(atendimento.profissionalId, profissional.id)
    ) {
      return "autor"
    }
    if (profissional.acessoTodosTipos) return "coordenacao"
    if (
      profissional.tipoId &&
      atendimento.tipoId &&
      igual(profissional.tipoId, atendimento.tipoId)
    ) {
      return "profissional_mesmo_tipo"
    }
  }

  return null
}

/** Comparação de uuid em tempo constante — evita distinguir por latência. */
function igual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
