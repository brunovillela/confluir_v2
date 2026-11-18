"use client"

import { useState, type RefObject } from "react"
import { flushSync } from "react-dom"
import { CircleAlert, CircleCheck, ExternalLink, Loader2, OctagonX, Pencil, Send } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { JUSTIFICATIVA_MINIMA, type Apontamento, type EstadoComApontamentos } from "@/lib/auditoria-confirmacao"
import { formatarData, formatarMoeda } from "@/lib/formato"

/**
 * Confirmação da auditoria antes de gravar uma ordem de pagamento. Vai DENTRO
 * do formulário (leva o campo oculto "confirmados"). Quando a action devolve
 * `apontamentos`, abre a tela com cada ponto não ok:
 *  - "Ajustar" fecha e devolve o formulário intacto — ao reenviar, a análise
 *    roda de novo e a tela diz o que persiste e o que foi resolvido;
 *  - "Registrar mesmo assim" confirma os alertas e reenvia (bloqueio não se
 *    confirma: só some ajustando). Desde 17/11/2026, alerta de regra com
 *    "Exigir justificativa" pede o motivo, que vai para a trilha e aparece
 *    para quem autoriza; possível duplicidade mostra as ordens parecidas.
 * O formulário precisa enviar por onSubmit (sem `action=`), senão o React
 * limpa os campos a cada análise.
 */
