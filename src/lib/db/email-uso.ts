import "server-only"

import { esquemaAusente, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { nomesDosDepartamentos } from "@/lib/db/ia-uso"
import { estadoDoEnvio, processoEmail, tituloModuloEmail, type EstadoEnvio } from "@/lib/email-processos"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Leitura dos e-mails enviados (tabela email_envios) para a Gestão › E-mail:
 * o resumo agregado no banco (função email_envios_resumo) e o histórico dos
 * envios, com filtros. Fase 2 da gestão do e-mail (26/11/2026).
 */

export type DimensaoEmail = "processo" | "modulo" | "usuario" | "departamento" | "situacao" | "dia"

export type LinhaEmail = {
  chave: string
  rotulo: string
  detalhe: string | null
  enviados: number
  falhas: number
  entregues: number
  rejeitados: number
  ultima: string | null
}

export type ResumoEmail = {
  disponivel: boolean
  total: LinhaEmail | null
  por: Record<DimensaoEmail, LinhaEmail[]>
}

const VAZIO: Record<DimensaoEmail, LinhaEmail[]> = { processo: [], modulo: [], usuario: [], departamento: [], situacao: [], dia: [] }

const ROTULO_SITUACAO: Record<string, string> = {
  enviado: "Aceitos pelo provedor",
  falhou: "Não saíram",
  teste: "Teste (não entregues)",
  sem_configuracao: "Envio não configurado",
  enviando: "Sem resposta do provedor",
}

function crua(r: Record<string, unknown>): Omit<LinhaEmail, "rotulo" | "detalhe"> {
  const n = (v: unknown) => Number(v ?? 0) || 0
  return {
    chave: String(r.chave ?? ""),
    enviados: n(r.enviados),
    falhas: n(r.falhas),
    entregues: n(r.entregues),
    rejeitados: n(r.rejeitados),
    ultima: texto(r.ultima),
  }
}

export async function resumoEmails(de: Date, ate: Date): Promise<ResumoEmail> {
  const admin = await createAdminClient()
  const { data, error } = await admin.rpc("email_envios_resumo", {
    p_emp: await tenantAtual(),
    p_de: de.toISOString(),
    p_ate: ate.toISOString(),
  })
  if (error) return { disponivel: !esquemaAusente(error), total: null, por: { ...VAZIO } }
  const bruto = (data ?? {}) as Record<string, Record<string, unknown>[]>
  const cru = (d: string) => (bruto[d] ?? []).map(crua)
  const usuarios = cru("usuario")
  const departamentos = cru("departamento")
  const [nomes, deps] = await Promise.all([
    nomesDosUsuarios(usuarios.map((u) => u.chave).filter(Boolean)),
    nomesDosDepartamentos(departamentos.map((d) => d.chave).filter(Boolean)),
  ])
  const total = cru("total")[0]
  return {
    disponivel: true,
    total: total ? { ...total, rotulo: "Total", detalhe: null } : null,
    por: {
      processo: cru("processo").map((l) => {
        const p = processoEmail(l.chave)
        return { ...l, rotulo: p.titulo, detalhe: tituloModuloEmail(p.modulo) }
      }),
      modulo: cru("modulo").map((l) => ({ ...l, rotulo: tituloModuloEmail(l.chave), detalhe: null })),
      usuario: usuarios.map((l) => ({
        ...l,
        rotulo: l.chave ? (nomes.get(l.chave) ?? "Pessoa sem nome") : "Sem pessoa (automático ou público)",
        detalhe: null,
      })),
      departamento: departamentos.map((l) => ({
        ...l,
        rotulo: l.chave ? (deps.get(l.chave) ?? "Departamento removido") : "Sem departamento",
        detalhe: null,
      })),
      situacao: cru("situacao").map((l) => ({ ...l, rotulo: ROTULO_SITUACAO[l.chave] ?? l.chave, detalhe: null })),
      dia: cru("dia")
        .map((l) => ({ ...l, rotulo: l.chave.split("-").reverse().join("/"), detalhe: null }))
        .sort((a, b) => a.chave.localeCompare(b.chave)),
    },
  }
}

export type EnvioEmail = {
  id: string
  criadoEm: string
  processo: string
  modulo: string
  detalhe: string | null
  pessoa: string | null
  departamento: string | null
  destinatario: string | null
  provedor: string
  estado: EstadoEnvio
  erro: string | null
  rejeicao: string | null
  entregueEm: string | null
  adiadoEm: string | null
  rejeitadoEm: string | null
  anexos: number
}

export type FiltroEnvios = {
  de: Date
  ate: Date
  destinatario?: string | null
  processo?: string | null
  modulo?: string | null
  usuarioId?: string | null
  departamentoId?: string | null
  situacao?: string | null
}

/** Histórico dos envios (os mais recentes primeiro), `limite` a partir de `deslocamento` (até 1.000 por vez). */
export async function listarEnvios(f: FiltroEnvios, limite = 100, deslocamento = 0): Promise<{ disponivel: boolean; envios: EnvioEmail[] }> {
  const admin = await createAdminClient()
  let q = admin
    .from("email_envios")
    .select("id, criado_em, processo, modulo, detalhe, usuario_id, departamento_id, destinatario, provedor, situacao, erro, anexos, entregue_em, adiado_em, rejeitado_em, rejeicao")
    .eq("emp_proprietaria_id", await tenantAtual())
    .gte("criado_em", f.de.toISOString())
    .lt("criado_em", f.ate.toISOString())
    .order("criado_em", { ascending: false })
    .order("id", { ascending: false })
    .range(deslocamento, deslocamento + Math.min(limite, 1000) - 1)
  const busca = f.destinatario?.trim().replace(/[%_,()]/g, "")
  if (busca) q = q.ilike("destinatario", `%${busca}%`)
  if (f.processo) q = q.eq("processo", f.processo)
  if (f.modulo) q = q.eq("modulo", f.modulo)
  if (f.usuarioId === "") q = q.is("usuario_id", null)
  else if (f.usuarioId) q = q.eq("usuario_id", f.usuarioId)
  if (f.departamentoId === "") q = q.is("departamento_id", null)
  else if (f.departamentoId) q = q.eq("departamento_id", f.departamentoId)
  switch (f.situacao) {
    case "problemas":
      q = q.or("situacao.eq.falhou,rejeitado_em.not.is.null,and(adiado_em.not.is.null,entregue_em.is.null)")
      break
    case "rejeitado":
      q = q.not("rejeitado_em", "is", null)
      break
    case "falhou":
      q = q.eq("situacao", "falhou")
      break
    case "adiado":
      q = q.not("adiado_em", "is", null).is("entregue_em", null).is("rejeitado_em", null)
      break
    case "entregue":
      q = q.not("entregue_em", "is", null).is("rejeitado_em", null)
      break
    case "aguardando":
      q = q.eq("situacao", "enviado").is("entregue_em", null).is("adiado_em", null).is("rejeitado_em", null)
      break
  }
  const { data, error } = await q
  if (error) return { disponivel: !esquemaAusente(error), envios: [] }
  const linhas = (data ?? []) as Record<string, unknown>[]
  const [nomes, deps] = await Promise.all([
    nomesDosUsuarios(linhas.map((l) => String(l.usuario_id ?? "")).filter(Boolean)),
    nomesDosDepartamentos(linhas.map((l) => String(l.departamento_id ?? "")).filter(Boolean)),
  ])
  return {
    disponivel: true,
    envios: linhas.map((l) => {
      const entregueEm = texto(l.entregue_em)
      const adiadoEm = texto(l.adiado_em)
      const rejeitadoEm = texto(l.rejeitado_em)
      return {
        id: String(l.id),
        criadoEm: String(l.criado_em),
        processo: String(l.processo),
        modulo: String(l.modulo),
        detalhe: texto(l.detalhe),
        pessoa: l.usuario_id ? (nomes.get(String(l.usuario_id)) ?? "Pessoa sem nome") : null,
        departamento: l.departamento_id ? (deps.get(String(l.departamento_id)) ?? null) : null,
        destinatario: texto(l.destinatario),
        provedor: String(l.provedor),
        estado: estadoDoEnvio({ situacao: String(l.situacao), entregueEm, adiadoEm, rejeitadoEm }),
        erro: texto(l.erro),
        rejeicao: texto(l.rejeicao),
        entregueEm,
        adiadoEm,
        rejeitadoEm,
        anexos: Number(l.anexos ?? 0),
      }
    }),
  }
}
