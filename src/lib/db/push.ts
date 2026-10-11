import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import webPush from "web-push"

import { cpfConfiavel } from "@/lib/cpf"
import { esquemaAusente, lerEmLotes } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * WEB PUSH (onda 4, D2): o aviso do sino também chega como notificação do
 * celular, para quem ligou "Receber no celular" em Meu perfil → Avisos.
 * Chaves VAPID por env; sem elas, tudo aqui é inerte. Assinaturas em
 * `push_assinaturas` (supabase/push-assinaturas.sql); uma assinatura que o
 * navegador cancelou (404/410) é apagada no primeiro envio que falha.
 *
 * O associado do portal tem as assinaturas dele à parte, por CPF — ver
 * "Portal do associado" no fim do arquivo (A52).
 */

export function pushConfigurado(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

let vapidPronto = false
function prepararVapid(): boolean {
  if (!pushConfigurado()) return false
  if (!vapidPronto) {
    webPush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? "mailto:contato@confluir.online",
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
      process.env.VAPID_PRIVATE_KEY as string
    )
    vapidPronto = true
  }
  return true
}

export type AssinaturaPush = { endpoint: string; keys: { p256dh: string; auth: string } }

export async function registrarAssinaturaPush(
  usuarioId: string,
  assinatura: AssinaturaPush,
  userAgent: string | null
): Promise<{ erro?: string }> {
  if (!assinatura?.endpoint || !assinatura.keys?.p256dh || !assinatura.keys?.auth) return { erro: "Assinatura inválida." }
  const admin = await createAdminClient()
  const { error } = await admin.from("push_assinaturas").upsert(
    {
      emp_proprietaria_id: await tenantAtual(),
      usuario_id: usuarioId,
      endpoint: assinatura.endpoint,
      p256dh: assinatura.keys.p256dh,
      auth: assinatura.keys.auth,
      user_agent: userAgent?.slice(0, 300) ?? null,
    },
    { onConflict: "endpoint" }
  )
  if (error) {
    if (esquemaAusente(error)) return { erro: "Falta rodar o SQL supabase/push-assinaturas.sql." }
    return { erro: error.message }
  }
  return {}
}

export async function removerAssinaturaPush(usuarioId: string, endpoint: string): Promise<void> {
  const admin = await createAdminClient()
  await admin.from("push_assinaturas").delete().eq("usuario_id", usuarioId).eq("endpoint", endpoint)
}

export async function contarAssinaturasPush(usuarioId: string): Promise<number> {
  const admin = await createAdminClient()
  const { count, error } = await admin
    .from("push_assinaturas")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", usuarioId)
  return error ? 0 : (count ?? 0)
}

/** Envia a todos os aparelhos da pessoa. Melhor esforço: nunca lança. */
export async function enviarPushWeb(
  usuarioId: string,
  aviso: { titulo: string; corpo: string; url?: string | null; tag?: string },
  client?: SupabaseClient
): Promise<void> {
  try {
    if (!prepararVapid()) return
    const admin = client ?? (await createAdminClient())
    const { data, error } = await admin
      .from("push_assinaturas")
      .select("id, endpoint, p256dh, auth")
      .eq("usuario_id", usuarioId)
    if (error || !data?.length) return
    const carga = JSON.stringify({ titulo: aviso.titulo, corpo: aviso.corpo, url: aviso.url ?? "/painel", tag: aviso.tag })
    await Promise.all(
      data.map(async (s) => {
        try {
          await webPush.sendNotification(
            { endpoint: String(s.endpoint), keys: { p256dh: String(s.p256dh), auth: String(s.auth) } },
            carga,
            { TTL: 60 * 60 * 12, urgency: "normal" }
          )
          await admin.from("push_assinaturas").update({ usado_em: new Date().toISOString() }).eq("id", s.id)
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) await admin.from("push_assinaturas").delete().eq("id", s.id)
          else console.error("push:", (e as Error).message)
        }
      })
    )
  } catch (e) {
    console.error("push:", e)
  }
}

// ── Portal do associado (A52) ────────────────────────────────────────────────

/**
 * O associado não é `usuarios`: os aparelhos dele moram em
 * `portal_push_assinaturas`, por CPF + entidade, como o sino do portal
 * (supabase/portal-push.sql). Sem a tabela, tudo aqui é inerte — o card some
 * das Preferências e o aviso segue para o sino e o e-mail, sem push.
 *
 * O endpoint vem do navegador de quem tem conta no portal, e o servidor faz um
 * POST nele a cada aviso. Por isso só passam endpoints HTTPS dos serviços de
 * push dos navegadores (uma assinatura forjada faria o servidor chamar
 * endereços internos) e no máximo MAX_APARELHOS por pessoa.
 *
 * A tabela fica FORA de TABELAS_TENANT até o SQL rodar: a escrita vai pelo
 * service role e a leitura pelo JWT do tenant — por isso toda consulta aqui
 * filtra `emp_proprietaria_id` explicitamente, dentro e fora de requisição.
 */
