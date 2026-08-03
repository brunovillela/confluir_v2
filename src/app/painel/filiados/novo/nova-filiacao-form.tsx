"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { limparCpf, validarCpf } from "@/lib/cpf"
import { FILIACAO_CONDICOES } from "@/lib/filiacao"
import { mascaraCpf, mascaraTelefone } from "@/lib/mascaras"

import { registrarFiliacao } from "./actions"

export function NovaFiliacaoForm({
  fontes,
}: {
  fontes: { id: string; nome: string }[]
}) {
  const [estado, formAction, pendente] = useActionState(registrarFiliacao, {})
  const [avisoCpf, setAvisoCpf] = useState<string | null>(null)

  async function verificarCpf(bruto: string) {
    const cpf = limparCpf(bruto)
    if (!cpf) {
      setAvisoCpf(null)
      return
    }
    if (!validarCpf(cpf)) {
      setAvisoCpf("CPF inválido — confira os dígitos.")
      return
    }
    try {
      const r = await fetch(
        `/painel/filiados/verificar-cpf?cpf=${encodeURIComponent(cpf)}`
      )
      const d = (await r.json()) as { valido: boolean; existente: boolean }
      setAvisoCpf(
        d.existente
          ? "Já existe um registro de filiação com este CPF."
          : null
      )
    } catch {
      setAvisoCpf(null)
    }
  }

  return (
    <form action={formAction} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identificação</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="nome_completo">Nome completo *</Label>
            <Input id="nome_completo" name="nome_completo" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cpf">CPF *</Label>
            <Input
              id="cpf"
              name="cpf"
              required
              inputMode="numeric"
              placeholder="000.000.000-00"
              aria-invalid={avisoCpf ? true : undefined}
              onChange={(e) => {
                e.target.value = mascaraCpf(e.target.value)
                if (avisoCpf) setAvisoCpf(null)
              }}
              onBlur={(e) => verificarCpf(e.target.value)}
            />
            {avisoCpf && (
              <p className="text-destructive text-xs">{avisoCpf}</p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="matricula_sindical">Matrícula sindical</Label>
            <Input id="matricula_sindical" name="matricula_sindical" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sexo">Sexo</Label>
            <Select name="sexo" defaultValue="nao_informado">
              <SelectTrigger id="sexo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nao_informado">Não informado</SelectItem>
                <SelectItem value="Masculino">Masculino</SelectItem>
                <SelectItem value="Feminino">Feminino</SelectItem>
                <SelectItem value="Outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="nascimento_data">Data de nascimento</Label>
            <Input id="nascimento_data" name="nascimento_data" type="date" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="filiacao_condicao">Condição da filiação</Label>
            <Select name="filiacao_condicao" defaultValue="Ativo">
              <SelectTrigger id="filiacao_condicao" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILIACAO_CONDICOES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="email_pessoal">Email</Label>
            <Input id="email_pessoal" name="email_pessoal" type="email" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="telefone_1">Telefone</Label>
            <Input
              id="telefone_1"
              name="telefone_1"
              inputMode="numeric"
              placeholder="(22) 99999-9999"
              onChange={(e) => {
                e.target.value = mascaraTelefone(e.target.value)
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vínculo com fonte pagadora</CardTitle>
          <CardDescription>
            Opcional — cria o primeiro vínculo do histórico de filiação.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="fonte_pagadora_id">Fonte pagadora</Label>
            <Select name="fonte_pagadora_id">
              <SelectTrigger id="fonte_pagadora_id" className="w-full">
                <SelectValue placeholder="Sem vínculo por enquanto" />
              </SelectTrigger>
              <SelectContent>
                {fontes.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cargo">Cargo</Label>
            <Input id="cargo" name="cargo" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="matricula_fonte">Matrícula na fonte</Label>
            <Input id="matricula_fonte" name="matricula_fonte" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="lotacao">Lotação</Label>
            <Input id="lotacao" name="lotacao" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="data_entrada_admissao">Admissão na fonte</Label>
            <Input
              id="data_entrada_admissao"
              name="data_entrada_admissao"
              type="date"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="data_filiacao">Data de filiação</Label>
            <Input id="data_filiacao" name="data_filiacao" type="date" />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" asChild>
          <Link href="/painel/filiados">Cancelar</Link>
        </Button>
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Registrar filiação
        </Button>
      </div>
    </form>
  )
}
