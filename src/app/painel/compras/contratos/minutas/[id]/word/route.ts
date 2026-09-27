import { getSessaoPainel } from "@/lib/auth"
import { obterMinuta } from "@/lib/db/contratos-minutas"
import { podeAcessar } from "@/lib/permissoes"

export const runtime = "nodejs"

const escapar = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** Mesma regra do PDF: linha curta em CAIXA ALTA = título em negrito. */
function ehTitulo(linha: string): boolean {
  const t = linha.trim()
  if (t.length === 0 || t.length > 90) return false
  return t === t.toUpperCase() && /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(t)
}

/**
 * Minuta para o Word: HTML com o cabeçalho que o Word reconhece (.doc). Serve
 * para mandar à outra parte revisar com "controlar alterações" — sem
 * biblioteca de DOCX no projeto, é o caminho que abre em qualquer Word.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "aquisicoes_contratos_edicao")) {
    return new Response("Sem acesso", { status: 403 })
  }
  const { id } = await ctx.params
  const minuta = await obterMinuta(id)
  if (!minuta?.texto) return new Response("Minuta não encontrada", { status: 404 })

  const corpo = minuta.texto
    .split("\n")
    .map((l) =>
      l.trim() === ""
        ? "<p>&nbsp;</p>"
        : ehTitulo(l)
          ? `<p><b>${escapar(l)}</b></p>`
          : `<p>${escapar(l)}</p>`
    )
    .join("\n")
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapar(minuta.titulo ?? "Minuta")}</title>
<style>body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.4} p{margin:0 0 6pt 0;text-align:justify}</style>
</head><body>
${corpo}
</body></html>`

  const nome = `minuta-v${minuta.versao}.doc`
  return new Response("﻿" + html, {
    headers: {
      "content-type": "application/msword; charset=utf-8",
      "content-disposition": `attachment; filename="${nome}"`,
    },
  })
}
