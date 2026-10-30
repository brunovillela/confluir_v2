"use client"

import { useActionState, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  FileText,
  Loader2,
  SkipForward,
  Sparkles,
  TriangleAlert,
} from "lucide-react"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { confirmar } from "@/components/ui/confirmacao"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import { estadosDosCampos } from "@/lib/cat-conferencia"
import type { EstadoForm } from "@/lib/contas"
import { formatarData } from "@/lib/formato"
import { BLOCOS, CAMPOS_CAT, nomeCampo } from "@/lib/saude-campos"

import { atualizarCatAction, marcarPendenciaCatAction, type EstadoCat } from "../actions"
import { Campo } from "../cat-forms"

type Props = {
  id: string
  numero: string | null
  valores: Record<string, string>
  avisos: string[]
  urlPdf: string | null
  pendencia: { motivo: string; em: string | null } | null
  conferida: boolean
  posicao: number
  total: number
  conferidas: number
  hrefAnterior: string | null
  hrefProxima: string | null
  /** Para onde ir depois de validar, marcar pendência ou pular. */
  hrefDepois: string
}

/** Uma CAT da fila: PDF à esquerda, campos por bloco à direita. */
export function ConferenciaCat(p: Props) {
  const router = useRouter()
  const [estado, acao, salvando] = useActionState<EstadoCat, FormData>(atualizarCatAction, {})
  const envio = useEnvioFormulario(acao, estado, { manter: true })
  const [mudou, setMudou] = useState(false)
  const [soAtencao, setSoAtencao] = useState(false)
  const [pendenciaAberta, setPendenciaAberta] = useState(false)

  const estados = useMemo(() => estadosDosCampos(p.valores, p.avisos), [p.valores, p.avisos])
  const [abertos, setAbertos] = useState<string[]>(() => {
    const comAtencao = BLOCOS.filter((b) => (estados.porBloco.get(b) ?? 0) > 0)
    return comAtencao.length ? comAtencao : [BLOCOS[0]]
  })

  useEffect(() => {
    if (estado.salvoId) router.push(p.hrefDepois)
  }, [estado.salvoId, p.hrefDepois, router])

  // Edição não salva: segura o fechar/recarregar da aba.
  useEffect(() => {
    if (!mudou) return
    const segurar = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", segurar)
    return () => window.removeEventListener("beforeunload", segurar)
  }, [mudou])

  async function sair(href: string) {
    if (mudou && !(await confirmar("Sair sem salvar? As alterações nesta CAT serão descartadas."))) return
    router.push(href)
  }

  const nome = p.valores[nomeCampo(CAMPOS_CAT.find((c) => c.n === 11)!)] || "Acidentado não lido"
  const progresso = p.total ? Math.round((p.conferidas / p.total) * 100) : 0

  return (
    <div className="grid gap-4">
      {/* Topo: posição na fila e progresso */}
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium tabular-nums">
              CAT {p.posicao} de {p.total}
            </p>
            <p className="text-muted-foreground truncate text-xs">
              {nome} · <span className="tabular-nums">{p.numero ?? "sem número"}</span>
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={!p.hrefAnterior}
              onClick={() => p.hrefAnterior && sair(p.hrefAnterior)}
            >
              <ChevronLeft />
              Anterior
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!p.hrefProxima}
              onClick={() => p.hrefProxima && sair(p.hrefProxima)}
            >
              Próxima
              <ChevronRight />
            </Button>
          </div>
        </div>
        <Progress value={progresso} aria-label="Progresso da conferência" />
        <p className="text-muted-foreground text-xs tabular-nums">
          {p.conferidas} {p.conferidas === 1 ? "conferida" : "conferidas"} de {p.total}
        </p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* PDF original */}
        <div className="grid gap-2 lg:sticky lg:top-4">
          {p.urlPdf ? (
            <>
              <iframe
                src={p.urlPdf}
                title="PDF da CAT"
                className="hidden h-[calc(100vh-12rem)] w-full rounded-md border lg:block"
              />
              <Button variant="outline" size="sm" className="justify-self-start" asChild>
                <a href={p.urlPdf} target="_blank" rel="noreferrer">
                  <FileText />
                  Abrir o PDF
                </a>
              </Button>
            </>
          ) : (
            <Alert variant="warning">
              <TriangleAlert />
              <AlertDescription>Esta CAT não tem o PDF guardado — confira com o documento em mãos.</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Campos */}
        <div className="grid gap-3">
          <Alert variant="info">
            <Sparkles />
            <AlertDescription>
              <p>
                <strong>Lido pela IA.</strong> Suas edições não refazem a leitura da IA.
              </p>
              {estados.gerais.length > 0 && (
                <ul className="mt-1 grid gap-0.5 text-xs">
                  {estados.gerais.map((a, i) => (
                    <li key={i}>• {a}</li>
                  ))}
                </ul>
              )}
            </AlertDescription>
          </Alert>

          {p.conferida && (
            <Alert variant="success">
              <CircleCheck />
              <AlertDescription>Esta CAT já foi conferida. Salvar de novo grava as alterações.</AlertDescription>
            </Alert>
          )}
          {p.pendencia && !p.conferida && (
            <Alert variant="warning">
              <ClipboardList />
              <AlertDescription>
                <strong>Pendência{p.pendencia.em ? ` (${formatarData(p.pendencia.em.slice(0, 10))})` : ""}:</strong>{" "}
                {p.pendencia.motivo}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="so-atencao" className="cursor-pointer text-sm">
              Mostrar só campos que pedem atenção
            </Label>
            <Switch id="so-atencao" checked={soAtencao} onCheckedChange={setSoAtencao} />
          </div>
          {soAtencao && estados.total === 0 && (
            <p className="text-muted-foreground text-sm">Nenhum campo pede atenção nesta CAT.</p>
          )}

          <form
            action={acao}
            {...envio}
            onInput={() => setMudou(true)}
            onChange={() => setMudou(true)}
            className="grid gap-3"
          >
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="permanecer" value="1" />
            {!p.conferida && <input type="hidden" name="conferir" value="1" />}

            <Accordion type="multiple" value={abertos} onValueChange={setAbertos} className="rounded-lg border px-3">
              {BLOCOS.map((bloco) => {
                const n = estados.porBloco.get(bloco) ?? 0
                return (
                  // Fechado continua montado (forceMount, escondido por CSS): campo fora do form seria gravado vazio.
                  <AccordionItem
                    key={bloco}
                    value={bloco}
                    className={cn(
                      "[&>[data-slot=accordion-content][data-state=closed]]:hidden",
                      soAtencao && n === 0 && "hidden"
                    )}
                  >
                    <AccordionTrigger className="min-h-11 items-center">
                      <span className="flex flex-1 flex-wrap items-center justify-between gap-2 pr-2">
                        <span>{bloco}</span>
                        {n === 0 ? (
                          <Badge variant="success">
                            <CircleCheck />
                            Tudo certo
                          </Badge>
                        ) : (
                          <Badge variant="warning">
                            <TriangleAlert />
                            {n === 1 ? "1 pede atenção" : `${n} pedem atenção`}
                          </Badge>
                        )}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent forceMount className="h-auto">
                      <div className="grid gap-4 pt-1 sm:grid-cols-2">
                        {CAMPOS_CAT.filter((c) => c.bloco === bloco).map((campo) => {
                          const e = estados.porCampo.get(campo.n)
                          return (
                            <Campo
                              key={campo.n}
                              campo={campo}
                              valor={p.valores[nomeCampo(campo)] ?? ""}
                              estado={e}
                              escondido={soAtencao && e?.tipo === "ok"}
                            />
                          )
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>

            {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}

            {/* Rodapé que acompanha a rolagem */}
            <div className="bg-background sticky bottom-0 z-(--z-sticky) -mx-1 border-t px-1 py-3">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setPendenciaAberta(true)} disabled={salvando || p.conferida}>
                  <ClipboardList />
                  Marcar pendência
                </Button>
                <Button type="button" variant="outline" onClick={() => sair(p.hrefDepois)} disabled={salvando}>
                  <SkipForward />
                  Pular
                </Button>
                <Button type="submit" disabled={salvando}>
                  {salvando ? <Loader2 className="animate-spin" /> : <CircleCheck />}
                  {p.conferida ? "Salvar e ir para a próxima" : "Validar e ir para a próxima"}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <DialogPendencia
        id={p.id}
        aberto={pendenciaAberta}
        motivo={p.pendencia?.motivo ?? ""}
        aoFechar={() => setPendenciaAberta(false)}
        aoMarcar={() => {
          // O diálogo já avisou que os campos editados não são salvos.
          setMudou(false)
          router.push(p.hrefDepois)
        }}
      />
    </div>
  )
}

function DialogPendencia({
  id,
  aberto,
  motivo,
  aoFechar,
  aoMarcar,
}: {
  id: string
  aberto: boolean
  motivo: string
  aoFechar: () => void
  aoMarcar: () => void
}) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(marcarPendenciaCatAction, {})
  const envio = useEnvioFormulario(acao, estado, { manter: true })

  useEffect(() => {
    if (estado.ok) {
      aoFechar()
      aoMarcar()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando a action responde
  }, [estado])

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent>
        <form action={acao} {...envio} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Marcar pendência</DialogTitle>
            <DialogDescription>
              A CAT continua sem conferência, com o motivo anotado, e sai da sua vez na fila. Os campos editados
              aqui não são salvos.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="id" value={id} />
          <div className="grid gap-1.5">
            <Label htmlFor="motivo-pendencia">O que falta resolver</Label>
            <Textarea
              id="motivo-pendencia"
              name="motivo"
              defaultValue={motivo}
              required
              maxLength={1000}
              placeholder="Ex.: página 2 ilegível; pedir à empresa a CAT original."
            />
          </div>
          {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={aoFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <ClipboardList />}
              Marcar pendência
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
