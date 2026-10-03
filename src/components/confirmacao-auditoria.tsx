"use client"

import { useState, type RefObject } from "react"
import { flushSync } from "react-dom"
import { CircleAlert, CircleCheck, Loader2, OctagonX, Pencil, Send } from "lucide-react"

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
import type { Apontamento, EstadoComApontamentos } from "@/lib/auditoria-confirmacao"

/**
 * Confirmação da auditoria antes de gravar uma ordem de pagamento. Vai DENTRO
 * do formulário (leva o campo oculto "confirmados"). Quando a action devolve
 * `apontamentos`, abre a tela com cada ponto não ok:
 *  - "Ajustar" fecha e devolve o formulário intacto — ao reenviar, a análise
 *    roda de novo e a tela diz o que persiste e o que foi resolvido;
 *  - "Registrar mesmo assim" confirma os alertas e reenvia (bloqueio não se
 *    confirma: só some ajustando).
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

  // Nova resposta da action: compara com a análise anterior.
  if (estado !== ultimo) {
    setUltimo(estado)
    if (estado.apontamentos?.length) {
      const atuais = estado.apontamentos
      setResolvidos(anteriores.filter((a) => !atuais.some((b) => b.codigo === a.codigo)))
      setPersistem(atuais.filter((a) => anteriores.some((b) => b.codigo === a.codigo)).map((a) => a.codigo))
      setLista(atuais)
      setAnteriores(atuais)
      setAberto(true)
    }
  }

  const temBloqueio = lista.some((a) => a.bloqueia)

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
      <Dialog open={aberto} onOpenChange={(v) => (v ? setAberto(true) : ajustar())}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Antes de registrar: pontos da análise</DialogTitle>
            <DialogDescription>
              A análise do processo (regras da Auditoria das ordens e IA) encontrou o que está
              abaixo. Ajuste o apontamento ou, se estiver ciente, registre mesmo assim — a
              confirmação fica na trilha da ordem.
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
              disabled={temBloqueio || pendente}
              title={temBloqueio ? "Há bloqueio: ajuste antes de registrar." : undefined}
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
