"use client"

import { useActionState, useId, useState } from "react"
import { CheckCircle2, FilePlus2, Loader2, Plus, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { TIPOS_ACORDO } from "@/lib/acordos-constantes"
import type { DocumentoNegociacao, NegociacaoDetalhe, OpcoesNegociacao } from "@/lib/db/negociacoes"
import {
  PAPEIS_DOCUMENTO,
  ROTULO_PAPEL,
  SITUACOES_NEGOCIACAO,
  TIPOS_EVENTO,
  type PapelDocumento,
} from "@/lib/negociacoes-constantes"

import {
  adicionarDocumentoAction,
  atualizarDocumentoAction,
  concluirNegociacaoAction,
  excluirDocumentoAction,
  excluirEventoAction,
  excluirNegociacaoAction,
  registrarEventoAction,
  salvarNegociacaoAction,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const DATA =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

function Erro({ erro }: { erro?: string }) {
  if (!erro) return null
  return (
    <Alert variant="destructive">
      <AlertDescription>{erro}</AlertDescription>
    </Alert>
  )
}

function hoje(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())
}

// ── Dados da negociação ──────────────────────────────────────────────────────

export function NegociacaoForm({
  negociacao,
  opcoes,
  aoCancelarHref,
}: {
  negociacao?: NegociacaoDetalhe
  opcoes: OpcoesNegociacao
  aoCancelarHref: string
}) {
  const [estado, acao, pendente] = useActionState(salvarNegociacaoAction, {})
  const selec = new Set(negociacao?.empresas.map((e) => e.id) ?? [])
  const concluida = negociacao?.situacao === "concluida"

  return (
    <form action={acao} className="grid gap-5">
      {negociacao && <input type="hidden" name="negociacao_id" value={negociacao.id} />}
      <Erro erro={estado.erro} />

      <div className="grid gap-1.5">
        <Label htmlFor="titulo">Título</Label>
        <Input
          id="titulo"
          name="titulo"
          required
          defaultValue={negociacao?.titulo ?? ""}
          placeholder="Ex.: ACT 2026/2027 — Petrobras"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="tipo">Instrumento</Label>
          <select id="tipo" name="tipo" className={SELECT} defaultValue={negociacao?.tipo ?? "act"}>
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
            defaultValue={negociacao?.situacao ?? "preparacao"}
            disabled={concluida}
          >
            {SITUACOES_NEGOCIACAO.filter((s) => concluida || s.chave !== "concluida").map((s) => (
              <option key={s.chave} value={s.chave}>
                {s.rotulo}
              </option>
            ))}
          </select>
          {concluida && <input type="hidden" name="situacao" value="concluida" />}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="data_base">Data-base (mês)</Label>
          <Input id="data_base" name="data_base" placeholder="Ex.: Setembro" defaultValue={negociacao?.dataBase ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="inicio">Início da negociação</Label>
          <input id="inicio" name="inicio" type="date" className={DATA} defaultValue={negociacao?.inicio ?? ""} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="acordo_vigente_id">Acordo vigente (o que está sendo renovado)</Label>
          <select
            id="acordo_vigente_id"
            name="acordo_vigente_id"
            className={SELECT}
            defaultValue={negociacao?.acordoVigente?.id ?? ""}
          >
            <option value="">Nenhum (primeiro acordo)</option>
            {opcoes.acordos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.titulo}
                {a.situacao === "vigente" ? " — vigente" : a.situacao === "arquivado" ? " — arquivado" : ""}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">
            É a primeira coluna do quadro comparativo. Ao concluir, ele vai para &quot;Arquivado&quot;.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="campanha_id">Campanha em Votações</Label>
          <select
            id="campanha_id"
            name="campanha_id"
            className={SELECT}
            defaultValue={negociacao?.campanha?.id ?? ""}
          >
            <option value="">Nenhuma</option>
            {opcoes.campanhas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.tema}
                {c.finalizado ? " (finalizada)" : ""}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">
            Onde a categoria vota a pauta e as propostas. As rodadas entram na linha do tempo.
          </p>
        </div>
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Empresas na mesa</legend>
        <div className="grid max-h-56 gap-1.5 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">
          {opcoes.empresas.length === 0 && (
            <p className="text-muted-foreground text-sm">Nenhum empregador cadastrado em Empregadores.</p>
          )}
          {opcoes.empresas.map((e) => (
            <label key={e.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="empresa" value={e.id} defaultChecked={selec.has(e.id)} className="size-4" />
              {e.nome}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="observacoes">Observações</Label>
        <Textarea id="observacoes" name="observacoes" rows={3} defaultValue={negociacao?.observacoes ?? ""} />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          {negociacao ? "Salvar" : "Criar negociação"}
        </Button>
        <Button type="button" variant="ghost" asChild>
          <a href={aoCancelarHref}>Cancelar</a>
        </Button>
      </div>
    </form>
  )
}

export function ExcluirNegociacao({ negociacaoId }: { negociacaoId: string }) {
  return (
    <form
      action={excluirNegociacaoAction}
      onSubmit={(e) => {
        if (!confirm("Excluir a negociação com a pauta, as propostas e a linha do tempo? Não dá para desfazer.")) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="negociacao_id" value={negociacaoId} />
      <Button type="submit" variant="ghost" size="sm" className="text-destructive">
        <Trash2 />
        Excluir negociação
      </Button>
    </form>
  )
}

// ── Documentos ───────────────────────────────────────────────────────────────

function CamposDocumento({ doc, papelInicial }: { doc?: DocumentoNegociacao; papelInicial?: PapelDocumento }) {
  const [papel, setPapel] = useState<PapelDocumento | "">(doc?.papel ?? papelInicial ?? "")
  const explicacao = PAPEIS_DOCUMENTO.find((p) => p.chave === papel)?.explicacao
  const id = useId()
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-papel`}>Documento</Label>
          <select
            id={`${id}-papel`}
            name="papel"
            required
            className={SELECT}
            value={papel}
            onChange={(e) => setPapel(e.target.value as PapelDocumento)}
          >
            <option value="" disabled>
              Escolha…
            </option>
            {PAPEIS_DOCUMENTO.map((p) => (
              <option key={p.chave} value={p.chave}>
                {p.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-rodada`}>Rodada</Label>
          <Input
            id={`${id}-rodada`}
            name="rodada"
            type="number"
            min={1}
            max={99}
            placeholder={papel === "pauta" ? "—" : "Ex.: 1"}
            defaultValue={doc?.rodada ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-data`}>Data</Label>
          <input id={`${id}-data`} name="data" type="date" className={DATA} defaultValue={doc?.data ?? hoje()} />
        </div>
      </div>
      {explicacao && <p className="text-muted-foreground -mt-2 text-xs">{explicacao}</p>}
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-titulo`}>Título {doc ? "" : "(opcional — montado a partir do tipo e da rodada)"}</Label>
        <Input id={`${id}-titulo`} name="titulo" defaultValue={doc?.titulo ?? ""} />
      </div>
    </>
  )
}

export function NovoDocumento({ negociacaoId, temPauta }: { negociacaoId: string; temPauta: boolean }) {
  const [estado, acao, pendente] = useActionState(adicionarDocumentoAction, {})
  return (
    <form action={acao} className="grid gap-4">
      <input type="hidden" name="negociacao_id" value={negociacaoId} />
      <Erro erro={estado.erro} />
      <CamposDocumento papelInicial={temPauta ? undefined : "pauta"} />
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <FilePlus2 />}
          Criar e enviar o PDF
        </Button>
        <p className="text-muted-foreground mt-1.5 text-xs">
          Na próxima tela você envia o PDF e extrai as cláusulas, como em Acordos coletivos.
        </p>
      </div>
    </form>
  )
}

export function EditarDocumento({ doc }: { doc: DocumentoNegociacao }) {
  const [estado, acao, pendente] = useActionState(atualizarDocumentoAction, {})
  return (
    <div className="grid gap-3">
      <form action={acao} className="grid gap-4">
        <input type="hidden" name="acordo_id" value={doc.id} />
        <Erro erro={estado.erro} />
        {estado.ok && <p className="text-success-fg text-xs">{estado.ok}</p>}
        <CamposDocumento doc={doc} />
        <div>
          <Button type="submit" size="sm" disabled={pendente}>
            {pendente && <Loader2 className="animate-spin" />}
            Salvar
          </Button>
        </div>
      </form>
      <form
        action={excluirDocumentoAction}
        onSubmit={(e) => {
          if (!confirm(`Excluir "${doc.titulo}" com o PDF e as cláusulas?`)) e.preventDefault()
        }}
      >
        <input type="hidden" name="acordo_id" value={doc.id} />
        <Button type="submit" variant="ghost" size="sm" className="text-destructive">
          <Trash2 />
          Excluir documento
        </Button>
      </form>
    </div>
  )
}

// ── Linha do tempo ───────────────────────────────────────────────────────────

export function NovoEvento({ negociacaoId }: { negociacaoId: string }) {
  const [estado, acao, pendente] = useActionState(registrarEventoAction, {})
  return (
    <form action={acao} className="grid gap-3">
      <input type="hidden" name="negociacao_id" value={negociacaoId} />
      <Erro erro={estado.erro} />
      {estado.ok && <p className="text-success-fg text-xs">{estado.ok}</p>}
      <div className="grid gap-3 sm:grid-cols-[10rem_14rem_1fr]">
        <input name="data" type="date" required className={DATA} defaultValue={hoje()} aria-label="Data" />
        <select name="tipo" className={SELECT} defaultValue="reuniao" aria-label="Tipo">
          {TIPOS_EVENTO.map((t) => (
            <option key={t.chave} value={t.chave}>
              {t.rotulo}
            </option>
          ))}
        </select>
        <Input name="titulo" required placeholder="O que aconteceu (ex.: 3ª reunião com a empresa)" />
      </div>
      <Textarea name="descricao" rows={2} placeholder="Detalhes, encaminhamentos (opcional)" />
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
          Registrar
        </Button>
      </div>
    </form>
  )
}

export function ExcluirEvento({ eventoId, negociacaoId }: { eventoId: string; negociacaoId: string }) {
  return (
    <form
      action={excluirEventoAction}
      onSubmit={(e) => {
        if (!confirm("Tirar este registro da linha do tempo?")) e.preventDefault()
      }}
    >
      <input type="hidden" name="evento_id" value={eventoId} />
      <input type="hidden" name="negociacao_id" value={negociacaoId} />
      <Button type="submit" variant="ghost" size="icon" className="size-7" aria-label="Excluir registro">
        <Trash2 className="size-3.5" />
      </Button>
    </form>
  )
}

// ── Conclusão ────────────────────────────────────────────────────────────────

export function ConcluirNegociacao({
  negociacaoId,
  documentos,
  vigenteTitulo,
}: {
  negociacaoId: string
  documentos: DocumentoNegociacao[]
  vigenteTitulo: string | null
}) {
  const [estado, acao, pendente] = useActionState(concluirNegociacaoAction, {})
  const finais = documentos.filter((d) => d.papel === "final")
  const opcoes = finais.length ? finais : documentos.filter((d) => d.papel !== "pauta")
  if (opcoes.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Cadastre o documento do acordo final (tipo &quot;Acordo final&quot;) para concluir.
      </p>
    )
  }
  return (
    <form
      action={acao}
      className="grid gap-4"
      onSubmit={(e) => {
        if (!confirm("Concluir a negociação? O documento escolhido vira o acordo vigente.")) e.preventDefault()
      }}
    >
      <input type="hidden" name="negociacao_id" value={negociacaoId} />
      <Erro erro={estado.erro} />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="documento_id">Acordo final</Label>
          <select id="documento_id" name="documento_id" required className={SELECT} defaultValue={opcoes.at(-1)?.id}>
            {opcoes.map((d) => (
              <option key={d.id} value={d.id}>
                {ROTULO_PAPEL[d.papel]}
                {d.rodada ? ` (${d.rodada}ª rodada)` : ""} — {d.titulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="vigencia_inicio">Vigência — início</Label>
          <input id="vigencia_inicio" name="vigencia_inicio" type="date" required className={DATA} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="vigencia_fim">Vigência — término</Label>
          <input id="vigencia_fim" name="vigencia_fim" type="date" required className={DATA} />
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        O documento sai da negociação e aparece em Acordos coletivos como <strong>vigente</strong>
        {vigenteTitulo ? (
          <>
            ; <strong>{vigenteTitulo}</strong> passa a &quot;Arquivado&quot;
          </>
        ) : null}
        . Pauta e propostas continuam sigilosas aqui.
      </p>
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
          Concluir negociação
        </Button>
      </div>
    </form>
  )
}
