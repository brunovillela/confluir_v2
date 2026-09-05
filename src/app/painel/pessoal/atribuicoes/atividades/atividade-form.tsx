"use client"

import { useActionState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PRESENCAS } from "@/lib/pessoal-sst-constantes"

import { atualizarAtividade, criarAtividade } from "../actions"

export type AtividadeFormDados = {
  id: string
  nome: string | null
  descricao: string | null
  presenca: string | null
  observacoes: string | null
}

const SELECT_CLS =
  "border-input bg-background h-9 rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/**
 * Dados básicos da atividade (catálogo). Função e recorrência NÃO ficam aqui:
 * a recorrência é de cada EXECUTOR (mesma atividade, cadências diferentes) e a
 * função vem do vínculo funcionário↔função.
 */
export function AtividadeForm({ atividade }: { atividade?: AtividadeFormDados }) {
  const [estado, action, pendente] = useActionState(
    atividade ? atualizarAtividade : criarAtividade,
    {}
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {atividade ? "Dados da atividade" : "Nova atividade"}
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
          {atividade && <input type="hidden" name="id" value={atividade.id} />}

          <div className="grid gap-1.5">
            <Label htmlFor="nome">Nome da atividade *</Label>
            <Input
              id="nome"
              name="nome"
              placeholder="Ex.: Emitir contracheques mensais"
              defaultValue={atividade?.nome ?? ""}
              required
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              name="descricao"
              rows={2}
              placeholder="O que a atividade envolve (ajuda a IA na análise de risco)"
              defaultValue={atividade?.descricao ?? ""}
            />
          </div>

          <div className="grid gap-1.5 sm:max-w-xs">
            <Label htmlFor="presenca">Presença física</Label>
            <select
              id="presenca"
              name="presenca"
              defaultValue={atividade?.presenca ?? ""}
              className={SELECT_CLS}
            >
              <option value="">— não definida —</option>
              {PRESENCAS.map((p) => (
                <option key={p.valor} value={p.valor}>
                  {p.rotulo}
                </option>
              ))}
            </select>
            <p className="text-muted-foreground text-xs">
              A recorrência (rotineira × não rotineira) e a frequência são
              definidas por executor, na seção de executores.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              name="observacoes"
              rows={2}
              defaultValue={atividade?.observacoes ?? ""}
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" asChild>
              <Link
                href={
                  atividade
                    ? `/painel/pessoal/atribuicoes/atividades/${atividade.id}`
                    : "/painel/pessoal/atribuicoes/atividades"
                }
              >
                {atividade ? "Voltar" : "Cancelar"}
              </Link>
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente && <Loader2 className="animate-spin" />}
              {atividade ? "Salvar atividade" : "Criar atividade"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
