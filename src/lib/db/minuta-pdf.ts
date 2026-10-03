import "server-only"

import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"

import { certificacaoParaPdf } from "@/lib/db/minuta-assinatura"
import { logoDataUri } from "@/lib/db/oficios-assinatura"
import { formatarCnpjCpf } from "@/lib/formato"
import { MinutaContratoPDF } from "@/lib/pdf/minuta-contrato"
import { createAdminClient } from "@/lib/supabase/admin"
import { urlLogo } from "@/lib/db/organizacao"

/**
 * PDF da minuta — o mesmo para o painel e para o assinante (sem login). Traz
 * a página de certificação quando há assinaturas sobre o texto atual.
 * `emp` vem de quem chama (sessão no painel, envelope no link público).
 */
export async function renderizarPdfMinuta(
  minutaId: string,
  emp: string
): Promise<{ pdf: Buffer; nome: string } | null> {
  const db = await createAdminClient()
  const [{ data: m }, { data: org }] = await Promise.all([
    db
      .from("contratos_minutas")
      .select("id, titulo, tipo, versao, finalizada, texto")
      .eq("id", minutaId)
      .eq("emp_proprietaria_id", emp)
      .eq("deletado", false)
      .maybeSingle(),
    db.from("empresa").select("nome_razao, nome_fantasia, cnpj_cpf, logomarca").eq("id", emp).maybeSingle(),
  ])
  if (!m?.texto) return null
  const certificacao = await certificacaoParaPdf(minutaId, String(m.texto))
  const titulo = (m.titulo as string | null) ?? (m.tipo as string | null) ?? "Minuta"
  const elemento = createElement(MinutaContratoPDF, {
    texto: String(m.texto),
    entidade: (org?.nome_razao as string | null) ?? (org?.nome_fantasia as string | null) ?? null,
    subtitulo: org?.cnpj_cpf ? `CNPJ ${formatarCnpjCpf(String(org.cnpj_cpf))}` : null,
    logo: await logoDataUri(urlLogo((org?.logomarca as string | null) ?? null)),
    rodape: [m.finalizada ? null : "MINUTA", titulo, `versão ${m.versao}`].filter(Boolean).join(" · "),
    minuta: !m.finalizada,
    certificacao,
  }) as Parameters<typeof renderToBuffer>[0]
  const pdf = await renderToBuffer(elemento)
  const assinado = certificacao?.concluida === true
  return { pdf, nome: `${assinado ? "contrato-assinado" : "minuta"}-v${m.versao}.pdf` }
}
