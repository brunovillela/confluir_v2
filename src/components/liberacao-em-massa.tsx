"use client"

import { useActionState, useEffect, useState, useTransition } from "react"
import { Loader2, Lock, LockOpen } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmar } from "@/components/ui/confirmacao"
import type { EstadoForm } from "@/lib/contas"

/**
 * LIBERAR OU BLOQUEAR EM MASSA (31/10/2026) — remessas de contracheques e de
 * ponto. As caixas das linhas (MarcarLinha) e a do cabeçalho (MarcarTodos)
 * pertencem ao formulário pelo atributo `form`, sem a tabela (do servidor)
 * virar componente do cliente. A barra age nos MARCADOS ou em TODOS os da
 * remessa (de todas as páginas). Liberar avisa cada funcionário, como o
 * liberar de um a um; bloquear não avisa.
 */

const caixas = (formId: string) =>
  [...document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][form="${formId}"][name="ids"]`)]

export function MarcarLinha({ formId, id, rotulo }: { formId: string; id: string; rotulo: string }) {
  return <input type="checkbox" form={formId} name="ids" value={id} aria-label={`Marcar ${rotulo}`} className="size-4 align-middle" />
}

export function MarcarTodos({ formId }: { formId: string }) {
  return (
    <input
      type="checkbox"
      // Do formulário (desmarcada junto depois de gravar), sem name: não vai como id.
      form={formId}
      aria-label="Marcar todos desta página"
      className="size-4 align-middle"
      onChange={(e) => {
        for (const c of caixas(formId)) c.checked = e.currentTarget.checked
        // As linhas não disparam "change" quando mudadas por código: avisa a barra.
        document.dispatchEvent(new Event(`marcados:${formId}`))
      }}
    />
  )
}

export function LiberacaoEmMassa({
  formId,
  acao,
  remessaId,
  bloqueados,
  liberados,
  rotulo,
}: {
  formId: string
  acao: (prev: EstadoForm, dados: FormData) => Promise<EstadoForm>
  remessaId: string
  /** Na remessa inteira (todas as páginas). */
  bloqueados: number
  liberados: number
  /** "contracheque(s)", "registro(s) de ponto" */
  rotulo: string
}) {
  const [estado, formAction, pendente] = useActionState(acao, {})
  const [, iniciar] = useTransition()
  const [marcados, setMarcados] = useState(0)

  useEffect(() => {
    const contar = () => setMarcados(caixas(formId).filter((c) => c.checked).length)
    const aoMudar = (e: Event) => {
      const alvo = e.target as HTMLInputElement | null
      if (alvo?.form?.id === formId) contar()
    }
    document.addEventListener("change", aoMudar)
    document.addEventListener(`marcados:${formId}`, contar)
    return () => {
      document.removeEventListener("change", aoMudar)
      document.removeEventListener(`marcados:${formId}`, contar)
    }
  }, [formId])

  // Depois de gravar, desmarca tudo (as caixas não são controladas pelo React).
  useEffect(() => {
    if (!estado.ok) return
    for (const c of document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][form="${formId}"]`)) c.checked = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- espelha o DOM que acabou de ser desmarcado
    setMarcados(0)
  }, [estado, formId])

  const enviar = async (modo: "liberar" | "bloquear", escopo: "marcados" | "todos") => {
    const form = document.getElementById(formId) as HTMLFormElement | null
    if (!form) return
    const n = escopo === "todos" ? (modo === "liberar" ? bloqueados : liberados) : marcados
    if (n === 0) return
    const ok = await confirmar({
      titulo: `${modo === "liberar" ? "Liberar" : "Bloquear"} ${n} ${rotulo}?`,
      descricao:
        modo === "liberar"
          ? `${escopo === "todos" ? "Todos os bloqueados desta remessa, de todas as páginas, ficam" : "Os marcados ficam"} visíveis em Meu perfil, e cada funcionário recebe o aviso de liberação. Os que já estavam liberados não mudam.`
          : `${escopo === "todos" ? "Todos os liberados desta remessa, de todas as páginas, somem" : "Os marcados somem"} do Meu perfil dos funcionários até serem liberados de novo. Ninguém é avisado.`,
      confirmar: modo === "liberar" ? "Liberar" : "Bloquear",
    })
    if (!ok) return
    const dados = new FormData(form)
    dados.set("modo", modo)
    dados.set("escopo", escopo)
    iniciar(() => formAction(dados))
  }

  return (
    <form id={formId} className="grid gap-2" onSubmit={(e) => e.preventDefault()}>
      <input type="hidden" name="remessa_id" value={remessaId} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <div className="bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
        <span className="text-muted-foreground mr-auto text-xs">
          {pendente ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" /> Gravando…
            </span>
          ) : marcados > 0 ? (
            `${marcados} marcado(s) nesta página`
          ) : (
            `Marque na tabela ou aja em todos · ${bloqueados} bloqueado(s) · ${liberados} liberado(s)`
          )}
        </span>
        {marcados > 0 ? (
          <>
            <Button type="button" size="sm" variant="outline" disabled={pendente} onClick={() => enviar("liberar", "marcados")}>
              <LockOpen />
              Liberar marcados ({marcados})
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={pendente} onClick={() => enviar("bloquear", "marcados")}>
              <Lock />
              Bloquear marcados ({marcados})
            </Button>
          </>
        ) : (
          <>
            <Button type="button" size="sm" variant="outline" disabled={pendente || bloqueados === 0} onClick={() => enviar("liberar", "todos")}>
              <LockOpen />
              Liberar todos ({bloqueados})
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={pendente || liberados === 0} onClick={() => enviar("bloquear", "todos")}>
              <Lock />
              Bloquear todos ({liberados})
            </Button>
          </>
        )}
      </div>
    </form>
  )
}
