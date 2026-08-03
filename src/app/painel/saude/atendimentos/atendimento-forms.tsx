"use client"

import { useActionState } from "react"
import { Loader2, Lock, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type {
  AtendimentoLinha,
  Profissional,
  TipoAtendimento,
} from "@/lib/db/atendimentos"

import {
  atualizarAtendimentoAction,
  criarAtendimentoAction,
  gravarRelatorioAction,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const AREA =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"

export function AtendimentoForm({
  atendimento,
  assistidos,
  tipos,
  profissionais,
  assistidoFixo,
}: {
  atendimento?: AtendimentoLinha
  assistidos: { id: string; nome: string }[]
  tipos: TipoAtendimento[]
  profissionais: Profissional[]
  assistidoFixo?: string
}) {
  const [estado, formAction, pendente] = useActionState(
    atendimento ? atualizarAtendimentoAction : criarAtendimentoAction,
    {}
  )

  return (
    <form action={formAction} className="grid gap-4">
      {atendimento && <input type="hidden" name="id" value={atendimento.id} />}

      <Card>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="assistido_id">Assistido *</Label>
              <select
                id="assistido_id"
                name="assistido_id"
                required
                defaultValue={
                  atendimento?.assistido_id ?? assistidoFixo ?? ""
                }
                className={SELECT}
              >
                <option value="" disabled>
                  Escolha o assistido
                </option>
                {assistidos.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground text-xs">
                Não filiados também são atendidos — cadastre o assistido sem
                vincular filiado.
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="data_atendimento">Data *</Label>
              <Input
                id="data_atendimento"
                name="data_atendimento"
                type="date"
                required
                defaultValue={atendimento?.data_atendimento ?? ""}
                className="[color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="tipo_id">Tipo de atendimento</Label>
              <select
                id="tipo_id"
                name="tipo_id"
                defaultValue={atendimento?.tipo_id ?? ""}
                className={SELECT}
              >
                <option value="">— não informado —</option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground text-xs">
                Define quem poderá ler o relatório clínico.
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="profissional_id">Profissional</Label>
              <select
                id="profissional_id"
                name="profissional_id"
                defaultValue={atendimento?.profissional_id ?? ""}
                className={SELECT}
              >
                <option value="">— não informado —</option>
                {profissionais
                  .filter((p) => !p.inativo)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.usuarioNome ?? p.profissao ?? "Profissional"}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="observacao_aberta">Observação aberta</Label>
            <textarea
              id="observacao_aberta"
              name="observacao_aberta"
              rows={3}
              defaultValue={atendimento?.observacao_aberta ?? ""}
              className={AREA}
              placeholder="Comparecimento, encaminhamento, retorno agendado…"
            />
            <p className="text-muted-foreground text-xs">
              Visível à equipe de saúde e à própria pessoa atendida, pela área
              do filiado. <strong>Não escreva conteúdo clínico aqui</strong> —
              avaliação, hipótese e diagnóstico vão no relatório.
            </p>
          </div>
        </CardContent>
      </Card>

      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}

      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {atendimento ? "Salvar alterações" : "Registrar atendimento"}
        </Button>
      </div>
    </form>
  )
}

/** Edição do relatório clínico. Só renderizada para quem tem acesso. */
export function RelatorioForm({
  atendimentoId,
  texto,
}: {
  atendimentoId: string
  texto: string
}) {
  const [estado, formAction, pendente] = useActionState(
    gravarRelatorioAction,
    {}
  )
  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="atendimento_id" value={atendimentoId} />
      <textarea
        name="relatorio"
        rows={10}
        defaultValue={texto}
        className={AREA}
        placeholder="Avaliação clínica, hipótese diagnóstica, conduta…"
      />
      <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
        <Lock className="mt-0.5 size-3 shrink-0" />
        Gravado cifrado. Legível apenas por profissional do mesmo tipo, pelo
        autor e pela coordenação clínica — nunca pela gestão nem pela pessoa
        atendida. Cada leitura fica registrada.
      </p>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar relatório
        </Button>
      </div>
    </form>
  )
}
