"use client"

import { useActionState, useMemo, useState } from "react"
import { Loader2, Undo2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import { Textarea } from "@/components/ui/textarea"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import { type EstadoForm } from "@/lib/contas"
import { hhmm } from "@/lib/horas"
import { MOTIVOS_ACERTO, type FaixasAcerto, type MotivoAcerto } from "@/lib/ponto-acertos"

import { apagarAcertoAction, criarAcertoAction, salvarConfigAcertoAction } from "./actions"

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

function Retorno({ estado }: { estado: EstadoForm }) {
  if (estado.erro)
    return (
      <Alert variant="destructive">
        <AlertDescription>{estado.erro}</AlertDescription>
      </Alert>
    )
  if (estado.ok) return <p className="text-success-fg text-sm">{estado.ok}</p>
  return null
}

function FaixasEMotivo({ faixas, motivo, rotulos }: { faixas: FaixasAcerto; motivo: MotivoAcerto; rotulos: { f1: string; f2: string } }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <fieldset className="grid gap-1.5">
        <legend className="mb-1 text-sm font-medium">O que zera</legend>
        {(
          [
            ["ambas", `As duas faixas (${rotulos.f1} e ${rotulos.f2})`],
            ["faixa1", `Só a faixa de ${rotulos.f1}`],
            ["faixa2", `Só a faixa de ${rotulos.f2}`],
          ] as const
        ).map(([v, r]) => (
          <label key={v} className="flex items-center gap-2 text-sm">
            <input type="radio" name="faixas" value={v} defaultChecked={faixas === v} />
            {r}
          </label>
        ))}
      </fieldset>
      <div className="grid content-start gap-1.5">
        <Label htmlFor="acerto-motivo">Motivo (das horas a favor do funcionário)</Label>
        <SelectNativo id="acerto-motivo" name="motivo" defaultValue={motivo}>
          {MOTIVOS_ACERTO.map((m) => (
            <option key={m.chave} value={m.chave}>
              {m.rotulo}
            </option>
          ))}
        </SelectNativo>
        <p className="text-muted-foreground text-xs">Saldo negativo zerado é sempre descontado em folha.</p>
      </div>
    </div>
  )
}

export type PessoaAcerto = {
  funcionarioId: string
  nome: string
  departamento: string
  ativo: boolean
  saldo70: number
  saldo100: number
  origem: string | null
  bloqueio: string | null
}

