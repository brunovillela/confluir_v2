"use client"

import { useActionState, useState } from "react"
import { Check, Loader2, Pencil, Save, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { CartaoEditavel } from "@/components/cartao-editavel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"
import { formatarData } from "@/lib/formato"

import { excluirVinculoAction, salvarDadosCadastraisAction, salvarVinculoAction } from "./actions"

export type DadosCadastraisTela = {
  nomeCompleto: string
  nomeGuerra: string | null
  cpf: string | null
  dataNascimento: string | null
  whatsapp: string | null
  email: string | null
}

export type VinculoTela = {
  id: string
  cargo: string | null
  lotacao: string | null
  matricula: string | null
  regime_trabalho: string | null
  contrato_admissao: string | null
  contrato_demissao: string | null
}

function Mensagem({ estado }: { estado: EstadoForm }) {
  if (estado.erro) return <p className="text-destructive text-sm">{estado.erro}</p>
  if (!estado.ok) return null
  return (
    <p className="text-success-fg flex items-center gap-1.5 text-sm">
      <Check className="size-4" />
      {estado.ok}
    </p>
  )
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="truncate">{valor || "—"}</dd>
    </div>
  )
}

/** Dados cadastrais do funcionário, com lápis (só a gestão do Pessoal). */
export function DadosCadastrais({
  usuarioId,
  dados,
  podeEditar,
}: {
  usuarioId: string
  dados: DadosCadastraisTela
  podeEditar: boolean
}) {
  const [estado, formAction, pendente] = useActionState(salvarDadosCadastraisAction, {})
  const resumo = (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
      <Dado rotulo="Nome completo" valor={dados.nomeCompleto} />
      <Dado rotulo="Como é chamado(a)" valor={dados.nomeGuerra} />
      <Dado rotulo="CPF" valor={dados.cpf} />
      <Dado rotulo="Nascimento" valor={dados.dataNascimento ? formatarData(dados.dataNascimento) : null} />
      <Dado rotulo="WhatsApp" valor={dados.whatsapp} />
      <Dado rotulo="E-mail (login)" valor={dados.email} />
    </dl>
  )
  if (!podeEditar) {
    return (
      <div className="rounded-xl border p-6">
        <p className="mb-3 font-medium">Dados cadastrais</p>
        {resumo}
      </div>
    )
  }
  return (
    <CartaoEditavel titulo="Dados cadastrais" resumo={resumo}>
      <form action={formAction} className="grid gap-3">
        <input type="hidden" name="usuario_id" value={usuarioId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="cad-nome">Nome completo *</Label>
            <Input id="cad-nome" name="nome_completo" required defaultValue={dados.nomeCompleto} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cad-guerra">Como é chamado(a)</Label>
            <Input id="cad-guerra" name="nome_guerra" defaultValue={dados.nomeGuerra ?? ""} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="cad-cpf">CPF</Label>
            <Input id="cad-cpf" name="cpf" inputMode="numeric" defaultValue={dados.cpf ?? ""} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cad-nasc">Nascimento</Label>
            <Input id="cad-nasc" name="data_nascimento" type="date" defaultValue={dados.dataNascimento ?? ""} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cad-whats">WhatsApp</Label>
            <Input id="cad-whats" name="whatsapp" defaultValue={dados.whatsapp ?? ""} />
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          O e-mail não se edita aqui: é o login da pessoa (Institucional › Usuários e permissões).
        </p>
        <Mensagem estado={estado} />
        <div>
          <Button type="submit" size="sm" disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" /> : <Save />}
            Salvar dados cadastrais
          </Button>
        </div>
      </form>
    </CartaoEditavel>
  )
}

/**
 * Um vínculo com a entidade: resumo, lápis que abre a edição (inclusive a data
 * de desligamento) e a exclusão para quem nunca fez parte da entidade.
 */
export function VinculoFuncionario({
  usuarioId,
  vinculo,
  podeEditar,
}: {
  usuarioId: string
  vinculo: VinculoTela
  podeEditar: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [estado, formAction, pendente] = useActionState(salvarVinculoAction, {})
  const [estadoExc, acaoExcluir, pendenteExc] = useActionState(
    async (prev: EstadoForm, formData: FormData) => {
      const r = await excluirVinculoAction(prev, formData)
      if (r.ok) toast.success(r.ok)
      return r
    },
    {}
  )
  const desligado = Boolean(vinculo.contrato_demissao)
  return (
    <div className="border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {vinculo.cargo ?? "(sem cargo)"}
            {desligado ? (
              <Badge variant="outline" className="text-muted-foreground">
                Desligado em {formatarData(vinculo.contrato_demissao)}
              </Badge>
            ) : (
              <Badge variant="outline" className="border-success/40 text-success-fg">
                Ativo
              </Badge>
            )}
          </p>
          <p className="text-muted-foreground text-xs">
            {[
              vinculo.lotacao,
              vinculo.regime_trabalho,
              vinculo.matricula && `matrícula ${vinculo.matricula}`,
              vinculo.contrato_admissao && `admissão ${formatarData(vinculo.contrato_admissao)}`,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
        {podeEditar && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditando((v) => !v)}
            aria-label={editando ? "Fechar edição" : "Editar vínculo"}
          >
            {editando ? <X /> : <Pencil />}
          </Button>
        )}
      </div>

      {editando && (
        <div className="bg-muted/30 mt-3 grid gap-4 rounded-md p-4">
          <form action={formAction} className="grid gap-3">
            <input type="hidden" name="usuario_id" value={usuarioId} />
            <input type="hidden" name="vinculo_id" value={vinculo.id} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="grid gap-1.5">
                <Label htmlFor={`cargo-${vinculo.id}`}>Cargo</Label>
                <Input id={`cargo-${vinculo.id}`} name="cargo" defaultValue={vinculo.cargo ?? ""} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`lot-${vinculo.id}`}>Lotação</Label>
                <Input id={`lot-${vinculo.id}`} name="lotacao" defaultValue={vinculo.lotacao ?? ""} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`reg-${vinculo.id}`}>Regime</Label>
                <Input id={`reg-${vinculo.id}`} name="regime_trabalho" defaultValue={vinculo.regime_trabalho ?? ""} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`mat-${vinculo.id}`}>Matrícula</Label>
                <Input id={`mat-${vinculo.id}`} name="matricula" defaultValue={vinculo.matricula ?? ""} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="grid gap-1.5">
                <Label htmlFor={`adm-${vinculo.id}`}>Admissão</Label>
                <Input id={`adm-${vinculo.id}`} name="contrato_admissao" type="date" defaultValue={vinculo.contrato_admissao ?? ""} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`dem-${vinculo.id}`}>Desligamento (demissão)</Label>
                <Input id={`dem-${vinculo.id}`} name="contrato_demissao" type="date" defaultValue={vinculo.contrato_demissao ?? ""} />
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              Para desligar, preencha a data de desligamento — a pessoa passa a{" "}
              <strong>Desligado</strong> e sai dos ativos. Apagar a data a reativa.
            </p>
            <Mensagem estado={estado} />
            <div>
              <Button type="submit" size="sm" disabled={pendente}>
                {pendente ? <Loader2 className="animate-spin" /> : <Save />}
                Salvar vínculo
              </Button>
            </div>
          </form>

          <form
            action={acaoExcluir}
            onSubmit={(e) => {
              if (
                !confirm(
                  "Excluir este vínculo? Use só para quem NUNCA fez parte da entidade (ex.: trabalhador de outra empresa cadastrado por engano). Para quem saiu, preencha a data de desligamento."
                )
              )
                e.preventDefault()
            }}
            className="grid gap-1.5 border-t pt-3"
          >
            <input type="hidden" name="usuario_id" value={usuarioId} />
            <input type="hidden" name="vinculo_id" value={vinculo.id} />
            <div>
              <Button type="submit" size="sm" variant="ghost" className="text-destructive" disabled={pendenteExc}>
                {pendenteExc ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Excluir vínculo (nunca fez parte da entidade)
              </Button>
            </div>
            <span className="text-muted-foreground text-xs">
              Recusado quando há contracheque, ponto ou férias — esses registros provam que a pessoa trabalhou aqui.
            </span>
            {estadoExc.erro && <span className="text-destructive text-xs">{estadoExc.erro}</span>}
          </form>
        </div>
      )}
    </div>
  )
}
