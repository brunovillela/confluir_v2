"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { requireSessaoPortal } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { cpfConfiavel } from "@/lib/cpf"
import { definirComunicados } from "@/lib/db/comunicacao-descadastro"
import { atualizarRegistrosDoCpf } from "@/lib/db/filiado-portal"
import { registrarAceiteTermo, termoEmVigor } from "@/lib/db/lgpd"
import { tenantAtual } from "@/lib/tenant"
import { getVisualizacaoPortal } from "@/lib/visualizacao-filiado"

/**
 * Registra o aceite do termo LGPD (data de hoje e versão aceita em todos os
 * registros do CPF). A versão gravada é a em vigor no servidor — a verdade
 * não vem do cliente —, mas ela tem de ser a mesma que a página mostrou
 * (`termo_id`): se o termo mudou com a página aberta, a pessoa lê a versão
 * nova antes de aceitar (A71).
 */
export async function registrarAceiteLgpd(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const { filiado } = await requireSessaoPortal()

  if (formData.get("li_e_aceito") !== "on") {
    return { erro: "Marque a caixa confirmando a leitura do termo." }
  }

  const termoId = await termoEmVigor("lgpd")
  if (!termoId) {
    return {
      erro: "A entidade ainda não cadastrou o termo de tratamento de dados. Fale com a secretaria.",
    }
  }
  if (String(formData.get("termo_id") ?? "") !== termoId) {
    revalidatePath("/portal/lgpd")
    return {
      erro: "O termo foi atualizado enquanto a página estava aberta. Leia a versão em vigor, que já está na tela, e confirme de novo.",
    }
  }

  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date())

  const erro = await atualizarRegistrosDoCpf(filiado.cpf, {
    tl_lgpd_data: hoje,
    tl_lgpd_id: termoId,
  })
  if (erro) return { erro }

  // Consentimento versionado: qual termo, quando, de onde (LGPD art. 8º, §1º).
  const h = await headers()
  await registrarAceiteTermo({
    cpf: filiado.cpf,
    filiacaoId: filiado.filiacaoId,
    tipo: "lgpd",
    termoId,
    origem: "portal",
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent"),
  })

  revalidatePath("/portal/lgpd")
  redirect("/portal/lgpd?salvo=1")
}

/**
 * Liga ou desliga os comunicados da mala direta (todos os registros do CPF).
 * Vem da LGPD ou de Preferências de avisos (A176, `voltar=preferencias`):
 * de lá, a resposta fica na própria página.
 */
export async function alterarComunicadosPortal(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  // Na visualização pela gestão a sessão é a de quem visualiza: gravaria na
  // conta DELE, se ele também tiver acesso ao portal.
  if ((await getVisualizacaoPortal())?.preview) {
    return { erro: "Na visualização pela gestão, só o próprio associado escolhe." }
  }
  const { filiado } = await requireSessaoPortal()
  const cpf = cpfConfiavel(filiado.cpf)
  if (!cpf) return { erro: "Cadastro sem CPF: fale com a secretaria." }
  const receber = formData.get("receber") === "1"
  const r = await definirComunicados({ emp: await tenantAtual(), cpf }, receber, "portal")
  if (r.erro) return { erro: r.erro }
  revalidatePath("/portal/lgpd")
  revalidatePath("/portal/avisos/preferencias")
  if (formData.get("voltar") === "preferencias") {
    return {
      ok: receber
        ? "Pronto: você volta a receber os comunicados por e-mail."
        : "Pronto: você não recebe mais os comunicados por e-mail.",
    }
  }
  redirect("/portal/lgpd?salvo=comunicados")
}
