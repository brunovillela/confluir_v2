"use client"

import { useActionState, useEffect, useState } from "react"
import Link from "next/link"
import { Clock, Loader2 } from "lucide-react"

import { motivoDeHojeAction, salvarMotivoUsoAction, type EstadoMotivo } from "@/app/painel/uso/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SelectNativo } from "@/components/ui/select-nativo"
import {
  dentroDaJornada,
  type JornadaDia,
} from "@/lib/pessoal-sst-constantes"
import { MOTIVOS_USO } from "@/lib/uso-fora-expediente"

/**
 * Faixa fixa exibida quando o funcionário usa o sistema FORA do horário da
 * jornada contratada (cadastrada em Pessoal › Atribuições › Jornadas). Sem
 * jornada cadastrada, nada é exibido. Reavalia a cada minuto, no fuso de
 * São Paulo (o horário contratado é local, não o do navegador).
 */
export function AlertaForaJornada({ dias }: { dias: JornadaDia[] }) {
  const [fora, setFora] = useState(false)

  useEffect(() => {
    if (dias.length === 0) return
    const avaliar = () => {
      const agora = new Date()
      const partes = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Sao_Paulo",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(agora)
      const get = (t: string) => partes.find((p) => p.type === t)?.value ?? ""
      const DIA: Record<string, number> = {
        Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
      }
      const dia = DIA[get("weekday")]
      const minutos = Number(get("hour")) * 60 + Number(get("minute"))
      if (dia === undefined || Number.isNaN(minutos)) return
      const dentro = dentroDaJornada(dias, dia, minutos)
      // null = dia sem expediente → também é "fora do horário"
      setFora(dentro !== true)
    }
    avaliar()
    const timer = setInterval(avaliar, 60_000)
    return () => clearInterval(timer)
  }, [dias])

  if (!fora) return null

  return (
    <div
      role="status"
      // Sem sticky próprio: quem gruda é o bloco do cabeçalho, em
      // `painel/layout.tsx`. Dois sticky em top-0 se sobrepõem.
      className="border-warning/40 bg-warning/15 text-warning-fg flex items-start gap-2 border-b px-4 py-2 text-sm"
    >
      <Clock className="mt-0.5 size-4 shrink-0" />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <span>
          Você está acessando o sistema <strong>fora do seu horário de
          trabalho</strong>. Horas fora da jornada contratada podem gerar passivo
          trabalhista — combine com a gestão antes de trabalhar agora. O tempo de uso
          fora do horário fica registrado para o departamento de pessoal.
        </span>
        <MotivoDoDia />
      </div>
    </div>
  )
}

/**
 * O funcionário informa por que está usando o sistema fora do horário hoje
 * (urgência, combinado com a chefia…). Aparece no relatório de uso fora do
 * expediente e na conferência do ponto. Um motivo por dia, que dá para trocar.
 */
function MotivoDoDia() {
  const [rotulo, setRotulo] = useState<string | null>(null)
  const [disponivel, setDisponivel] = useState(false)
  const [abrindo, setAbrindo] = useState(false)
  const [estado, formAction, pendente] = useActionState<EstadoMotivo, FormData>(async (anterior, dados) => {
    const r = await salvarMotivoUsoAction(anterior, dados)
    if (r.rotulo) {
      setRotulo(r.rotulo)
      setAbrindo(false)
    }
    return r
  }, {})

  useEffect(() => {
    let vivo = true
    motivoDeHojeAction()
      .then((m) => {
        if (!vivo) return
        setDisponivel(m.estado !== "indisponivel")
        if (m.estado === "informado") setRotulo(m.rotulo)
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])

  if (!disponivel) return null
  if (!abrindo) {
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {rotulo ? (
          <>
            <span>
              Motivo de hoje: <strong>{rotulo}</strong>
            </span>
            <Button type="button" variant="link" size="sm" className="text-warning-fg h-auto p-0 text-xs underline" onClick={() => setAbrindo(true)}>
              Trocar
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" size="sm" className="h-7 bg-transparent text-xs" onClick={() => setAbrindo(true)}>
            Informar o motivo
          </Button>
        )}
        <Link href="/painel/perfil/ponto#uso-fora" className="underline underline-offset-2">
          Ver o meu uso e os dias anteriores
        </Link>
      </span>
    )
  }
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2 text-xs">
      <label className="sr-only" htmlFor="uso-motivo">
        Motivo
      </label>
      <SelectNativo id="uso-motivo" name="motivo" required defaultValue="" className="h-8 w-56 bg-background">
        <option value="" disabled>
          Por que está usando agora?
        </option>
        {MOTIVOS_USO.map((m) => (
          <option key={m.chave} value={m.chave}>
            {m.rotulo}
          </option>
        ))}
      </SelectNativo>
      <label className="sr-only" htmlFor="uso-detalhe">
        Detalhe (opcional)
      </label>
      <Input id="uso-detalhe" name="detalhe" maxLength={300} placeholder="Detalhe (opcional)" className="bg-background h-8 w-64" />
      <Button type="submit" size="sm" className="h-8" disabled={pendente}>
        {pendente && <Loader2 className="animate-spin" />}
        Salvar
      </Button>
      <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setAbrindo(false)} disabled={pendente}>
        Cancelar
      </Button>
      {estado.erro && <span className="text-destructive">{estado.erro}</span>}
    </form>
  )
}
