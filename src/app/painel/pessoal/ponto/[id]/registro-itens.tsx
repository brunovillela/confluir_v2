"use client"

import { useActionState, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { Calculator, Loader2, Trash2 } from "lucide-react"

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
  apurarEspelhoAction,
  atualizarRegistroPonto,
  criarRegistroPonto,
  excluirRegistroPonto,
} from "../actions"
import { confirmar, confirmarEnvio } from "@/components/ui/confirmacao"
import type { RemessaPosterior } from "@/lib/db/ponto-cascata"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

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
  posteriores,
}: {
  remessaId: string
  funcionarios: { usuarioId: string; nome: string }[]
  registro?: RegistroPontoFormDados
  saldosAnteriores: Record<string, SaldoAnteriorPonto>
  /** Percentual de cada faixa na entidade (as colunas são _70 e _100). */
  faixas: FaixasHE
  /** Por funcionário: remessas seguintes com registro dele (para perguntar se recalcula). */
  posteriores: Record<string, RemessaPosterior[]>
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
  const arquivoRef = useRef<HTMLInputElement>(null)
  const [apurando, iniciarApuracao] = useTransition()
  const [apuracao, setApuracao] = useState<{ erro?: string; ok?: string; alertas?: string[] }>({})

  // As realizadas saem das batidas do espelho, nunca dos totais do relatório.
  const apurar = () => {
    const arquivo = arquivoRef.current?.files?.[0]
    if (!arquivo) return setApuracao({ erro: "Escolha o espelho de ponto (PDF) primeiro." })
    const dados = new FormData()
    dados.set("arquivo", arquivo)
    setApuracao({})
    iniciarApuracao(async () => {
      const r = await apurarEspelhoAction(dados)
      if ("erro" in r) return setApuracao({ erro: r.erro })
      setCampos((c) => ({
        "70": { ...c["70"], realizadas: emHoras(r.faixa1) },
        "100": { ...c["100"], realizadas: emHoras(r.faixa2) },
      }))
      setApuracao({ ok: "Realizadas preenchidas pelas batidas — confira antes de salvar.", alertas: r.alertas })
    })
  }

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
          // A pergunta vem antes da transição (dentro dela, o diálogo só
          // apareceria no fim).
          onSubmit={async (e) => {
            e.preventDefault()
            const dados = new FormData(e.currentTarget)
            const depois = funcionarioId ? (posteriores[funcionarioId] ?? []) : []
            const mudouSaldo =
              !registro ||
              PERCENTUAIS.some((pct) => {
                const r = conta(pct)
                if ("erro" in r) return false
                const gravado = registro[`saldo_remanescente_${pct}`] ?? null
                return (gravado === null) !== (r.saldo === null) || Math.abs((gravado ?? 0) - (r.saldo ?? 0)) >= 0.01
              })
            if (depois.length > 0 && mudouSaldo) {
              const abertas = depois.filter((d) => !d.finalizada).map((d) => d.remessa)
              const finalizada = depois.find((d) => d.finalizada)?.remessa
              const recalcular = await confirmar({
                titulo: "Recalcular as remessas posteriores?",
                descricao: `O saldo remanescente deste funcionário muda, e as remessas seguintes partem dele: ${depois
                  .map((d) => d.remessa + (d.finalizada ? " (finalizada)" : ""))
                  .join(", ")}. Recalcular refaz o saldo da remessa anterior e o saldo remanescente dele em cada uma, em ordem${
                  finalizada ? ` — até ${finalizada}, que está finalizada e não muda` : ""
                }. Realizadas e pagas não mudam.${abertas.length === 0 ? " Nenhuma está aberta: nada seria recalculado." : ""}`,
                confirmar: "Recalcular",
                cancelar: "Salvar só esta",
              })
              if (recalcular) dados.set("recalcular_posteriores", "1")
            }
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
              <div className="flex gap-2">
                <Input ref={arquivoRef} id="arquivo" name="arquivo" type="file" accept="application/pdf" />
                <Button type="button" variant="outline" onClick={apurar} disabled={apurando}>
                  {apurando ? <Loader2 className="animate-spin" /> : <Calculator />}
                  Apurar pelas batidas
                </Button>
              </div>
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

          {(apuracao.erro || apuracao.ok) && (
            <Alert variant={apuracao.erro ? "destructive" : "default"}>
              <AlertDescription>
                {apuracao.erro ?? apuracao.ok}
                {apuracao.alertas && apuracao.alertas.length > 0 && (
                  <ul className="mt-1 list-disc pl-4">
                    {apuracao.alertas.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                )}
              </AlertDescription>
            </Alert>
          )}

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
  liberado = false,
  funcionario,
  posteriores = [],
}: {
  id: string
  remessaId: string
  /** Já liberado: o funcionário pode ter visto o espelho — confirmação mais forte. */
  liberado?: boolean
  funcionario?: string | null
  /** Remessas seguintes com registro do funcionário: pergunta se recalcula. */
  posteriores?: RemessaPosterior[]
}) {
  const [estado, formAction, pendente] = useActionState(excluirRegistroPonto, {})
  const recalcularRef = useRef<HTMLInputElement>(null)
  const exclusao = liberado
    ? {
        titulo: "Excluir um registro já liberado?",
        descricao: `${funcionario ?? "O funcionário"} já recebeu este espelho e pode tê-lo visto em Meu perfil. Ele some de lá; o aviso de liberação fica no histórico, sem link. O PDF do espelho também é apagado.`,
        confirmar: "Excluir mesmo assim",
        destrutivo: true,
      }
    : "Excluir este registro de ponto? O PDF do espelho também é apagado."
  const envio = useEnvioFormulario(formAction, estado, {
    antes: (e) => {
      if (!posteriores.length) return confirmarEnvio(e, exclusao)
      // Duas perguntas: excluir? e, sim, recalcular as seguintes? (o mesmo
      // segundo passe de confirmarEnvio: a marca deixa o reenvio seguir).
      const form = e.currentTarget
      if (form.dataset.confirmado === "1") {
        delete form.dataset.confirmado
        return
      }
      e.preventDefault()
      void (async () => {
        if (!(await confirmar(exclusao))) return
        const finalizada = posteriores.find((d) => d.finalizada)?.remessa
        const recalcular = await confirmar({
          titulo: "Recalcular as remessas posteriores?",
          descricao: `As remessas seguintes de ${funcionario ?? "o funcionário"} partem do saldo deste registro: ${posteriores
            .map((d) => d.remessa + (d.finalizada ? " (finalizada)" : ""))
            .join(", ")}. Sem ele, recalcular faz cada uma partir do saldo da remessa anterior a esta, em ordem${
            finalizada ? ` — até ${finalizada}, que está finalizada e não muda` : ""
          }. Realizadas e pagas não mudam.`,
          confirmar: "Excluir e recalcular",
          cancelar: "Só excluir",
        })
        if (recalcularRef.current) recalcularRef.current.value = recalcular ? "1" : ""
        form.dataset.confirmado = "1"
        form.requestSubmit()
      })()
    },
  })

  return (
    <form
      action={formAction} {...envio}
      className="inline-flex"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="remessa_id" value={remessaId} />
      <input ref={recalcularRef} type="hidden" name="recalcular_posteriores" defaultValue="" />
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
