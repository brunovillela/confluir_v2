import type { Metadata } from "next"
import { ExternalLink, Handshake, MapPin, Phone } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { listarConvenios, type Convenio } from "@/lib/db/filiacao-convenios"
import { formatarTelefone } from "@/lib/formato"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { PortalShell } from "../portal-shell"

export const metadata: Metadata = { title: "Convênios — Portal do Associado" }

/**
 * Os convênios que o sindicato negocia para o associado, por categoria, com
 * as unidades onde ele é atendido. Só os vigentes: convênio encerrado não
 * pode aparecer como promessa.
 */
export default async function PortalConveniosPage() {
  const { filiado, preview, gestorNome } = await requireVisualizacaoPortal()
  const convenios = await listarConvenios({ somenteVigentes: true })

  const porCategoria = new Map<string, Convenio[]>()
  for (const c of convenios) {
    const chave = c.categoria ?? "Outros"
    porCategoria.set(chave, [...(porCategoria.get(chave) ?? []), c])
  }

  return (
    <PortalShell preview={preview ? { filiadoNome: filiado.nome_completo, gestorNome } : undefined}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Convênios</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Descontos e serviços negociados pelo sindicato para você. Apresente sua
          carteira de associado no atendimento.
        </p>
      </div>

      {convenios.length === 0 ? (
        <Card>
          <CardContent>
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center">
              <Handshake className="size-6" />
              <p className="text-sm">Nenhum convênio vigente no momento.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        [...porCategoria.entries()].map(([categoria, lista]) => (
          <section key={categoria} className="grid gap-3">
            <h2 className="text-lg font-semibold">{categoria}</h2>
            {lista.map((c) => (
              <Card key={c.id}>
                <CardHeader>
                  <CardTitle className="text-base">{c.conveniador ?? "Convênio"}</CardTitle>
                  {c.infoSumarias && <CardDescription>{c.infoSumarias}</CardDescription>}
                </CardHeader>
                <CardContent className="grid gap-3">
                  {c.infoVantagens && (
                    <div>
                      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Vantagens</p>
                      <p className="text-sm whitespace-pre-line">{c.infoVantagens}</p>
                    </div>
                  )}
                  {c.unidades.length > 0 && (
                    <div>
                      <p className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wide">
                        Onde ser atendido
                      </p>
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {c.unidades.map((u) => (
                          <li key={u.id} className="rounded-md border p-3 text-sm">
                            <p className="flex flex-wrap items-center gap-1.5 font-medium">
                              {u.nome ?? "Unidade"}
                              {u.online && <Badge variant="outline">online</Badge>}
                              {u.presencial && <Badge variant="outline">presencial</Badge>}
                            </p>
                            {u.endereco && (
                              <p className="text-muted-foreground mt-1 flex items-start gap-1.5 text-xs">
                                <MapPin className="mt-0.5 size-3.5 shrink-0" />
                                <span>{u.endereco}</span>
                              </p>
                            )}
                            {u.telefones.length > 0 && (
                              <p className="text-muted-foreground mt-1 flex items-start gap-1.5 text-xs tabular-nums">
                                <Phone className="mt-0.5 size-3.5 shrink-0" />
                                <span>{u.telefones.map((t) => formatarTelefone(t)).join(" · ")}</span>
                              </p>
                            )}
                            {u.site && (
                              <a
                                href={u.site.startsWith("http") ? u.site : `https://${u.site}`}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 inline-flex items-center gap-1 text-xs underline"
                              >
                                <ExternalLink className="size-3" /> site
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {c.arquivoUrl && (
                    <a href={c.arquivoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline">
                      <ExternalLink className="size-3.5" /> Regras do convênio
                    </a>
                  )}
                </CardContent>
              </Card>
            ))}
          </section>
        ))
      )}
    </PortalShell>
  )
}
