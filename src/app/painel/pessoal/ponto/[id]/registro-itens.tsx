"use client"

import { useActionState, useState, useTransition } from "react"
import Link from "next/link"
import { Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { SaldoAnteriorPonto } from "@/lib/db/ponto-analise"
import type { FaixasHE } from "@/lib/faixas-he"
import { decimalHoras, duasCasas, hhmm, lerHoras } from "@/lib/horas"

import {
  atualizarRegistroPonto,
  criarRegistroPonto,
  excluirRegistroPonto,
} from "../actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type RegistroPontoFormDados = {
  id: string
  funcionario_id: string | null
  funcionarioNome: string | null
  liberado: boolean | null
  horas_realizadas_70: number | null
  horas_pagas_70: number | null
  saldo_remanescente_70: number | null
  saldo_remessa_anterior_70: number | null
  horas_realizadas_100: number | null
  horas_pagas_100: number | null
  saldo_remanescente_100: number | null
  saldo_remessa_anterior_100: number | null
}

const PERCENTUAIS = ["70", "100"] as const
type Pct = (typeof PERCENTUAIS)[number]
type CamposPct = { anterior: string; realizadas: string; pagas: string }

const emHoras = (v: number | null | undefined) => (v === null || v === undefined ? "" : hhmm(v))

/**
 * Formulário de registro de ponto: criação (com seleção de funcionário) ou
 * edição (funcionário fixo, vindo de ?editar=<id> na página da remessa).
 *
 * Horas em HH:MM. O saldo da remessa anterior vem preenchido (o saldo
 * remanescente do funcionário na remessa da competência anterior) e o saldo
 * remanescente é a conta anterior + realizadas − pagas — o servidor refaz a
 * mesma conta ao gravar. As pagas aparecem também em decimal, que é o que vai
 * à contabilidade.
 */
