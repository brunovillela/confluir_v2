"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { Building, Building2, Check, Loader2, Pencil, Save, UserCheck, X } from "lucide-react"

import {
  FiliadoPicker,
  type SugestaoFiliado,
} from "@/components/filiado-picker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"
import { type Integrante } from "@/lib/db/diretoria"
import { formatarData } from "@/lib/formato"

import { atualizarIntegranteAction } from "../actions"
import { RemoverIntegrante } from "../diretoria-forms"

const INPUT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

function Selo({ rotulo, ativo }: { rotulo: string; ativo: boolean }) {
  return (
    <Badge
      variant="outline"
      className={
        ativo
          ? "border-success/40 text-success-fg"
          : "text-muted-foreground opacity-60"
      }
    >
      {rotulo}
    </Badge>
  )
}

const SITUACAO: Record<Integrante["situacao"], { rotulo: string; classe: string }> = {
  exercicio: { rotulo: "Em exercício", classe: "" },
  licenciado: { rotulo: "Licenciado", classe: "border-warning/40 text-warning-fg" },
  excluido: { rotulo: "Excluído", classe: "border-destructive/40 text-destructive" },
}

/**
 * Membro da diretoria como cartão (não célula de tabela — `<form>` dentro de
 * tabela é fragmentado pelo parser e perde campos). Info visível + lápis que
 * abre a edição inline (padrão [[confluir-ux-formularios]]).
 */
export function IntegranteLinha({
  integrante,
  mandatoId,
  grupos,
  departamentos,
}: {
  integrante: Integrante
  mandatoId: string
  grupos: { id: string; nome: string }[]
  /** Departamentos da pessoa em Organização (integrante ou coordenadora). */
  departamentos: string[]
}) {
  const [editando, setEditando] = useState(false)
  const [situacao, setSituacao] = useState(integrante.situacao)
  const afastado = integrante.situacao !== "exercicio"
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    atualizarIntegranteAction,
    {}
  )

  const inicial: SugestaoFiliado | null = integrante.filiacaoId
    ? {
        id: integrante.filiacaoId,
        nome_completo: integrante.nome,
        cpf: integrante.cpf,
        matricula_sindical: null,
        filiacao_condicao: null,
      }
    : null

  return (
    <div className="border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={`flex items-center gap-2 font-medium ${integrante.situacao === "excluido" ? "text-muted-foreground line-through" : ""}`}>
            {integrante.nome ?? "—"}
            {integrante.liberado && (
              <UserCheck className="text-success-fg size-4" />
            )}
          </p>
          <p className="text-muted-foreground text-xs">
            {integrante.cargo ?? "—"}
            {afastado && (
              <>
                {" · "}
                {SITUACAO[integrante.situacao].rotulo.toLowerCase()}
                {integrante.situacaoDesde ? ` desde ${formatarData(integrante.situacaoDesde)}` : ""}
                {integrante.situacaoMotivo ? ` — ${integrante.situacaoMotivo}` : ""}
              </>
            )}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {departamentos.length > 0 ? (
              departamentos.map((nome) => (
                <Badge key={`d-${nome}`} variant="outline" className="gap-1 font-normal">
                  <Building2 className="size-3" />
                  {nome}
                </Badge>
              ))
            ) : (
              <Badge variant="outline" className="text-muted-foreground gap-1 font-normal opacity-70">
                <Building2 className="size-3" />
                sem departamento
              </Badge>
            )}
            {integrante.instancias.map((nome) => (
              <Badge key={nome} variant="outline" className="border-primary/40 text-primary gap-1 font-normal">
                <Building className="size-3" />
                {nome}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {afastado && (
            <Badge variant="outline" className={SITUACAO[integrante.situacao].classe}>
              {SITUACAO[integrante.situacao].rotulo}
            </Badge>
          )}
          {integrante.liberado && <Selo rotulo="Liberado" ativo />}
          {integrante.podeAssinar && !afastado && <Selo rotulo="Assina" ativo />}
          <Selo rotulo="Filiado" ativo={integrante.ehFiliado} />
          <Selo rotulo="Usuário" ativo={integrante.temUsuario} />
          <Selo rotulo="Acesso" ativo={integrante.temAcesso} />
          <Button variant="outline" size="sm" asChild>
            <Link
              href={`/painel/institucional/diretoria/${mandatoId}/${integrante.id}`}
            >
              Ficha
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditando((v) => !v)}
            aria-label={editando ? "Fechar edição" : "Editar integrante"}
          >
            {editando ? <X /> : <Pencil />}
          </Button>
          <RemoverIntegrante integranteId={integrante.id} mandatoId={mandatoId} />
        </div>
      </div>

      {editando && (
        <form action={formAction} className="bg-muted/30 mt-3 grid gap-3 rounded-md p-4">
          <input type="hidden" name="integrante_id" value={integrante.id} />
          <input type="hidden" name="mandato_id" value={mandatoId} />

          <div className="grid gap-1.5">
            <Label>Pessoa (busque nos filiados para vincular)</Label>
            <FiliadoPicker
              endpoint="/painel/institucional/diretoria/busca-filiado"
              nome="filiacao_id"
              inicial={inicial}
              placeholder="Busque por nome, CPF ou matrícula"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor={`nome-${integrante.id}`}>Nome</Label>
              <Input
                id={`nome-${integrante.id}`}
                name="nome"
                defaultValue={integrante.nome ?? ""}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`cargo-${integrante.id}`}>Cargo</Label>
              <Input
                id={`cargo-${integrante.id}`}
                name="cargo"
                defaultValue={integrante.cargo ?? ""}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`grupo-${integrante.id}`}>Grupo</Label>
              <select
                id={`grupo-${integrante.id}`}
                name="grupo_id"
                defaultValue={integrante.grupoId ?? ""}
                className={INPUT}
              >
                <option value="">(sem grupo)</option>
                {grupos.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor={`situacao-${integrante.id}`}>Situação no mandato</Label>
              <select
                id={`situacao-${integrante.id}`}
                name="situacao"
                value={situacao}
                onChange={(e) => setSituacao(e.target.value as Integrante["situacao"])}
                className={INPUT}
              >
                <option value="exercicio">Em exercício</option>
                <option value="licenciado">Licenciado</option>
                <option value="excluido">Excluído</option>
              </select>
            </div>
            {situacao !== "exercicio" && (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor={`desde-${integrante.id}`}>Desde</Label>
                  <Input
                    id={`desde-${integrante.id}`}
                    name="situacao_desde"
                    type="date"
                    defaultValue={integrante.situacaoDesde ?? ""}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`motivo-${integrante.id}`}>Motivo</Label>
                  <Input
                    id={`motivo-${integrante.id}`}
                    name="situacao_motivo"
                    defaultValue={integrante.situacaoMotivo ?? ""}
                    placeholder="Ex.: licença para tratamento de saúde"
                  />
                </div>
              </>
            )}
          </div>
          {situacao !== "exercicio" && (
            <p className="text-muted-foreground text-xs">
              Licenciado e excluído não assinam ofícios. O membro continua na lista do mandato, marcado.
            </p>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="pode_assinar"
              value="1"
              defaultChecked={integrante.podeAssinar}
              className="size-4"
            />
            Assina ofícios
          </label>

          {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
          {estado.ok && (
            <p className="text-success-fg flex items-center gap-1.5 text-sm">
              <Check className="size-4" />
              {estado.ok}
            </p>
          )}
          <div>
            <Button type="submit" size="sm" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <Save />}
              Salvar integrante
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
