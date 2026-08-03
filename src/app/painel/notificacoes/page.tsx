import type { Metadata } from "next"
import Link from "next/link"
import { BellOff } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Paginacao } from "@/components/paginacao"
import { requireSessaoPainel } from "@/lib/auth"
import { listarNotificacoes } from "@/lib/db/notificacoes"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { cn } from "@/lib/utils"

import { MarcarTodasBotao } from "./marcar-todas"

export const metadata: Metadata = { title: "Notificações — Confluir" }

export default async function NotificacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string; porPagina?: string }>
}) {
  const sessao = await requireSessaoPainel()
  const notificacoes = await listarNotificacoes(sessao.usuario.id, 1000)
  const naoLidas = notificacoes.filter((n) => n.notificado !== true).length

  // Página dedicada à lista: 30 por página.
  const paginacao = lerPaginacao(await searchParams, 30)
  const paginaAtual = paginar(notificacoes, paginacao)

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notificações</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            {naoLidas > 0
              ? `${naoLidas} não lida${naoLidas === 1 ? "" : "s"} · ${notificacoes.length} no histórico`
              : `${notificacoes.length} no histórico`}
          </p>
        </div>
        {naoLidas > 0 && <MarcarTodasBotao />}
      </div>

      <Card>
        <CardContent>
          {notificacoes.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center">
              <BellOff className="size-6" />
              <p className="text-sm">Nenhuma notificação por aqui.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {paginaAtual.linhas.map((n) => {
                const lida = n.notificado === true
                return (
                  <li key={n.id}>
                    <Link
                      href={`/painel/notificacoes/abrir/${n.id}`}
                      className={cn(
                        "hover:bg-muted/40 -mx-2 flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-3 transition-colors",
                        // Não lida ganha destaque: barra da marca + fundo suave.
                        !lida && "bg-primary/5 border-l-primary border-l-2"
                      )}
                    >
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm",
                          lida ? "font-normal" : "font-semibold"
                        )}
                      >
                        {n.notificacao ?? "(sem texto)"}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {!lida && (
                          <Badge className="bg-primary text-primary-foreground">
                            Nova
                          </Badge>
                        )}
                        <span className="text-muted-foreground text-xs">
                          {n.created_at
                            ? formatarDataHora(n.created_at)
                            : formatarData(n.notificacao_data)}
                        </span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Paginacao
        total={paginaAtual.total}
        pagina={paginaAtual.pagina}
        totalPaginas={paginaAtual.totalPaginas}
        porPagina={paginacao.porPagina}
        padrao={30}
      />
    </>
  )
}