const TABELA_PORTAL = "portal_push_assinaturas"

/** Aparelhos por pessoa: o mais antigo sai quando um novo passa do limite. */
const MAX_APARELHOS = 10

/** Serviços de push dos navegadores (Chrome/Android, Firefox, Safari/iPhone, Edge). */
const HOSTS_PUSH = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
]

function endpointAceito(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 2000) return false
  try {
    const u = new URL(endpoint)
    if (u.protocol !== "https:" || u.port || u.username || u.password) return false
    const host = u.hostname.toLowerCase()
    return HOSTS_PUSH.some((h) => host === h || host.endsWith(`.${h}`))
  } catch {
    return false
  }
}

/** Chave em base64url, como o navegador entrega em `toJSON()`. */
function chaveAceita(v: unknown, max: number): v is string {
  return typeof v === "string" && v.length >= 16 && v.length <= max && /^[A-Za-z0-9_-]+=*$/.test(v)
}

type AmbientePush = { client: SupabaseClient; tenantId: string }

/**
 * Quem tem ao menos um aparelho ligado, por entidade — um minuto de memória.
 * O aviso em lote (votação aberta, RSVP de evento) chama `avisarFiliado` para
 * milhares de CPFs, e quase ninguém tem aparelho: sem isto, cada aviso pagaria
 * uma consulta a mais. Só decide SE vale procurar; os aparelhos em si são
 * lidos na hora do envio. `null` = tabela ausente (guardado por dez minutos).
 */
const comPushPorTenant = new Map<string, { ate: number; cpfs: Set<string> | null }>()
const MEMORIA_MS = 60_000
const MEMORIA_SEM_TABELA_MS = 10 * 60_000
/** Leitura em andamento por entidade: o lote avisa 5 a 10 por vez e todos esperam a mesma. */
const lendoPorTenant = new Map<string, Promise<Set<string> | null>>()

async function cpfsComPushPortal(amb: AmbientePush): Promise<Set<string> | null> {
  const guardado = comPushPorTenant.get(amb.tenantId)
  if (guardado && guardado.ate > Date.now()) return guardado.cpfs
  const emAndamento = lendoPorTenant.get(amb.tenantId)
  if (emAndamento) return emAndamento
  const leitura = lerCpfsComPushPortal(amb).finally(() => lendoPorTenant.delete(amb.tenantId))
  lendoPorTenant.set(amb.tenantId, leitura)
  return leitura
}

async function lerCpfsComPushPortal(amb: AmbientePush): Promise<Set<string> | null> {
  try {
    const linhas = await lerEmLotes<{ cpf: string }>((de, ate) =>
      amb.client.from(TABELA_PORTAL).select("id, cpf").eq("emp_proprietaria_id", amb.tenantId).order("id").range(de, ate)
    )
    const cpfs = new Set(linhas.map((l) => String(l.cpf)))
    comPushPorTenant.set(amb.tenantId, { ate: Date.now() + MEMORIA_MS, cpfs })
    return cpfs
  } catch (e) {
    if (esquemaAusente(e as { code?: string })) {
      comPushPorTenant.set(amb.tenantId, { ate: Date.now() + MEMORIA_SEM_TABELA_MS, cpfs: null })
    } else {
      console.error("push (portal):", (e as Error).message)
    }
    return null
  }
}

/** Há aparelho ligado para este CPF? Falso sem VAPID, sem tabela ou em erro. */
export async function temPushPortal(cpf: string, amb: AmbientePush): Promise<boolean> {
  const chave = cpfConfiavel(cpf)
  if (!chave || !pushConfigurado()) return false
  const cpfs = await cpfsComPushPortal(amb)
  return Boolean(cpfs?.has(chave))
}

/**
 * O card "Receber no celular" do portal: `disponivel` só com VAPID e com a
 * tabela criada; `aparelhos` = quantos aparelhos desta pessoa estão ligados.
 */
