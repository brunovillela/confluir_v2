import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, BookOpen, Plug } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { listarChavesApi } from "@/lib/api-publica"
import { requirePermissao } from "@/lib/auth"
import { listarEntregas, listarWebhooks } from "@/lib/db/webhooks"
import { formatarDataHora } from "@/lib/formato"
import { origemAtual } from "@/lib/tenant-url"

import { ExcluirWebhookBotao, NovaChaveForm, ReenviarEntregaBotao, RevogarChaveBotao, TestarWebhooksBotao, WebhookForm } from "./forms"

export const metadata: Metadata = { title: "API e webhooks — Confluir" }

/** Chaves de leitura, webhooks de saída e o log de entregas (onda 5, A9). */
export default async function ApiPage({ searchParams }: { searchParams: Promise<{ editar?: string; novo?: string }> }) {
  await requirePermissao("configuracoes")
  const sp = await searchParams
  const [{ disponivel, chaves }, { webhooks }, entregas, origem] = await Promise.all([listarChavesApi(), listarWebhooks(), listarEntregas(undefined, 50), origemAtual()])
  const editando = sp.editar ? (webhooks.find((w) => w.id === sp.editar) ?? null) : null
  const nomeWebhook = new Map(webhooks.map((w) => [w.id, w.url]))

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
            <Link href="/painel/institucional">
              <ArrowLeft />
              Institucional
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Plug className="text-muted-foreground size-5" />
            <h1 className="text-2xl font-semibold tracking-tight">API e webhooks</h1>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            Chaves para o contador, o Power BI ou o site lerem os dados em <code className="font-mono">{origem}/api/v1/…</code>, e webhooks que avisam outros sistemas quando algo acontece aqui.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/painel/institucional/api/docs">
            <BookOpen />
            Documentação
          </Link>
        </Button>
      </div>

      {!disponivel ? (
        <Alert>
          <AlertDescription>Falta rodar o SQL supabase/api-webhooks.sql.</AlertDescription>
        </Alert>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Chaves de API</CardTitle>
              <CardDescription className="text-xs">Só leitura. Cada chave vale para esta entidade e só funciona neste endereço. Revogue quando a pessoa ou o sistema não precisar mais.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <NovaChaveForm />
              {chaves.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Prefixo</TableHead>
                      <TableHead>Criada em</TableHead>
                      <TableHead>Último uso</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {chaves.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.nome}</TableCell>
                        <TableCell className="font-mono text-xs">cf_{c.prefixo}_…</TableCell>
                        <TableCell className="text-muted-foreground">{formatarDataHora(c.criadaEm)}</TableCell>
                        <TableCell className="text-muted-foreground">{c.ultimoUsoEm ? formatarDataHora(c.ultimoUsoEm) : "nunca"}</TableCell>
                        <TableCell>{c.revogadaEm ? <Badge variant="outline">revogada</Badge> : <Badge variant="success">ativa</Badge>}</TableCell>
                        <TableCell>{!c.revogadaEm && <RevogarChaveBotao chaveId={c.id} nome={c.nome} />}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Webhooks</CardTitle>
                  <CardDescription className="text-xs">Um POST JSON por evento, assinado com HMAC-SHA256 do corpo (cabeçalho X-Confluir-Assinatura). Falhou? Reenviamos em 1 min, 10 min, 1 h e 6 h.</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <TestarWebhooksBotao />
                  {!sp.novo && !editando && (
                    <Button size="sm" asChild>
                      <Link href="/painel/institucional/api?novo=1">Novo webhook</Link>
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              {(sp.novo || editando) && (
                <div className="rounded-lg border p-4">
                  <p className="mb-3 text-sm font-medium">{editando ? "Editar webhook" : "Novo webhook"}</p>
                  <WebhookForm webhook={editando} />
                </div>
              )}
              {webhooks.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nenhum webhook cadastrado.</p>
              ) : (
                <ul className="divide-y">
                  {webhooks.map((w) => (
                    <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-xs">{w.url}</span>
                        <span className="text-muted-foreground block text-xs">
                          {w.descricao ? `${w.descricao} · ` : ""}
                          {w.eventos.join(", ")}
                          {w.ultimoSucessoEm ? ` · último sucesso ${formatarDataHora(w.ultimoSucessoEm)}` : ""}
                          {w.falhasSeguidas > 0 ? ` · ${w.falhasSeguidas} falha(s) seguida(s): ${w.ultimoErro ?? ""}` : ""}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge variant={!w.ativo ? "outline" : w.falhasSeguidas > 0 ? "warning" : "success"}>{!w.ativo ? "inativo" : w.falhasSeguidas > 0 ? "com falhas" : "ativo"}</Badge>
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/painel/institucional/api?editar=${w.id}`}>Editar</Link>
                        </Button>
                        <ExcluirWebhookBotao webhookId={w.id} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {entregas.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Entregas recentes</CardTitle>
                <CardDescription className="text-xs">As 50 últimas, todas as URLs.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quando</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>Webhook</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead>Tentativas</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entregas.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-muted-foreground whitespace-nowrap">{formatarDataHora(e.criadoEm)}</TableCell>
                        <TableCell className="font-mono text-xs">{e.evento}</TableCell>
                        <TableCell className="max-w-48 truncate font-mono text-xs">{nomeWebhook.get(e.webhookId) ?? e.webhookId}</TableCell>
                        <TableCell>
                          <Badge variant={e.situacao === "entregue" ? "success" : e.situacao === "falhou" ? "destructive" : "secondary"}>{e.situacao}</Badge>
                          {e.ultimoErro && <span className="text-muted-foreground block max-w-56 truncate text-xs">{e.ultimoErro}</span>}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {e.tentativas}
                          {e.ultimoStatus ? ` · HTTP ${e.ultimoStatus}` : ""}
                        </TableCell>
                        <TableCell>{e.situacao !== "entregue" && <ReenviarEntregaBotao entregaId={e.id} />}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </>
  )
}
