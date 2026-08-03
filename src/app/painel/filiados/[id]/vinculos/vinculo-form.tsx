"use client"

import { useActionState } from "react"
import Link from "next/link"
import { Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
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
import { FILIACAO_CONDICOES } from "@/lib/filiacao"

import { atualizarVinculo, criarVinculo, excluirVinculo } from "./actions"

export type OpcaoFonte = { id: string; nome: string }

export type VinculoFormDados = {
  id: string
  fonte_pagadora_id: string | null
  cargo: string | null
  lotacao: string | null
  matricula: string | null
  data_entrada_admissao: string | null
  data_filiacao: string | null
  data_desfiliacao: string | null
  filiacao_condicao: string | null
}

function CampoData({
  nome,
  rotulo,
  valor,
}: {
  nome: string
  rotulo: string
  valor: string | null
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={nome}>{rotulo}</Label>
      <Input
        id={nome}
        name={nome}
        type="date"
        defaultValue={(valor ?? "").slice(0, 10)}
      />
    </div>
  )
}

export function VinculoForm({
  filiadoId,
  fontes,
  vinculo,
}: {
  filiadoId: string
  fontes: OpcaoFonte[]
  vinculo?: VinculoFormDados
}) {
  const [estado, formAction, pendente] = useActionState(
    vinculo ? atualizarVinculo : criarVinculo,
    {}
  )
  const [estadoExcluir, excluirAction, excluindo] = useActionState(
    excluirVinculo,
    {}
  )

  const erro = estado.erro ?? estadoExcluir.erro

  return (
    <div className="grid gap-4">
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <form action={formAction} className="grid gap-4">
        <input type="hidden" name="filiado_id" value={filiadoId} />
        {vinculo && <input type="hidden" name="vinculo_id" value={vinculo.id} />}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados do vínculo</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="fonte_pagadora_id">Fonte pagadora *</Label>
              <Select
                name="fonte_pagadora_id"
                defaultValue={vinculo?.fonte_pagadora_id ?? undefined}
                required
              >
                <SelectTrigger id="fonte_pagadora_id" className="w-full">
                  <SelectValue placeholder="Selecione a fonte" />
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
              <Label htmlFor="filiacao_condicao">Condição</Label>
              <Select
                name="filiacao_condicao"
                defaultValue={vinculo?.filiacao_condicao ?? "sem_condicao"}
              >
                <SelectTrigger id="filiacao_condicao" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sem_condicao">Sem condição</SelectItem>
                  {FILIACAO_CONDICOES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="matricula">Matrícula na fonte</Label>
              <Input
                id="matricula"
                name="matricula"
                defaultValue={vinculo?.matricula ?? ""}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cargo">Cargo</Label>
              <Input id="cargo" name="cargo" defaultValue={vinculo?.cargo ?? ""} />
            </div>
            <div className="grid gap-1.5 lg:col-span-2">
              <Label htmlFor="lotacao">Lotação</Label>
              <Input
                id="lotacao"
                name="lotacao"
                defaultValue={vinculo?.lotacao ?? ""}
              />
            </div>
            <CampoData
              nome="data_entrada_admissao"
              rotulo="Admissão na fonte"
              valor={vinculo?.data_entrada_admissao ?? null}
            />
            <CampoData
              nome="data_filiacao"
              rotulo="Filiação"
              valor={vinculo?.data_filiacao ?? null}
            />
            <CampoData
              nome="data_desfiliacao"
              rotulo="Desfiliação"
              valor={vinculo?.data_desfiliacao ?? null}
            />
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" asChild>
            <Link href={`/painel/filiados/${filiadoId}`}>Cancelar</Link>
          </Button>
          <Button type="submit" disabled={pendente}>
            {pendente && <Loader2 className="animate-spin" />}
            {vinculo ? "Salvar alterações" : "Adicionar vínculo"}
          </Button>
        </div>
      </form>

      {vinculo && (
        <form
          action={excluirAction}
          onSubmit={(e) => {
            if (!confirm("Excluir este vínculo do histórico de filiação?")) {
              e.preventDefault()
            }
          }}
          className="flex justify-end border-t pt-4"
        >
          <input type="hidden" name="filiado_id" value={filiadoId} />
          <input type="hidden" name="vinculo_id" value={vinculo.id} />
          <Button
            type="submit"
            variant="ghost"
            disabled={excluindo}
            className="text-destructive hover:text-destructive"
          >
            {excluindo ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Excluir vínculo
          </Button>
        </form>
      )}
    </div>
  )
}
