"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import { frasePagamento, pagamentoDoAviso, type RegraPagamentoFerias } from "@/lib/ferias-pagamento"
import { formatarData } from "@/lib/formato"

import { salvarRegrasFerias } from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/** Próxima segunda-feira depois de hoje: o exemplo da prévia. */
function proximaSegunda(): string {
  const d = new Date()
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function RegrasFeriasForm({ regra, pendentes }: { regra: RegraPagamentoFerias; pendentes: number }) {
  const [estado, formAction, pendente] = useActionState(salvarRegrasFerias, {})
  const envio = useEnvioFormulario(formAction, estado, { manter: true })
  const [dias, setDias] = useState(regra.dias === null ? "" : String(regra.dias))
  const [contagem, setContagem] = useState(regra.uteis ? "uteis" : "corridos")
  const [descricao, setDescricao] = useState(regra.descricao ?? "")
  const [fundamento, setFundamento] = useState(regra.fundamento ?? "")
  const [exemplo] = useState(proximaSegunda)

  const n = dias.trim() === "" ? null : Number(dias)
  const pagamento =
    n !== null && Number.isInteger(n) && n >= 0
      ? pagamentoDoAviso(exemplo, { dias: n, uteis: contagem === "uteis", descricao, fundamento })
      : null

  return (
    <form action={formAction} {...envio} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pagamento das férias</CardTitle>
          <CardDescription>
            Preencha como está no acordo coletivo. Sem prazo informado, o aviso de férias não mostra
            data de pagamento.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="dias">Prazo: dias antes do início do gozo</Label>
            <Input
              id="dias"
              name="dias"
              type="number"
              min={0}
              max={60}
              inputMode="numeric"
              placeholder="Não informado"
              value={dias}
              onChange={(e) => setDias(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="contagem">Contagem</Label>
            <select
              id="contagem"
              name="contagem"
              className={SELECT}
              value={contagem}
              onChange={(e) => setContagem(e.target.value)}
            >
              <option value="uteis">Dias úteis (sem sábado, domingo e feriado nacional)</option>
              <option value="corridos">Dias corridos</option>
            </select>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="descricao">O que é pago (opcional)</Label>
            <Input
              id="descricao"
              name="descricao"
              maxLength={300}
              placeholder="Ex.: gratificação de férias de 100% da remuneração"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="fundamento">Fundamento (opcional)</Label>
            <Input
              id="fundamento"
              name="fundamento"
              maxLength={200}
              placeholder="Ex.: cláusula 3ª do ACT"
              value={fundamento}
              onChange={(e) => setFundamento(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Como fica no aviso</CardTitle>
          <CardDescription>Exemplo para férias começando em {formatarData(exemplo)}.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            {pagamento ? frasePagamento(pagamento, false) : "Sem prazo informado: o aviso não fala de pagamento."}
          </p>
        </CardContent>
      </Card>

      {pendentes > 0 && (
        <p className="text-muted-foreground text-sm">
          Ao salvar, {pendentes === 1 ? "o aviso que aguarda" : `os ${pendentes} avisos que aguardam`} assinatura{" "}
          {pendentes === 1 ? "é refeito e reenviado" : "são refeitos e reenviados"} com o texto novo, se ele mudar. O
          link antigo deixa de valer. Avisos já assinados não mudam.
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" asChild>
          <Link href="/painel/pessoal/ferias">Cancelar</Link>
        </Button>
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Salvar regras
        </Button>
      </div>
    </form>
  )
}
