"use client"

import { useState } from "react"
import { useActionState } from "react"
import { Loader2, LogOut } from "lucide-react"

import { AcaoVisualizacao, formVisualizacao } from "@/components/acao-visualizacao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EstadoForm } from "@/lib/contas"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

/**
 * Confirmação da desistência (digitar CONFIRMO). O mesmo formulário serve à
 * área do filiado e à página do link sem login (/desistir/<token>) — muda só
 * a action e, no link, o token que vai junto. As duas actions redirecionam
 * no sucesso; aqui só aparecem os erros.
 */
export function DesistirForm({
  action,
  preview = false,
  token,
}: {
  action: (prev: EstadoForm, fd: FormData) => Promise<EstadoForm>
  preview?: boolean
  /** Link sem login: o token assinado volta para o servidor conferir. */
  token?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, formAction, pend] = useActionState(action, {})
  const envio = useEnvioFormulario(formAction, estado)

  if (!aberto) {
    return (
      <div>
        <Button variant="outline" onClick={() => setAberto(true)}>
          <LogOut />
          Quero desistir da filiação
        </Button>
      </div>
    )
  }

  return (
    <form {...formVisualizacao(preview, formAction)} {...(preview ? {} : envio)} className="grid max-w-md gap-3">
      {estado.erro && !estado.campo && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <ErroNoCampo estado={estado} />
      {token && <input type="hidden" name="token" value={token} />}
      <div className="grid gap-1.5">
        <Label htmlFor="confirmacao">Digite CONFIRMO para concluir o pedido</Label>
        <Input
          id="confirmacao"
          name="confirmacao"
          placeholder="CONFIRMO"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          // O botão que abriu o formulário sai da tela: o foco vem para cá,
          // em vez de cair no topo da página (teclado e leitor de tela).
          autoFocus
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <AcaoVisualizacao
          preview={preview}
          nota="A desistência é um ato do próprio trabalhador — a gestão não pode fazê-la por ele."
        >
          <Button type="submit" disabled={pend}>
            {pend ? <Loader2 className="animate-spin" /> : <LogOut />}
            Confirmar desistência
          </Button>
        </AcaoVisualizacao>
        <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
