"use client"

import { useActionState, useState } from "react"
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react"

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
import type { Pergunta } from "@/lib/db/assembleias"

import {
  novaOpcao,
  novaPergunta,
  removerOpcao,
  removerPergunta,
  salvarPergunta,
} from "./actions"

const TEXTAREA =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"

function pct(votos: number, total: number): string {
  if (total === 0) return "0%"
  return `${((votos / total) * 100).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })}%`
}

/** Perguntas da rodada — as assembleias usam as perguntas da sua rodada. */
export function Perguntas({
  rodadaId,
  perguntas,
  editavel,
  motivoBloqueio,
}: {
  rodadaId: string
  perguntas: Pergunta[]
  editavel: boolean
  motivoBloqueio: string | null
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Perguntas da rodada</CardTitle>
        <CardDescription>
          Todas as assembleias desta rodada usam as mesmas perguntas.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!editavel && motivoBloqueio && (
          <p className="text-muted-foreground text-sm">{motivoBloqueio}</p>
        )}
        {perguntas.length === 0 && (
          <p className="text-muted-foreground py-2 text-center text-sm">
            Nenhuma pergunta cadastrada ainda.
          </p>
        )}
        {perguntas.map((p, i) => (
          <PerguntaItem
            key={p.id}
            rodadaId={rodadaId}
            pergunta={p}
            numero={p.ordem ?? i + 1}
            editavel={editavel}
          />
        ))}
        {editavel && <NovaPerguntaForm rodadaId={rodadaId} />}
      </CardContent>
    </Card>
  )
}

