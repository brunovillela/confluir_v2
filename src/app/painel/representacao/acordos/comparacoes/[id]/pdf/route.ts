import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"

import { ROTULO_AVALIACAO, ROTULO_SITUACAO } from "@/lib/acordos-comparar"
import { ROTULO_TEMA } from "@/lib/acordos-constantes"
import { getSessaoPainel } from "@/lib/auth"
import { obterComparacao } from "@/lib/db/acordos-comparacoes"
import { logoDataUri } from "@/lib/db/oficios-assinatura"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { formatarDataHora } from "@/lib/formato"
import { ComparacaoAcordosPDF } from "@/lib/pdf/comparacao-acordos"
import { podeAcessar } from "@/lib/permissoes"

export const runtime = "nodejs"

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "acordos_coletivos")) {
    return new Response("Sem acesso", { status: 403 })
  }
  const { id } = await ctx.params
  const [comparacao, org] = await Promise.all([obterComparacao(id), obterOrganizacao()])
  if (!comparacao) return new Response("Comparação não encontrada", { status: 404 })
  const c = comparacao

  const conta = (f: (p: (typeof c.pares)[number]) => boolean) => c.pares.filter(f).length
  const lado = (l: (typeof c.pares)[number]["a"]) =>
    l ? [l.numero ? `Cláusula ${l.numero}` : null, l.titulo].filter(Boolean).join(" · ") : "—"
  const elemento = createElement(ComparacaoAcordosPDF, {
    entidade: org?.nomeRazao ?? org?.nomeFantasia ?? null,
    logo: await logoDataUri(org?.logoUrl ?? null),
    acordoA: c.acordoA.titulo ?? "A",
    acordoB: c.acordoB.titulo ?? "B",
    numeros: [
      { rotulo: "Alteradas", valor: conta((p) => p.situacao === "alterada") },
      { rotulo: "Novas (só em B)", valor: conta((p) => p.situacao === "nova") },
      { rotulo: "Suprimidas (só em A)", valor: conta((p) => p.situacao === "suprimida") },
      { rotulo: "Iguais", valor: conta((p) => p.situacao === "igual") },
      { rotulo: "Favoráveis ao trabalhador", valor: conta((p) => p.avaliacao === "favoravel"), cor: "#15803d" },
      { rotulo: "Desfavoráveis ao trabalhador", valor: conta((p) => p.avaliacao === "desfavoravel"), cor: "#b91c1c" },
      { rotulo: "Neutras", valor: conta((p) => p.avaliacao === "neutra") },
    ],
    itens: c.pares
      .filter((p) => p.situacao !== "igual")
      .map((p) => ({
        situacao: ROTULO_SITUACAO[p.situacao],
        avaliacao: p.avaliacao ? ROTULO_AVALIACAO[p.avaliacao] + (p.avaliacaoManual ? " (conferida)" : "") : null,
        avaliacaoChave: p.avaliacao,
        tema: p.tema ? ROTULO_TEMA[p.tema] : null,
        a: lado(p.a),
        b: lado(p.b),
        resumo: p.resumo,
        motivo: p.avaliacaoMotivo,
      })),
    geradoEm: formatarDataHora(new Date().toISOString()),
  }) as Parameters<typeof renderToBuffer>[0]
  const pdf = await renderToBuffer(elemento)
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="comparacao-acordos.pdf"`,
    },
  })
}
