import "server-only"

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
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

// O controle de acesso mora em saude-acesso.ts (regra pura, testada).
export {
  motivoDeAcesso,
  type AtendimentoParaAcesso,
  type MotivoAcesso,
  type PerfilClinico,
} from "@/lib/saude-acesso"
