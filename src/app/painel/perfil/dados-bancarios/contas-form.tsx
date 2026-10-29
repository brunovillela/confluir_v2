"use client"

import { startTransition, useActionState, useState } from "react"
import { Loader2, Pencil, Plus, Send, Trash2, Undo2, X } from "lucide-react"

import { CamposDadosBancarios, type ValoresDadosBancarios } from "@/components/dados-bancarios-campos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { type EstadoForm } from "@/lib/contas"

import { cancelarPedidoAction, pedirContaAction, pedirExclusaoAction } from "./actions"

function Mensagem({ estado }: { estado: EstadoForm }) {
  if (estado.erro)
    return (
      <Alert variant="destructive">
        <AlertDescription>{estado.erro}</AlertDescription>
      </Alert>
    )
  if (estado.ok)
    return (
      <Alert className="border-success/40 text-success-fg">
        <AlertDescription>{estado.ok}</AlertDescription>
      </Alert>
    )
  return null
}

/**
 * Formulário de inclusão (sem `contaId`) ou alteração da conta. Envio por
 * startTransition: com `action={...}` o React 19 reinicia o formulário depois
 * de um erro e o que foi digitado some.
 */
function FormularioConta({
  contaId,
  valores,
  principal,
  titularSugerido,
  aoFechar,
}: {
  contaId: string | null
  valores: ValoresDadosBancarios | null
  principal: boolean
  titularSugerido: string | null
  aoFechar: () => void
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(pedirContaAction, {})
  if (estado.ok) {
    return (
      <div className="grid gap-3">
        <Mensagem estado={estado} />
        <div>
          <Button variant="outline" size="sm" onClick={aoFechar}>
            Fechar
          </Button>
        </div>
      </div>
    )
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const dados = new FormData(e.currentTarget)
        startTransition(() => formAction(dados))
      }}
      className="grid gap-3"
    >
      {contaId && <input type="hidden" name="conta_id" value={contaId} />}
      <Mensagem estado={estado} />
      <CamposDadosBancarios prefixo={contaId ? `c${contaId.slice(0, 8)}` : "nova"} valores={valores} titularSugerido={titularSugerido} />
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="principal" defaultChecked={principal} />
        Usar como conta principal (a dos pagamentos)
      </label>
      <p className="text-muted-foreground text-xs">
        O pedido vai ao Financeiro. Até ele confirmar, os pagamentos continuam na conta atual.
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={aoFechar} disabled={pendente}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Send />}
          Enviar ao Financeiro
        </Button>
      </div>
    </form>
  )
}

/** "Incluir conta": abre o formulário só quando pedido. */
export function IncluirConta({ titularSugerido }: { titularSugerido: string | null }) {
  const [aberto, setAberto] = useState(false)
  const [chave, setChave] = useState(0)
  if (!aberto) {
    return (
      <div>
        <Button onClick={() => setAberto(true)}>
          <Plus />
          Incluir conta
        </Button>
      </div>
    )
  }
  return (
    <div className="bg-card rounded-xl border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-medium">Nova conta</p>
        <Button variant="ghost" size="icon" className="size-8" onClick={() => setAberto(false)} aria-label="Fechar">
          <X />
        </Button>
      </div>
      <FormularioConta
        key={chave}
        contaId={null}
        valores={null}
        principal={false}
        titularSugerido={titularSugerido}
        aoFechar={() => {
          setAberto(false)
          setChave((c) => c + 1)
        }}
      />
    </div>
  )
}

/** Lápis e lixeira de uma conta (alteração e exclusão vão ao Financeiro). */
export function AcoesConta({
  contaId,
  valores,
  principal,
  titularSugerido,
}: {
  contaId: string
  valores: ValoresDadosBancarios
  principal: boolean
  titularSugerido: string | null
}) {
  const [editando, setEditando] = useState(false)
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(pedirExclusaoAction, {})
  return (
    <div className="grid gap-3">
      {!editando && (
        <div className="flex flex-wrap items-center justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setEditando(true)}>
            <Pencil />
            Alterar
          </Button>
          <form
            action={formAction}
            onSubmit={(e) => confirmarEnvio(e, "Pedir a exclusão desta conta? O Financeiro confirma antes de ela sair.")}
          >
            <input type="hidden" name="conta_id" value={contaId} />
            <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Excluir
            </Button>
          </form>
        </div>
      )}
      {estado.erro && <Mensagem estado={estado} />}
      {editando && (
        <div className="border-t pt-3">
          <FormularioConta
            contaId={contaId}
            valores={valores}
            principal={principal}
            titularSugerido={titularSugerido}
            aoFechar={() => setEditando(false)}
          />
        </div>
      )}
    </div>
  )
}

/** Desiste do pedido que ainda aguarda o Financeiro. */
export function CancelarPedido({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(cancelarPedidoAction, {})
  return (
    <form
      action={formAction}
      onSubmit={(e) => confirmarEnvio(e, "Cancelar este pedido? Nada muda na conta.")}
      className="inline-flex items-center gap-2"
    >
      <input type="hidden" name="id" value={id} />
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
      <Button type="submit" variant="ghost" size="sm" className="h-7 px-2" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Undo2 />}
        Cancelar pedido
      </Button>
    </form>
  )
}

