"use client"

import { useActionState } from "react"
import { ArrowRight, Loader2, Save } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"
import type { SugestaoModelo } from "@/lib/ia-sugestao-modelo"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

import { aplicarSugestaoModeloAction, salvarPrecoComparacaoAction } from "./actions"

function Retorno({ estado }: { estado: EstadoForm }) {
  if (estado.ok) {
    return (
      <Alert variant="success">
        <AlertDescription>{estado.ok}</AlertDescription>
      </Alert>
    )
  }
  if (estado.erro && !estado.campo) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{estado.erro}</AlertDescription>
      </Alert>
    )
  }
  return null
}

function dinheiro(usd: number, cotacao: number | null): string {
  const d = `US$ ${usd.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return cotacao ? `${d} (R$ ${(usd * cotacao).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : d
}

function UsarModelo({ s }: { s: SugestaoModelo }) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(aplicarSugestaoModeloAction.bind(null, s.processo, s.sugerido), {})
  return (
    <form
      action={action}
      onSubmit={(e) =>
        confirmarEnvio(
          e,
          `"${s.titulo}" passa a usar o ${s.sugerido}. Confira o resultado nas próximas vezes; para voltar, apague o modelo do processo em "Modelo por processo". Continuar?`
        )
      }
      className="grid gap-2"
    >
      <div>
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <ArrowRight />}
          Usar {s.sugerido}
        </Button>
      </div>
      <Retorno estado={estado} />
    </form>
  )
}

/** Processos simples que custariam bem menos num modelo menor (últimos 30 dias). */
export function SugestoesModelo({ sugestoes, cotacao }: { sugestoes: SugestaoModelo[]; cotacao: number | null }) {
  return (
    <ul className="divide-y">
      {sugestoes.map((s) => (
        <li key={s.processo} className="flex flex-wrap items-start justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{s.titulo}</p>
            <p className="text-muted-foreground text-xs">
              {s.chamadas.toLocaleString("pt-BR")} {s.chamadas === 1 ? "chamada" : "chamadas"} em 30 dias no{" "}
              <span className="font-mono">{s.modeloAtual}</span>: {dinheiro(s.custoAtual, cotacao)}. No <span className="font-mono">{s.sugerido}</span>,{" "}
              {s.custoSugerido < 0.01 ? "menos de US$ 0,01" : `cerca de ${dinheiro(s.custoSugerido, cotacao)}`}.
            </p>
            <p className="text-success-fg text-xs font-medium">Economia de cerca de {dinheiro(s.economia, cotacao)} por mês</p>
          </div>
          <UsarModelo s={s} />
        </li>
      ))}
    </ul>
  )
}

export type PrecoComparacao = { modelo: string; entrada: number | null; cache: number | null; saida: number | null; emUso: boolean }

function br(n: number | null): string {
  return n === null ? "" : String(n).replace(".", ",")
}

/** Preço de um modelo menor só para comparar; não troca o modelo de nenhum processo. */
export function PrecoComparacaoForm({ precos }: { precos: PrecoComparacao[] }) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(salvarPrecoComparacaoAction, {})
  const envio = useEnvioFormulario(action, estado)
  return (
    <div className="grid gap-3">
      {precos.length > 0 && (
        <ul className="text-muted-foreground grid gap-1 text-xs">
          {precos.map((p) => (
            <li key={p.modelo}>
              <span className="text-foreground font-mono">{p.modelo}</span>: entrada US$ {br(p.entrada)}
              {p.cache !== null ? ` · em cache US$ ${br(p.cache)}` : ""} · saída US$ {br(p.saida)} por milhão de tokens
              {p.emUso ? " · em uso num processo" : ""}
            </li>
          ))}
        </ul>
      )}
      <form action={action} {...envio} className="grid gap-3">
        <ErroNoCampo estado={estado} />
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="cmp-modelo" className="text-xs">
              Modelo
            </Label>
            <Input id="cmp-modelo" name="modelo" list="modelos-ia" placeholder="gpt-5.4-mini" className="w-44 font-mono text-xs" maxLength={64} autoComplete="off" spellCheck={false} />
          </div>
          {(
            [
              ["entrada", "Entrada"],
              ["cache", "Entrada em cache"],
              ["saida", "Saída"],
            ] as const
          ).map(([campo, rotulo]) => (
            <div key={campo} className="grid gap-1.5">
              <Label htmlFor={`cmp-${campo}`} className="text-xs">
                {rotulo}
              </Label>
              <Input id={`cmp-${campo}`} name={campo} inputMode="decimal" className="w-28" />
            </div>
          ))}
          <Button type="submit" variant="outline" disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" /> : <Save />}
            Guardar preço
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          US$ por 1 milhão de tokens, como na página de preços da OpenAI. Para apagar o preço de um modelo, informe o nome e deixe entrada e saída em branco.
        </p>
        <Retorno estado={estado} />
      </form>
    </div>
  )
}
