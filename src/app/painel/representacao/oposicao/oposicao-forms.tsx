"use client"

import { useActionState } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { CampanhaDetalhe, OpcaoFonte } from "@/lib/db/oposicao"
import {
  MODOS_FORMALIZACAO,
  SITUACOES_CAMPANHA,
} from "@/lib/oposicao-constantes"

import {
  adicionarPerguntaAction,
  atualizarCampanhaAction,
  avaliarOpositorAction,
  criarCampanhaAction,
  excluirPerguntaAction,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const DATA =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const FILE =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-1.5 text-sm shadow-xs outline-none file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1"

export function CampanhaForm({
  campanha,
  fontes,
  fonteIds,
  aoCancelarHref,
}: {
  campanha?: CampanhaDetalhe
  fontes: OpcaoFonte[]
  fonteIds: string[]
  aoCancelarHref: string
}) {
  const [estado, formAction, pendente] = useActionState(
    campanha ? atualizarCampanhaAction : criarCampanhaAction,
    {}
  )
  const selec = new Set(fonteIds)

  return (
    <form action={formAction} className="grid gap-5">
      {campanha && (
        <input type="hidden" name="campanha_id" value={campanha.id} />
      )}
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="nome">Nome da campanha</Label>
        <Input id="nome" name="nome" required defaultValue={campanha?.nome ?? ""} />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="detalhe_desconto">Contribuição / detalhe do desconto</Label>
        <Textarea
          id="detalhe_desconto"
          name="detalhe_desconto"
          rows={2}
          defaultValue={campanha?.detalhe_desconto ?? ""}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="prazo_inicio">Prazo — início</Label>
          <input
            id="prazo_inicio"
            name="prazo_inicio"
            type="date"
            className={DATA}
            defaultValue={campanha?.prazo_inicio?.slice(0, 10) ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="prazo_fim">Prazo — término</Label>
          <input
            id="prazo_fim"
            name="prazo_fim"
            type="date"
            className={DATA}
            defaultValue={campanha?.prazo_fim?.slice(0, 10) ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="situacao">Situação</Label>
          <select
            id="situacao"
            name="situacao"
            className={SELECT}
            defaultValue={campanha?.situacao ?? "rascunho"}
          >
            {SITUACOES_CAMPANHA.map((s) => (
              <option key={s.chave} value={s.chave}>
                {s.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="modo_formalizacao">Formalização</Label>
          <select
            id="modo_formalizacao"
            name="modo_formalizacao"
            className={SELECT}
            defaultValue={campanha?.modo_formalizacao ?? "tela"}
          >
            {MODOS_FORMALIZACAO.map((m) => (
              <option key={m.chave} value={m.chave}>
                {m.rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Fontes pagadoras</legend>
        <p className="text-muted-foreground text-xs">
          Empregadores cujos trabalhadores podem se opor nesta campanha.
        </p>
        <div className="grid max-h-56 gap-1.5 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">
          {fontes.map((f) => (
            <label key={f.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="fonte"
                value={f.id}
                defaultChecked={selec.has(f.id)}
                className="size-4"
              />
              {f.nome}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="texto_declaracao">Texto da declaração</Label>
        <Textarea
          id="texto_declaracao"
          name="texto_declaracao"
          rows={4}
          placeholder="Declaração que o trabalhador aceita ao formalizar a oposição."
          defaultValue={campanha?.texto_declaracao ?? ""}
        />
      </div>

      <fieldset className="grid gap-4 rounded-md border p-4">
        <legend className="px-1 text-sm font-medium">
          Vídeos de sensibilização
        </legend>
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <div className="grid gap-1.5">
            <Label htmlFor="video_filiado_url">Vídeo — filiado (URL/ID)</Label>
            <Input
              id="video_filiado_url"
              name="video_filiado_url"
              defaultValue={campanha?.video_filiado_url ?? ""}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="video_filiado_tempo">Tempo mín. (s)</Label>
            <Input
              id="video_filiado_tempo"
              name="video_filiado_tempo"
              type="number"
              min={0}
              defaultValue={campanha?.video_filiado_tempo ?? ""}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <div className="grid gap-1.5">
            <Label htmlFor="video_nao_filiado_url">Vídeo — não filiado (URL/ID)</Label>
            <Input
              id="video_nao_filiado_url"
              name="video_nao_filiado_url"
              defaultValue={campanha?.video_nao_filiado_url ?? ""}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="video_nao_filiado_tempo">Tempo mín. (s)</Label>
            <Input
              id="video_nao_filiado_tempo"
              name="video_nao_filiado_tempo"
              type="number"
              min={0}
              defaultValue={campanha?.video_nao_filiado_tempo ?? ""}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="video_agradecimento_url">
            Vídeo — agradecimento (desistência)
          </Label>
          <Input
            id="video_agradecimento_url"
            name="video_agradecimento_url"
            defaultValue={campanha?.video_agradecimento_url ?? ""}
          />
        </div>
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="documento_modelo">
          Documento-modelo p/ assinatura gov.br (PDF, opcional)
        </Label>
        <input
          id="documento_modelo"
          name="documento_modelo"
          type="file"
          accept="application/pdf"
          className={FILE}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          {campanha ? "Salvar campanha" : "Criar campanha"}
        </Button>
        <Button type="button" variant="ghost" asChild>
          <a href={aoCancelarHref}>Cancelar</a>
        </Button>
      </div>
    </form>
  )
}

export function AdicionarPergunta({ campanhaId }: { campanhaId: string }) {
  const [estado, formAction, pendente] = useActionState(
    adicionarPerguntaAction,
    {}
  )
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="campanha_id" value={campanhaId} />
      <div className="grid min-w-64 flex-1 gap-1.5">
        <Label htmlFor="pergunta">Nova pergunta</Label>
        <Input id="pergunta" name="pergunta" required placeholder="Texto da pergunta" />
      </div>
      <Button type="submit" size="sm" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
        Adicionar
      </Button>
      {estado.erro && (
        <p className="text-destructive w-full text-xs">{estado.erro}</p>
      )}
    </form>
  )
}

export function AvaliarForm({
  opositorId,
  campanhaId,
}: {
  opositorId: string
  campanhaId: string
}) {
  const [estado, formAction, pendente] = useActionState(
    avaliarOpositorAction,
    {}
  )
  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="opositor_id" value={opositorId} />
      <input type="hidden" name="campanha_id" value={campanhaId} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="motivo">Motivo (obrigatório para reprovar)</Label>
        <Textarea id="motivo" name="motivo" rows={2} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          name="decisao"
          value="aprovar"
          disabled={pendente}
        >
          {pendente && <Loader2 className="animate-spin" />}
          Aprovar (procedente)
        </Button>
        <Button
          type="submit"
          name="decisao"
          value="reprovar"
          variant="destructive"
          disabled={pendente}
        >
          Reprovar (improcedente)
        </Button>
      </div>
    </form>
  )
}

export function BotaoExcluirPergunta({
  perguntaId,
  campanhaId,
}: {
  perguntaId: string
  campanhaId: string
}) {
  const [, formAction, pendente] = useActionState(excluirPerguntaAction, {})
  return (
    <form action={formAction}>
      <input type="hidden" name="pergunta_id" value={perguntaId} />
      <input type="hidden" name="campanha_id" value={campanhaId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        aria-label="Remover pergunta"
      >
        {pendente ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Trash2 className="text-destructive size-4" />
        )}
      </Button>
    </form>
  )
}
