import "server-only"

import { createHmac } from "node:crypto"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { getSessaoPainel, getSessaoPortal } from "@/lib/auth"
import { buscarFiliadoPorCpf, type Filiado } from "@/lib/contas"
import { podeAcessar } from "@/lib/permissoes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * "Ver como filiado" — a gestão da filiação visualiza a área do associado em
 * modo SOMENTE LEITURA. A segurança é ESTRUTURAL: a visualização nunca produz
 * uma sessão de escrita do filiado (as actions do portal seguem usando
 * requireSessaoPortal/requireSessaoTrabalhador, que leem o auth real da
 * gestão) — então a gestão não consegue editar os dados do filiado nem por
 * engano. Este módulo cobre só a EXIBIÇÃO.
 *
 * O cookie guarda apenas UUIDs (filiacaoId + gestorId), assinado (HMAC) e com
 * validade curta; a permissão da gestão é RE-CHECADA no servidor a cada
 * request.
 */

export const COOKIE_VISUALIZACAO = "confluir_ver_filiado"
const TTL_SEGUNDOS = 60 * 30 // 30 min

/** Chaves de permissão que autorizam ver a área de um filiado. */
const PERMISSAO_VER = "filiacao_filiados"
const PERMISSAO_VER_ALT = ["filiacao_gestao", "filiacao_receitas"]

function assinar(corpo: string): string {
  return createHmac("sha256", process.env.SUPABASE_JWT_SECRET!)
    .update(corpo)
    .digest("base64url")
}

/** Gera o token assinado do cookie (filiacaoId + gestorId + expiração). */
export function gerarTokenVisualizacao(filiacaoId: string, gestorId: string): string {
  const corpo = Buffer.from(
    JSON.stringify({
      f: filiacaoId,
      g: gestorId,
      exp: Math.floor(Date.now() / 1000) + TTL_SEGUNDOS,
    })
  ).toString("base64url")
  return `${corpo}.${assinar(corpo)}`
}

export const MAX_IDADE_VISUALIZACAO = TTL_SEGUNDOS

type Payload = { f: string; g: string; exp: number }

function lerToken(token: string | undefined): Payload | null {
  if (!token) return null
  const [corpo, sig] = token.split(".")
  if (!corpo || !sig || assinar(corpo) !== sig) return null
  try {
    const o = JSON.parse(Buffer.from(corpo, "base64url").toString()) as Payload
    if (typeof o.f !== "string" || typeof o.g !== "string") return null
    if (typeof o.exp !== "number" || o.exp < Math.floor(Date.now() / 1000)) return null
    return o
  } catch {
    return null
  }
}

export type VisualizacaoPortal = {
  filiado: Filiado
  /** true quando a gestão está visualizando outro filiado (somente leitura). */
  preview: boolean
  /** Nome da gestão que está visualizando (para o banner). */
  gestorNome?: string | null
  /** Id da filiação alvo (para voltar ao cadastro ao sair). */
  alvoId?: string
}

/**
 * Sessão de EXIBIÇÃO do portal: o filiado logado normalmente, OU — quando há
 * um cookie de visualização válido e o usuário logado é gestão com permissão —
 * o filiado-alvo, com `preview: true`. Retorna null quando nem uma coisa nem
 * outra se aplica (o require redireciona).
 */
export async function getVisualizacaoPortal(): Promise<VisualizacaoPortal | null> {
  const jar = await cookies()
  const dados = lerToken(jar.get(COOKIE_VISUALIZACAO)?.value)

  if (dados) {
    // Re-checa que quem está logado é a MESMA gestão do cookie e ainda tem
    // permissão de ver filiados — a cada request, não confia só no cookie.
    const painel = await getSessaoPainel()
    const autorizado =
      painel &&
      painel.usuario.id === dados.g &&
      podeAcessar(painel.permissoes, PERMISSAO_VER, PERMISSAO_VER_ALT)

    if (autorizado) {
      const admin = await createAdminClient()
      const { data } = await admin
        .from("filiacoes")
        .select("cpf")
        .eq("id", dados.f)
        .eq("emp_proprietaria_id", await tenantAtual())
        .maybeSingle()
      const cpf =
        typeof data?.cpf === "string" ? data.cpf.replace(/\D/g, "") : null
      if (cpf && cpf.length === 11) {
        const filiado = await buscarFiliadoPorCpf(cpf)
        if (filiado) {
          return {
            filiado,
            preview: true,
            gestorNome:
              painel.usuario.nome_guerra ?? painel.usuario.nome_completo,
            alvoId: dados.f,
          }
        }
      }
    }
    // Cookie presente mas inválido/sem permissão: ignora e segue o fluxo normal.
  }

  // Fluxo normal: o próprio filiado logado.
  const sessao = await getSessaoPortal()
  if (!sessao) return null
  return { filiado: sessao.filiado, preview: false }
}

export async function requireVisualizacaoPortal(): Promise<VisualizacaoPortal> {
  const v = await getVisualizacaoPortal()
  if (!v) redirect("/portal")
  return v
}

/** Id da filiação em visualização (para voltar ao cadastro ao encerrar). */
export async function alvoDaVisualizacao(): Promise<string | null> {
  const jar = await cookies()
  return lerToken(jar.get(COOKIE_VISUALIZACAO)?.value)?.f ?? null
}
