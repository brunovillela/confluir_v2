"use client"

import { useActionState, useState } from "react"
import { Loader2, Save, Upload } from "lucide-react"

import { FiliadoPicker, type SugestaoFiliado } from "@/components/filiado-picker"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MOTIVOS_RESCISAO } from "@/lib/juridico-constantes"

import {
  atualizarHomologacaoAction,
  criarHomologacaoAction,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type OpcaoFonte = { id: string; rotulo: string }

type ValoresIniciais = {
  id: string
  data: string | null
  data_demissao: string | null
  motivo: string | null
  fonte_pg_id: string | null
  observacoes: string | null
  filiadoInicial: SugestaoFiliado | null
  trabalhador_nome: string | null
  trabalhador_cpf: string | null
  temParecer: boolean
}

/** Campos partilhados entre criação e edição. */
function CamposHomologacao({
  buscaFiliadoEndpoint,
  fontes,
  inicial,
}: {
  buscaFiliadoEndpoint: string
  fontes: OpcaoFonte[]
  inicial?: ValoresIniciais
}) {
  // O trabalhador é um filiado OU um não-filiado (nome/CPF livres).
  const [naoFiliado, setNaoFiliado] = useState(
    inicial ? !inicial.filiadoInicial : false
  )

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="data">Data da homologação *</Label>
          <Input
            id="data"
            name="data"
            type="date"
            required
            defaultValue={inicial?.data ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="data_demissao">Data da demissão</Label>
          <Input
            id="data_demissao"
            name="data_demissao"
            type="date"
            defaultValue={inicial?.data_demissao ?? ""}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="motivo">Motivo da rescisão</Label>
        <select
          id="motivo"
          name="motivo"
          defaultValue={inicial?.motivo ?? ""}
          className={SELECT}
        >
          <option value="">Não informado</option>
          {MOTIVOS_RESCISAO.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="fonte_pg_id">Empregador</Label>
        <select
          id="fonte_pg_id"
          name="fonte_pg_id"
          defaultValue={inicial?.fonte_pg_id ?? ""}
          className={SELECT}
        >
          <option value="">Não informado</option>
          {fontes.map((f) => (
            <option key={f.id} value={f.id}>
              {f.rotulo}
            </option>
          ))}
        </select>
      </div>

      {/* Trabalhador: filiado ou não-filiado */}
      <fieldset className="grid gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Trabalhador</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="vinculo_ui"
              checked={!naoFiliado}
              onChange={() => setNaoFiliado(false)}
            />
            Filiado
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="vinculo_ui"
              checked={naoFiliado}
              onChange={() => setNaoFiliado(true)}
            />
            Não-filiado
          </label>
        </div>

        {/* O input hidden filiado_id só vale quando "Filiado" está ativo.
            No modo não-filiado, desmontamos o picker para não enviar id. */}
        {!naoFiliado ? (
          <FiliadoPicker
            endpoint={buscaFiliadoEndpoint}
            nome="filiado_id"
            inicial={inicial?.filiadoInicial ?? null}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="trabalhador_nome">Nome *</Label>
              <Input
                id="trabalhador_nome"
                name="trabalhador_nome"
                defaultValue={inicial?.trabalhador_nome ?? ""}
                placeholder="Nome completo do trabalhador"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="trabalhador_cpf">CPF</Label>
              <Input
                id="trabalhador_cpf"
                name="trabalhador_cpf"
                inputMode="numeric"
                defaultValue={inicial?.trabalhador_cpf ?? ""}
                placeholder="Somente números"
              />
            </div>
          </div>
        )}
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="observacoes">Observações</Label>
        <Textarea
          id="observacoes"
          name="observacoes"
          rows={3}
          defaultValue={inicial?.observacoes ?? ""}
          placeholder="Anotações sobre o acerto rescisório, pendências etc."
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="parecer">
          Parecer jurídico (PDF)
          {inicial?.temParecer && (
            <span className="text-muted-foreground ml-2 text-xs font-normal">
              — enviar um novo substitui o atual
            </span>
          )}
        </Label>
        <Input id="parecer" name="parecer" type="file" accept="application/pdf" />
      </div>
    </div>
  )
}

export function NovaHomologacaoForm({
  buscaFiliadoEndpoint,
  fontes,
}: {
  buscaFiliadoEndpoint: string
  fontes: OpcaoFonte[]
}) {
  const [estado, formAction, pendente] = useActionState(
    criarHomologacaoAction,
    {}
  )
  return (
    <form action={formAction} className="grid max-w-2xl gap-4">
      <CamposHomologacao
        buscaFiliadoEndpoint={buscaFiliadoEndpoint}
        fontes={fontes}
      />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar homologação
        </Button>
      </div>
    </form>
  )
}

export function EditarHomologacaoForm({
  buscaFiliadoEndpoint,
  fontes,
  inicial,
}: {
  buscaFiliadoEndpoint: string
  fontes: OpcaoFonte[]
  inicial: ValoresIniciais
}) {
  const [estado, formAction, pendente] = useActionState(
    atualizarHomologacaoAction,
    {}
  )
  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="id" value={inicial.id} />
      <CamposHomologacao
        buscaFiliadoEndpoint={buscaFiliadoEndpoint}
        fontes={fontes}
        inicial={inicial}
      />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Upload />}
          Salvar alterações
        </Button>
      </div>
    </form>
  )
}
