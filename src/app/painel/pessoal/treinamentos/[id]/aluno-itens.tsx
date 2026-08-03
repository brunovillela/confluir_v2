"use client"

import { useActionState } from "react"
import Link from "next/link"
import { Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  atualizarAlunoTreinamento,
  criarAlunoTreinamento,
  excluirAlunoTreinamento,
} from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type AlunoFormDados = {
  id: string
  aluno_id: string | null
  alunoNome: string | null
  data_inicio: string | null
  data_termino: string | null
  temCertificado: boolean
}

export function AlunoTreinamentoForm({
  treinamentoId,
  funcionarios,
  aluno,
}: {
  treinamentoId: string
  funcionarios: { usuarioId: string; nome: string }[]
  aluno?: AlunoFormDados
}) {
  const [estado, formAction, pendente] = useActionState(
    aluno ? atualizarAlunoTreinamento : criarAlunoTreinamento,
    {}
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {aluno
            ? `Editar aluno — ${aluno.alunoNome ?? "(sem nome)"}`
            : "Adicionar aluno"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
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
          <input type="hidden" name="treinamento_id" value={treinamentoId} />
          {aluno && <input type="hidden" name="id" value={aluno.id} />}

          <div className="grid gap-4 sm:grid-cols-2">
            {aluno ? (
              <div className="grid gap-1.5">
                <Label>Funcionário</Label>
                <Input value={aluno.alunoNome ?? "(sem nome)"} disabled />
                <input
                  type="hidden"
                  name="aluno_id"
                  value={aluno.aluno_id ?? ""}
                />
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="aluno_id">Funcionário *</Label>
                <select
                  id="aluno_id"
                  name="aluno_id"
                  required
                  defaultValue=""
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

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="data_inicio">Início *</Label>
                <Input
                  id="data_inicio"
                  name="data_inicio"
                  type="date"
                  required
                  defaultValue={aluno?.data_inicio ?? ""}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="data_termino">Término</Label>
                <Input
                  id="data_termino"
                  name="data_termino"
                  type="date"
                  defaultValue={aluno?.data_termino ?? ""}
                />
              </div>
            </div>

            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="certificado">
                Certificado (PDF/JPG/PNG
                {aluno?.temCertificado ? " — substitui o atual" : ", opcional"})
              </Label>
              <Input
                id="certificado"
                name="certificado"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            {aluno && (
              <Button variant="ghost" asChild>
                <Link href={`/painel/pessoal/treinamentos/${treinamentoId}`}>
                  Cancelar
                </Link>
              </Button>
            )}
            <Button type="submit" disabled={pendente}>
              {pendente && <Loader2 className="animate-spin" />}
              {aluno ? "Salvar aluno" : "Adicionar aluno"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function ExcluirAlunoBotao({
  treinamentoId,
  id,
}: {
  treinamentoId: string
  id: string
}) {
  const [estado, formAction, pendente] = useActionState(
    excluirAlunoTreinamento,
    {}
  )

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Excluir este aluno do treinamento?")) e.preventDefault()
      }}
      className="inline-flex items-center"
    >
      <input type="hidden" name="treinamento_id" value={treinamentoId} />
      <input type="hidden" name="id" value={id} />
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
