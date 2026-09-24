"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { obterOrganizacao } from "@/lib/db/organizacao"
import {
  reativarVersaoTermo,
  salvarVersaoTermo,
} from "@/lib/db/espacos-termo"
import { MARCADORES, marcadoresDesconhecidos } from "@/lib/espacos-termo"
import { gerarTextoIA } from "@/lib/ia"

type Estado = { erro?: string; ok?: string; texto?: string; aviso?: string }

const AQUI = "/painel/espacos/termo"
const txt = (fd: FormData, nome: string) => String(fd.get(nome) ?? "").trim()

export async function salvarTermoAction(
  _prev: Estado,
  fd: FormData
): Promise<Estado> {
  const sessao = await requirePermissao("espacos_gestao")
  const texto = txt(fd, "texto")
  const { erro } = await salvarVersaoTermo(texto, sessao.usuario.id as string)
  if (erro) return { erro }
  revalidatePath(AQUI)
  const desconhecidos = marcadoresDesconhecidos(texto)
  return {
    ok: "Nova versão em vigor. As cessões novas passam a usar este texto.",
    aviso:
      desconhecidos.length > 0
        ? `Estes marcadores não existem e vão sair em branco: ${desconhecidos.map((d) => `{{${d}}}`).join(", ")}.`
        : undefined,
  }
}

export async function reativarTermoAction(fd: FormData): Promise<void> {
  await requirePermissao("espacos_gestao")
  await reativarVersaoTermo(txt(fd, "id"))
  revalidatePath(AQUI)
}

/**
 * A IA ajuda a escrever o MODELO — não o termo de cada cessão. O que varia
 * entre cessões entra por marcador, e é isso que o prompt deixa explícito:
 * pedir para ela inventar horário ou responsável seria pedir variação onde
 * não pode haver.
 */
export async function redigirComIAAction(
  _prev: Estado,
  fd: FormData
): Promise<Estado> {
  await requirePermissao("espacos_gestao")
  const instrucao = txt(fd, "instrucao")
  const atual = txt(fd, "texto")
  const org = await obterOrganizacao()

  const lista = MARCADORES.map((m) => `{{${m.chave}}} — ${m.rotulo}`).join("\n")
  const { texto, erro } = await gerarTextoIA({
    system:
      "Você redige documentos institucionais de entidades sindicais brasileiras, em português do Brasil, com linguagem simples e direta. Escreve texto corrido e cláusulas numeradas, sem juridiquês desnecessário e sem inventar obrigações que não foram pedidas.",
    prompt: [
      `Escreva o MODELO PADRÃO de um termo de cessão de uso de espaço da entidade ${org?.nomeRazao ?? org?.nomeFantasia ?? "sindical"}.`,
      "",
      "O modelo vale para TODAS as cessões. Tudo que muda de uma cessão para outra entra por MARCADOR, escrito exatamente assim, com duas chaves. Use apenas estes:",
      lista,
      "",
      "Regras:",
      "- não invente valores, datas, nomes ou horários: use o marcador correspondente;",
      "- cubra finalidade, período, responsáveis, exigências de segurança, custeio, obrigações de cada parte, cancelamento e disposições finais;",
      "- termine com {{local_data}};",
      "- devolva SÓ o texto do termo, sem comentários e sem formatação markdown.",
      instrucao ? `\nPedido de quem está escrevendo: ${instrucao}` : "",
      atual ? `\nTexto atual, para tomar como base:\n${atual}` : "",
    ].join("\n"),
  })
  if (erro) return { erro }
  return { texto, ok: "Texto sugerido. Leia, ajuste e salve — a IA não publica nada sozinha." }
}
