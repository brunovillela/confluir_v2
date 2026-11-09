"use client"

import { useActionState, useState } from "react"
import { CircleSlash, Loader2, RotateCcw, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import { type EstadoForm } from "@/lib/contas"
import { rotuloCompetencia } from "@/lib/repasse"

import { encerrarSemValoresAction, registrarSemValoresAction } from "./actions"

/** 202610 → "2026-10" (input month). */
const mes = (c: number) => `${Math.floor(c / 100)}-${String(c % 100).padStart(2, "0")}`

function Mensagem({ estado }: { estado: EstadoForm }) {
  if (estado.erro) return <p className="text-destructive text-sm">{estado.erro}</p>
  if (estado.ok) return <p className="text-success-fg text-sm">{estado.ok}</p>
  return null
}

/** Registrar que a empresa não tem valores a repassar a partir de uma competência. */
export function RegistrarSemValores({
  empresaId,
  sugestao,
  semFiliados,
}: {
  empresaId: string
  /** Competência sugerida para o início (AAAAMM). */
  sugestao: number
  /** Nenhum filiado ativo: abre o formulário já com o motivo sugerido. */
  semFiliados: boolean
}) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(registrarSemValoresAction, {})
  const envio = useEnvioFormulario(acao, estado)
  const [aberto, setAberto] = useState(false)
  if (!aberto) {
    return (
      <div className="grid gap-2">
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setAberto(true)}>
          <CircleSlash />
          Sem valores a repassar
        </Button>
        <Mensagem estado={estado} />
      </div>
    )
  }
  return (
    <form action={acao} {...envio} className="grid gap-3">
      <input type="hidden" name="empresa_id" value={empresaId} />
      <ErroNoCampo estado={estado} />
      <div className="grid gap-1.5">
        <Label htmlFor="sv-desde">A partir da competência</Label>
        <Input id="sv-desde" name="desde" type="month" defaultValue={mes(sugestao)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="sv-motivo">Motivo</Label>
        <Input
          id="sv-motivo"
          name="motivo"
          defaultValue={semFiliados ? "Todos os trabalhadores se desfiliaram" : ""}
          placeholder="Ex.: todos os trabalhadores se desfiliaram"
        />
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        Vale para todos os tipos de contribuição. O controle deixa de cobrar a relação dessa competência em diante, até
        você registrar que o desconto voltou. Se chegar uma relação ou um depósito, ele aparece normalmente.
      </p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Registrar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
      <Mensagem estado={estado} />
    </form>
  )
}

/** Encerrar o período em aberto: a empresa voltou a ter desconto. */
export function EncerrarSemValores({ empresaId, desde, sugestao }: { empresaId: string; desde: number; sugestao: number }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(encerrarSemValoresAction, {})
  const envio = useEnvioFormulario(acao, estado)
  const [aberto, setAberto] = useState(false)
  if (!aberto) {
    return (
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setAberto(true)}>
        <RotateCcw />
        Voltou a ter desconto
      </Button>
    )
  }
  return (
    <form action={acao} {...envio} className="grid gap-3">
      <input type="hidden" name="empresa_id" value={empresaId} />
      <ErroNoCampo estado={estado} />
      <div className="grid gap-1.5">
        <Label htmlFor="sv-retomada">O desconto volta na competência</Label>
        <Input id="sv-retomada" name="retomada" type="month" min={mes(desde)} defaultValue={mes(Math.max(sugestao, desde))} />
        <p className="text-muted-foreground text-xs">
          O período fica registrado de {rotuloCompetencia(desde)} até o mês anterior. Escolher {rotuloCompetencia(desde)}{" "}
          desfaz o registro.
        </p>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Confirmar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
      <Mensagem estado={estado} />
    </form>
  )
}