function PerguntaItem({
  rodadaId,
  pergunta,
  numero,
  editavel,
}: {
  rodadaId: string
  pergunta: Pergunta
  numero: number
  editavel: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [estadoSalvar, salvarAction, salvando] = useActionState(
    salvarPergunta,
    {}
  )
  const [estadoRemover, removerAction, removendo] = useActionState(
    removerPergunta,
    {}
  )
  const erro = estadoSalvar.erro ?? estadoRemover.erro

  return (
    <div className="grid gap-3 rounded-lg border p-4">
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {editando && editavel ? (
        <form action={salvarAction} className="grid gap-3">
          <input type="hidden" name="rodada_id" value={rodadaId} />
          <input type="hidden" name="pergunta_id" value={pergunta.id} />
          <div className="grid gap-3 sm:grid-cols-[6rem_1fr]">
            <div className="grid gap-1.5">
              <Label htmlFor={`ordem-${pergunta.id}`}>Ordem</Label>
              <Input
                id={`ordem-${pergunta.id}`}
                name="ordem"
                type="number"
                min={1}
                defaultValue={pergunta.ordem ?? ""}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`pergunta-${pergunta.id}`}>Pergunta *</Label>
              <textarea
                id={`pergunta-${pergunta.id}`}
                name="pergunta"
                rows={2}
                required
                defaultValue={pergunta.pergunta ?? ""}
                className={TEXTAREA}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={salvando}>
              {salvando && <Loader2 className="animate-spin" />}
              Salvar
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
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-sm font-medium">
            <span className="text-muted-foreground mr-2 tabular-nums">
              {numero}.
            </span>
            {pergunta.pergunta ?? "(sem texto)"}
          </p>
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="tabular-nums">
              {pergunta.votos.toLocaleString("pt-BR")} voto
              {pergunta.votos === 1 ? "" : "s"}
            </Badge>
            {editavel && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditando(true)}
                  aria-label="Editar pergunta"
                >
                  <Pencil />
                </Button>
                <form
                  action={removerAction}
                  onSubmit={(e) => {
                    if (!confirm("Excluir esta pergunta e suas opções?")) {
                      e.preventDefault()
                    }
                  }}
                >
                  <input type="hidden" name="rodada_id" value={rodadaId} />
                  <input type="hidden" name="pergunta_id" value={pergunta.id} />
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    disabled={removendo || pergunta.votos > 0}
                    aria-label="Excluir pergunta"
                  >
                    {removendo ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Trash2 />
                    )}
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      <ul className="grid gap-1">
        {pergunta.opcoes.map((o) => (
          <li
            key={o.id}
            className="bg-muted/40 flex items-center justify-between gap-2 rounded px-3 py-1.5 text-sm"
          >
            <span>{o.opcao_resposta ?? "(sem texto)"}</span>
            <span className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs tabular-nums">
                {o.votos.toLocaleString("pt-BR")} voto{o.votos === 1 ? "" : "s"}{" "}
                · {pct(o.votos, pergunta.votos)}
              </span>
              {editavel && (
                <RemoverOpcaoBotao
                  rodadaId={rodadaId}
                  opcaoId={o.id}
                  temVotos={o.votos > 0}
                />
              )}
            </span>
          </li>
        ))}
      </ul>

      {editavel && (
        <AdicionarOpcao rodadaId={rodadaId} perguntaId={pergunta.id} />
      )}
    </div>
  )
}

function AdicionarOpcao({
  rodadaId,
  perguntaId,
}: {
  rodadaId: string
  perguntaId: string
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, opcaoAction, pendente] = useActionState(novaOpcao, {})

  if (!aberto) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={() => setAberto(true)}>
          <Plus />
          Adicionar opção
        </Button>
      </div>
    )
  }

  return (
    <form action={opcaoAction} className="grid gap-2">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="rodada_id" value={rodadaId} />
        <input type="hidden" name="pergunta_id" value={perguntaId} />
        <Input
          name="opcao_resposta"
          required
          autoFocus
          placeholder="Texto da opção de resposta"
          className="h-8 max-w-72"
        />
        <Button type="submit" variant="outline" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
          Adicionar
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

function RemoverOpcaoBotao({
  rodadaId,
  opcaoId,
  temVotos,
}: {
  rodadaId: string
  opcaoId: string
  temVotos: boolean
}) {
  const [, removerAction, removendo] = useActionState(removerOpcao, {})
  return (
    <form
      action={removerAction}
      onSubmit={(e) => {
        if (!confirm("Excluir esta opção de resposta?")) e.preventDefault()
      }}
    >
      <input type="hidden" name="rodada_id" value={rodadaId} />
      <input type="hidden" name="opcao_id" value={opcaoId} />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        className="size-6"
        disabled={removendo || temVotos}
        aria-label="Excluir opção"
      >
        {removendo ? <Loader2 className="animate-spin" /> : <X />}
      </Button>
    </form>
  )
}

function NovaPerguntaForm({ rodadaId }: { rodadaId: string }) {
  const [aberto, setAberto] = useState(false)
  const [estado, formAction, pendente] = useActionState(novaPergunta, {})

  if (!aberto) {
    return (
      <div>
        <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
          <Plus />
          Nova pergunta
        </Button>
      </div>
    )
  }

  return (
    <form
      action={formAction}
      className="grid gap-3 rounded-lg border border-dashed p-4"
    >
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="rodada_id" value={rodadaId} />
      <div className="grid gap-3 sm:grid-cols-[6rem_1fr]">
        <div className="grid gap-1.5">
          <Label htmlFor="nova-ordem">Ordem</Label>
          <Input id="nova-ordem" name="ordem" type="number" min={1} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="nova-pergunta">Pergunta *</Label>
          <textarea
            id="nova-pergunta"
            name="pergunta"
            rows={2}
            required
            placeholder="Ex.: Você aprova a proposta de acordo apresentada?"
            className={TEXTAREA}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="novas-opcoes">Opções de resposta (uma por linha)</Label>
        <textarea
          id="novas-opcoes"
          name="opcoes"
          rows={4}
          placeholder={"APROVO\nREPROVO\nABSTENÇÃO"}
          className={TEXTAREA}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
          Criar pergunta
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
