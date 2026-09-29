import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, FileSpreadsheet, Layers } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ROTULO_TEMA, TEMAS_CLAUSULA, temaClausula } from "@/lib/acordos-constantes"
import { agruparPorAssunto, valoresCitados } from "@/lib/acordos-tema"
import { requirePermissao } from "@/lib/auth"
import { acordosParaTema, clausulasDoTema, type ClausulaTema } from "@/lib/db/acordos-tema"
import { formatarData } from "@/lib/formato"

export const metadata: Metadata = { title: "Comparar por tema — Confluir" }

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const MAX_ACORDOS = 8

const MOSTRAR = {
  todas: "Todos os assuntos",
  comum: "Só o que mais de um acordo tem",
  exclusivas: "Só o que um acordo tem",
} as const
type Mostrar = keyof typeof MOSTRAR

function rotulo(c: ClausulaTema): string {
  return [c.numero ? `Cl. ${c.numero}` : null, c.titulo].filter(Boolean).join(" · ") || "(sem título)"
}

export default async function TemasPage({
  searchParams,
}: {
  searchParams: Promise<{ tema?: string; termo?: string; a?: string | string[]; mostrar?: string }>
}) {
  const sessao = await requirePermissao("acordos_coletivos", ["negociacoes"])
  const sp = await searchParams
  const disponiveis = await acordosParaTema(sessao.permissoes)

  const tema = temaClausula(sp.tema)
  const termo = (sp.termo ?? "").trim().slice(0, 80)
  const pedidos = (Array.isArray(sp.a) ? sp.a : sp.a ? [sp.a] : []).filter((id) => disponiveis.some((d) => d.id === id))
  // Sem escolha: os vigentes (até o limite), que é a pergunta mais comum.
  const escolhidos = (
    pedidos.length ? pedidos : disponiveis.filter((d) => d.situacao === "vigente").map((d) => d.id)
  ).slice(0, MAX_ACORDOS)
  const mostrar: Mostrar = sp.mostrar && sp.mostrar in MOSTRAR ? (sp.mostrar as Mostrar) : "todas"
  const pronto = Boolean(tema || termo) && escolhidos.length >= 2

  const colunas = escolhidos.map((id) => disponiveis.find((d) => d.id === id)!)
  const porAcordo = pronto ? await clausulasDoTema(escolhidos, { tema, termo }) : new Map<string, ClausulaTema[]>()
  const todas = pronto
    ? agruparPorAssunto(escolhidos.map((id) => ({ acordoId: id, clausulas: porAcordo.get(id) ?? [] })))
    : []
  const linhas = todas.filter((l) =>
    mostrar === "comum" ? l.porAcordo.size > 1 : mostrar === "exclusivas" ? l.porAcordo.size === 1 : true
  )

  const qs = new URLSearchParams()
  if (tema) qs.set("tema", tema)
  if (termo) qs.set("termo", termo)
  for (const id of escolhidos) qs.append("a", id)
  const link = (m: Mostrar) => {
    const q = new URLSearchParams(qs)
    if (m !== "todas") q.set("mostrar", m)
    return `/painel/representacao/acordos/temas?${q.toString()}`
  }

  return (
    <>
      <RotuloTrilha valores={{ temas: "Comparar por tema" }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/representacao/acordos">
            <ArrowLeft />
            Acordos coletivos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Comparar por tema</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          O mesmo assunto em acordos de empresas diferentes, lado a lado — com os valores (%, R$, prazos) em destaque.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">O que comparar</CardTitle>
          <CardDescription>
            Escolha um tema, palavras (ex.: &quot;sobreaviso&quot;, &quot;hora extra&quot;) ou os dois, e de 2 a{" "}
            {MAX_ACORDOS} acordos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/painel/representacao/acordos/temas" className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label htmlFor="tema" className="text-sm font-medium">
                  Tema
                </label>
                <select id="tema" name="tema" defaultValue={tema ?? ""} className={SELECT}>
                  <option value="">Qualquer tema</option>
                  {TEMAS_CLAUSULA.map((t) => (
                    <option key={t.chave} value={t.chave}>
                      {t.rotulo}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="termo" className="text-sm font-medium">
                  Palavras no título ou no texto
                </label>
                <input
                  id="termo"
                  name="termo"
                  type="search"
                  defaultValue={termo}
                  placeholder="Ex.: sobreaviso"
                  className={SELECT}
                />
              </div>
            </div>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Acordos</legend>
              {disponiveis.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Nenhum acordo com cláusulas. Extraia as cláusulas do PDF na página de cada acordo.
                </p>
              ) : (
                <div className="grid max-h-64 gap-1.5 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">
                  {disponiveis.map((d) => (
                    <label key={d.id} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="a"
                        value={d.id}
                        defaultChecked={escolhidos.includes(d.id)}
                        className="mt-0.5 size-4"
                      />
                      <span>
                        {d.sigiloso ? "[negociação] " : ""}
                        {d.titulo}
                        <span className="text-muted-foreground block text-xs">
                          {[d.empresas.join(", "), d.situacao === "vigente" ? "vigente" : d.situacao === "arquivado" ? "arquivado" : null, `${d.clausulas} cláusulas`]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <div>
              <Button type="submit">
                <Layers />
                Comparar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {!pronto && (tema || termo || pedidos.length > 0) && (
        <Alert variant="warning">
          <AlertDescription>
            {escolhidos.length < 2 ? "Escolha pelo menos dois acordos." : "Escolha um tema ou digite palavras."}
          </AlertDescription>
        </Alert>
      )}

      {pronto && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {(Object.keys(MOSTRAR) as Mostrar[]).map((m) => (
                <Button key={m} variant={mostrar === m ? "default" : "outline"} size="sm" asChild>
                  <Link href={link(m)}>{MOSTRAR[m]}</Link>
                </Button>
              ))}
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href={`/painel/representacao/acordos/temas/planilha?${qs.toString()}`}>
                <FileSpreadsheet />
                Planilha
              </a>
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            {linhas.length} assunto(s){tema ? ` · ${ROTULO_TEMA[tema]}` : ""}
            {termo ? ` · "${termo}"` : ""}. O alinhamento é automático (título e texto parecidos) — empresas que
            chamam o mesmo direito por nomes diferentes podem aparecer em linhas separadas.
          </p>

          {linhas.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">Nenhuma cláusula encontrada.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-max border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/40">
                    {colunas.map((c) => (
                      <th key={c.id} className="w-72 max-w-72 border-b p-3 text-left align-top font-medium">
                        <Link href={`/painel/representacao/acordos/${c.id}`} className="text-primary hover:underline">
                          {c.titulo}
                        </Link>
                        <span className="text-muted-foreground block text-xs font-normal">
                          {c.empresas.join(", ") || "—"}
                          {c.vigenciaFim ? ` · até ${formatarData(c.vigenciaFim)}` : ""}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      {colunas.map((col) => {
                        const c = l.porAcordo.get(col.id)
                        if (!c) {
                          return (
                            <td key={col.id} className="text-muted-foreground w-72 max-w-72 p-3 align-top text-xs italic">
                              Não tem
                            </td>
                          )
                        }
                        const valores = valoresCitados(c.texto)
                        return (
                          <td key={col.id} className="w-72 max-w-72 p-3 align-top">
                            <p className="font-medium">{rotulo(c)}</p>
                            {valores.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {valores.map((v) => (
                                  <Badge key={v} variant="secondary" className="text-xs font-normal">
                                    {v}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            <details className="mt-1">
                              <summary className="text-muted-foreground cursor-pointer text-xs">Ver o texto</summary>
                              <p className="bg-muted/30 mt-1 max-h-72 overflow-auto rounded border p-2 text-xs leading-relaxed whitespace-pre-wrap">
                                {c.texto}
                              </p>
                            </details>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  )
}
