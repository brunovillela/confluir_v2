"use client"

import { useActionState, useEffect, useState } from "react"
import Link from "next/link"
import { CircleAlert, CircleCheck, Copy, Landmark, Loader2, MessageCircle, Search, Send } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { confirmar } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { SelectNativo } from "@/components/ui/select-nativo"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { rotuloTipoReembolso, TIPOS_REEMBOLSO } from "@/lib/reembolsos-tipos"

import {
  conferirLoteAction,
  lancarLoteParteAction,
  pedirDadosLoteAction,
  type EstadoLote,
  type ResultadoPedidoLote,
} from "../actions"

const PARTE = 10

type Resultado = { id?: string; erro?: string }

export function LoteForm({ hoje, projetos }: { hoje: string; projetos: { id: string; titulo: string }[] }) {
  const [estado, formAction, conferindo] = useActionState(conferirLoteAction, {} as EstadoLote)
  const envio = useEnvioFormulario(formAction, estado, { manter: true })

  // Lançamento: resultado por linha da lista; `feito` = partes concluídas.
  const [resultados, setResultados] = useState<Record<number, Resultado>>({})
  const [lancando, setLancando] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [conferenciaAtual, setConferenciaAtual] = useState(estado)
  if (estado !== conferenciaAtual) {
    // Nova conferência: o resultado do lançamento anterior não vale mais.
    setConferenciaAtual(estado)
    setResultados({})
    setProgresso(0)
  }

  const linhas = estado.linhas ?? []
  const prontas = linhas.filter((l) => !l.problema && l.filiadoId && l.valor)
  const comProblema = linhas.filter((l) => l.problema)
  const semContaSemPedido = linhas.filter((l) => l.semConta && !l.pedidoEm && l.filiadoId)
  const totalProntas = prontas.reduce((t, l) => t + (l.valor ?? 0), 0)
  const lancadas = Object.values(resultados).filter((r) => r.id).length
  const falhas = Object.values(resultados).filter((r) => r.erro).length
  const terminou = prontas.length > 0 && lancadas + falhas === prontas.length

  // Sair da página no meio do lançamento deixaria o lote pela metade.
  useEffect(() => {
    if (!lancando) return
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", aviso)
    return () => window.removeEventListener("beforeunload", aviso)
  }, [lancando])

  async function lancar() {
    if (!estado.comum || prontas.length === 0) return
    const ok = await confirmar({
      titulo: `Lançar ${prontas.length} reembolso(s)?`,
      descricao: `Total de ${formatarMoeda(totalProntas)}. Cada um gera a ordem de pagamento em autorização e um registro no prontuário do filiado. As ${comProblema.length} linha(s) com problema ficam de fora.`,
      confirmar: "Lançar",
    })
    if (!ok) return
    setLancando(true)
    const pendentes = prontas.filter((l) => !resultados[l.linha]?.id)
    try {
      for (let i = 0; i < pendentes.length; i += PARTE) {
        const parte = pendentes.slice(i, i + PARTE)
        let saida: Awaited<ReturnType<typeof lancarLoteParteAction>>
        try {
          saida = await lancarLoteParteAction(
            estado.comum,
            parte.map((l) => ({ linha: l.linha, filiadoId: l.filiadoId as string, valor: l.valor as number }))
          )
        } catch {
          saida = parte.map((l) => ({ linha: l.linha, erro: "Falha de comunicação — tente lançar de novo." }))
        }
        setResultados((r) => {
          const novo = { ...r }
          for (const s of saida) novo[s.linha] = s.id ? { id: s.id } : { erro: s.erro }
          return novo
        })
        setProgresso(Math.min(100, Math.round(((i + parte.length) / pendentes.length) * 100)))
      }
    } finally {
      setLancando(false)
    }
  }

  return (
    <div className="grid gap-4">
      <form action={formAction} {...envio} className="grid gap-4">
        {estado.erro && (
          <Alert variant="destructive">
            <AlertDescription>{estado.erro}</AlertDescription>
          </Alert>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">O que vale para todos</CardTitle>
            <CardDescription>Tipo, data, justificativa e projeto entram iguais em cada reembolso do lote.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="tipo">Tipo *</Label>
              <SelectNativo id="tipo" name="tipo" required defaultValue="">
                <option value="" disabled>
                  Escolha o tipo
                </option>
                {TIPOS_REEMBOLSO.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.rotulo}
                  </option>
                ))}
              </SelectNativo>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="data">Data de referência *</Label>
              <Input id="data" name="data" type="date" defaultValue={hoje} required />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="justificativa">Justificativa *</Label>
              <Textarea
                id="justificativa"
                name="justificativa"
                rows={2}
                required
                placeholder="Ex.: 25% do desconto salarial da greve de março"
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="projeto_id">Projeto</Label>
              <SelectNativo id="projeto_id" name="projeto_id" defaultValue="sem_projeto">
                <option value="sem_projeto">Sem projeto</option>
                {projetos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.titulo}
                  </option>
                ))}
              </SelectNativo>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Os filiados</CardTitle>
            <CardDescription>
              Uma linha por filiado com o CPF e o valor — copie as duas colunas do Excel e cole aqui, ou envie a
              planilha (.xlsx ou .csv). Outras colunas, como o nome, são ignoradas; o valor é o último número da
              linha.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="lista">Lista colada</Label>
              <Textarea
                id="lista"
                name="lista"
                rows={8}
                className="font-mono text-xs"
                placeholder={"123.456.789-09\t1.234,56\n987.654.321-00\t980,10"}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="planilha">Ou a planilha</Label>
              <Input id="planilha" name="planilha" type="file" accept=".xlsx,.xls,.csv" />
              <p className="text-muted-foreground text-xs">Com planilha, a lista colada é ignorada.</p>
            </div>
            <div className="flex justify-end">
              <Button type="submit" variant="secondary" disabled={conferindo || lancando}>
                {conferindo ? <Loader2 className="animate-spin" /> : <Search />}
                Conferir lista
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {estado.comum && linhas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conferência</CardTitle>
            <CardDescription>
              {rotuloTipoReembolso(estado.comum.tipo)} · {formatarData(estado.comum.data)} ·{" "}
              {estado.comum.justificativa}
              {estado.ignoradas ? ` · ${estado.ignoradas} linha(s) sem CPF ignoradas (cabeçalho, títulos)` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">
                {prontas.length} pronta(s) · {formatarMoeda(totalProntas)}
              </Badge>
              {comProblema.length > 0 && <Badge variant="warning">{comProblema.length} com problema</Badge>}
              {lancadas > 0 && <Badge variant="success">{lancadas} lançada(s)</Badge>}
              {falhas > 0 && <Badge variant="destructive">{falhas} falharam</Badge>}
            </div>

            {semContaSemPedido.length > 0 && (
              <PedirDadosLote
                key={semContaSemPedido.map((l) => l.filiadoId).join(",")}
                filiados={semContaSemPedido.map((l) => ({ id: l.filiadoId as string, nome: l.nome }))}
              />
            )}

            {(lancando || progresso > 0) && <Progress value={progresso} />}

            {terminou ? (
              <Alert>
                <AlertDescription>
                  Lote concluído: {lancadas} reembolso(s) lançado(s)
                  {falhas ? `, ${falhas} falharam (veja na tabela; dá para lançar de novo só os que falharam)` : ""}.{" "}
                  <Link href="/painel/filiados/reembolsos" className="underline">
                    Ver na lista
                  </Link>
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={lancar}
                disabled={lancando || conferindo || prontas.length === 0 || lancadas === prontas.length}
              >
                {lancando ? <Loader2 className="animate-spin" /> : <Send />}
                {falhas && !lancando ? `Lançar de novo os ${falhas} que falharam` : `Lançar ${prontas.length - lancadas} reembolso(s)`}
              </Button>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Linha</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>Filiado</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l) => {
                    const r = resultados[l.linha]
                    return (
                      <TableRow key={l.linha}>
                        <TableCell className="text-muted-foreground tabular-nums">{l.linha}</TableCell>
                        <TableCell className="tabular-nums whitespace-nowrap">{l.cpf}</TableCell>
                        <TableCell>
                          {l.filiadoId ? (
                            <Link href={`/painel/filiados/${l.filiadoId}`} className="hover:underline" target="_blank">
                              {l.nome ?? "—"}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                          {l.valor != null ? formatarMoeda(l.valor) : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r?.id ? (
                            <Link
                              href={`/painel/filiados/reembolsos/${r.id}`}
                              className="text-success-fg inline-flex items-center gap-1 hover:underline"
                              target="_blank"
                            >
                              <CircleCheck className="size-3.5" />
                              Lançado
                            </Link>
                          ) : r?.erro ? (
                            <span className="text-destructive inline-flex items-center gap-1">
                              <CircleAlert className="size-3.5 shrink-0" />
                              {r.erro}
                            </span>
                          ) : l.problema ? (
                            <span className="text-warning-fg inline-flex items-center gap-1">
                              <CircleAlert className="size-3.5 shrink-0" />
                              {l.problema}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Pronta</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/**
 * Pede os dados bancários a quem está sem chave Pix nem conta: por e-mail
 * quando o cadastro tem um; sem e-mail, mostra o link para copiar ou mandar
 * pelo WhatsApp. Depois que responderem, basta conferir a lista de novo.
 */
function PedirDadosLote({ filiados }: { filiados: { id: string; nome: string | null }[] }) {
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoPedidoLote[] | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)

  async function pedir() {
    const ok = await confirmar({
      titulo: `Pedir os dados bancários a ${filiados.length} filiado(s)?`,
      descricao:
        "Cada um recebe um link de uso único, válido por 7 dias, para informar a chave Pix ou a conta no próprio CPF. Quem tem e-mail no cadastro recebe por e-mail; para os outros, o link aparece aqui para você mandar pelo WhatsApp.",
      confirmar: "Pedir",
    })
    if (!ok) return
    setEnviando(true)
    try {
      setResultado(await pedirDadosLoteAction(filiados.map((f) => f.id)))
    } catch {
      setResultado(filiados.map((f) => ({ filiadoId: f.id, nome: f.nome, situacao: "erro", erro: "Falha de comunicação." })))
    } finally {
      setEnviando(false)
    }
  }

  async function copiar(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(link)
    } catch {
      window.prompt("Copie o link:", link)
    }
  }

  if (!resultado) {
    return (
      <div className="border-warning/40 bg-warning/5 flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
        <span>
          <strong>{filiados.length}</strong> filiado(s) sem chave Pix nem conta — a ordem não nasce sem o destino.
        </span>
        <Button type="button" size="sm" variant="outline" onClick={pedir} disabled={enviando}>
          {enviando ? <Loader2 className="animate-spin" /> : <Landmark />}
          Pedir dados bancários
        </Button>
      </div>
    )
  }

  const porEmail = resultado.filter((r) => r.situacao === "email")
  const jaPedidos = resultado.filter((r) => r.situacao === "ja_pedido")
  const aMao = resultado.filter((r) => r.situacao === "link")
  const erros = resultado.filter((r) => r.situacao === "erro")
  const mensagem = (nome: string | null, link: string) =>
    `Olá${nome ? `, ${nome.split(" ")[0]}` : ""}. Para receber o seu reembolso, informe a sua chave Pix ou conta bancária neste link (vale por 7 dias): ${link}`

  return (
    <div className="border-border grid gap-3 rounded-md border p-3 text-sm">
      <p>
        Pedidos de dados bancários: <strong>{porEmail.length}</strong> por e-mail
        {jaPedidos.length > 0 && <>, {jaPedidos.length} já tinham pedido em aberto</>}
        {aMao.length > 0 && <>, {aMao.length} sem e-mail (mande o link abaixo)</>}
        {erros.length > 0 && <>, {erros.length} com erro</>}. Quando responderem, confira a lista de novo.
      </p>
      {aMao.length > 0 && (
        <ul className="grid gap-2">
          {aMao.map((r) => (
            <li key={r.filiadoId} className="flex flex-wrap items-center gap-2">
              <span className="min-w-48 font-medium">{r.nome ?? "Filiado"}</span>
              {r.erro && <span className="text-warning-fg text-xs">{r.erro}</span>}
              <Button type="button" size="sm" variant="outline" onClick={() => copiar(r.link as string)}>
                <Copy />
                {copiado === r.link ? "Copiado" : "Copiar link"}
              </Button>
              {r.whatsapp && (
                <Button asChild size="sm" variant="outline">
                  <a
                    href={`https://wa.me/${r.whatsapp}?text=${encodeURIComponent(mensagem(r.nome, r.link as string))}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle />
                    WhatsApp
                  </a>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {erros.length > 0 && (
        <ul className="text-destructive grid gap-1 text-xs">
          {erros.map((r) => (
            <li key={r.filiadoId}>
              {r.nome ?? "Filiado"}: {r.erro}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