export async function estadoPushPortal(cpf: string): Promise<{ disponivel: boolean; aparelhos: number }> {
  const chave = cpfConfiavel(cpf)
  if (!chave || !pushConfigurado()) return { disponivel: false, aparelhos: 0 }
  const admin = await createAdminClient()
  // Lê as linhas (são no máximo MAX_APARELHOS) em vez de `count` com `head`:
  // o HEAD de uma tabela que não existe volta 404 sem corpo, e o supabase-js
  // o converte em sucesso vazio — o card apareceria antes do SQL rodar.
  const { data, error } = await admin
    .from(TABELA_PORTAL)
    .select("id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("cpf", chave)
    .limit(MAX_APARELHOS)
  // Qualquer erro esconde o card: melhor não oferecer do que oferecer quebrado.
  if (error || !data) {
    if (error && !esquemaAusente(error)) console.error("push (portal):", error.message)
    return { disponivel: false, aparelhos: 0 }
  }
  return { disponivel: true, aparelhos: data.length }
}

/** Este aparelho (endpoint) está ligado para este CPF? */
export async function aparelhoLigadoNoPortal(cpf: string, endpoint: string): Promise<boolean> {
  const chave = cpfConfiavel(cpf)
  if (!chave || !endpointAceito(endpoint)) return false
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from(TABELA_PORTAL)
    .select("id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("cpf", chave)
    .eq("endpoint", endpoint)
    .limit(1)
  return !error && (data?.length ?? 0) > 0
}

async function enviarUma(
  client: SupabaseClient,
  tenantId: string,
  s: { id: unknown; endpoint: unknown; p256dh: unknown; auth: unknown },
  carga: string
): Promise<"ok" | "expirada" | "recusada" | "falha"> {
  try {
    await webPush.sendNotification(
      { endpoint: String(s.endpoint), keys: { p256dh: String(s.p256dh), auth: String(s.auth) } },
      carga,
      // Um dia na fila do serviço de push: celular desligado à noite ainda recebe.
      { TTL: 60 * 60 * 24, urgency: "normal", timeout: 8000 }
    )
    await client
      .from(TABELA_PORTAL)
      .update({ usado_em: new Date().toISOString() })
      .eq("id", s.id)
      .eq("emp_proprietaria_id", tenantId)
    return "ok"
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode
    // 404/410: o navegador cancelou a assinatura (permissão retirada, app
    // desinstalado, dados apagados). Não volta mais — sai da tabela.
    if (status === 404 || status === 410) {
      await client.from(TABELA_PORTAL).delete().eq("id", s.id).eq("emp_proprietaria_id", tenantId)
      return "expirada"
    }
    console.error("push (portal):", (e as Error).message)
    // 400/401/403: o serviço recusou ESTA assinatura (ex.: criada com outra
    // chave VAPID). No envio comum só registra — pode ser configuração nossa,
    // e apagar tudo por isso seria pior; ao ligar, quem decide é o registro.
    return status === 400 || status === 401 || status === 403 ? "recusada" : "falha"
  }
}

/**
 * Liga o aparelho para o associado logado. O mesmo endpoint numa entidade é
 * de UMA pessoa: se outro CPF o tinha (celular que mudou de dono, ou outra
 * pessoa entrou no portal neste navegador), passa para quem ligou agora.
 * Manda uma notificação de confirmação — prova, na hora, que o caminho todo
 * funciona; se o serviço de push recusar a assinatura, ela não fica gravada e
 * `refazer` avisa o navegador para descartar a dele (senão o próximo "Ligar"
 * devolveria a mesma assinatura morta).
 */
export async function registrarAssinaturaPushPortal(
  cpf: string,
  assinatura: AssinaturaPush,
  userAgent: string | null
): Promise<{ erro?: string; refazer?: boolean }> {
  const chave = cpfConfiavel(cpf)
  if (!chave) return { erro: "Não identificamos o seu cadastro. Entre de novo no portal." }
  if (!prepararVapid()) return { erro: "O aviso no celular não está disponível nesta entidade." }
  if (
    !endpointAceito(assinatura?.endpoint) ||
    !chaveAceita(assinatura.keys?.p256dh, 200) ||
    !chaveAceita(assinatura.keys?.auth, 100)
  ) {
    return { erro: "Este navegador não enviou uma assinatura de notificação válida. Tente pelo Chrome, Firefox, Edge ou Safari." }
  }
  const tenantId = await tenantAtual()
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from(TABELA_PORTAL)
    .upsert(
      {
        emp_proprietaria_id: tenantId,
        cpf: chave,
        endpoint: assinatura.endpoint,
        p256dh: assinatura.keys.p256dh,
        auth: assinatura.keys.auth,
        user_agent: userAgent?.slice(0, 300) ?? null,
        // "Ligado em": religar (ou o aparelho passar a outra pessoa) conta como
        // novo — senão a poda dos MAX_APARELHOS podia tirar justo este.
        created_at: new Date().toISOString(),
      },
      { onConflict: "emp_proprietaria_id,endpoint" }
    )
    .select("id, endpoint, p256dh, auth")
    .single()
  if (error || !data) {
    if (esquemaAusente(error)) {
      return { erro: "O aviso no celular ainda não está disponível — a entidade precisa concluir a atualização do sistema." }
    }
    console.error("push (portal):", error?.message)
    return { erro: "Não foi possível ligar agora. Tente de novo em instantes." }
  }

  const confirmacao = await enviarUma(
    admin,
    tenantId,
    data,
    JSON.stringify({
      area: "portal",
      titulo: "Avisos no celular ligados",
      corpo: "Pronto: os avisos do portal vão aparecer neste aparelho.",
      url: "/portal/avisos/preferencias",
    })
  )
  if (confirmacao === "expirada" || confirmacao === "recusada") {
    // "expirada" já saiu da tabela em enviarUma; "recusada" sai aqui.
    if (confirmacao === "recusada") {
      await admin.from(TABELA_PORTAL).delete().eq("id", data.id).eq("emp_proprietaria_id", tenantId)
    }
    return {
      erro: "O serviço de notificações do navegador recusou este aparelho. Toque em “Ligar neste aparelho” de novo.",
      refazer: true,
    }
  }

  // A memória desta instância passa a conhecer o CPF; se guardava "sem
  // tabela" (o SQL acabou de rodar), é descartada e relida no próximo aviso.
  const guardado = comPushPorTenant.get(tenantId)
  if (guardado?.cpfs) guardado.cpfs.add(chave)
  else comPushPorTenant.delete(tenantId)

  await podarAparelhos(admin, tenantId, chave)
  return {}
}

/** Mantém só os MAX_APARELHOS mais recentes da pessoa. */
async function podarAparelhos(client: SupabaseClient, tenantId: string, cpf: string): Promise<void> {
  const { data } = await client
    .from(TABELA_PORTAL)
    .select("id")
    .eq("emp_proprietaria_id", tenantId)
    .eq("cpf", cpf)
    .order("created_at", { ascending: false })
  const sobra = (data ?? []).slice(MAX_APARELHOS).map((s) => s.id)
  if (sobra.length > 0) await client.from(TABELA_PORTAL).delete().in("id", sobra).eq("emp_proprietaria_id", tenantId)
}

/**
 * Desliga um aparelho do associado logado (só a assinatura dele, neste
 * endpoint). Devolve erro se a linha pode ter ficado: a tela não pode dizer
 * "desligado" com o aparelho ainda recebendo.
 */
export async function removerAssinaturaPushPortal(cpf: string, endpoint: string): Promise<{ erro?: string }> {
  const chave = cpfConfiavel(cpf)
  if (!chave || typeof endpoint !== "string" || !endpoint) return {}
  const admin = await createAdminClient()
  const { error } = await admin
    .from(TABELA_PORTAL)
    .delete()
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("cpf", chave)
    .eq("endpoint", endpoint)
  if (error && !esquemaAusente(error)) {
    console.error("push (portal):", error.message)
    return { erro: "Não foi possível desligar agora. Tente de novo em instantes." }
  }
  return {}
}

/**
 * Envia o aviso a todos os aparelhos ligados do associado. Melhor esforço:
 * nunca lança, e uma falha não derruba o aviso que a chamou. Usa o client e o
 * tenant RECEBIDOS (vale no tick, fora de requisição, como `avisarFiliado`).
 */
export async function enviarPushPortal(
  cpf: string,
  aviso: { titulo: string; corpo: string; url?: string | null },
  amb: AmbientePush
): Promise<void> {
  try {
    const chave = cpfConfiavel(cpf)
    if (!chave || !prepararVapid()) return
    const { data, error } = await amb.client
      .from(TABELA_PORTAL)
      .select("id, endpoint, p256dh, auth")
      .eq("emp_proprietaria_id", amb.tenantId)
      .eq("cpf", chave)
      .limit(MAX_APARELHOS)
    if (error || !data?.length) return
    // Caminho relativo: o service worker abre no mesmo endereço (subdomínio
    // da entidade) em que o aparelho foi ligado. Fora do portal, a lista de avisos.
    const url = aviso.url && aviso.url.startsWith("/portal") ? aviso.url : "/portal/avisos"
    const carga = JSON.stringify({ area: "portal", titulo: aviso.titulo.slice(0, 120), corpo: aviso.corpo.slice(0, 400), url })
    await Promise.all(data.map((s) => enviarUma(amb.client, amb.tenantId, s, carga)))
  } catch (e) {
    console.error("push (portal):", e)
  }
}