export function NovoAcertoForm({
  competencia,
  pessoas,
  faixas,
  motivo,
  rotulos,
}: {
  competencia: string
  pessoas: PessoaAcerto[]
  faixas: FaixasAcerto
  motivo: MotivoAcerto
  rotulos: { f1: string; f2: string }
}) {
  const elegiveis = useMemo(() => pessoas.filter((p) => !p.bloqueio), [pessoas])
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(elegiveis.filter((p) => p.ativo && (p.saldo70 || p.saldo100)).map((p) => p.funcionarioId)))
  const [estado, formAction, pendente] = useActionState(criarAcertoAction, {})
  const envio = useEnvioFormulario(formAction, estado, {
    antes: (e) =>
      confirmarEnvio(
        e,
        `Zerar o banco de horas de ${marcados.size} pessoa(s) no fechamento de ${competencia.slice(5, 7)}/${competencia.slice(0, 4)}? A remessa seguinte de cada uma começa do zero.`
      ),
  })
  const departamentos = [...new Set(elegiveis.map((p) => p.departamento))].sort((a, b) => a.localeCompare(b, "pt-BR"))
  const marcar = (ids: string[], sim: boolean) =>
    setMarcados((m) => {
      const n = new Set(m)
      for (const id of ids) {
        if (sim) n.add(id)
        else n.delete(id)
      }
      return n
    })
  const somaMarcados = (campo: "saldo70" | "saldo100", sinal: 1 | -1) =>
    pessoas.filter((p) => marcados.has(p.funcionarioId) && p[campo] * sinal > 0).reduce((s, p) => s + p[campo], 0)
  const positivo = somaMarcados("saldo70", 1) + somaMarcados("saldo100", 1)
  const negativo = somaMarcados("saldo70", -1) + somaMarcados("saldo100", -1)

  return (
    <form action={formAction} {...envio} className="grid gap-5">
      <Retorno estado={estado} />
      <input type="hidden" name="competencia" value={competencia} />
      <input type="hidden" name="elegiveis" value={elegiveis.length} />
      {[...marcados].map((id) => (
        <input key={id} type="hidden" name="funcionario" value={id} />
      ))}

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Quem:</span>
          <Button type="button" variant="outline" size="sm" onClick={() => marcar(elegiveis.map((p) => p.funcionarioId), true)}>
            Todos ({elegiveis.length})
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setMarcados(new Set(elegiveis.filter((p) => p.ativo).map((p) => p.funcionarioId)))}>
            Só ativos
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setMarcados(new Set())}>
            Nenhum
          </Button>
          {departamentos.length > 1 && (
            <SelectNativo
              aria-label="Marcar um departamento"
              className="h-8 max-w-56 text-sm"
              value=""
              onChange={(e) => {
                const d = e.target.value
                if (d) setMarcados(new Set(elegiveis.filter((p) => p.departamento === d).map((p) => p.funcionarioId)))
              }}
            >
              <option value="">Só um departamento…</option>
              {departamentos.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </SelectNativo>
          )}
        </div>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground bg-muted/40 text-left text-xs">
              <tr>
                <th className="w-8 py-1.5 pl-3" />
                <th className="py-1.5 pr-3 font-medium">Funcionário</th>
                <th className="py-1.5 pr-3 font-medium">Departamento</th>
                <th className="py-1.5 pr-3 text-right font-medium">Saldo {rotulos.f1}</th>
                <th className="py-1.5 pr-3 text-right font-medium">Saldo {rotulos.f2}</th>
                <th className="py-1.5 pr-3 font-medium">Origem do saldo</th>
              </tr>
            </thead>
            <tbody>
              {pessoas.map((p) => (
                <tr key={p.funcionarioId} className={`border-t align-top ${p.bloqueio ? "text-muted-foreground" : ""}`}>
                  <td className="py-1.5 pl-3">
                    <input
                      type="checkbox"
                      aria-label={`Incluir ${p.nome}`}
                      disabled={Boolean(p.bloqueio)}
                      checked={marcados.has(p.funcionarioId)}
                      onChange={(e) => marcar([p.funcionarioId], e.target.checked)}
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    {p.nome}
                    {!p.ativo && <span className="text-muted-foreground"> (desligado)</span>}
                    {p.bloqueio && <div className="text-xs">{p.bloqueio}</div>}
                  </td>
                  <td className="py-1.5 pr-3">{p.departamento}</td>
                  <td className={`py-1.5 pr-3 text-right tabular-nums ${p.saldo70 < 0 ? "text-destructive" : ""}`}>{hhmm(p.saldo70)}</td>
                  <td className={`py-1.5 pr-3 text-right tabular-nums ${p.saldo100 < 0 ? "text-destructive" : ""}`}>{hhmm(p.saldo100)}</td>
                  <td className="text-muted-foreground py-1.5 pr-3 text-xs">{p.origem ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground text-xs">
          {marcados.size} pessoa(s) · {hhmm(positivo)} a favor dos funcionários
          {negativo < 0 ? ` · ${hhmm(-negativo)} a descontar em folha` : ""} (somando as duas faixas; o que zera de fato depende da escolha abaixo)
        </p>
      </div>

      <FaixasEMotivo faixas={faixas} motivo={motivo} rotulos={rotulos} />

      <div className="grid gap-1.5">
        <Label htmlFor="acerto-obs">Observação</Label>
        <Textarea id="acerto-obs" name="observacao" rows={2} placeholder="Ex.: cláusula 12ª do ACT 2026/2027 — zeramento semestral" />
      </div>

      <div>
        <Button type="submit" disabled={pendente || marcados.size === 0}>
          {pendente && <Loader2 className="animate-spin" />}
          Lançar o acerto ({marcados.size})
        </Button>
      </div>
    </form>
  )
}

export function ConfigAcertoForm({
  meses,
  faixas,
  motivo,
  rotulos,
}: {
  meses: number[]
  faixas: FaixasAcerto
  motivo: MotivoAcerto
  rotulos: { f1: string; f2: string }
}) {
  const [estado, formAction, pendente] = useActionState(salvarConfigAcertoAction, {})
  const envio = useEnvioFormulario(formAction, estado)
  return (
    <form action={formAction} {...envio} className="grid gap-4">
      <Retorno estado={estado} />
      <fieldset className="grid gap-1.5">
        <legend className="mb-1 text-sm font-medium">Meses em que o banco é zerado</legend>
        <div className="flex flex-wrap gap-3">
          {MESES.map((m, i) => (
            <label key={m} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="mes" value={i + 1} defaultChecked={meses.includes(i + 1)} />
              {m}
            </label>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">
          Nenhum mês marcado: sem acerto recorrente. Marcado, a caixa de entrada lembra no mês e no seguinte, até o acerto ser lançado.
        </p>
      </fieldset>
      <FaixasEMotivo faixas={faixas} motivo={motivo} rotulos={rotulos} />
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Salvar
        </Button>
      </div>
    </form>
  )
}

export function DesfazerAcertoBotao({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(apagarAcertoAction, {})
  const envio = useEnvioFormulario(formAction, estado, {
    antes: (e) => confirmarEnvio(e, "Desfazer o acerto? Os saldos voltam a correr como antes, e as remessas seguintes são recalculadas."),
  })
  return (
    <form action={formAction} {...envio} className="grid gap-2">
      <Retorno estado={estado} />
      <input type="hidden" name="id" value={id} />
      <div>
        <Button type="submit" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Undo2 />}
          Desfazer o acerto
        </Button>
      </div>
    </form>
  )
}
