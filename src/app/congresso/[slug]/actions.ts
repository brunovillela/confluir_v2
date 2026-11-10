"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { type EstadoForm } from "@/lib/contas"
import { limparCpf } from "@/lib/cpf"
import { inscreverPublico } from "@/lib/db/congressos-inscricao"
import { enviarEmail } from "@/lib/email"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

/**
 * Inscrição pública em congresso. Tudo é revalidado em inscreverPublico: a
 * action é alcançável por POST direto, e entre abrir a página e enviar as
 * vagas da base podem ter acabado.
 */

function txt(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}

export async function inscreverCongressoAction(_p: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const slug = txt(fd, "slug")
  if (!slug) return { erro: "Congresso inválido." }
  if (fd.get("aceite") !== "on") {
    return { erro: "É preciso concordar com o tratamento dos dados para se inscrever.", campo: "aceite" }
  }
  const tenantId = await tenantAtual()
  const h = await headers()
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null
  const email = txt(fd, "email").toLowerCase()
  const nome = txt(fd, "nome")
  const r = await inscreverPublico(slug, tenantId, {
    nome,
    nomeSocial: txt(fd, "nome_social") || null,
    cpf: limparCpf(txt(fd, "cpf")),
    email,
    telefone: txt(fd, "telefone").replace(/\D/g, "") || null,
    genero: txt(fd, "genero") || null,
    acessibilidade: txt(fd, "acessibilidade") || null,
    papelId: txt(fd, "papel_id"),
    unidadeId: txt(fd, "unidade_id") || null,
    ip,
  })
  if (r.erro || !r.token) return { erro: r.erro ?? "Não foi possível concluir a inscrição." }

  const link = `${await origemAtual()}/congresso/eu/${r.token}`
  // Sem e-mail configurado a inscrição não trava: a página seguinte mostra o
  // link e pede para guardá-lo.
  await enviarEmail({
    email,
    nome,
    assunto: `Inscrição recebida — ${r.congressoNome ?? "congresso"}`,
    html: `<p>Olá, ${nome.split(" ")[0]}!</p><p>Recebemos sua inscrição em <strong>${r.congressoNome ?? "congresso"}</strong>.</p><p>Acompanhe a situação pelo seu link pessoal:</p><p><a href="${link}">${link}</a></p><p>Não repasse este link: ele identifica você no congresso.</p><p>{ENTIDADE}</p>`,
  })
  redirect(`/congresso/eu/${r.token}?nova=1`)
}
