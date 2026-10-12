import "server-only"

import { createHash, createHmac, timingSafeEqual } from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import { hojeSP, texto } from "@/lib/db/comum"
import { CONDICAO_COLETIVA, ORDEM_DESFILIACAO, ORDEM_FILIACAO_COLETIVA } from "@/lib/filiacao"
import { formatarData } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"
import { capitalizarNome } from "@/lib/texto"

/**
 * Desistência da FILIAÇÃO COLETIVA — a regra num lugar só (A4/A26).
 *
 * Duas portas gravam pela MESMA função (`registrarDesistenciaColetiva`):
 *  - a área do filiado (/portal/desfiliacao), para quem já entra no portal;
 *  - o link assinado (/desistir/<token>), sem login. Quem entrou pelo lote
 *    coletivo costuma ter um único registro, ainda fora de "Ativo", e o
 *    portal não o deixa entrar — sem o link, o prazo legal de desistência
 *    corria sem caminho online.
 *
 * Quem desiste segue a trilha NORMAL de desfiliação ("Desfiliação não
 * informada à fonte"): o empregador precisa ser avisado. Ver
 * [[confluir-filiacao-coletiva]].
 *
 * O token leva o tenant, a filiação, o lote e o último dia do prazo — nada de
 * CPF ou nome, porque aparece na URL — e é assinado com chave derivada do
 * segredo do servidor por finalidade (padrão de tokenDescadastro, em
 * comunicacao-descadastro.ts). Vale até o fim do prazo; a cada abertura o
 * banco é conferido de novo (condição, lote e prazo), então um lote revertido
 * ou uma filiação que já seguiu adiante desligam o link sozinhos.
 */

export type OrigemDesistencia = "portal" | "link"

const NOVA_CONDICAO = "Desfiliação não informada à fonte"
const EM_DESFILIACAO = new Set<string>(ORDEM_DESFILIACAO)
/** Etapas da trilha coletiva depois do prazo (informada à fonte → Ativo). */
const DEPOIS_DO_PRAZO = new Set<string>(ORDEM_FILIACAO_COLETIVA.filter((c) => c !== CONDICAO_COLETIVA))

const PRONTUARIO: Record<OrigemDesistencia, string> = {
  portal:
    "Desistência da filiação coletiva solicitada pelo próprio trabalhador na área do filiado, dentro do prazo.",
  link: "Desistência da filiação coletiva solicitada pelo próprio trabalhador pelo link de desistência (sem login), dentro do prazo.",
}

/** "CONFIRMO" digitado, sem exigir caixa alta (o teclado do celular capitaliza). */
export function confirmouDesistencia(valor: FormDataEntryValue | null): boolean {
  return String(valor ?? "").trim().toUpperCase() === "CONFIRMO"
}

/**
 * O que acontece depois de desistir — o mesmo texto nas duas portas. Quem
 * desistiu pelo link em geral não entra no portal, então lá a última linha
 * aponta a entidade em vez de "Meu cadastro".
 */
export function oQueAcontece(origem: OrigemDesistencia): string[] {
  return [
    "A entidade avisa a sua empresa para encerrar o desconto da mensalidade.",
    "Se o desconto já tiver começado, o do mês em curso ainda pode aparecer no contracheque — é esperado: ele para quando a empresa processa o aviso, e essa data depende dela.",
    "Você deixa de ter acesso aos serviços exclusivos dos filiados.",
    origem === "portal"
      ? "Você acompanha o andamento em Meu cadastro."
      : "Se o desconto continuar depois disso, fale com a entidade.",
  ]
}

// ── Token assinado ───────────────────────────────────────────────────────────

/** Chave por finalidade: o segredo do projeto não assina dois tipos de link iguais. */
function segredo(): Buffer {
  const s = process.env.SUPABASE_JWT_SECRET
  if (!s) throw new Error("SUPABASE_JWT_SECRET ausente — link de desistência indisponível")
  return createHash("sha256").update(`desistencia-coletiva:${s}`).digest()
}

function assinar(corpo: string): string {
  // Prefixo próprio: um token de outra finalidade nunca vale aqui.
  return createHmac("sha256", segredo()).update(`desistencia:${corpo}`).digest("base64url")
}

