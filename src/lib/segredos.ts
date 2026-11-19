import "server-only"

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto"

/**
 * Segredos da entidade (hoje: a chave de API de IA cadastrada na Gestão).
 *
 * Mesmo princípio de lib/saude-sigilo.ts: o segredo é cifrado AQUI, na
 * aplicação, e só o texto cifrado vai ao banco. Quem tem o banco (dashboard,
 * backup, service role vazada) vê base64 sem sentido; a chave de cifra vive em
 * variável de ambiente.
 *
 * Chave de cifra, por versão (gravada junto, para permitir a rotação):
 *  - 1: SEGREDOS_CHAVE (32 bytes em base64 — `openssl rand -base64 32`);
 *  - 0: derivada por HKDF de SAUDE_RELATORIO_CHAVE com rótulo próprio, para
 *    funcionar sem configurar nada novo. Cadastrar SEGREDOS_CHAVE depois não
 *    quebra o que já foi gravado: a versão 0 continua decifrando.
 *
 * A entidade entra como dado autenticado (AAD): o segredo copiado para outra
 * entidade não decifra.
 */

const ALGORITMO = "aes-256-gcm"
const TAM_IV = 12
const TAM_TAG = 16

function chave32(nome: string): Buffer | null {
  const bruta = process.env[nome]
  if (!bruta) return null
  const buf = Buffer.from(bruta, "base64")
  return buf.length === 32 ? buf : null
}

function chaveDaVersao(versao: number): Buffer | null {
  if (versao === 1) return chave32("SEGREDOS_CHAVE")
  if (versao === 0) {
    const saude = chave32("SAUDE_RELATORIO_CHAVE")
    if (!saude) return null
    return Buffer.from(hkdfSync("sha256", saude, Buffer.alloc(0), "confluir:segredos-entidade:v0", 32))
  }
  return null
}

/** Versão que cifra agora (a dedicada, se houver). null = sem chave de cifra. */
function versaoAtual(): number | null {
  if (chaveDaVersao(1)) return 1
  if (chaveDaVersao(0)) return 0
  return null
}

export function segredosConfigurados(): boolean {
  return versaoAtual() !== null
}

export function cifrarSegredo(texto: string, entidadeId: string): { cifrado: string; versao: number } {
  const versao = versaoAtual()
  if (versao === null) {
    throw new Error("Sem chave de cifra no servidor: configure SEGREDOS_CHAVE (openssl rand -base64 32).")
  }
  const iv = randomBytes(TAM_IV)
  const cipher = createCipheriv(ALGORITMO, chaveDaVersao(versao)!, iv)
  cipher.setAAD(Buffer.from(entidadeId, "utf8"))
  const dados = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()])
  return { cifrado: Buffer.concat([iv, cipher.getAuthTag(), dados]).toString("base64"), versao }
}

/** Decifra. null = adulterado, de outra entidade ou sem a chave daquela versão. */
export function decifrarSegredo(cifrado: string, versao: number, entidadeId: string): string | null {
  const chave = chaveDaVersao(versao)
  if (!chave) return null
  try {
    const buf = Buffer.from(cifrado, "base64")
    const iv = buf.subarray(0, TAM_IV)
    const tag = buf.subarray(TAM_IV, TAM_IV + TAM_TAG)
    const dados = buf.subarray(TAM_IV + TAM_TAG)
    const decipher = createDecipheriv(ALGORITMO, chave, iv)
    decipher.setAAD(Buffer.from(entidadeId, "utf8"))
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(dados), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}
