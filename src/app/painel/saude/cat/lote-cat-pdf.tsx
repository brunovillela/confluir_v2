"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { CircleCheck, ExternalLink, FileText, Loader2, RotateCcw, Save, TriangleAlert, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ROTULO_CLASSE } from "@/lib/cat-classificacao"
import { formatarData } from "@/lib/formato"
import { cn } from "@/lib/utils"

import { CatForm } from "./cat-forms"
import { ClassificacaoCatAviso } from "./classificacao-cat"
import {
  lerCatDoLoteAction,
  registrarSemConferenciaAction,
  type ResultadoLoteCat,
} from "./importar-pdf-actions"

/** Quantos PDFs a IA lê ao mesmo tempo (cada leitura leva de 10 a 30 s). */
const SIMULTANEOS = 2
export const MAXIMO_LOTE = 30

type Situacao = "fila" | "lendo" | "lida" | "gravando" | "gravada" | "salva" | "nao_gravada" | "erro"

type Item = {
  arquivo: File
  situacao: Situacao
  r?: ResultadoLoteCat
  /** Erro, motivo de não gravar ou aviso do PDF. */
  mensagem?: string
  /** CAT criada (sem conferência, ou conferida e salva pelo formulário). */
  id?: string
}

const ROTULO_SITUACAO: Record<Situacao, string> = {
  fila: "Na fila",
  lendo: "Lendo…",
  lida: "Lida — a conferir",
  gravando: "Gravando…",
  gravada: "Gravada sem conferência",
  salva: "Conferida e salva",
  nao_gravada: "Não gravada — a conferir",
  erro: "Erro na leitura",
}

/**
 * Pode ir para a base sem olhar: CAT nova ou atualização de uma da base, com
 * nome e data do acidente lidos (sem eles o servidor recusa de novo).
 */
const gravavel = (it: Item) =>
  (it.situacao === "lida" || it.situacao === "nao_gravada") &&
  !!it.r?.valores?.campo_11 &&
  !!it.r.valores.campo_19 &&
  (it.r.classificacao?.classe === "nova" || it.r.classificacao?.classe === "atualizacao")

const aConferir = (it: Item) =>
  (it.situacao === "lida" || it.situacao === "nao_gravada") &&
  !!it.r?.valores &&
  it.r.classificacao?.classe !== "duplicada"

