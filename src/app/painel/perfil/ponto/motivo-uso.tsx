"use client"

import { useActionState, useState } from "react"
import { Loader2 } from "lucide-react"

import { salvarMotivoDoDiaAction, type EstadoMotivo } from "@/app/painel/uso/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SelectNativo } from "@/components/ui/select-nativo"
import { MOTIVOS_USO, type JustificativaUso } from "@/lib/uso-fora-expediente"

/**
 * Meu perfil → Ponto: o funcionário informa (ou troca) por que usou o
 * sistema fora do horário num dia. O mesmo motivo da faixa amarela.
 */
export function MotivoUsoDoDia({
  data,
  rotulo,
  atual,
}: {
  data: string
  /** Motivo já informado, em uma frase. */
  rotulo: string | null
  atual: JustificativaUso | null
}) {
  const [abrindo, setAbrindo] = useState(false)
  // O React 19 limpa o formulário depois da ação: o digitado volta como padrão.
  const [valores, setValores] = useState<{ motivo?: string; detalhe?: string }>({})
  const [estado, formAction, pendente] = useActionState<EstadoMotivo, FormData>(async (anterior, dados) => {
    setValores({ motivo: String(dados.get("motivo") ?? ""), detalhe: String(dados.get("detalhe") ?? "") })
    const r = await salvarMotivoDoDiaAction(anterior, dados)
    if (r.ok) setAbrindo(false)
    return r
  }, {})
  const mostrado = estado.rotulo ?? rotulo

  if (!abrindo) {
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {mostrado ? (
          <>
            <span>
              Motivo: <strong>{mostrado}</strong>
            </span>
            <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setAbrindo(true)}>
              Trocar
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAbrindo(true)}>
            Informar o motivo
          </Button>
        )}
      </span>
    )
  }
  const id = `motivo-${data}`
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="data" value={data} />
      <label className="sr-only" htmlFor={id}>
        Motivo
      </label>
      <SelectNativo
        id={id}
        name="motivo"
        required
        defaultValue={valores.motivo ?? atual?.motivo ?? ""}
        className="h-8 w-56"
      >
        <option value="" disabled>
          Por que usou o sistema?
        </option>
        {MOTIVOS_USO.map((m) => (
          <option key={m.chave} value={m.chave}>
            {m.rotulo}
          </option>
        ))}
      </SelectNativo>
      <label className="sr-only" htmlFor={`${id}-detalhe`}>
        Detalhe (opcional)
      </label>
      <Input
        id={`${id}-detalhe`}
        name="detalhe"
        maxLength={300}
        placeholder="Detalhe (opcional)"
        defaultValue={valores.detalhe ?? atual?.detalhe ?? ""}
        className="h-8 w-64"
      />
      <Button type="submit" size="sm" className="h-8" disabled={pendente}>
        {pendente && <Loader2 className="animate-spin" />}
        Salvar
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setAbrindo(false)} disabled={pendente}>
        Cancelar
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}
