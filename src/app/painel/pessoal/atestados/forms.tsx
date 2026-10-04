"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CamposPeriodo } from "@/components/campos-periodo"
import { TIPOS_AUSENCIA } from "@/lib/ausencias"
import { diasDoPeriodo } from "@/lib/periodo-dias"

import {
  atualizarAtestadoAction,
  atualizarAusenciaAction,
  criarAtestadoAction,
  criarAusenciaAction,
  excluirAtestadoAction,
  excluirAusenciaAction,
} from "./actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Funcionario = { usuarioId: string; nome: string }

/** Dias do atestado na edição: o registrado ou, sem ele, o derivado das datas. */
function diasDoAtestado(
  a: { inicio: string | null; termino: string | null; quantidade_dias: number | null } | undefined
): number | null {
  if (!a?.inicio) return null
  if (a.quantidade_dias) return a.quantidade_dias
  return a.termino ? diasDoPeriodo(a.inicio, a.termino) : null
}

function SelectFuncionario({
  funcionarios,
  defaultValue,
}: {
  funcionarios: Funcionario[]
  defaultValue: string
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="funcionario_id">Funcionário *</Label>
      <select
        id="funcionario_id"
        name="funcionario_id"
        required
        defaultValue={defaultValue}
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
  )
}

// ── Atestado ───────────────────────────────────────────────────────────────

export type AtestadoFormDados = {
  id: string
  funcionario_id: string | null
  inicio: string | null
  termino: string | null
  quantidade_dias: number | null
  cid10: string | null
  consideracao: string | null
  atestado_acompanhamento: boolean | null
  nome_acompanhado: string | null
  filho_menor_6_anos: boolean | null
  temArquivo: boolean
}

export function AtestadoForm({
  funcionarios,
  atestado,
}: {
  funcionarios: Funcionario[]
  atestado?: AtestadoFormDados
}) {
  const [estado, formAction, pendente] = useActionState(
    atestado ? atualizarAtestadoAction : criarAtestadoAction,
    {}
  )
  const [acompanhamento, setAcompanhamento] = useState(
    atestado?.atestado_acompanhamento === true
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {atestado ? "Editar atestado" : "Registrar atestado médico"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          {atestado && <input type="hidden" name="id" value={atestado.id} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectFuncionario
              funcionarios={funcionarios}
              defaultValue={atestado?.funcionario_id ?? ""}
            />
            <CamposPeriodo
              rotuloDias="Dias de afastamento *"
              nomeDias="quantidade_dias"
              placeholderDias="Ex.: 3"
              inicioPadrao={atestado?.inicio}
              diasPadrao={diasDoAtestado(atestado)}
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="cid10">CID-10</Label>
                <Input
                  id="cid10"
                  name="cid10"
                  placeholder="Ex.: J06.9"
                  defaultValue={atestado?.cid10 ?? ""}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="arquivo">
                Atestado (PDF/JPG/PNG{atestado?.temArquivo ? " — substitui o atual" : ""})
              </Label>
              <Input
                id="arquivo"
                name="arquivo"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="consideracao">Considerações</Label>
              <textarea
                id="consideracao"
                name="consideracao"
                rows={2}
                defaultValue={atestado?.consideracao ?? ""}
                className="border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"
              />
            </div>
            <div className="grid content-end gap-2 pb-1 sm:col-span-2">
              <label className="text-muted-foreground flex items-center gap-2 text-sm">
                <Checkbox
                  name="atestado_acompanhamento"
                  checked={acompanhamento}
                  onCheckedChange={(v) => setAcompanhamento(v === true)}
                />
                Atestado de acompanhamento
              </label>
            </div>
            {acompanhamento && (
              <>
                <div className="grid gap-1.5">
                  <Label htmlFor="nome_acompanhado">Nome do acompanhado</Label>
                  <Input
                    id="nome_acompanhado"
                    name="nome_acompanhado"
                    defaultValue={atestado?.nome_acompanhado ?? ""}
                  />
                </div>
                <div className="grid content-end pb-1">
                  <label className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Checkbox
                      name="filho_menor_6_anos"
                      defaultChecked={atestado?.filho_menor_6_anos === true}
                    />
                    Filho(a) menor de 6 anos
                  </label>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            {atestado && (
              <Button variant="ghost" asChild>
                <Link href="/painel/pessoal/atestados">Cancelar</Link>
              </Button>
            )}
            <Button type="submit" disabled={pendente}>
              {pendente && <Loader2 className="animate-spin" />}
              {atestado ? "Salvar atestado" : "Registrar atestado"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function ExcluirAtestadoBotao({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(
    excluirAtestadoAction,
    {}
  )
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        confirmarEnvio(e, "Excluir este atestado?")}}
      className="inline-flex items-center"
    >
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

// ── Ausência ───────────────────────────────────────────────────────────────

export type AusenciaFormDados = {
  id: string
  funcionario_id: string | null
  inicio: string | null
  termino: string | null
  motivo: string | null
  observacao?: string | null
}

export function AusenciaForm({
  funcionarios,
  ausencia,
}: {
  funcionarios: Funcionario[]
  ausencia?: AusenciaFormDados
}) {
  const [estado, formAction, pendente] = useActionState(
    ausencia ? atualizarAusenciaAction : criarAusenciaAction,
    {}
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {ausencia ? "Editar ausência" : "Registrar ausência"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          {ausencia && <input type="hidden" name="id" value={ausencia.id} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectFuncionario
              funcionarios={funcionarios}
              defaultValue={ausencia?.funcionario_id ?? ""}
            />
            <CamposPeriodo
              rotuloDias="Dias *"
              placeholderDias="Ex.: 1"
              inicioPadrao={ausencia?.inicio}
              diasPadrao={
                ausencia?.inicio
                  ? ausencia.termino
                    ? diasDoPeriodo(ausencia.inicio, ausencia.termino)
                    : 1
                  : null
              }
            />
            <div className="grid gap-1.5">
              <Label htmlFor="motivo">Tipo da ausência *</Label>
              <select
                id="motivo"
                name="motivo"
                required
                defaultValue={ausencia?.motivo ?? ""}
                className={SELECT}
              >
                <option value="" disabled>
                  Escolha…
                </option>
                {TIPOS_AUSENCIA.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground text-xs">
                É o que aparece no painel, na coluna do dia.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="observacao">Observação</Label>
              <Input
                id="observacao"
                name="observacao"
                placeholder="Ex.: Seminário da Mulher"
                defaultValue={ausencia?.observacao ?? ""}
              />
              <p className="text-muted-foreground text-xs">
                O detalhe do caso, quando houver.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            {ausencia && (
              <Button variant="ghost" asChild>
                <Link href="/painel/pessoal/atestados?aba=ausencias">
                  Cancelar
                </Link>
              </Button>
            )}
            <Button type="submit" disabled={pendente}>
              {pendente && <Loader2 className="animate-spin" />}
              {ausencia ? "Salvar ausência" : "Registrar ausência"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function ExcluirAusenciaBotao({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(
    excluirAusenciaAction,
    {}
  )
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        confirmarEnvio(e, "Excluir esta ausência?")}}
      className="inline-flex items-center"
    >
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
