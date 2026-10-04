import type { Metadata } from "next"
import Link from "next/link"
import { BellOff, Settings2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { avisosDoFiliado, marcarAvisosLidos } from "@/lib/db/portal-avisos"
import { formatarDataHora } from "@/lib/formato"
import { EVENTOS_PORTAL } from "@/lib/portal-avisos-eventos"
import { cn } from "@/lib/utils"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { PortalShell } from "../portal-shell"

export const metadata: Metadata = { title: "Avisos — Portal do Associado" }

const ROTULO = new Map<string, string>(EVENTOS_PORTAL.map((e) => [e.chave, e.rotulo]))

/**
 * Sino do filiado (onda 4, F4). Abrir a lista marca tudo como lido — no
 * portal não há fila de trabalho, só notícias sobre o que é da pessoa.
 */
export default async function PortalAvisosPage() {
  const { filiado, preview, gestorNome } = await requireVisualizacaoPortal()
  const avisos = await avisosDoFiliado(filiado.cpf)
  const naoLidos = avisos.filter((a) => !a.lidaEm).length
  // A gestão visualizando não "lê" pelo filiado.
  if (naoLidos > 0 && !preview) await marcarAvisosLidos(filiado.cpf)

  return (
    <PortalShell preview={preview ? { filiadoNome: filiado.nome_completo, gestorNome } : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Avisos</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            {naoLidos > 0
              ? `${naoLidos} novo${naoLidos === 1 ? "" : "s"} · ${avisos.length} no histórico`
              : avisos.length > 0
                ? `${avisos.length} no histórico`
                : "Reservas, cupons, inscrições e votações: o que é seu chega aqui."}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/portal/avisos/preferencias">
            <Settings2 />
            Preferências de e-mail
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent>
          {avisos.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center">
              <BellOff className="size-6" />
              <p className="text-sm">Nenhum aviso por aqui ainda.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {avisos.map((a) => {
                const novo = !a.lidaEm
                const conteudo = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm", novo ? "font-semibold" : "font-normal")}>{a.texto}</span>
                      <span className="text-muted-foreground mt-0.5 block text-xs">
                        {ROTULO.get(a.evento) ?? a.evento} · {formatarDataHora(a.criadoEm)}
                      </span>
                    </span>
                    {novo && <Badge className="bg-primary text-primary-foreground shrink-0">Novo</Badge>}
                  </>
                )
                const classes = cn(
                  "-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-3",
                  novo && "bg-primary/5 border-l-primary border-l-2",
                  a.link && "hover:bg-muted/40 transition-colors"
                )
                return (
                  <li key={a.id}>
                    {a.link ? (
                      <Link href={a.link} className={classes}>
                        {conteudo}
                      </Link>
                    ) : (
                      <div className={classes}>{conteudo}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </PortalShell>
  )
}