export function LoteCatPdf({ arquivos, registrar }: { arquivos: File[]; registrar: boolean }) {
  const [itens, setItens] = useState<Item[]>(() => arquivos.map((arquivo) => ({ arquivo, situacao: "fila" })))
  const [aberto, setAberto] = useState<number | null>(null)
  const [confirmandoTodas, setConfirmandoTodas] = useState(false)
  const painel = useRef<HTMLDivElement>(null)

  const atualizar = useCallback((i: number, mudanca: Partial<Item>) => {
    setItens((xs) => xs.map((x, j) => (j === i ? { ...x, ...mudanca } : x)))
  }, [])

  // Fila de leitura: SIMULTANEOS por vez. O ref segura o duplo efeito do
  // modo estrito (senão cada PDF seria lido — e cobrado — duas vezes).
  const iniciou = useRef(false)
  useEffect(() => {
    if (iniciou.current) return
    iniciou.current = true
    let proximo = 0
    const trabalhador = async () => {
      while (proximo < arquivos.length) {
        const i = proximo++
        atualizar(i, { situacao: "lendo" })
        const fd = new FormData()
        fd.set("arquivo", arquivos[i])
        if (registrar) fd.set("registrar", "1")
        try {
          const r = await lerCatDoLoteAction(fd)
          if (r.erro) atualizar(i, { situacao: "erro", mensagem: r.erro })
          else if (r.gravadaId) atualizar(i, { situacao: "gravada", r, id: r.gravadaId, mensagem: r.avisoPdf })
          else if (r.naoGravada) atualizar(i, { situacao: "nao_gravada", r, mensagem: r.naoGravada })
          else atualizar(i, { situacao: "lida", r })
        } catch {
          atualizar(i, { situacao: "erro", mensagem: "Falha de comunicação — tente este PDF de novo." })
        }
      }
    }
    void Promise.all(Array.from({ length: Math.min(SIMULTANEOS, arquivos.length) }, trabalhador))
  }, [arquivos, registrar, atualizar])

  const emAndamento = itens.some((it) => it.situacao === "fila" || it.situacao === "lendo" || it.situacao === "gravando")
  useEffect(() => {
    if (!emAndamento) return
    const segurar = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", segurar)
    return () => window.removeEventListener("beforeunload", segurar)
  }, [emAndamento])

  async function gravarSemConferir(i: number) {
    const it = itens[i]
    if (!it.r?.valores) return
    atualizar(i, { situacao: "gravando", mensagem: undefined })
    const fd = new FormData()
    fd.set("arquivo", it.arquivo)
    fd.set("valores", JSON.stringify(it.r.valores))
    fd.set("avisos", JSON.stringify(it.r.avisos ?? []))
    try {
      const g = await registrarSemConferenciaAction(fd)
      if (g.gravadaId) atualizar(i, { situacao: "gravada", id: g.gravadaId, mensagem: g.avisoPdf })
      else atualizar(i, { situacao: "nao_gravada", mensagem: g.erro ?? g.naoGravada })
    } catch {
      atualizar(i, { situacao: "nao_gravada", mensagem: "Falha de comunicação — tente de novo." })
    }
    if (aberto === i) setAberto(null)
  }

  async function gravarTodas() {
    setConfirmandoTodas(false)
    const alvos = itens.map((it, i) => (gravavel(it) ? i : -1)).filter((i) => i >= 0)
    for (const i of alvos) await gravarSemConferir(i)
  }

  function conferir(i: number) {
    setAberto(i)
    requestAnimationFrame(() => painel.current?.scrollIntoView({ behavior: "smooth", block: "start" }))
  }

  const conta = useMemo(() => {
    const c = { lidas: 0, total: itens.length, gravadas: 0, salvas: 0, aConferir: 0, jaLancadas: 0, erros: 0, gravaveis: 0 }
    for (const it of itens) {
      if (!["fila", "lendo"].includes(it.situacao)) c.lidas++
      if (it.situacao === "gravada") c.gravadas++
      if (it.situacao === "salva") c.salvas++
      if (it.situacao === "erro") c.erros++
      if (aConferir(it)) c.aConferir++
      if (gravavel(it)) c.gravaveis++
      if (it.r?.classificacao?.classe === "duplicada" && it.situacao !== "gravada" && it.situacao !== "salva") c.jaLancadas++
    }
    return c
  }, [itens])

  const atual = aberto !== null ? itens[aberto] : null

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-0.5 text-sm">
          <p className="font-medium">
            {emAndamento ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Lendo {conta.lidas} de {conta.total} PDFs…
              </span>
            ) : (
              `${conta.total} PDFs lidos`
            )}
          </p>
          <p className="text-muted-foreground text-xs">
            {[
              conta.gravadas && `${conta.gravadas} ${conta.gravadas === 1 ? "gravada" : "gravadas"} sem conferência`,
              conta.salvas && `${conta.salvas} ${conta.salvas === 1 ? "conferida e salva" : "conferidas e salvas"}`,
              conta.aConferir && `${conta.aConferir} a conferir`,
              conta.jaLancadas && `${conta.jaLancadas} já ${conta.jaLancadas === 1 ? "lançada" : "lançadas"}`,
              conta.erros && `${conta.erros} com erro`,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {conta.gravaveis > 0 &&
            (confirmandoTodas ? (
              <>
                <Button size="sm" onClick={gravarTodas}>
                  <Save />
                  Confirmar: gravar {conta.gravaveis === 1 ? "1 CAT" : `${conta.gravaveis} CATs`} sem conferência
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmandoTodas(false)}>
                  Cancelar
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setConfirmandoTodas(true)} disabled={emAndamento}>
                <Save />
                {conta.gravaveis === 1 ? "Gravar sem conferência a pendente" : `Gravar sem conferência as ${conta.gravaveis} pendentes`}
              </Button>
            ))}
          <Button size="sm" variant="outline" asChild>
            <Link href="/painel/saude/cat/nova/pdf">
              <RotateCcw />
              Ler outros PDFs
            </Link>
          </Button>
        </div>
      </div>

      {registrar && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertDescription>
            Registro sem conferência ligado: CATs novas e atualizações são gravadas com o que a IA leu, marcadas
            &quot;sem conferência&quot;, até alguém conferir. Já lançadas não entram; possível duplicidade e leitura sem
            nome ou data ficam para conferir aqui.
          </AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-left text-xs">
            <tr>
              <th className="px-3 py-2 font-medium">Arquivo</th>
              <th className="px-3 py-2 font-medium">Acidentado</th>
              <th className="px-3 py-2 font-medium">Nº da CAT</th>
              <th className="px-3 py-2 font-medium">Comparação com a base</th>
              <th className="px-3 py-2 font-medium">Situação</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {itens.map((it, i) => {
              const v = it.r?.valores
              const classe = it.r?.classificacao?.classe
              return (
                <tr key={i} className={cn("border-t align-top", aberto === i && "bg-primary/5")}>
                  <td className="max-w-48 px-3 py-2">
                    <span className="flex items-center gap-1.5">
                      <FileText className="text-muted-foreground size-4 shrink-0" />
                      <span className="truncate" title={it.arquivo.name}>{it.arquivo.name}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {v?.campo_11 ?? <span className="text-muted-foreground">—</span>}
                    {v?.campo_19 && <span className="text-muted-foreground block text-xs">{formatarData(v.campo_19)}</span>}
                  </td>
                  <td className="px-3 py-2 text-xs tabular-nums">{v?.campo_5 ?? "—"}</td>
                  <td className="px-3 py-2">
                    {classe ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-normal whitespace-nowrap",
                          classe === "duplicada" && "border-destructive/40 text-destructive",
                          classe === "possivel_duplicada" && "border-warning/40 text-warning-fg",
                          classe === "nova" && "border-success/40 text-success-fg"
                        )}
                      >
                        {ROTULO_CLASSE[classe]}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs whitespace-nowrap",
                        it.situacao === "erro" && "text-destructive",
                        it.situacao === "gravada" && "text-warning-fg",
                        it.situacao === "salva" && "text-success-fg"
                      )}
                    >
                      {(it.situacao === "lendo" || it.situacao === "gravando") && <Loader2 className="size-3.5 animate-spin" />}
                      {it.situacao === "salva" && <CircleCheck className="size-3.5" />}
                      {ROTULO_SITUACAO[it.situacao]}
                    </span>
                    {it.mensagem && <p className="text-muted-foreground mt-0.5 max-w-64 text-xs">{it.mensagem}</p>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {it.id && (
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/painel/saude/cat/${it.id}`} target="_blank">
                            <ExternalLink />
                            Abrir
                          </Link>
                        </Button>
                      )}
                      {classe === "duplicada" && !it.id && it.r?.existente && (
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/painel/saude/cat/${it.r.existente.id}`} target="_blank">
                            <ExternalLink />
                            Abrir a existente
                          </Link>
                        </Button>
                      )}
                      {aConferir(it) && (
                        <Button size="sm" variant={aberto === i ? "default" : "outline"} onClick={() => conferir(i)}>
                          Conferir
                        </Button>
                      )}
                      {gravavel(it) && (
                        <Button size="sm" variant="ghost" onClick={() => gravarSemConferir(i)}>
                          Gravar sem conferir
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div ref={painel} className="scroll-mt-4">
        {atual?.r?.valores && aberto !== null && (
          <Card>
            <CardContent className="grid gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  Conferindo: <span className="font-normal">{atual.arquivo.name}</span>
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => window.open(URL.createObjectURL(atual.arquivo), "_blank")}>
                    <FileText />
                    Abrir o PDF
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAberto(null)} aria-label="Fechar a conferência">
                    <X />
                  </Button>
                </div>
              </div>
              {atual.r.avisos && atual.r.avisos.length > 0 && (
                <Alert variant="warning">
                  <AlertDescription>
                    <p className="font-medium">Avisos da leitura</p>
                    <ul className="mt-1 grid gap-0.5 text-xs">
                      {atual.r.avisos.map((a, k) => (
                        <li key={k}>• {a}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
              {atual.r.classificacao && <ClassificacaoCatAviso classificacao={atual.r.classificacao} />}
              <CatForm
                key={aberto}
                valores={atual.r.valores}
                origemId={atual.r.classificacao?.classe === "atualizacao" ? atual.r.classificacao.origemId : null}
                pedirConfirmacao={atual.r.classificacao?.classe === "possivel_duplicada"}
                arquivo={atual.arquivo}
                aoSalvar={(id, mensagem) => {
                  atualizar(aberto, { situacao: "salva", id, mensagem: mensagem === "CAT salva." ? undefined : mensagem })
                  setAberto(null)
                }}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
