"use client"

import { useActionState, useState } from "react"
import { ArrowRightLeft, Loader2, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import type { EstadoForm } from "@/lib/contas"

type Acao = (prev: EstadoForm, formData: FormData) => Promise<EstadoForm>

const SELECT =
  "border-input bg-background text-foreground h-7 max-w-56 rounded-md border px-2 text-xs shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/**
 * Excluir a remessa sem itens (contracheques ou ponto), no alto da página.
 * A action confere de novo no servidor que a remessa está vazia.
 */
export function ExcluirRemessaVazia({ acao, id }: { acao: Acao; id: string }) {
  const [estado, formAction, pendente] = useActionState(acao, {})
  const envio = useEnvioFormulario(formAction, estado, {
    antes: (e) => {
      confirmarEnvio(e, "Excluir esta remessa vazia? Não dá para desfazer.")
    },
  })
  return (
    <form action={formAction} {...envio} className="grid justify-items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline" disabled={pendente} className="text-destructive hover:text-destructive">
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
        Excluir remessa
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}

/**
 * Transferir um item para outra remessa aberta. Só aparece quando há destino
 * (a página não renderiza o botão se a remessa atual estiver finalizada ou
 * não houver outra aberta).
 */
export function TransferirParaRemessa({
  acao,
  id,
  remessaId,
  destinos,
  funcionario,
  aviso,
}: {
  acao: Acao
  id: string
  remessaId: string
  destinos: { id: string; nome: string }[]
  funcionario: string | null
  /** Frase extra na confirmação (ex.: saldos do ponto não são recalculados). */
  aviso?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [destino, setDestino] = useState("")
  const [estado, formAction, pendente] = useActionState(acao, {})
  const envio = useEnvioFormulario(formAction, estado, {
    antes: (e) => {
      const nome = destinos.find((d) => d.id === destino)?.nome ?? "a remessa escolhida"
      confirmarEnvio(e, `Transferir ${funcionario ? `o item de ${funcionario}` : "este item"} para ${nome}?${aviso ? ` ${aviso}` : ""}`)
    },
  })

  if (!aberto) {
    return (
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => setAberto(true)}>
        <ArrowRightLeft />
        Transferir
      </Button>
    )
  }
  return (
    <form action={formAction} {...envio} className="grid justify-items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="remessa_id" value={remessaId} />
      <div className="flex items-center gap-1">
        <select
          name="destino_id"
          aria-label="Remessa de destino"
          required
          className={SELECT}
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
        >
          <option value="" disabled>
            Para a remessa…
          </option>
          {destinos.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nome}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" className="h-7 px-2" disabled={pendente || !destino}>
          {pendente ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />}
          Transferir
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5" aria-label="Cancelar" onClick={() => setAberto(false)}>
          <X />
        </Button>
      </div>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}
