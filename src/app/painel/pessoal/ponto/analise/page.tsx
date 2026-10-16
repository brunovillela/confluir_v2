import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { anosDaBase, carregarBasePonto, indicadoresDe, rotuloCompetenciaPonto } from "@/lib/db/ponto-analise"
import { obterResenha } from "@/lib/db/ponto-resenha"

import { CartaoResenha, PainelIndicadores } from "./componentes"

export const metadata: Metadata = { title: "Indicadores do ponto — Confluir" }
// A resenha da IA pode levar perto de um minuto.
export const maxDuration = 300

/** Indicadores e resenha do controle de ponto por ano e por departamento no ano. */
export default async function AnalisePontoPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string; departamento?: string }>
}) {
  await requirePermissao("pessoal_gestao")
  const params = await searchParams
  const base = await carregarBasePonto()
  const anos = anosDaBase(base)
  const ano = params.ano && anos.includes(params.ano) ? params.ano : anos[0]
  const departamento = params.departamento && base.departamentos.some((d) => d.chave === params.departamento) ? params.departamento : null

  if (!ano) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Indicadores do ponto</h1>
        <p className="text-muted-foreground text-sm">Nenhuma remessa de ponto cadastrada ainda.</p>
      </>
    )
  }

  const ind = departamento
    ? indicadoresDe(base, { escopo: "departamento", ano, departamento })
    : indicadoresDe(base, { escopo: "ano", ano })
  const { disponivel, resenha } = await obterResenha(
    departamento ? "departamento" : "ano",
    departamento ? `${ano}:${departamento}` : ano
  )
  const nomeDep = base.departamentos.find((d) => d.chave === departamento)?.nome
  const href = (a: string, d?: string | null) =>
    `/painel/pessoal/ponto/analise?ano=${a}${d ? `&departamento=${encodeURIComponent(d)}` : ""}`
  const remessasDoAno = base.remessas.filter((r) => r.competencia.startsWith(ano)).reverse()

  return (
    <>
      <RotuloTrilha valores={{ analise: "Indicadores" }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={departamento ? href(ano) : "/painel/pessoal/ponto"}>
            <ArrowLeft />
            {departamento ? `Indicadores de ${ano}` : "Remessas de controle de ponto"}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {departamento ? `${nomeDep} — ${ano}` : `Indicadores do ponto — ${ano}`}
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {ind.competencias.length} remessa(s) no {departamento ? "recorte" : "ano"} · horas em formato decimal (7,5 h = 7 h 30 min)
        </p>
      </div>

      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Ano">
        {anos.map((a) => (
          <Link
            key={a}
            href={href(a, departamento)}
            className={`rounded-md border px-3 py-1 ${a === ano ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"}`}
          >
            {a}
          </Link>
        ))}
      </nav>

      <PainelIndicadores ind={ind} hrefDepartamento={departamento ? undefined : (d) => href(ano, d)} />

      <CartaoResenha
        disponivel={disponivel}
        resenha={resenha}
        escopo={departamento ? "departamento" : "ano"}
        ano={ano}
        departamento={departamento ?? undefined}
      />

      {!departamento && remessasDoAno.length > 0 && (
        <p className="text-muted-foreground text-xs">
          Indicadores e resenha de cada mês:{" "}
          {remessasDoAno.map((r, i) => (
            <span key={r.id}>
              {i > 0 && " · "}
              <Link href={`/painel/pessoal/ponto/${r.id}`} className="text-primary hover:underline">
                {rotuloCompetenciaPonto(r.competencia)}
              </Link>
            </span>
          ))}
        </p>
      )}
    </>
  )
}
