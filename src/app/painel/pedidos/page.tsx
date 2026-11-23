import type { Metadata } from "next"
import { Inbox } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { requireSessaoPainel } from "@/lib/auth"
import { listarFormularios, meusPedidos } from "@/lib/db/pedidos"
import { formatarData } from "@/lib/formato"

import { PedidoForm } from "./pedido-form"

export const metadata: Metadata = { title: "Pedidos — Confluir" }

const COR: Record<string, string> = {
  "A fazer": "text-muted-foreground",
  Fazendo: "border-warning/40 text-warning-fg",
  Feito: "border-success/40 text-success-fg",
}

/**
 * Pedidos a outros setores (Onda 3): qualquer pessoa do painel escolhe o
 * formulário e pede; o pedido vira uma demanda do setor. Meus pedidos mostra
 * em que pé está cada um.
 */
export default async function PedidosPage() {
  const sessao = await requireSessaoPainel()
  const [formularios, meus] = await Promise.all([listarFormularios(true), meusPedidos(String(sessao.usuario.id))])

  return (
    <>
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Inbox className="text-muted-foreground size-5" />
          Pedidos
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Peça a outro setor pelo formulário dele. O pedido vira uma demanda de quem atende, e você é avisado quando ficar pronto.
        </p>
      </div>

      {formularios.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground py-6 text-center text-sm">Nenhum setor recebe pedidos por aqui ainda.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {formularios.map((f) => (
            <Card key={f.id}>
              <CardContent className="grid gap-3">
                <div>
                  <p className="font-medium">{f.nome}</p>
                  {f.descricao && <p className="text-muted-foreground mt-1 text-sm whitespace-pre-line">{f.descricao}</p>}
                  {f.responsavelNome && <p className="text-muted-foreground mt-1 text-xs">Quem atende: {f.responsavelNome}</p>}
                </div>
                <PedidoForm formularioId={f.id} nome={f.nome} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent>
          <p className="mb-3 text-sm font-medium">
            Meus pedidos <span className="text-muted-foreground font-normal">({meus.length})</span>
          </p>
          {meus.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">Você ainda não fez pedidos.</p>
          ) : (
            <ul className="grid divide-y">
              {meus.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">{p.nome}</span>
                    <span className="text-muted-foreground block text-xs">
                      Pedido em {formatarData(p.criadoEm.slice(0, 10))}
                      {p.prazo ? ` · para ${formatarData(p.prazo)}` : ""}
                    </span>
                  </span>
                  <Badge variant="outline" className={COR[p.situacao] ?? ""}>
                    {p.situacao}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
