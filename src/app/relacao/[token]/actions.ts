"use server"

import { revalidatePath } from "next/cache"

import { confirmarComunicacaoPeloLink, prepararEnvio, registrarEnvio } from "@/lib/db/repasse-link"

export type EstadoLink = { erro?: string; campo?: string; ok?: string }

const texto = (f: FormData, k: string) => {
  const v = f.get(k)
  return typeof v === "string" && v.trim() ? v.trim() : null
}

/** Passo 1 do envio: o navegador pede onde subir o arquivo (sem o teto de 4 MB das actions). */
export async function prepararEnvioAction(token: string, nomeArquivo: string, tamanho: number) {
  return prepararEnvio(token, nomeArquivo, tamanho)
}

/** Passo 2: registra o envio (com o arquivo já no armazenamento, ou "sem desconto"). */
export async function registrarEnvioAction(_: EstadoLink, f: FormData): Promise<EstadoLink> {
  const token = texto(f, "token") ?? ""
  const [competencia, tipo] = (texto(f, "competencia") ?? "").split("|")
  const valorTexto = texto(f, "valor")
  const valor = valorTexto ? Number(valorTexto.replace(/\./g, "").replace(",", ".")) : null
  if (valor !== null && (!Number.isFinite(valor) || valor < 0)) return { erro: "Valor inválido.", campo: "valor" }
  const semDesconto = f.get("sem_desconto") === "on"
  const r = await registrarEnvio(token, {
    caminho: texto(f, "caminho"),
    nomeArquivo: texto(f, "nome_arquivo"),
    tamanho: Number(texto(f, "tamanho") ?? 0) || null,
    competencia: Number(competencia),
    tipo: tipo ?? "",
    semDesconto,
    valor,
    observacao: texto(f, "observacao"),
    nome: texto(f, "nome") ?? "",
    email: texto(f, "email"),
  })
  if (r.erro) return r
  revalidatePath(`/relacao/${token}`)
  return { ok: semDesconto ? "Registrado: sem desconto nesta competência. Obrigado!" : "Relação recebida. Obrigado!" }
}

export async function confirmarComunicacaoAction(_: EstadoLink, f: FormData): Promise<EstadoLink> {
  const token = texto(f, "token") ?? ""
  const r = await confirmarComunicacaoPeloLink(token, texto(f, "comunicacao_id") ?? "", texto(f, "nome") ?? "", texto(f, "email"))
  if (r.erro) return r
  revalidatePath(`/relacao/${token}`)
  return { ok: "Recebimento confirmado. Obrigado!" }
}
