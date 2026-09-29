import { temaClausula } from "@/lib/acordos-constantes"
import { agruparPorAssunto, valoresCitados } from "@/lib/acordos-tema"
import { getSessaoPainel } from "@/lib/auth"
import { acordosParaTema, clausulasDoTema } from "@/lib/db/acordos-tema"
import { podeAcessar } from "@/lib/permissoes"

export const runtime = "nodejs"

/** Célula de CSV (Excel pt-BR: separador ";"). */
function celula(v: string | null | undefined): string {
  const t = (v ?? "").replace(/\r?\n/g, "\n")
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

/** Uma linha por assunto; para cada acordo, a cláusula, os valores citados e o texto. */
export async function GET(req: Request) {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "acordos_coletivos", ["negociacoes"])) {
    return new Response("Sem acesso", { status: 403 })
  }
  const sp = new URL(req.url).searchParams
  const tema = temaClausula(sp.get("tema"))
  const termo = (sp.get("termo") ?? "").trim().slice(0, 80)
  const disponiveis = await acordosParaTema(sessao.permissoes)
  const ids = sp
    .getAll("a")
    .filter((id) => disponiveis.some((d) => d.id === id))
    .slice(0, 8)
  if ((!tema && !termo) || ids.length < 2) return new Response("Escolha o tema e ao menos dois acordos.", { status: 400 })

  const porAcordo = await clausulasDoTema(ids, { tema, termo })
  const linhas = agruparPorAssunto(ids.map((id) => ({ acordoId: id, clausulas: porAcordo.get(id) ?? [] })))
  const nomes = ids.map((id) => disponiveis.find((d) => d.id === id)!.titulo)

  const cabecalho = nomes.flatMap((n) => [`${n} — cláusula`, `${n} — valores`, `${n} — texto`])
  const corpo = linhas.map((l) =>
    ids.flatMap((id) => {
      const c = l.porAcordo.get(id)
      if (!c) return ["Não tem", "", ""]
      return [[c.numero, c.titulo].filter(Boolean).join(" – "), valoresCitados(c.texto).join(" | "), c.texto ?? ""]
    })
  )
  const csv = [cabecalho, ...corpo].map((l) => l.map(celula).join(";")).join("\r\n")
  return new Response("﻿" + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="acordos-por-tema.csv"`,
    },
  })
}
