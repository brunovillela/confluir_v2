"use client"

import { useActionState, useState } from "react"
import { Loader2, ShieldCheck, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { GATILHOS, rotuloGatilho, type Gatilho } from "@/lib/espacos-constantes"

import { criarRegraAction, excluirRegraAction } from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Regra = {
  id: string
  gatilho: Gatilho
  de: number | null
  ate: number | null
  bombeiros: number
  segurancas: number
  observacao: string | null
}

export function Exigencias({
  espacoId,
  regras,
  podeGerir,
}: {
  espacoId: string
  regras: Regra[]
  podeGerir: boolean
}) {
  const [estado, formAction, pendente] = useActionState(criarRegraAction, {})
  const [gatilho, setGatilho] = useState<Gatilho>("publico")

  const faixas = regras.filter((r) => r.gatilho === "publico")
  const condicoes = regras.filter((r) => r.gatilho !== "publico")

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4" />
          Bombeiros civis e seguranças
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-muted-foreground text-sm">
          As regras somam: 200 pessoas pedem dois bombeiros, e bebida alcoólica
          pede mais um — são três. Quem solicita vê a conta antes de enviar o
          pedido.
        </p>

        {regras.length === 0 ? (
          <Alert variant="warning">
            <AlertDescription>
              Sem regra cadastrada, nenhuma exigência é apresentada a quem
              solicita.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-3">
            {faixas.length > 0 && (
              <div className="grid gap-1.5">
                <p className="text-sm font-medium">Por quantidade de pessoas</p>
                {faixas.map((r) => (
                  <LinhaRegra
                    key={r.id}
                    regra={r}
                    espacoId={espacoId}
                    podeGerir={podeGerir}
                    titulo={
                      r.ate === null
                        ? `A partir de ${r.de} pessoas`
                        : `De ${r.de} a ${r.ate} pessoas`
                    }
                  />
                ))}
              </div>
            )}
            {condicoes.length > 0 && (
              <div className="grid gap-1.5">
                <p className="text-sm font-medium">Por condição do evento</p>
                {condicoes.map((r) => (
                  <LinhaRegra
                    key={r.id}
                    regra={r}
                    espacoId={espacoId}
                    podeGerir={podeGerir}
                    titulo={rotuloGatilho(r.gatilho)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {podeGerir && (
          <form action={formAction} className="grid gap-3 rounded-md border p-3">
            <input type="hidden" name="espaco_id" value={espacoId} />
            {estado.erro && (
              <Alert variant="destructive">
                <AlertDescription>{estado.erro}</AlertDescription>
              </Alert>
            )}
            {estado.ok && (
              <Alert variant="success">
                <AlertDescription>{estado.ok}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="gatilho">O que dispara *</Label>
                <select
                  id="gatilho"
                  name="gatilho"
                  className={SELECT}
                  value={gatilho}
                  onChange={(e) => setGatilho(e.target.value as Gatilho)}
                >
                  {GATILHOS.map((g) => (
                    <option key={g.chave} value={g.chave}>
                      {g.rotulo}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="de">De (pessoas)</Label>
                <Input
                  id="de"
                  name="de"
                  type="number"
                  min={0}
                  disabled={gatilho !== "publico"}
                  placeholder={gatilho === "publico" ? "101" : "—"}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ate">Até (pessoas)</Label>
                <Input
                  id="ate"
                  name="ate"
                  type="number"
                  min={0}
                  disabled={gatilho !== "publico"}
                  placeholder={gatilho === "publico" ? "vazio = sem teto" : "—"}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="bombeiros">Bombeiros civis</Label>
                <Input id="bombeiros" name="bombeiros" type="number" min={0} defaultValue={0} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="segurancas">Seguranças</Label>
                <Input id="segurancas" name="segurancas" type="number" min={0} defaultValue={0} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="observacao">Outra exigência</Label>
                <Input
                  id="observacao"
                  name="observacao"
                  placeholder="Ex.: ambulância de plantão"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={pendente}>
                {pendente && <Loader2 className="animate-spin" />}
                Adicionar regra
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

function LinhaRegra({
  regra,
  espacoId,
  podeGerir,
  titulo,
}: {
  regra: Regra
  espacoId: string
  podeGerir: boolean
  titulo: string
}) {
  const exige = [
    regra.bombeiros > 0 &&
      `${regra.bombeiros} bombeiro${regra.bombeiros === 1 ? "" : "s"}`,
    regra.segurancas > 0 &&
      `${regra.segurancas} segurança${regra.segurancas === 1 ? "" : "s"}`,
    regra.observacao,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
      <span className="min-w-0">
        <span className="font-medium">{titulo}</span>
        <Badge variant="outline" className="text-muted-foreground ml-2">
          {exige || "nada"}
        </Badge>
      </span>
      {podeGerir && (
        <form action={excluirRegraAction}>
          <input type="hidden" name="id" value={regra.id} />
          <input type="hidden" name="espaco_id" value={espacoId} />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Excluir regra"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </form>
      )}
    </div>
  )
}
