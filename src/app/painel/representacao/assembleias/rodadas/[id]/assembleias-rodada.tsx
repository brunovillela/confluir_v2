"use client"

import { useActionState, useState } from "react"
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react"

import { ModalidadeBadge } from "@/components/assembleias"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import {
  MODALIDADES,
  ROTULOS_MODALIDADE,
  type Modalidade,
} from "@/lib/assembleias-constantes"
import type { AssembleiaLinha } from "@/lib/db/assembleias"
import { formatarData } from "@/lib/formato"

import { apagarAssembleia, novaAssembleia, salvarAssembleia } from "./actions"

const TEXTAREA =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"

const DESCRICOES_MODALIDADE: Record<Modalidade, string> = {
  online: "Eleitores votam pelo sistema, em /votar.",
  urna: "Voto presencial registrado por mesário na urna (fase seguinte).",
  reuniao:
    "Encontro presencial com ata assinada; o resultado entra agregado (fase seguinte).",
}

export function AssembleiasDaRodada({
  rodadaId,
  assembleias,
  esquemaPronto,
  editavel,
  motivoBloqueio,
}: {
  rodadaId: string
  assembleias: AssembleiaLinha[]
  esquemaPronto: boolean
  editavel: boolean
  motivoBloqueio: string | null
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Assembleias da rodada</CardTitle>
        <CardDescription>
          Onde e como os aptos votam dentro do período: online, urna com
          mesário ou reunião de trabalhadores.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!esquemaPronto && (
          <Alert variant="warning">
            <AlertDescription>
              Rode <code>supabase/assembleias.sql</code> no SQL Editor do
              Supabase para habilitar o vínculo assembleia→rodada.
            </AlertDescription>
          </Alert>
        )}
        {!editavel && motivoBloqueio && (
          <p className="text-muted-foreground text-sm">{motivoBloqueio}</p>
        )}
        {assembleias.length === 0 && esquemaPronto && (
          <p className="text-muted-foreground py-2 text-center text-sm">
            Nenhuma assembleia cadastrada nesta rodada ainda.
          </p>
        )}
        {assembleias.map((a) => (
          <AssembleiaItem
            key={a.id}
            rodadaId={rodadaId}
            assembleia={a}
            editavel={editavel}
          />
        ))}
        {esquemaPronto && editavel && (
          <NovaAssembleiaForm rodadaId={rodadaId} />
        )}
      </CardContent>
    </Card>
  )
}

