"use client"

import { useActionState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { atualizarFuncao, criarFuncao } from "../actions"

export type FuncaoFormDados = {
  id: string
  nome: string | null
  descricao: string | null
  ativo: boolean
}

export function FuncaoForm({ funcao }: { funcao?: FuncaoFormDados }) {
  const [estado, action, pendente] = useActionState(
    funcao ? atualizarFuncao : criarFuncao,
    {}
  )
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {funcao ? "Dados da função" : "Nova função"}
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
          {funcao && <input type="hidden" name="id" value={funcao.id} />}
          <div className="grid gap-1.5">
            <Label htmlFor="nome">Nome da função *</Label>
            <Input
              id="nome"
              name="nome"
              placeholder="Ex.: Assistente administrativo"
              defaultValue={funcao?.nome ?? ""}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              name="descricao"
              rows={2}
              placeholder="Resumo do cargo (ajuda a IA a sugerir o plano de cargos)"
              defaultValue={funcao?.descricao ?? ""}
            />
          </div>
          {funcao && (
            <label className="text-muted-foreground flex items-center gap-2 text-sm">
              <Checkbox name="ativo" defaultChecked={funcao.ativo} />
              Função ativa
            </label>
          )}
          <div className="flex items-center justify-end gap-2">
            {funcao && (
              <Button variant="ghost" asChild>
                <Link href="/painel/pessoal/atribuicoes/funcoes">Voltar</Link>
              </Button>
            )}
            <Button type="submit" disabled={pendente}>
              {pendente && <Loader2 className="animate-spin" />}
              {funcao ? "Salvar" : "Criar função"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
