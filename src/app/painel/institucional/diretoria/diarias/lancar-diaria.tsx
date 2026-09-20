"use client"

import { useActionState, useState } from "react"
import { Loader2, Plus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { type EstadoForm } from "@/lib/contas"
import type { DiretorParaDiaria } from "@/lib/db/diarias-diretoria"
import { formatarMoeda } from "@/lib/formato"

import { lancarDiariaDiretor } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none"

/**
 * Lançar diária em nome de um diretor. Fica FECHADO: o formulário só aparece
 * quando se clica (padrão da casa desde 18/09).
 */
export function LancarDiariaDiretor({
  diretores,
  tipos,
}: {
  diretores: DiretorParaDiaria[]
  tipos: { id: string; nome: string; valor: number | null }[]
}) {
  const [aberto, setAberto] = useState(false)
  const [diretorId, setDiretorId] = useState("")
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    lancarDiariaDiretor,
    {}
  )
  const diretor = diretores.find((d) => d.usuarioId === diretorId)

  if (!aberto) {
    return (
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAberto(true)} disabled={diretores.length === 0}>
          <Plus />
          Lançar diária
        </Button>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Lançar diária de diretor(a)</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="diretor_id">Diretor(a)</Label>
              <select
                id="diretor_id"
                name="diretor_id"
                required
                className={SELECT}
                value={diretorId}
                onChange={(e) => setDiretorId(e.target.value)}
              >
                <option value="">Escolha…</option>
                {diretores.map((d) => (
                  <option key={d.usuarioId} value={d.usuarioId}>
                    {d.nome}
                    {d.cargo ? ` — ${d.cargo}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="departamento_id">Departamento que banca</Label>
              <select
                id="departamento_id"
                name="departamento_id"
                className={SELECT}
                defaultValue=""
                key={diretor?.departamentoId ?? "sem"}
              >
                <option value="">
                  {diretor?.departamentoNome
                    ? `Do diretor — ${diretor.departamentoNome}`
                    : "Sem departamento (o financeiro classifica)"}
                </option>
                {[
                  ...new Map(
                    diretores
                      .filter((d) => d.departamentoId)
                      .map((d) => [d.departamentoId!, d.departamentoNome ?? "(sem nome)"])
                  ),
                ]
                  .sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))
                  .map(([id, nome]) => (
                    <option key={id} value={id}>
                      {nome}
                    </option>
                  ))}
              </select>
              <p className="text-muted-foreground text-xs">
                É o departamento que dá a conta contábil da diária.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="diaria_id">Tipo de diária</Label>
              <select id="diaria_id" name="diaria_id" required className={SELECT} defaultValue="">
                <option value="">Escolha…</option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                    {t.valor !== null ? ` — ${formatarMoeda(t.valor)}` : ""}
                  </option>
                ))}
              </select>
              {tipos.length === 0 && (
                <p className="text-muted-foreground text-xs">
                  Nenhum tipo liberado para a diretoria — marque o quadro em Pessoal → Diárias →
                  Tipos de diária.
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="quantidade">Quantidade</Label>
              <Input
                id="quantidade"
                name="quantidade"
                type="number"
                min="0.5"
                step="0.5"
                defaultValue="1"
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="data_inicio">Início</Label>
              <Input id="data_inicio" name="data_inicio" type="date" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="data_termino">Término</Label>
              <Input id="data_termino" name="data_termino" type="date" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="motivo">Atividade</Label>
            <Textarea
              id="motivo"
              name="motivo"
              required
              rows={2}
              placeholder="Ex.: reunião com a categoria na refinaria, com pernoite"
            />
          </div>

          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={pendente}>
              {pendente && <Loader2 className="animate-spin" />}
              Lançar diária
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <p className="text-muted-foreground text-xs">
              As despesas extras (hospedagem, alimentação) entram na tela da diária, depois de
              lançada.
            </p>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