function CamposAssembleia({
  assembleia,
  prefixo,
}: {
  assembleia?: AssembleiaLinha
  prefixo: string
}) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-1.5 md:col-span-2">
          <Label htmlFor={`${prefixo}-nome`}>Nome da assembleia *</Label>
          <Input
            id={`${prefixo}-nome`}
            name="nome"
            required
            defaultValue={assembleia?.nome ?? ""}
            placeholder="Ex.: Assembleia online — Unidade central"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${prefixo}-inicio`}>Início</Label>
          <Input
            id={`${prefixo}-inicio`}
            name="data_inicio"
            type="date"
            defaultValue={assembleia?.data_inicio ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${prefixo}-termino`}>Término</Label>
          <Input
            id={`${prefixo}-termino`}
            name="data_termino"
            type="date"
            defaultValue={assembleia?.data_termino ?? ""}
          />
        </div>
        <div className="grid gap-1.5 md:col-span-2">
          <Label htmlFor={`${prefixo}-descricao`}>Descrição</Label>
          <textarea
            id={`${prefixo}-descricao`}
            name="descricao"
            rows={2}
            defaultValue={assembleia?.descricao ?? ""}
            className={TEXTAREA}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label>Modalidade *</Label>
        <RadioGroup
          name="modalidade"
          defaultValue={assembleia?.modalidade ?? "online"}
          className="grid gap-2 md:grid-cols-3"
        >
          {MODALIDADES.map((m) => (
            <label
              key={m}
              className="hover:bg-muted/40 flex cursor-pointer items-start gap-2 rounded-lg border p-3"
            >
              <RadioGroupItem value={m} className="mt-0.5" />
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">
                  {ROTULOS_MODALIDADE[m]}
                </span>
                <span className="text-muted-foreground text-xs">
                  {DESCRICOES_MODALIDADE[m]}
                </span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </div>

      <VotoEmSeparadoSwitch inicial={assembleia?.voto_em_separado ?? false} />
    </>
  )
}

function VotoEmSeparadoSwitch({ inicial }: { inicial: boolean }) {
  const [ativo, setAtivo] = useState(inicial)
  return (
    <label className="flex items-center gap-2 text-sm">
      <Switch
        checked={ativo}
        onCheckedChange={setAtivo}
        aria-label="Permitir voto em separado"
      />
      <span className={ativo ? "font-medium" : "text-muted-foreground"}>
        Voto em separado
      </span>
      <input type="hidden" name="voto_em_separado" value={ativo ? "on" : ""} />
    </label>
  )
}

function AssembleiaItem({
  rodadaId,
  assembleia,
  editavel,
}: {
  rodadaId: string
  assembleia: AssembleiaLinha
  editavel: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [estadoSalvar, salvarAction, salvando] = useActionState(
    salvarAssembleia,
    {}
  )
  const [estadoApagar, apagarAction, apagando] = useActionState(
    apagarAssembleia,
    {}
  )
  const erro = estadoSalvar.erro ?? estadoApagar.erro

  if (editando && editavel) {
    return (
      <form
        action={salvarAction}
        className="grid gap-4 rounded-lg border p-4"
      >
        {erro && (
          <Alert variant="destructive">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}
        <input type="hidden" name="rodada_id" value={rodadaId} />
        <input type="hidden" name="assembleia_id" value={assembleia.id} />
        <CamposAssembleia assembleia={assembleia} prefixo={assembleia.id} />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`${assembleia.id}-edital`}>Edital (PDF)</Label>
            <Input
              id={`${assembleia.id}-edital`}
              name="edital"
              type="file"
              accept="application/pdf"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${assembleia.id}-ata`}>Ata (PDF)</Label>
            <Input
              id={`${assembleia.id}-ata`}
              name="ata"
              type="file"
              accept="application/pdf"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={salvando}>
            {salvando && <Loader2 className="animate-spin" />}
            Salvar assembleia
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditando(false)}
          >
            Cancelar
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className="grid gap-2 rounded-lg border p-4">
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-1">
          <p className="text-sm font-medium">
            {assembleia.nome ?? "(sem nome)"}
          </p>
          <p className="text-muted-foreground text-xs">
            {assembleia.data_inicio || assembleia.data_termino
              ? `${formatarData(assembleia.data_inicio)} a ${formatarData(assembleia.data_termino)}`
              : "Sem datas definidas"}
            {assembleia.descricao ? ` · ${assembleia.descricao}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <ModalidadeBadge modalidade={assembleia.modalidade} />
          {assembleia.voto_em_separado && (
            <Badge variant="outline">Voto em separado</Badge>
          )}
          {editavel && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditando(true)}
                aria-label="Editar assembleia"
              >
                <Pencil />
              </Button>
              <form
                action={apagarAction}
                onSubmit={(e) => {
                  if (!confirm("Excluir esta assembleia?")) e.preventDefault()
                }}
              >
                <input type="hidden" name="rodada_id" value={rodadaId} />
                <input
                  type="hidden"
                  name="assembleia_id"
                  value={assembleia.id}
                />
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  disabled={apagando}
                  aria-label="Excluir assembleia"
                >
                  {apagando ? <Loader2 className="animate-spin" /> : <Trash2 />}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function NovaAssembleiaForm({ rodadaId }: { rodadaId: string }) {
  const [aberto, setAberto] = useState(false)
  const [estado, formAction, pendente] = useActionState(novaAssembleia, {})

  if (!aberto) {
    return (
      <div>
        <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
          <Plus />
          Nova assembleia
        </Button>
      </div>
    )
  }

  return (
    <form
      action={formAction}
      className="grid gap-4 rounded-lg border border-dashed p-4"
    >
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="rodada_id" value={rodadaId} />
      <CamposAssembleia prefixo="nova" />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
          Criar assembleia
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAberto(false)}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}
