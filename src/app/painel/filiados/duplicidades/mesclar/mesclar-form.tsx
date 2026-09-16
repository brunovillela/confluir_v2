"use client"

import Link from "next/link"
import { useActionState, useMemo, useState } from "react"
import { Loader2, Merge } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { type EstadoForm } from "@/lib/contas"
import { formatarCpf } from "@/lib/cpf"

import { mesclarAction } from "../actions"

type Cadastro = {
  id: string
  valores: Record<string, string | null>
  condicao: string | null
  criadoEm: string | null
  vinculos: number
  contribuicoes: number
  prontuario: number
}

const dataBr = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10).split("-").reverse().join("/") : v)

function exibir(campo: string, valor: string | null): string {
  if (valor === null) return "—"
  if (campo === "cpf") return formatarCpf(valor)
  if (campo === "nascimento_data") return dataBr(valor) ?? "—"
  if (campo === "tl_lgpd_id" || campo === "tl_desconto_id") return "aceito"
  return valor
}

/**
 * Escolha do cadastro principal e, campo a campo, de qual cadastro vem o
 * valor. Por padrão vale o do principal; campo vazio nele herda o primeiro
 * preenchido dos outros.
 */
export function MesclarForm({
  cadastros,
  campos,
  sugerido,
}: {
  cadastros: Cadastro[]
  campos: { campo: string; rotulo: string }[]
  sugerido: string
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(mesclarAction, {})
  const [principal, setPrincipal] = useState(sugerido)
  const [escolhas, setEscolhas] = useState<Record<string, string>>({})

  const numero = (id: string) => cadastros.findIndex((c) => c.id === id) + 1
  const ordenados = useMemo(
    () => [cadastros.find((c) => c.id === principal)!, ...cadastros.filter((c) => c.id !== principal)],
    [cadastros, principal]
  )

  // Fonte padrão de cada campo: o principal, ou o primeiro que tem valor.
  const fontePadrao = (campo: string) =>
    ordenados.find((c) => c.valores[campo] !== null)?.id ?? principal
  const fonte = (campo: string) => escolhas[campo] ?? fontePadrao(campo)
  const valor = (campo: string) => cadastros.find((c) => c.id === fonte(campo))?.valores[campo] ?? null

  const divergentes = campos.filter(
    ({ campo }) => new Set(cadastros.map((c) => c.valores[campo]).filter((v) => v !== null)).size > 1
  )
  const outros = cadastros.filter((c) => c.id !== principal)
  const somar = (k: "vinculos" | "contribuicoes" | "prontuario") => outros.reduce((s, c) => s + c[k], 0)

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="principal" value={principal} />
      <input type="hidden" name="secundarios" value={outros.map((c) => c.id).join(",")} />
      {campos.map(({ campo }) => (
        <input key={campo} type="hidden" name={`campo_${campo}`} value={valor(campo) ?? ""} />
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Qual cadastro fica</CardTitle>
          <CardDescription>
            O principal continua existindo; os outros ficam excluídos, apontando para ele. Sugerimos
            o que carrega mais histórico.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {cadastros.map((c) => (
            <label
              key={c.id}
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors ${
                principal === c.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
              }`}
            >
              <input
                type="radio"
                name="escolha_principal"
                checked={principal === c.id}
                onChange={() => {
                  setPrincipal(c.id)
                  setEscolhas({})
                }}
                className="mt-1"
              />
              <span className="grid gap-0.5">
                <span className="font-medium">
                  Cadastro {numero(c.id)} · {c.valores.nome_completo ?? "sem nome"}
                  {c.id === sugerido && (
                    <Badge variant="outline" className="ml-2 align-middle">
                      sugerido
                    </Badge>
                  )}
                </span>
                <span className="text-muted-foreground text-xs">
                  Matrícula {c.valores.matricula_sindical ?? "—"} · {c.condicao ?? "sem condição"} · criado em{" "}
                  {dataBr(c.criadoEm) ?? "—"}
                </span>
                <span className="text-muted-foreground text-xs">
                  {c.vinculos} vínculo(s) · {c.contribuicoes} contribuição(ões) · {c.prontuario} apontamento(s)
                </span>
                <Link href={`/painel/filiados/${c.id}`} target="_blank" className="text-primary text-xs hover:underline">
                  Abrir cadastro
                </Link>
              </span>
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Dados que ficam no principal</CardTitle>
          <CardDescription>
            {divergentes.length === 0
              ? "Os cadastros não divergem em nenhum campo: campos vazios do principal são completados pelos outros."
              : "Onde os cadastros divergem, escolha o valor certo. Campos vazios do principal são completados pelos outros."}
          </CardDescription>
        </CardHeader>
        {divergentes.length > 0 && (
          <CardContent className="grid gap-4">
            {divergentes.map(({ campo, rotulo }) => (
              <fieldset key={campo} className="grid gap-1.5">
                <legend className="text-sm font-medium">{rotulo}</legend>
                <div className="flex flex-wrap gap-2">
                  {ordenados
                    .filter((c) => c.valores[campo] !== null)
                    .map((c) => (
                      <label
                        key={c.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${
                          fonte(campo) === c.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`escolha_${campo}`}
                          checked={fonte(campo) === c.id}
                          onChange={() => setEscolhas((e) => ({ ...e, [campo]: c.id }))}
                        />
                        <span>{exibir(campo, c.valores[campo])}</span>
                        <span className="text-muted-foreground text-xs">cad. {numero(c.id)}</span>
                      </label>
                    ))}
                </div>
              </fieldset>
            ))}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Confirmar</CardTitle>
          <CardDescription>
            Passam para o principal: {somar("vinculos")} vínculo(s), {somar("contribuicoes")} contribuição(ões),{" "}
            {somar("prontuario")} apontamento(s) de prontuário, além de contatos, dados bancários, reembolsos,
            hospedagens, atendimentos e processos. Nada é apagado, e a mesclagem fica registrada no prontuário.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirmar" className="mt-1 size-4" />
            Conferi que os {cadastros.length} cadastros são da mesma pessoa.
          </label>
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" asChild>
              <Link href="/painel/filiados/duplicidades">Cancelar</Link>
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <Merge />}
              Mesclar cadastros
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  )
}
