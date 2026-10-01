"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { Loader2, Save, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TIPOS_AGENDA_AVULSA, TITULO_MAX_AGENDA } from "@/lib/agenda-constantes"

import { excluirCompromissoAction, salvarCompromissoAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const DATA = SELECT
const TEXTAREA =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"

export type CompromissoFormDados = {
  id: string
  atividade: string | null
  tipo: string | null
  /** "AAAA-MM-DDTHH:mm" no horário de Brasília (paraCampoDataHora). */
  inicio: string
  termino: string
  diaTodo: boolean
  local: string | null
  sedeId: string | null
  departamentoId: string | null
  informacoesGerais: string | null
  eventoInterno: boolean
  aplicativo: boolean
}

type Opcao = { id: string; nome: string }

/** Cria (sem `compromisso`) ou edita um compromisso avulso. */
export function CompromissoForm({
  compromisso,
  sedes,
  departamentos,
}: {
  compromisso?: CompromissoFormDados
  sedes: Opcao[]
  departamentos: Opcao[]
}) {
  const [estado, acao, pendente] = useActionState(salvarCompromissoAction, {})
  const [diaTodo, setDiaTodo] = useState(compromisso?.diaTodo ?? false)
  const voltar = compromisso
    ? `/painel/ferramentas/agenda/${compromisso.id}`
    : "/painel/ferramentas/agenda"
  // Tipo legado fora da lista (ex.: vazio do Bubble) não vira opção inválida.
  const tipoInicial = (TIPOS_AGENDA_AVULSA as readonly string[]).includes(compromisso?.tipo ?? "")
    ? compromisso!.tipo!
    : ""

  return (
    <form action={acao} className="grid gap-4">
      {compromisso && <input type="hidden" name="id" value={compromisso.id} />}
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="atividade">Título *</Label>
            <Input
              id="atividade"
              name="atividade"
              required
              maxLength={TITULO_MAX_AGENDA}
              placeholder="Ex.: Reunião com a base do Edise"
              defaultValue={compromisso?.atividade ?? ""}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="tipo">Tipo *</Label>
            <select id="tipo" name="tipo" required defaultValue={tipoInicial} className={SELECT}>
              <option value="" disabled>
                Escolha o tipo
              </option>
              {TIPOS_AGENDA_AVULSA.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              name="dia_todo"
              checked={diaTodo}
              onChange={(e) => setDiaTodo(e.target.checked)}
              className="size-4"
            />
            Dia todo
          </label>

          {diaTodo ? (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="data_inicio">Data *</Label>
                <input
                  id="data_inicio"
                  name="data_inicio"
                  type="date"
                  required
                  defaultValue={compromisso?.inicio.slice(0, 10) ?? ""}
                  className={DATA}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="data_termino">Até (opcional)</Label>
                <input
                  id="data_termino"
                  name="data_termino"
                  type="date"
                  defaultValue={compromisso?.termino.slice(0, 10) ?? ""}
                  className={DATA}
                />
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="inicio">Início *</Label>
                <input
                  id="inicio"
                  name="inicio"
                  type="datetime-local"
                  required
                  defaultValue={compromisso?.inicio ?? ""}
                  className={DATA}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="termino">Término (opcional)</Label>
                <input
                  id="termino"
                  name="termino"
                  type="datetime-local"
                  defaultValue={compromisso?.termino ?? ""}
                  className={DATA}
                />
              </div>
            </>
          )}

          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="local">Local</Label>
            <Input
              id="local"
              name="local"
              placeholder="Ex.: Auditório da sede, ou link da reunião on-line"
              defaultValue={compromisso?.local ?? ""}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="sede_id">Sede</Label>
            <select id="sede_id" name="sede_id" defaultValue={compromisso?.sedeId ?? ""} className={SELECT}>
              <option value="">—</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="departamento_id">Departamento</Label>
            <select
              id="departamento_id"
              name="departamento_id"
              defaultValue={compromisso?.departamentoId ?? ""}
              className={SELECT}
            >
              <option value="">—</option>
              {departamentos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="informacoes_gerais">Informações gerais</Label>
            <textarea
              id="informacoes_gerais"
              name="informacoes_gerais"
              rows={4}
              placeholder="Pauta, quem participa, o que levar…"
              defaultValue={compromisso?.informacoesGerais ?? ""}
              className={TEXTAREA}
            />
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="aplicativo"
                defaultChecked={compromisso?.aplicativo ?? false}
                className="size-4"
              />
              Mostrar na agenda do portal do filiado
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="evento_interno"
                defaultChecked={compromisso?.eventoInterno ?? false}
                className="size-4"
              />
              Compromisso interno da equipe
            </label>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" asChild>
          <Link href={voltar}>Cancelar</Link>
        </Button>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {compromisso ? "Salvar alterações" : "Criar compromisso"}
        </Button>
      </div>
    </form>
  )
}

export function ExcluirCompromissoBotao({ id }: { id: string }) {
  const [estado, acao, pendente] = useActionState(excluirCompromissoAction, {})
  return (
    <form
      action={acao}
      onSubmit={(e) => {
        if (!confirm("Excluir este compromisso da Agenda?")) e.preventDefault()
      }}
      className="inline-flex items-center"
    >
      <input type="hidden" name="id" value={id} />
      {estado.erro && <span className="text-destructive mr-2 text-xs">{estado.erro}</span>}
      <Button
        type="submit"
        variant="outline"
        disabled={pendente}
        className="text-destructive hover:text-destructive"
      >
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
        Excluir
      </Button>
    </form>
  )
}
