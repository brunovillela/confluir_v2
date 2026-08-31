"use client"

import { useState } from "react"
import { useActionState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  FREQUENCIAS,
  PRESENCAS,
  RECORRENCIAS,
  ROTULO_RECORRENCIA,
  sugerirRecorrencia,
} from "@/lib/pessoal-sst-constantes"

import { atualizarTarefa, criarTarefa } from "../actions"

export type TarefaFormDados = {
  id: string
  nome: string | null
  descricao: string | null
  funcao_id: string | null
  recorrencia: string | null
  frequencia: string | null
  presenca: string | null
  observacoes: string | null
}

const SELECT_CLS =
  "border-input bg-background h-9 rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export function TarefaForm({
  tarefa,
  funcoes,
  limiar,
}: {
  tarefa?: TarefaFormDados
  funcoes: { id: string; nome: string | null }[]
  limiar: string
}) {
  const [estado, action, pendente] = useActionState(
    tarefa ? atualizarTarefa : criarTarefa,
    {}
  )
  const [frequencia, setFrequencia] = useState(tarefa?.frequencia ?? "")
  const [recorrencia, setRecorrencia] = useState(tarefa?.recorrencia ?? "")
  const [recTocada, setRecTocada] = useState(Boolean(tarefa?.recorrencia))
  const sugestao = sugerirRecorrencia(frequencia || null, limiar)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {tarefa ? "Dados da tarefa" : "Nova tarefa"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          {estado.ok && (
            <Alert className="border-success/40 text-success-fg">
              <AlertDescription>{estado.ok}</AlertDescription>
            </Alert>
          )}
          {tarefa && <input type="hidden" name="id" value={tarefa.id} />}

          <div className="grid gap-1.5">
            <Label htmlFor="nome">Nome da tarefa *</Label>
            <Input
              id="nome"
              name="nome"
              placeholder="Ex.: Emitir contracheques mensais"
              defaultValue={tarefa?.nome ?? ""}
              required
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              name="descricao"
              rows={2}
              placeholder="O que a tarefa envolve (ajuda a IA na análise de risco)"
              defaultValue={tarefa?.descricao ?? ""}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="funcao_id">Função</Label>
              <select
                id="funcao_id"
                name="funcao_id"
                defaultValue={tarefa?.funcao_id ?? ""}
                className={SELECT_CLS}
              >
                <option value="">— sem função —</option>
                {funcoes.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome ?? "(sem nome)"}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="presenca">Presença física</Label>
              <select
                id="presenca"
                name="presenca"
                defaultValue={tarefa?.presenca ?? ""}
                className={SELECT_CLS}
              >
                <option value="">— não definida —</option>
                {PRESENCAS.map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="frequencia">Frequência</Label>
              <select
                id="frequencia"
                name="frequencia"
                value={frequencia}
                onChange={(e) => {
                  const v = e.target.value
                  setFrequencia(v)
                  if (!recTocada) {
                    setRecorrencia(sugerirRecorrencia(v || null, limiar) ?? "")
                  }
                }}
                className={SELECT_CLS}
              >
                <option value="">— não definida —</option>
                {FREQUENCIAS.map((f) => (
                  <option key={f.valor} value={f.valor}>
                    {f.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="recorrencia">Recorrência</Label>
              <select
                id="recorrencia"
                name="recorrencia"
                value={recorrencia}
                onChange={(e) => {
                  setRecorrencia(e.target.value)
                  setRecTocada(true)
                }}
                className={SELECT_CLS}
              >
                <option value="">— não definida —</option>
                {RECORRENCIAS.map((r) => (
                  <option key={r.valor} value={r.valor}>
                    {r.rotulo}
                  </option>
                ))}
              </select>
              {sugestao && (
                <p className="text-muted-foreground text-xs">
                  Sugestão pela frequência:{" "}
                  <strong>{ROTULO_RECORRENCIA[sugestao]}</strong>.
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              name="observacoes"
              rows={2}
              defaultValue={tarefa?.observacoes ?? ""}
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" asChild>
              <Link
                href={
                  tarefa
                    ? `/painel/pessoal/atribuicoes/tarefas/${tarefa.id}`
                    : "/painel/pessoal/atribuicoes/tarefas"
                }
              >
                {tarefa ? "Voltar" : "Cancelar"}
              </Link>
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente && <Loader2 className="animate-spin" />}
              {tarefa ? "Salvar tarefa" : "Criar tarefa"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
