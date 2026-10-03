import "server-only"

import { avisar, type Destinatario } from "@/lib/db/avisos"
import { texto } from "@/lib/db/comum"
import { contextoDoTenant } from "@/lib/db/comunicacao-mensagens"
import { DIAS_PARADA, pendenciasPara, totalPendencias, type Pendencia } from "@/lib/db/pendencias"
import { escaparHtml, paragrafo, textoSuave } from "@/lib/email-layout"
import { PERMISSOES_USUARIO_FK, type Permissoes } from "@/lib/permissoes"
import { resolverPermissoes } from "@/lib/permissoes-resolver"
import { createServiceClient } from "@/lib/supabase/admin"

/**
 * LEMBRETE DIÁRIO DE PENDÊNCIAS (onda 2, U2): uma vez por dia, cada pessoa
 * com algo esperando por ela recebe um resumo — sino, e-mail e Telegram
 * conforme a preferência "Lembrete diário" — com destaque para o que está
 * parado há mais de DIAS_PARADA dias. Sem pendência, nada é enviado.
 *
 * Roda fora de requisição (cron /api/pendencias/tick): service role, tenant
 * por tenant, as mesmas fontes da caixa de entrada (lib/db/pendencias.ts).
 * Um lembrete por pessoa por dia (dedupe pelo texto no dia).
 */

export async function tenantsDoLembrete(): Promise<{ id: string; slug: string | null }[]> {
  const svc = createServiceClient()
  const { data, error } = await svc.from("tenants").select("empresa_id, slug")
  if (error) return []
  return (data ?? [])
    .map((t) => ({ id: texto(t.empresa_id) ?? "", slug: texto(t.slug) }))
    .filter((t) => t.id)
}

function linhaResumo(p: Pendencia): string {
  const parada = p.antigas ? ` (${p.antigas} há mais de ${DIAS_PARADA} dias)` : ""
  // Só a inicial em minúscula: siglas como ACT seguem como são.
  return `${p.quantidade} × ${p.titulo.charAt(0).toLowerCase()}${p.titulo.slice(1)}${parada}`
}

export function textoLembrete(lista: Pendencia[]): string {
  const total = totalPendencias(lista)
  const paradas = lista.reduce((s, p) => s + (p.antigas ?? 0), 0)
  const cabeca = `Lembrete diário: ${total} pendência${total === 1 ? "" : "s"} esperando você` + (paradas ? `, ${paradas} parada${paradas === 1 ? "" : "s"} há mais de ${DIAS_PARADA} dias` : "") + "."
  return `${cabeca} ${lista.map(linhaResumo).join("; ")}.`
}

function htmlLembrete(lista: Pendencia[], origem: string): string {
  const total = totalPendencias(lista)
  const itens = lista
    .map((p) => {
      const parada = p.antigas ? ` <span style="color:#b45309;">— ${p.antigas} há mais de ${DIAS_PARADA} dias</span>` : ""
      return `<li style="margin:0 0 8px;"><a href="${origem}${p.href}" style="font-weight:600;">${escaparHtml(p.titulo)}</a>: ${p.quantidade}${parada}</li>`
    })
    .join("")
  return (
    paragrafo(`Você tem <strong>${total}</strong> pendência${total === 1 ? "" : "s"} esperando a sua ação no Confluir:`) +
    `<ul style="margin:0 0 16px;padding-left:20px;">${itens}</ul>` +
    paragrafo(`<a href="${origem}/painel#caixa-entrada" style="font-weight:600;">Abrir a caixa de entrada</a>`) +
    textoSuave("Este lembrete sai uma vez por dia enquanto houver pendência. Para desligá-lo, abra Meu perfil → Avisos.")
  )
}

export async function lembrarPendencias(tenantId: string): Promise<{ pessoas: number; lembretes: number }> {
  const svc = createServiceClient()
  const contexto = await contextoDoTenant(tenantId, svc)

  const { data: acessos } = await svc
    .from("permissoes")
    .select("*")
    .eq("emp_proprietaria_id", tenantId)
    .not(PERMISSOES_USUARIO_FK, "is", null)
  const porUsuario = new Map<string, Permissoes>()
  for (const a of acessos ?? []) porUsuario.set(String(a[PERMISSOES_USUARIO_FK]), a as Permissoes)
  if (porUsuario.size === 0) return { pessoas: 0, lembretes: 0 }

  const { data: usuarios } = await svc
    .from("usuarios")
    .select("id, nome_completo, nome_guerra, email")
    .in("id", [...porUsuario.keys()])
    .eq("emp_proprietaria_id", tenantId)
    .not("inativo", "is", true)
    .not("deletado", "is", true)

  let lembretes = 0
  for (const u of usuarios ?? []) {
    const id = String(u.id)
    const base = porUsuario.get(id)
    if (!base) continue
    const permissoes = await resolverPermissoes(svc, id, base)
    const email = texto(u.email)
    const lista = await pendenciasPara({ client: svc, emp: tenantId, permissoes, email, comAntigas: true })
    if (lista.length === 0) continue
    const d: Destinatario = { id, nome: texto(u.nome_completo) ?? texto(u.nome_guerra), email, permissoes }
    lembretes += await avisar(
      [d],
      {
        texto: textoLembrete(lista),
        link: "/painel#caixa-entrada",
        evento: "lembrete_pendencias",
        assunto: `Suas pendências de hoje no Confluir — ${contexto.entidade}`,
        html: htmlLembrete(lista, contexto.origem),
        umaVezPorDia: true,
      },
      { client: svc, tenantId, contexto }
    )
  }
  return { pessoas: (usuarios ?? []).length, lembretes }
}
