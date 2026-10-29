"use client"

import { Fragment, useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronRight, FileSearch, Loader2, RotateCcw, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { confirmar } from "@/components/ui/confirmacao"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { FaixasHE } from "@/lib/faixas-he"
import { formatarMin, type Apuracao } from "@/lib/ponto-apuracao"
import { cn } from "@/lib/utils"

import { aplicarItensAction, associarFuncionarioAction, descartarItemAction, lerImportacaoAction, reapurarAction } from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-8 w-full max-w-64 rounded-md border px-2 text-xs shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type ItemTela = {
  id: string
  paginas: number[]
  nomeLido: string | null
  cpfLido: string | null
  funcionarioId: string | null
  funcionarioNome: string | null
  situacao: "pendente" | "lido" | "erro" | "aplicado" | "descartado"
  erro: string | null
  apuracao: Apuracao | null
  /** Batidas de cada dia (da leitura), para o detalhe. */
  marcacoes: Record<string, string[]>
  bloqueio: string | null
  registroId: string | null
}

const SITUACAO: Record<ItemTela["situacao"], { rotulo: string; classe: string }> = {
  pendente: { rotulo: "A ler", classe: "text-muted-foreground" },
  lido: { rotulo: "Lido", classe: "border-info/40 text-info-fg" },
  erro: { rotulo: "Erro na leitura", classe: "border-destructive/40 text-destructive" },
  aplicado: { rotulo: "Aplicado", classe: "border-success/40 text-success-fg" },
  descartado: { rotulo: "Descartado", classe: "text-muted-foreground" },
}

const TIPO = { util: "útil", sabado: "sábado", domingo: "domingo", feriado: "feriado" } as const
const hm = (min: number) => formatarMin(min).replace(/^\+/, "")

/** Lê os funcionários pendentes com a IA, em lotes, sozinho ao abrir a página. */
export function LeitorImportacao({ remessaId, importacaoId, pendentes }: { remessaId: string; importacaoId: string; pendentes: number }) {
  const router = useRouter()
  const [rodando, iniciar] = useTransition()
  const [andamento, setAndamento] = useState<string | null>(null)
  const comecou = useRef(false)

  const ler = () =>
    iniciar(async () => {
      let feitos = 0
      for (let volta = 0; volta < 30; volta++) {
        setAndamento(`Lendo os cartões com a IA… ${feitos} de ${pendentes}`)
        const r = await lerImportacaoAction(remessaId, importacaoId)
        feitos += r.lidos + r.erros
        router.refresh()
        if (!r.faltam || r.lidos + r.erros === 0) break
      }
      setAndamento(null)
    })

  useEffect(() => {
    if (pendentes > 0 && !comecou.current) {
      comecou.current = true
      ler()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- começa uma vez ao abrir
  }, [])

  if (pendentes === 0 && !rodando) return null
  return (
    <Alert className="border-info/40">
      <AlertDescription className="flex flex-wrap items-center gap-3">
        {rodando ? <Loader2 className="size-4 animate-spin" /> : <FileSearch className="size-4" />}
        <span>{andamento ?? `${pendentes} cartão(ões) a ler.`}</span>
        {!rodando && (
          <Button size="sm" variant="outline" onClick={ler}>
            Ler agora
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

export function ItensImportacao({
  remessaId,
  importacaoId,
  itens,
  funcionarios,
  faixas,
}: {
  remessaId: string
  importacaoId: string
  itens: ItemTela[]
  funcionarios: { usuarioId: string; nome: string }[]
  faixas: FaixasHE
}) {
  const router = useRouter()
  const aplicaveis = itens.filter((i) => !i.bloqueio).map((i) => i.id)
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(aplicaveis))
  const [aberto, setAberto] = useState<string | null>(null)
  const [ocupado, iniciar] = useTransition()
  const [resultado, setResultado] = useState<{ ok?: string; erro?: string; pulados?: string[] } | null>(null)

  // Item que fica aplicável depois (funcionário escolhido) entra marcado.
  const chave = aplicaveis.join(",")
  const [chaveVista, setChaveVista] = useState(chave)
  if (chave !== chaveVista) {
    setChaveVista(chave)
    setMarcados((m) => new Set([...[...m].filter((id) => aplicaveis.includes(id)), ...aplicaveis.filter((id) => !chaveVista.includes(id))]))
  }

  const selecionados = [...marcados].filter((id) => aplicaveis.includes(id))
  const alternar = (id: string) =>
    setMarcados((m) => {
      const n = new Set(m)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  // A confirmação vem antes da transição: dentro dela, o diálogo só seria
  // desenhado quando a transição acabasse.
  const aplicar = async () => {
    const ok = await confirmar({
      titulo: `Aplicar ${selecionados.length} funcionário(s) à remessa?`,
      descricao:
        "Cria ou atualiza o registro de cada um com as horas realizadas apuradas e o cartão dele como espelho. Horas pagas e saldo da remessa anterior ficam como estão; o saldo remanescente é refeito.",
      confirmar: "Aplicar",
    })
    if (!ok) return
    iniciar(async () => {
      const r = await aplicarItensAction(remessaId, importacaoId, selecionados)
      setResultado(r.erro ? { erro: r.erro } : { ok: `${r.aplicados} registro(s) aplicado(s) à remessa.`, pulados: r.pulados })
      router.refresh()
    })
  }

  const reapurar = () =>
    iniciar(async () => {
      await reapurarAction(remessaId, importacaoId)
      setResultado({ ok: "Horas reapuradas com as regras atuais." })
      router.refresh()
    })

  return (
    <div className="grid gap-3">
      {resultado?.erro && (
        <Alert variant="destructive">
          <AlertDescription>{resultado.erro}</AlertDescription>
        </Alert>
      )}
      {resultado?.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            {resultado.ok}
            {resultado.pulados && resultado.pulados.length > 0 && (
              <ul className="text-muted-foreground mt-1 list-disc pl-5 text-xs">
                {resultado.pulados.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">
          {selecionados.length} de {aplicaveis.length} pronto(s) para aplicar marcado(s)
        </span>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={reapurar} disabled={ocupado}>
            <RotateCcw />
            Reapurar com as regras atuais
          </Button>
          <Button size="sm" onClick={aplicar} disabled={ocupado || selecionados.length === 0}>
            {ocupado && <Loader2 className="animate-spin" />}
            Aplicar à remessa ({selecionados.length})
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-8" />
              <TableHead>Pág.</TableHead>
              <TableHead>Funcionário</TableHead>
              <TableHead className="text-right">A mais ({faixas["70"]})</TableHead>
              <TableHead className="text-right">A mais ({faixas["100"]})</TableHead>
              <TableHead className="text-right">Negativas</TableHead>
              <TableHead className="text-right">Realiz. {faixas["70"]}</TableHead>
              <TableHead className="text-right">Realiz. {faixas["100"]}</TableHead>
              <TableHead className="text-right">Relatório</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((i) => {
              const a = i.apuracao
              const podeEditar = i.situacao !== "aplicado"
              const divergente =
                a && a.totalRelatorioMin !== null && Math.abs(a.totalRelatorioMin - (a.positivosFaixa1Min + a.positivosFaixa2Min - a.negativosMin)) > 1
              return (
                <Fragment key={i.id}>
                  <TableRow className={cn(i.situacao === "descartado" && "opacity-60")}>
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label="Aplicar este funcionário"
                        checked={!i.bloqueio && marcados.has(i.id)}
                        disabled={Boolean(i.bloqueio) || ocupado}
                        onChange={() => alternar(i.id)}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{i.paginas.join(", ")}</TableCell>
                    <TableCell className="min-w-56">
                      {podeEditar ? (
                        <select
                          aria-label="Funcionário do cadastro"
                          className={SELECT}
                          value={i.funcionarioId ?? ""}
                          disabled={ocupado}
                          onChange={(e) =>
                            iniciar(async () => {
                              await associarFuncionarioAction(remessaId, importacaoId, i.id, e.target.value)
                              router.refresh()
                            })
                          }
                        >
                          <option value="">— escolha o funcionário —</option>
                          {funcionarios.map((f) => (
                            <option key={f.usuarioId} value={f.usuarioId}>
                              {f.nome}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="font-medium">{i.funcionarioNome}</span>
                      )}
                      {!i.funcionarioId && (
                        <span className="text-warning-fg block text-xs">
                          Não achado no cadastro{i.nomeLido ? `: ${i.nomeLido}` : ""}{i.cpfLido ? ` (CPF ${i.cpfLido.replace(/^(\d{3})\d{6}(\d{2})$/, "$1.***.***-$2")})` : ""}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{a ? hm(a.positivosFaixa1Min) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{a ? hm(a.positivosFaixa2Min) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{a ? `-${hm(a.negativosMin)}` : "—"}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{a ? formatarMin(a.realizadasFaixa1Min) : "—"}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{a ? formatarMin(a.realizadasFaixa2Min) : "—"}</TableCell>
                    <TableCell className={cn("text-right text-xs tabular-nums", divergente ? "text-warning-fg" : "text-muted-foreground")}>
                      {a?.totalRelatorioMin !== null && a?.totalRelatorioMin !== undefined ? formatarMin(a.totalRelatorioMin) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={SITUACAO[i.situacao].classe}>
                        {SITUACAO[i.situacao].rotulo}
                      </Badge>
                      {i.bloqueio && i.situacao === "lido" && <span className="text-warning-fg block text-xs">{i.bloqueio}</span>}
                      {i.erro && <span className="text-destructive block text-xs">{i.erro}</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {a && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => setAberto(aberto === i.id ? null : i.id)}
                            aria-expanded={aberto === i.id}
                          >
                            {aberto === i.id ? <ChevronDown /> : <ChevronRight />}
                            Dias
                          </Button>
                        )}
                        {podeEditar && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn("h-7 px-2", i.situacao !== "descartado" && "text-destructive hover:text-destructive")}
                            disabled={ocupado}
                            aria-label={i.situacao === "descartado" ? "Restaurar" : "Descartar"}
                            onClick={() =>
                              iniciar(async () => {
                                await descartarItemAction(remessaId, importacaoId, i.id, i.situacao === "descartado")
                                router.refresh()
                              })
                            }
                          >
                            {i.situacao === "descartado" ? <RotateCcw /> : <Trash2 />}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {a && (a.alertas.length > 0 || aberto === i.id) && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell />
                      <TableCell colSpan={10} className="pt-0">
                        {a.alertas.length > 0 && (
                          <ul className="text-warning-fg mb-2 list-disc pl-4 text-xs">
                            {a.alertas.map((t) => (
                              <li key={t}>{t}</li>
                            ))}
                          </ul>
                        )}
                        {aberto === i.id && <DiasApurados apuracao={a} marcacoes={i.marcacoes} faixas={faixas} />}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function DiasApurados({ apuracao, marcacoes, faixas }: { apuracao: Apuracao; marcacoes: Record<string, string[]>; faixas: FaixasHE }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="px-2 py-1 text-left font-medium">Dia</th>
            <th className="px-2 py-1 text-left font-medium">Batidas</th>
            <th className="px-2 py-1 text-right font-medium">Previsto</th>
            <th className="px-2 py-1 text-right font-medium">Trabalhado</th>
            <th className="px-2 py-1 text-right font-medium">Saldo</th>
            <th className="px-2 py-1 text-left font-medium">Faixa</th>
          </tr>
        </thead>
        <tbody>
          {apuracao.dias.map((d) => (
            <tr key={d.data} className={cn("border-t", d.tipo !== "util" && "bg-muted/30")}>
              <td className="px-2 py-1 whitespace-nowrap">
                {d.data.split("-").reverse().slice(0, 2).join("/")} {TIPO[d.tipo]}
              </td>
              <td className="px-2 py-1">
                {(marcacoes[d.data] ?? []).join(" ") || <span className="text-muted-foreground">{d.ocorrencia ?? "—"}</span>}
                {d.incompleto && <span className="text-warning-fg ml-1">(incompleta)</span>}
                {d.abonado && d.ocorrencia && (marcacoes[d.data] ?? []).length > 0 && (
                  <span className="text-muted-foreground ml-1">({d.ocorrencia})</span>
                )}
              </td>
              <td className="px-2 py-1 text-right tabular-nums">{d.previstoMin ? hm(d.previstoMin) : "—"}</td>
              <td className="px-2 py-1 text-right tabular-nums">{d.trabalhadoMin ? hm(d.trabalhadoMin) : "—"}</td>
              <td
                className={cn(
                  "px-2 py-1 text-right font-medium tabular-nums",
                  d.saldoMin > 0 && "text-success-fg",
                  d.saldoMin < 0 && "text-destructive"
                )}
              >
                {d.saldoMin ? formatarMin(d.saldoMin) : "—"}
              </td>
              <td className="text-muted-foreground px-2 py-1">{d.saldoMin > 0 ? faixas[d.faixa === 1 ? "70" : "100"] : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
