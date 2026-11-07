"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { type EstadoForm } from "@/lib/contas"
import { concluirFicha, salvarPassoDaFicha } from "@/lib/db/filiacao-ficha-online"
import { obterTermosVigentes, subirFichaAssinada } from "@/lib/db/filiacao-publica"
import { type DadosFicha } from "@/lib/ficha-filiacao"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function rastro(): Promise<{ ip: string | null; ua: string | null }> {
  const h = await headers()
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
  return { ip, ua: h.get("user-agent") }
}

export type EstadoPasso = EstadoForm & { salvo?: number; passo?: number }

/** Salva um passo da ficha (1 a 3). */
export async function salvarPassoAction(_prev: EstadoPasso, fd: FormData): Promise<EstadoPasso> {
  const token = String(fd.get("token") ?? "")
  if (!UUID.test(token)) return { erro: "Ficha inválida." }
  const passo = Number(fd.get("passo"))
  if (passo !== 1 && passo !== 2 && passo !== 3) return { erro: "Passo inválido." }
  const t = (c: string) => {
    const v = fd.get(c)
    return typeof v === "string" ? v : null
  }
  const mesma = t("mesma_fonte")
  const dados: DadosFicha & { mesma_fonte?: boolean | null } = {
    nome_completo: t("nome_completo"),
    nome_social: t("nome_social"),
    nascimento: t("nascimento"),
    sexo: t("sexo"),
    telefone_1: t("telefone_1"),
    telefone_1_whatsapp: fd.get("telefone_1_whatsapp") === "on",
    telefone_2: t("telefone_2"),
    endereco_cep: t("endereco_cep"),
    endereco_logradouro: t("endereco_logradouro"),
    endereco_numero: t("endereco_numero"),
    endereco_complemento: t("endereco_complemento"),
    endereco_bairro: t("endereco_bairro"),
    endereco_cidade: t("endereco_cidade"),
    endereco_estado: t("endereco_estado"),
    empregador_id: UUID.test(t("empregador_id") ?? "") ? t("empregador_id") : null,
    matricula: t("matricula"),
    cargo: t("cargo"),
    lotacao: t("lotacao"),
    mesma_fonte: mesma === "sim" ? true : mesma === "nao" ? false : null,
  }
  const r = await salvarPassoDaFicha(token, passo, dados)
  if (r.erro) return { erro: r.erro, campo: r.campo }
  return { salvo: passo }
}

/** Passo 4: autorizações; a ficha fica pronta para assinar. */
export async function concluirFichaAction(_prev: EstadoPasso, fd: FormData): Promise<EstadoPasso> {
  const token = String(fd.get("token") ?? "")
  if (!UUID.test(token)) return { erro: "Ficha inválida." }
  if (fd.get("aceite_desconto") !== "on") {
    return { erro: "Para se filiar, é preciso autorizar o desconto da mensalidade.", campo: "aceite_desconto" }
  }
  if (fd.get("aceite_lgpd") !== "on") {
    return { erro: "Para se filiar, é preciso autorizar o uso dos seus dados (LGPD).", campo: "aceite_lgpd" }
  }
  // A versão vigente dos termos é a do servidor, não a da tela.
  const termos = await obterTermosVigentes()
  const { ip, ua } = await rastro()
  const r = await concluirFicha(token, { lgpdId: termos.lgpd?.id ?? null, descontoId: termos.desconto?.id ?? null }, ip, ua)
  if (r.erro) return { erro: r.erro, passo: r.passo }
  redirect(`/ficha/${token}?preenchida=1`)
}

export async function subirFichaAssinadaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const token = String(formData.get("token") ?? "")
  if (!UUID.test(token)) return { erro: "Solicitação inválida." }

  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Selecione o PDF assinado." }
  }

  const { ip, ua } = await rastro()
  const res = await subirFichaAssinada(token, arquivo, ip, ua)
  if (res.erro) return { erro: res.erro }

  redirect(`/ficha/${token}?enviado=1`)
}