type Carga = { emp: string; filiacaoId: string; coletivaId: string; prazo: string }

const DATA = /^\d{4}-\d{2}-\d{2}$/

function gerarToken(c: Carga): string {
  const corpo = Buffer.from(
    JSON.stringify({ e: c.emp, i: c.filiacaoId, c: c.coletivaId, p: c.prazo })
  ).toString("base64url")
  return `${corpo}.${assinar(corpo)}`
}

/**
 * Confere a assinatura e o tenant da requisição (o link de um tenant não abre
 * em outro subdomínio). O prazo NÃO é conferido aqui: fora dele a página
 * ainda explica o que fazer.
 */
async function lerToken(token: string | null | undefined): Promise<Carga | null> {
  if (!token || token.length > 600) return null
  const [corpo, sig, ...resto] = token.split(".")
  if (!corpo || !sig || resto.length > 0) return null
  let esperado: Buffer
  try {
    esperado = Buffer.from(assinar(corpo))
  } catch {
    return null // sem segredo configurado, nenhum link vale
  }
  const veio = Buffer.from(sig)
  if (esperado.length !== veio.length || !timingSafeEqual(esperado, veio)) return null
  let carga: Carga
  try {
    const o = JSON.parse(Buffer.from(corpo, "base64url").toString()) as Record<string, unknown>
    if (
      typeof o.e !== "string" ||
      typeof o.i !== "string" ||
      typeof o.c !== "string" ||
      typeof o.p !== "string" ||
      !DATA.test(o.p)
    ) {
      return null
    }
    carga = { emp: o.e, filiacaoId: o.i, coletivaId: o.c, prazo: o.p }
  } catch {
    return null
  }
  return carga.emp === (await tenantAtual()) ? carga : null
}

// ── Gravação (a regra) ───────────────────────────────────────────────────────

/**
 * Registra a desistência. Confere no banco a condição coletiva e o prazo; com
 * `coletivaId` (o link), também o lote do token. A troca de condição só vale
 * se a pessoa ainda está na condição coletiva: dois envios seguidos não
 * registram duas vezes.
 */
export async function registrarDesistenciaColetiva(
  filiacaoId: string,
  origem: OrigemDesistencia,
  coletivaId?: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const hoje = hojeSP()

  const { data: f } = await admin
    .from("filiacoes")
    .select("id, filiacao_condicao, filiacao_coletiva_prazo, filiacao_coletiva_id")
    .eq("id", filiacaoId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!f) return { erro: "Cadastro não encontrado." }
  const lote = texto(f.filiacao_coletiva_id)
  const prazo = texto(f.filiacao_coletiva_prazo)
  const mesmoLote = !coletivaId || lote === coletivaId
  if (f.filiacao_condicao !== CONDICAO_COLETIVA || !mesmoLote) {
    // Já maturada no último dia (ver situacaoDoLink): o motivo é o prazo.
    if (
      mesmoLote &&
      prazo &&
      prazo.slice(0, 10) <= hoje &&
      DEPOIS_DO_PRAZO.has(String(f.filiacao_condicao))
    ) {
      return {
        erro: `O prazo de desistência terminou em ${formatarData(prazo)}. A desfiliação agora é pedida à entidade.`,
      }
    }
    return {
      erro: "A desistência online vale apenas durante o processo de filiação coletiva.",
    }
  }
  if (prazo && prazo < hoje) {
    return {
      erro: `O prazo de desistência terminou em ${formatarData(prazo)}. A desfiliação agora é pedida à entidade.`,
    }
  }

  // Entra na trilha normal de desfiliação (a fonte precisa ser informada).
  const agora = new Date().toISOString()
  const { data: mudou, error } = await admin
    .from("filiacoes")
    .update({
      filiacao_condicao: NOVA_CONDICAO,
      condicao_desde: hoje,
      updated_at: agora,
    })
    .eq("id", filiacaoId)
    .eq("emp_proprietaria_id", emp)
    .eq("filiacao_condicao", CONDICAO_COLETIVA)
    .select("id")
  if (error) {
    console.error("[desistencia] falha ao gravar a condição:", error.message)
    return { erro: "Não foi possível registrar o pedido agora. Tente de novo em instantes." }
  }
  if (!mudou?.length) {
    return {
      erro: "A situação da filiação mudou enquanto a página estava aberta. Recarregue a página para ver como está.",
    }
  }

  // Marca o item do lote e registra no prontuário (acessórios: a condição já mudou).
  let item = admin
    .from("filiacao_coletiva_itens")
    .update({ resultado: "desistiu", desistencia_em: agora, updated_at: agora })
    .eq("filiacao_id", filiacaoId)
    .eq("emp_proprietaria_id", emp)
    .is("desistencia_em", null)
  if (lote) item = item.eq("coletiva_id", lote)
  const { error: erroItem } = await item
  if (erroItem) console.warn("[desistencia] item do lote não marcado:", erroItem.message)

  const { error: erroProntuario } = await admin.from("filiacao_prontuario").insert({
    filiacao_id: filiacaoId,
    data: agora,
    tipo: "Desfiliação",
    descricao: PRONTUARIO[origem],
    diretor_funcionario_id: null,
    emp_proprietaria_id: emp,
    created_at: agora,
    modified_at: agora,
  })
  if (erroProntuario) {
    console.warn("[desistencia] prontuário não registrado:", erroProntuario.message)
  }
  return {}
}

