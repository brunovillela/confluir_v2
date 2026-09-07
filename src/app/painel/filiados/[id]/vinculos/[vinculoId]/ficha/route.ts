import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"

import { requirePermissao } from "@/lib/auth"
import { obterTextosDosTermos } from "@/lib/db/filiacao-publica"
import { obterOrganizacao } from "@/lib/db/organizacao"
import {
  FichaFiliacaoPDF,
  type OrgPdf,
} from "@/lib/pdf/ficha-filiacao"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { semAcento } from "@/lib/texto"

export const runtime = "nodejs"

/**
 * Ficha de filiação PREENCHIDA, pronta para o associado assinar.
 *
 * Reusa o mesmo PDF do fluxo público `/filiar` — o documento tem de ser o
 * mesmo, venha a filiação de onde vier. A diferença é a fonte dos dados: aqui
 * eles saem da filiação já cadastrada e do vínculo escolhido, em vez da
 * solicitação pública.
 *
 * Serve para quem foi filiado pela secretaria, migrado do Bubble ou filiado
 * coletivamente: a entidade imprime, colhe a assinatura e sobe o PDF de volta
 * no mesmo vínculo.
 */
async function logoDataUri(url: string | null): Promise<string | null> {
  if (!url) return null
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const tipo = r.headers.get("content-type") ?? ""
    if (!/image\/(png|jpe?g)/.test(tipo)) return null
    const buf = Buffer.from(await r.arrayBuffer())
    return `data:${tipo};base64,${buf.toString("base64")}`
  } catch {
    return null
  }
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; vinculoId: string }> }
) {
  await requirePermissao("filiacao_gestao")
  const { id, vinculoId } = await params

  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const [{ data: filiado }, { data: vinculo }] = await Promise.all([
    admin
      .from("filiacoes")
      .select(
        "id, nome_completo, nome_social, cpf, nascimento_data, sexo, email_pessoal, email_corporativo, telefone_1, telefone_1_whatsapp, telefone_2, endereco_cep, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_estado"
      )
      .eq("emp_proprietaria_id", emp)
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("filiacao_vinculos")
      .select("id, filiado_id, cargo, lotacao, matricula, fonte_pagadora_id, fonte_pg_cargo, fonte_pg_lotacao, fonte_pg_matricula, data_filiacao")
      .eq("emp_proprietaria_id", emp)
      .eq("id", vinculoId)
      .maybeSingle(),
  ])

  if (!filiado || !vinculo || vinculo.filiado_id !== id) {
    return new Response("Não encontrado", { status: 404 })
  }

  let empregadorNome: string | null = null
  if (vinculo.fonte_pagadora_id) {
    const { data: fonte } = await admin
      .from("empresa")
      .select("nome_fantasia, nome_razao")
      .eq("id", vinculo.fonte_pagadora_id as string)
      .maybeSingle()
    empregadorNome =
      texto(fonte?.nome_fantasia) ?? texto(fonte?.nome_razao) ?? null
  }

  const [organizacao, termos] = await Promise.all([
    obterOrganizacao(),
    obterTextosDosTermos(null, null),
  ])

  const org: OrgPdf = {
    nomeRazao: organizacao?.nomeRazao ?? null,
    nomeFantasia: organizacao?.nomeFantasia ?? null,
    cnpjCpf: organizacao?.cnpjCpf ?? null,
    logoDataUri: await logoDataUri(organizacao?.logoUrl ?? null),
  }

  // A ficha em branco para assinatura não tem protocolo nem token: ela não
  // nasceu de uma solicitação pública, e inventar um número seria fingir um
  // trâmite que não houve.
  const dados = {
    id: vinculo.id as string,
    token: "",
    situacao: "aprovada" as const,
    protocolo: null,
    nome: texto(filiado.nome_completo),
    nome_social: texto(filiado.nome_social),
    cpf: texto(filiado.cpf),
    nascimento: texto(filiado.nascimento_data),
    sexo: texto(filiado.sexo),
    email: texto(filiado.email_pessoal) ?? texto(filiado.email_corporativo),
    telefone_1: texto(filiado.telefone_1),
    telefone_1_whatsapp: filiado.telefone_1_whatsapp === true,
    telefone_2: texto(filiado.telefone_2),
    endereco_cep: texto(filiado.endereco_cep),
    endereco_logradouro: texto(filiado.endereco_logradouro),
    endereco_numero: texto(filiado.endereco_numero),
    endereco_complemento: texto(filiado.endereco_complemento),
    endereco_bairro: texto(filiado.endereco_bairro),
    endereco_cidade: texto(filiado.endereco_cidade),
    endereco_estado: texto(filiado.endereco_estado),
    empregadorNome,
    matricula: texto(vinculo.matricula) ?? texto(vinculo.fonte_pg_matricula),
    cargo: texto(vinculo.cargo) ?? texto(vinculo.fonte_pg_cargo),
    lotacao: texto(vinculo.lotacao) ?? texto(vinculo.fonte_pg_lotacao),
    emailVerificado: false,
    documentoAssinado: false,
    reprovacao_motivo: null,
    tlLgpdId: null,
    tlDescontoId: null,
    created_at: texto(vinculo.data_filiacao),
  }

  const elemento = createElement(FichaFiliacaoPDF, {
    dados,
    org,
    termos,
  }) as Parameters<typeof renderToBuffer>[0]
  const buffer = await renderToBuffer(elemento)

  const nome = semAcento(texto(filiado.nome_completo) ?? "filiado")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ficha-filiacao-${nome}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