export function RegistroPontoForm({
  remessaId,
  funcionarios,
  registro,
  saldosAnteriores,
  faixas,
}: {
  remessaId: string
  funcionarios: { usuarioId: string; nome: string }[]
  registro?: RegistroPontoFormDados
  saldosAnteriores: Record<string, SaldoAnteriorPonto>
  /** Percentual de cada faixa na entidade (as colunas são _70 e _100). */
  faixas: FaixasHE
}) {
  const [estado, formAction, pendente] = useActionState(
    registro ? atualizarRegistroPonto : criarRegistroPonto,
    {}
  )
  const [, iniciar] = useTransition()

  const inicial = (pct: Pct): CamposPct => {
    const gravado = registro?.[`saldo_remessa_anterior_${pct}`] ?? null
    const sugerido = registro?.funcionario_id ? saldosAnteriores[registro.funcionario_id] : undefined
    return {
      anterior: emHoras(gravado ?? (pct === "70" ? sugerido?.saldo70 : sugerido?.saldo100) ?? null),
      realizadas: emHoras(registro?.[`horas_realizadas_${pct}`]),
      pagas: emHoras(registro?.[`horas_pagas_${pct}`]),
    }
  }
  const [funcionarioId, setFuncionarioId] = useState(registro?.funcionario_id ?? "")
  const [campos, setCampos] = useState<Record<Pct, CamposPct>>(() => ({ "70": inicial("70"), "100": inicial("100") }))
  const origem = funcionarioId ? saldosAnteriores[funcionarioId] : undefined

  const escolherFuncionario = (id: string) => {
    setFuncionarioId(id)
    const s = saldosAnteriores[id]
    setCampos((c) => ({
      "70": { ...c["70"], anterior: emHoras(s?.saldo70 ?? null) },
      "100": { ...c["100"], anterior: emHoras(s?.saldo100 ?? null) },
    }))
  }
  const mudar = (pct: Pct, campo: keyof CamposPct, valor: string) =>
    setCampos((c) => ({ ...c, [pct]: { ...c[pct], [campo]: valor } }))

  const conta = (pct: Pct): { erro: true } | { saldo: number | null; pagas: number | null } => {
    const [a, r, p] = [campos[pct].anterior, campos[pct].realizadas, campos[pct].pagas].map(lerHoras)
    if ([a, r, p].some((v) => v !== null && Number.isNaN(v))) return { erro: true }
    if ([a, r, p].every((v) => v === null)) return { saldo: null, pagas: null }
    return {
      saldo: duasCasas(duasCasas(a ?? 0) + duasCasas(r ?? 0) - duasCasas(p ?? 0)),
      pagas: p === null ? null : duasCasas(p),
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {registro
            ? `Editar registro — ${registro.funcionarioNome ?? "(sem nome)"}`
            : "Adicionar registro de ponto"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          action={formAction}
          // Envio por transição: num erro, o React 19 limparia o formulário.
          onSubmit={(e) => {
            e.preventDefault()
            const dados = new FormData(e.currentTarget)
            iniciar(() => formAction(dados))
          }}
          className="grid gap-4"
        >
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          <input type="hidden" name="remessa_id" value={remessaId} />
          {registro && <input type="hidden" name="id" value={registro.id} />}

          <div className="grid gap-4 sm:grid-cols-2">
            {!registro && (
              <div className="grid gap-1.5">
                <Label htmlFor="funcionario_id">Funcionário *</Label>
                <select
                  id="funcionario_id"
                  name="funcionario_id"
                  required
                  value={funcionarioId}
                  onChange={(e) => escolherFuncionario(e.target.value)}
                  className={SELECT}
                >
                  <option value="" disabled>
                    Escolha o funcionário
                  </option>
                  {funcionarios.map((f) => (
                    <option key={f.usuarioId} value={f.usuarioId}>
                      {f.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="arquivo">
                Espelho de ponto (PDF{registro ? " — substitui o atual" : ", opcional"})
              </Label>
              <Input id="arquivo" name="arquivo" type="file" accept="application/pdf" />
            </div>
            <div className="grid content-end pb-1">
              <label className="text-muted-foreground flex items-center gap-2 text-sm">
                <Checkbox
                  name="liberado"
                  defaultChecked={registro ? registro.liberado === true : true}
                />
                Liberado para o funcionário
              </label>
            </div>
          </div>

          <p className="text-muted-foreground text-xs">
            Horas e minutos (ex.: 10:30).{" "}
            {funcionarioId
              ? origem
                ? `Saldo anterior trazido de ${origem.remessa} — confira.`
                : "Sem remessa anterior deste funcionário: informe o saldo anterior, se houver."
              : "Escolha o funcionário para trazer o saldo da remessa anterior."}
          </p>

          {PERCENTUAIS.map((pct) => {
            const r = conta(pct)
            const gravado = registro?.[`saldo_remanescente_${pct}`] ?? null
            const muda =
              registro !== undefined &&
              !("erro" in r) &&
              gravado !== null &&
              r.saldo !== null &&
              Math.abs(gravado - r.saldo) >= 0.01
            const entradas = [
              ["anterior", `saldo_remessa_anterior_${pct}`, "Saldo da remessa anterior"],
              ["realizadas", `horas_realizadas_${pct}`, "Realizadas no mês"],
              ["pagas", `horas_pagas_${pct}`, "Pagas no mês"],
            ] as const
            return (
              <div key={pct} className="grid gap-2">
                <p className="text-sm font-medium">Horas extras a {faixas[pct]}</p>
                <div className="grid gap-3 sm:grid-cols-4">
                  {entradas.map(([chave, nome, rotulo]) => (
                    <div key={nome} className="grid content-start gap-1.5">
                      <Label htmlFor={nome}>{rotulo}</Label>
                      <Input
                        id={nome}
                        name={nome}
                        inputMode="numeric"
                        placeholder="0:00"
                        value={campos[pct][chave]}
                        onChange={(e) => mudar(pct, chave, e.target.value)}
                        className="tabular-nums"
                      />
                      {chave === "pagas" && !("erro" in r) && r.pagas !== null && (
                        <p className="text-muted-foreground text-xs">
                          Em decimal (contabilidade):{" "}
                          <strong className="tabular-nums">{decimalHoras(r.pagas)}</strong>
                        </p>
                      )}
                    </div>
                  ))}
                  <div className="grid content-start gap-1.5">
                    <Label>Saldo remanescente</Label>
                    <div className="bg-muted/50 flex h-9 items-center rounded-md border px-3 text-sm font-medium tabular-nums">
                      {"erro" in r ? "Confira as horas" : r.saldo === null ? "—" : hhmm(r.saldo)}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {muda
                        ? `Gravado: ${hhmm(gravado)} — ao salvar, passa à conta.`
                        : "Anterior + realizadas − pagas"}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" asChild>
              <Link href={`/painel/pessoal/ponto/${remessaId}`}>Cancelar</Link>
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente && <Loader2 className="animate-spin" />}
              {registro ? "Salvar registro" : "Adicionar registro"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function ExcluirRegistroBotao({
  id,
  remessaId,
}: {
  id: string
  remessaId: string
}) {
  const [estado, formAction, pendente] = useActionState(excluirRegistroPonto, {})

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        confirmarEnvio(e, "Excluir este registro de ponto?")}}
      className="inline-flex"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="remessa_id" value={remessaId} />
      {estado.erro && (
        <span className="text-destructive mr-1 text-xs">{estado.erro}</span>
      )}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        className="text-destructive hover:text-destructive h-7 px-2"
      >
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
    </form>
  )
}