// ── Link para a gestão enviar ────────────────────────────────────────────────

/**
 * Link de desistência de UMA filiação em processo coletivo, para a gestão
 * copiar e mandar ao trabalhador. Só existe dentro do prazo e com prazo
 * definido — um link sem validade não é gerado.
 */
export async function linkDesistencia(
  filiacaoId: string
): Promise<{ erro?: string; link?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: f } = await admin
    .from("filiacoes")
    .select("filiacao_condicao, filiacao_coletiva_prazo, filiacao_coletiva_id")
    .eq("id", filiacaoId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  const lote = texto(f?.filiacao_coletiva_id)
  if (!f || f.filiacao_condicao !== CONDICAO_COLETIVA || !lote) {
    return { erro: "Este cadastro não está no processo de filiação coletiva." }
  }
  const prazo = texto(f.filiacao_coletiva_prazo)
  if (!prazo || !DATA.test(prazo.slice(0, 10))) {
    return { erro: "O lote não tem prazo de desistência definido — sem prazo, o link não é gerado." }
  }
  if (prazo.slice(0, 10) < hojeSP()) {
    return { erro: `O prazo de desistência terminou em ${formatarData(prazo)}.` }
  }
  let token: string
  try {
    token = gerarToken({ emp, filiacaoId, coletivaId: lote, prazo: prazo.slice(0, 10) })
  } catch {
    return { erro: "Link de desistência indisponível: falta configurar o segredo do servidor." }
  }
  return { link: `${await origemAtual()}/desistir/${token}` }
}

// ── Página pública do link ───────────────────────────────────────────────────

export type SituacaoDoLink =
  | { estado: "invalido" }
  | { estado: "registrado"; em: string | null }
  | { estado: "vencido"; prazo: string }
  | { estado: "encerrado" }
  | {
      estado: "aberto"
      /** Primeiro nome + inicial do último sobrenome — o link pode ter sido repassado. */
      nome: string | null
      empresa: string | null
      prazo: string
    }

/** "MARIA DA SILVA SANTOS" → "Maria S." */
function nomeParcial(nome: string | null): string | null {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return null
  const primeiro = capitalizarNome(partes[0])
  if (partes.length === 1) return primeiro
  return `${primeiro} ${partes[partes.length - 1].charAt(0).toLocaleUpperCase("pt-BR")}.`
}