export function ConfirmacaoAuditoria({
  estado,
  formRef,
  pendente,
}: {
  estado: EstadoComApontamentos
  formRef: RefObject<HTMLFormElement | null>
  pendente: boolean
}) {
  const [confirmados, setConfirmados] = useState("")
  const [aberto, setAberto] = useState(false)
  const [lista, setLista] = useState<Apontamento[]>([])
  const [resolvidos, setResolvidos] = useState<Apontamento[]>([])
  const [anteriores, setAnteriores] = useState<Apontamento[]>([])
  const [persistem, setPersistem] = useState<string[]>([])
  const [ultimo, setUltimo] = useState(estado)
  // Justificativa por regra: sobrevive às reanálises (o texto não se perde ao ajustar).
  const [justificativas, setJustificativas] = useState<Record<string, string>>({})

  // Nova resposta da action: compara com a análise anterior.
  if (estado !== ultimo) {
    setUltimo(estado)
    if (estado.apontamentos?.length) {
      const atuais = estado.apontamentos
      setResolvidos(anteriores.filter((a) => !atuais.some((b) => b.codigo === a.codigo)))
      setPersistem(atuais.filter((a) => anteriores.some((b) => b.codigo === a.codigo)).map((a) => a.codigo))
      setLista(atuais)
      setAnteriores(atuais)
      setJustificativas((j) => ({
        ...Object.fromEntries(atuais.filter((a) => a.justificativa).map((a) => [a.codigo, a.justificativa!])),
        ...j,
      }))
      setAberto(true)
    }
  }

  const temBloqueio = lista.some((a) => a.bloqueia)
  const faltaJustificar = lista.filter(
    (a) => !a.bloqueia && a.pedeJustificativa && (justificativas[a.codigo]?.trim().length ?? 0) < JUSTIFICATIVA_MINIMA
  )

  function ajustar() {
    setAberto(false)
    // Ajustou: a próxima análise começa do zero (nada pré-confirmado).
    setConfirmados("")
  }

  function confirmar() {
    flushSync(() => {
      setConfirmados(
        lista
          .filter((a) => !a.bloqueia)
          .map((a) => a.codigo)
          .join(",")
      )
      setAberto(false)
    })
    formRef.current?.requestSubmit()
  }

  return (
    <>
      <input type="hidden" name="confirmados" value={confirmados} />
      <input
        type="hidden"
        name="justificativas"
        value={JSON.stringify(
          Object.fromEntries(
            Object.entries(justificativas)
              .map(([k, v]) => [k, v.trim()])
              .filter(([k, v]) => v && confirmados.split(",").includes(k))
          )
        )}
      />
      <Dialog open={aberto} onOpenChange={(v) => (v ? setAberto(true) : ajustar())}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Antes de registrar: pontos da análise</DialogTitle>
            <DialogDescription>
              A análise do processo (regras da Auditoria das ordens e IA) encontrou o que está
              abaixo. Ajuste o apontamento ou, se estiver ciente, explique o motivo e registre
              mesmo assim — a confirmação e a justificativa ficam na trilha da ordem.
            </DialogDescription>
          </DialogHeader>

          <ul className="grid max-h-[50vh] gap-2 overflow-y-auto">
            {lista.map((a) => (
              <li
                key={a.codigo}
                className={
                  a.bloqueia
                    ? "border-destructive/40 bg-destructive/5 rounded-md border p-3"
                    : "border-warning/40 bg-warning/5 rounded-md border p-3"
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  {a.bloqueia ? (
                    <OctagonX className="text-destructive size-4 shrink-0" />
                  ) : (
                    <CircleAlert className="text-warning-fg size-4 shrink-0" />
                  )}
                  <span className="text-sm font-medium">{a.titulo}</span>
                  {a.bloqueia ? (
                    <Badge variant="destructive">Bloqueia — ajuste para seguir</Badge>
                  ) : (
                    <Badge variant="warning">Alerta</Badge>
                  )}
                  {persistem.includes(a.codigo) && <Badge variant="outline">Persiste após o ajuste</Badge>}
                </div>
                <p className="text-muted-foreground mt-1 text-sm">{a.detalhe}</p>
                {a.relacionadas && a.relacionadas.length > 0 && (
                  <ul className="mt-2 grid gap-1">
                    {a.relacionadas.map((o) => (
                      <li key={o.id} className="bg-background rounded border px-2 py-1.5 text-xs">
                        <a
                          href={`/painel/financeiro/ordens/${o.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary inline-flex items-center gap-1 font-medium tabular-nums hover:underline"
                        >
                          {o.codigo ?? "(sem código)"}
                          <ExternalLink className="size-3" />
                        </a>
                        <span className="text-muted-foreground">
                          {" "}
                          · {o.situacao ?? "—"}
                          {o.vencimento ? ` · vence ${formatarData(o.vencimento)}` : ""}
                          {o.valor !== null ? ` · ${formatarMoeda(o.valor)}` : ""}
                        </span>
                        {o.descricao && <p className="mt-0.5 line-clamp-2 break-words">{o.descricao}</p>}
                      </li>
                    ))}
                  </ul>
                )}
                {!a.bloqueia && a.pedeJustificativa && (
                  <div className="mt-2 grid gap-1">
                    <label htmlFor={`just-${a.codigo}`} className="text-xs font-medium">
                      Por que registrar mesmo assim? *
                    </label>
                    <Textarea
                      id={`just-${a.codigo}`}
                      rows={2}
                      maxLength={500}
                      value={justificativas[a.codigo] ?? ""}
                      onChange={(e) => setJustificativas((j) => ({ ...j, [a.codigo]: e.target.value }))}
                      placeholder="Ex.: é a segunda parcela da mesma compra; a chave é do dono do MEI."
                      className="bg-background text-sm"
                    />
                    <p className="text-muted-foreground text-xs">Quem autoriza a ordem vê esta justificativa junto do alerta.</p>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {resolvidos.length > 0 && (
            <div className="grid gap-1">
              {resolvidos.map((r) => (
                <p key={r.codigo} className="text-success-fg flex items-center gap-2 text-sm">
                  <CircleCheck className="size-4 shrink-0" />
                  Resolvido com o ajuste: {r.titulo}
                </p>
              ))}
            </div>
          )}
          {temBloqueio && (
            <p className="text-muted-foreground text-xs">
              Bloqueio é regra do Financeiro: corrija a origem (cadastro, valor, datas…) ou peça a
              revisão da regra em Financeiro → Auditoria das ordens.
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={ajustar}>
              <Pencil />
              Ajustar
            </Button>
            <Button
              type="button"
              onClick={confirmar}
              disabled={temBloqueio || faltaJustificar.length > 0 || pendente}
              title={
                temBloqueio
                  ? "Há bloqueio: ajuste antes de registrar."
                  : faltaJustificar.length
                    ? `Justifique: ${faltaJustificar.map((a) => a.titulo).join("; ")} (mínimo de ${JUSTIFICATIVA_MINIMA} caracteres).`
                    : undefined
              }
            >
              {pendente ? <Loader2 className="animate-spin" /> : <Send />}
              Registrar mesmo assim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
