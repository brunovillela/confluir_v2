"use client"

import { useActionState, useState } from "react"
import { Loader2, Lock, LockOpen } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatarDataHora } from "@/lib/formato"

import { fecharMesAction, reabrirMesAction } from "./actions"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

export type LinhaMes = {
  /** "AAAA-MM". */
  mes: string
  fechamento: { id: string; fechadoEm: string; fechadoPor: string | null; observacao: string | null } | null
}

const NOME_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

function rotulo(mes: string): string {
  return `${NOME_MES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`
}

/**
 * Fechamento dos meses para a contabilidade: fechado, a classificação das
 * ordens pagas no mês (centro, departamento, rateio) não muda mais. Reabrir
 * pede o motivo.
 */
export function FechamentoMeses({ meses, podeFechar }: { meses: LinhaMes[]; podeFechar: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Mês</TableHead>
          <TableHead>Situação</TableHead>
          {podeFechar && <TableHead className="w-[45%]" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {meses.map((m) => (
          <TableRow key={m.mes}>
            <TableCell className="font-medium tabular-nums">{rotulo(m.mes)}</TableCell>
            <TableCell className="text-xs">
              {m.fechamento ? (
                <span className="flex items-center gap-1.5">
                  <Lock className="size-3.5" />
                  Fechado em {formatarDataHora(m.fechamento.fechadoEm)}
                  {m.fechamento.fechadoPor ? ` por ${m.fechamento.fechadoPor}` : ""}
                  {m.fechamento.observacao ? ` — ${m.fechamento.observacao}` : ""}
                </span>
              ) : (
                <span className="text-muted-foreground">Aberto — as ordens pagas podem ser reclassificadas</span>
              )}
            </TableCell>
            {podeFechar && (
              <TableCell>{m.fechamento ? <Reabrir id={m.fechamento.id} /> : <Fechar mes={m.mes} />}</TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function Fechar({ mes }: { mes: string }) {
  const [estado, acao, pendente] = useActionState(fecharMesAction, {})
  const envio1 = useEnvioFormulario(acao, estado)
  return (
    <form action={acao} {...envio1} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="mes" value={mes} />
      <Input name="observacao" placeholder="Observação (opcional)" className="h-8 w-48" />
      <Button type="submit" size="sm" variant="outline" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Lock />}
        Fechar
      </Button>
      {estado.erro && (
        <Alert variant="destructive" className="w-full">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
    </form>
  )
}

function Reabrir({ id }: { id: string }) {
  const [aberto, setAberto] = useState(false)
  const [estado, acao, pendente] = useActionState(reabrirMesAction, {})
  const envio2 = useEnvioFormulario(acao, estado)
  if (!aberto) {
    return (
      <div className="flex justify-end">
        <Button type="button" size="sm" variant="ghost" onClick={() => setAberto(true)}>
          <LockOpen />
          Reabrir
        </Button>
      </div>
    )
  }
  return (
    <form action={acao} {...envio2} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="id" value={id} />
      <Input name="motivo" placeholder="Motivo da reabertura *" required className="h-8 w-56" autoFocus />
      <Button type="submit" size="sm" variant="outline" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <LockOpen />}
        Reabrir
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setAberto(false)}>
        Voltar
      </Button>
      {estado.erro && (
        <Alert variant="destructive" className="w-full">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
    </form>
  )
}
