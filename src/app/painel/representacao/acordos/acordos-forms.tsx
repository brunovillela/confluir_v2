"use client"

import { useActionState, useRef } from "react"
import { FileText, Loader2, Plus, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { AcordoDetalhe, OpcaoFonte } from "@/lib/db/acordos"
import type { DadosLidos } from "@/lib/db/acordos-leitura"
import {
  CATEGORIAS_CLAUSULA,
  SITUACOES_ACORDO,
  TIPOS_ACORDO,
} from "@/lib/acordos-constantes"

import {
  adicionarClausulaAction,
  atualizarAcordoAction,
  criarAcordoAction,
  excluirClausulaAction,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const DATA =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export function AcordoForm({
  acordo,
  fontes,
  fonteIds,
  aoCancelarHref,
  sugestao,
  grupos = [],
}: {
  acordo?: AcordoDetalhe
  fontes: OpcaoFonte[]
  fonteIds: string[]
  aoCancelarHref: string
  /** Grupos empresariais: marcam de uma vez as empresas representadas. */
  grupos?: { id: string; nome: string; fonteIds: string[] }[]
  /** Novo acordo pelo PDF: valores lidos pela IA e o PDF já enviado. */
  sugestao?: { caminho: string; nomeArquivo: string; dados: DadosLidos }
}) {
  const ia = sugestao?.dados
  const podeSeparar = Boolean(ia && !ia.escaneado && ia.clausulas > 0)
  const [estado, formAction, pendente] = useActionState(
    acordo ? atualizarAcordoAction : criarAcordoAction,
    {}
  )
  const selec = new Set(fonteIds)
  const formRef = useRef<HTMLFormElement>(null)
  /** Acordo do grupo inteiro: marca todas as empresas representadas dele. */
  function marcarGrupo(ids: string[]) {
    const caixas = formRef.current?.querySelectorAll<HTMLInputElement>('input[name="fonte"]') ?? []
    for (const c of caixas) if (ids.includes(c.value)) c.checked = true
  }

  return (
    <form ref={formRef} action={formAction} className="grid gap-5">
      {acordo && <input type="hidden" name="acordo_id" value={acordo.id} />}
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="tipo">Tipo</Label>
          <select
            id="tipo"
            name="tipo"
            className={SELECT}
            defaultValue={acordo?.tipo ?? ia?.tipo ?? "act"}
          >
            {TIPOS_ACORDO.map((t) => (
              <option key={t.chave} value={t.chave}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="situacao">Situação</Label>
          <select
            id="situacao"
            name="situacao"
            className={SELECT}
            defaultValue={acordo?.situacao ?? "em_negociacao"}
          >
            {SITUACOES_ACORDO.map((s) => (
              <option key={s.chave} value={s.chave}>
                {s.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="numero_registro">Nº de registro (MTE)</Label>
          <Input
            id="numero_registro"
            name="numero_registro"
            defaultValue={acordo?.numero_registro ?? ia?.numero_registro ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="data_base">Data-base (mês)</Label>
          <Input
            id="data_base"
            name="data_base"
            placeholder="Ex.: Setembro"
            defaultValue={acordo?.data_base ?? ia?.data_base ?? ""}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="titulo">Título</Label>
        <Input
          id="titulo"
          name="titulo"
          required
          defaultValue={acordo?.titulo ?? ia?.titulo ?? ""}
          placeholder="Ex.: ACT 2024/2025 — Petrobras"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="vigencia_inicio">Vigência — início</Label>
          <input
            id="vigencia_inicio"
            name="vigencia_inicio"
            type="date"
            className={DATA}
            defaultValue={acordo?.vigencia_inicio?.slice(0, 10) ?? ia?.vigencia_inicio ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="vigencia_fim">Vigência — término</Label>
          <input
            id="vigencia_fim"
            name="vigencia_fim"
            type="date"
            className={DATA}
            defaultValue={acordo?.vigencia_fim?.slice(0, 10) ?? ia?.vigencia_fim ?? ""}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="abrangencia">Abrangência</Label>
        <Textarea
          id="abrangencia"
          name="abrangencia"
          rows={2}
          placeholder="Base territorial e categorias cobertas."
          defaultValue={acordo?.abrangencia ?? ia?.abrangencia ?? ""}
        />
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">
          Fontes pagadoras / empregadores
        </legend>
        <p className="text-muted-foreground text-xs">
          Empregadores abrangidos (ACT). CCT da categoria pode ficar sem fonte.
        </p>
        {grupos.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground text-xs">Acordo do grupo inteiro:</span>
            {grupos.map((g) => (
              <Button
                key={g.id}
                type="button"
                variant="outline"
                size="sm"
                className="h-7"
                onClick={() => marcarGrupo(g.fonteIds)}
                title={`Marca as ${g.fonteIds.length} empresa(s) representada(s) do grupo`}
              >
                <Plus />
                {g.nome}
              </Button>
            ))}
          </div>
        )}
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

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="com_funcionarios_entidade"
          defaultChecked={acordo?.com_funcionarios_entidade ?? false}
          className="mt-0.5 size-4"
        />
        <span>
          Acordo com os <strong>funcionários da entidade</strong> (o sindicato
          como empregador)
          <span className="text-muted-foreground block text-xs">
            Acordos marcados aparecem na área Meu Perfil dos funcionários —
            inclusive vencidos, enquanto a situação for &quot;Vigente&quot;.
            Arquivar tira do Meu Perfil.
          </span>
        </span>
      </label>

      <div className="grid gap-1.5">
        <Label htmlFor="observacoes">Observações</Label>
        <Textarea
          id="observacoes"
          name="observacoes"
          rows={2}
          defaultValue={acordo?.observacoes ?? ""}
        />
      </div>

      {sugestao ? (
        <div className="grid gap-2 rounded-md border p-3">
          <input type="hidden" name="rascunho" value={sugestao.caminho} />
          <p className="flex items-center gap-2 text-sm">
            <FileText className="size-4" />
            Documento: <strong>{sugestao.nomeArquivo}</strong>
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="separar_clausulas"
              defaultChecked={podeSeparar}
              disabled={!podeSeparar}
              className="mt-0.5 size-4"
            />
            <span>
              Separar as cláusulas ao criar
              <span className="text-muted-foreground block text-xs">
                {podeSeparar
                  ? `${ia?.clausulas} cláusula(s) encontradas, com tema e resumo sugeridos pela IA — revise na página do acordo.`
                  : "Não há cláusulas para separar neste PDF (escaneado ou sem numeração)."}
              </span>
            </span>
          </label>
        </div>
      ) : (
        <div className="grid gap-1.5">
          <Label htmlFor="documento">
            Documento do acordo (PDF{acordo ? ", vazio mantém o atual" : ""})
          </Label>
          <Input
            id="documento"
            name="documento"
            type="file"
            accept="application/pdf"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          {acordo ? "Salvar acordo" : "Criar acordo"}
        </Button>
        <Button type="button" variant="ghost" asChild>
          <a href={aoCancelarHref}>Cancelar</a>
        </Button>
        {pendente && sugestao && (
          <span className="text-muted-foreground text-xs" aria-live="polite">
            Criando o acordo e separando as cláusulas — pode levar um minuto.
          </span>
        )}
      </div>
    </form>
  )
}

export function AdicionarClausula({ acordoId }: { acordoId: string }) {
  const [estado, formAction, pendente] = useActionState(
    adicionarClausulaAction,
    {}
  )
  return (
    <form action={formAction} className="grid gap-3 rounded-md border p-3">
      <input type="hidden" name="acordo_id" value={acordoId} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-[6rem_1fr_10rem]">
        <div className="grid gap-1.5">
          <Label htmlFor="numero">Nº</Label>
          <Input id="numero" name="numero" placeholder="5.1" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="clausula_titulo">Título da cláusula</Label>
          <Input id="clausula_titulo" name="clausula_titulo" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="categoria">Categoria</Label>
          <select id="categoria" name="categoria" className={SELECT} defaultValue="outro">
            {CATEGORIAS_CLAUSULA.map((c) => (
              <option key={c.chave} value={c.chave}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="clausula_texto">Texto</Label>
        <Textarea id="clausula_texto" name="clausula_texto" rows={2} />
      </div>
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
          Adicionar cláusula
        </Button>
      </div>
    </form>
  )
}

export function BotaoExcluirClausula({
  clausulaId,
  acordoId,
}: {
  clausulaId: string
  acordoId: string
}) {
  const [, formAction, pendente] = useActionState(excluirClausulaAction, {})
  return (
    <form action={formAction}>
      <input type="hidden" name="clausula_id" value={clausulaId} />
      <input type="hidden" name="acordo_id" value={acordoId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        aria-label="Remover cláusula"
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