/** Empresa(s) da rodada que originou o lote; sem empresa na rodada, as da campanha. */
async function empresaDoLote(
  admin: SupabaseClient,
  emp: string,
  coletivaId: string
): Promise<string | null> {
  const { data: lote } = await admin
    .from("filiacao_coletiva")
    .select("rod_assembleia_id")
    .eq("id", coletivaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  const rodadaId = texto(lote?.rod_assembleia_id)
  if (!rodadaId) return null
  const { data: rodada } = await admin
    .from("voto_rod_assembleias")
    .select("empresa_id, campanha_id")
    .eq("id", rodadaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  let ids = [texto(rodada?.empresa_id)].filter((v): v is string => !!v)
  const campanha = texto(rodada?.campanha_id)
  if (ids.length === 0 && campanha) {
    const { data: fontes } = await admin
      .from("voto_campanha_fontes")
      .select("empresa_id")
      .eq("campanha_id", campanha)
    ids = (fontes ?? []).map((f) => texto(f.empresa_id)).filter((v): v is string => !!v)
  }
  if (ids.length === 0) return null
  const { data: empresas } = await admin
    .from("empresa")
    .select("nome_fantasia, nome_razao")
    .in("id", [...new Set(ids)])
  const nomes = (empresas ?? [])
    .map((e) => texto(e.nome_fantasia)?.trim() || texto(e.nome_razao)?.trim())
    .filter((n): n is string => !!n)
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
  return nomes.length > 0 ? nomes.join(" / ") : null
}

/**
 * O que a página do link mostra. Nada além disto sai por ele: nome parcial,
 * empresa e prazo — nenhum outro dado do cadastro nem do portal.
 */
export async function situacaoDoLink(token: string): Promise<SituacaoDoLink> {
  const carga = await lerToken(token)
  if (!carga) return { estado: "invalido" }

  const admin = await createAdminClient()
  const [{ data: f }, { data: item }] = await Promise.all([
    admin
      .from("filiacoes")
      .select("nome_completo, filiacao_condicao, filiacao_coletiva_prazo, filiacao_coletiva_id")
      .eq("id", carga.filiacaoId)
      .eq("emp_proprietaria_id", carga.emp)
      .not("filiacao_excluida", "is", true)
      .maybeSingle(),
    admin
      .from("filiacao_coletiva_itens")
      .select("desistencia_em")
      .eq("filiacao_id", carga.filiacaoId)
      .eq("coletiva_id", carga.coletivaId)
      .eq("emp_proprietaria_id", carga.emp)
      .not("desistencia_em", "is", null)
      .limit(1)
      .maybeSingle(),
  ])

  // Já desistiu por este lote: confirma, mesmo depois do prazo.
  if (item) return { estado: "registrado", em: texto(item.desistencia_em) }

  const prazoBanco = texto(f?.filiacao_coletiva_prazo)?.slice(0, 10) ?? null
  // Vale o menor dos dois: o do link e o do banco (a gestão pode ter mudado).
  const prazo = prazoBanco && prazoBanco < carga.prazo ? prazoBanco : carga.prazo
  if (prazo < hojeSP()) return { estado: "vencido", prazo }

  const mesmoLote = !!f && texto(f.filiacao_coletiva_id) === carga.coletivaId
  // Dentro do prazo, a filiação deste lote só sai para a desfiliação pela
  // desistência (o item do lote é acessório e pode não ter sido marcado).
  if (mesmoLote && EM_DESFILIACAO.has(String(f.filiacao_condicao))) {
    return { estado: "registrado", em: null }
  }
  // A maturação diária (filiacao-coletiva.ts) avança quem tem prazo <= hoje:
  // no último dia, depois que ela roda, a filiação já seguiu a trilha. Para a
  // pessoa, o prazo terminou — não é um link "indisponível".
  if (mesmoLote && prazo <= hojeSP() && DEPOIS_DO_PRAZO.has(String(f.filiacao_condicao))) {
    return { estado: "vencido", prazo }
  }
  if (!f || !mesmoLote || f.filiacao_condicao !== CONDICAO_COLETIVA) {
    return { estado: "encerrado" }
  }

  return {
    estado: "aberto",
    nome: nomeParcial(texto(f.nome_completo)),
    empresa: await empresaDoLote(admin, carga.emp, carga.coletivaId),
    prazo,
  }
}

/** Confirmação na página do link: confere o token e o prazo dele, e grava pela regra única. */
export async function desistirPeloLink(token: string): Promise<{ erro?: string }> {
  const carga = await lerToken(token)
  if (!carga) {
    return { erro: "Este link não é válido. Use o link que você recebeu, sem cortar nenhuma parte." }
  }
  if (carga.prazo < hojeSP()) {
    return {
      erro: `O prazo de desistência terminou em ${formatarData(carga.prazo)}. A desfiliação agora é pedida à entidade.`,
    }
  }
  return registrarDesistenciaColetiva(carga.filiacaoId, "link", carga.coletivaId)
}
