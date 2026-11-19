"use client"

import { useState, useTransition } from "react"
import { ClipboardPaste, Loader2, Undo2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { confirmar } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import { Textarea } from "@/components/ui/textarea"
import { separarPropostas } from "@/lib/congressos/relatoria"

import {
  aplicarGruposAction,
  colarPropostasAction,
  definirFuncaoAction,
  reabrirRelatorioAction,
  removerFuncaoAction,
} from "./relatoria-actions"

type Resp = { erro?: string; ok?: string }

function Mensagem({ r }: { r: Resp | null }) {
  if (!r) return null
  return (
    <p role="status" className={`text-sm ${r.erro ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
      {r.erro ?? r.ok}
    </p>
  )
}

/** Coordenação e relatoria do grupo: quem tem função opera a relatoria pelo link pessoal. */
export function FuncoesGrupo({
  congressoId,
  grupoId,
  funcoes,
  pessoas,
  escolhaPadrao,
}: {
  congressoId: string
  grupoId: string
  funcoes: { id: string; nome: string; funcao: string; rotulo: string; escolha: string }[]
  pessoas: { id: string; nome: string; doGrupo: boolean }[]
  escolhaPadrao: "eleita" | "indicada"
}) {
  const [pessoa, setPessoa] = useState("")
  const [funcao, setFuncao] = useState<"coordenacao" | "relatoria" | "relatoria_adjunta">("relatoria")
  const [r, setR] = useState<Resp | null>(null)
  const [pendente, iniciar] = useTransition()
  const doGrupo = pessoas.filter((p) => p.doGrupo)
  const outros = pessoas.filter((p) => !p.doGrupo)
  return (
    <div className="grid gap-3">
      {funcoes.length === 0 ? (
        <p className="text-muted-foreground text-sm">Ninguém com função ainda.</p>
      ) : (
        <ul className="grid gap-1 text-sm">
          {funcoes.map((f) => (
            <li key={f.id} className="flex items-center gap-2">
              <span className="font-medium">{f.nome}</span>
              <span className="text-muted-foreground">
                · {f.rotulo} ({f.escolha === "eleita" ? "eleita no grupo" : "indicada"})
              </span>
              <button
                type="button"
                aria-label={`Remover ${f.rotulo} de ${f.nome}`}
                className="text-muted-foreground hover:text-destructive"
                disabled={pendente}
                onClick={() => iniciar(async () => setR(await removerFuncaoAction(congressoId, f.id)))}
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-56 flex-1 gap-1">
          <Label className="text-xs">Pessoa</Label>
          <SelectNativo value={pessoa} onChange={(e) => setPessoa(e.target.value)} aria-label="Pessoa">
            <option value="">Escolha…</option>
            {doGrupo.length > 0 && (
              <optgroup label="Do grupo">
                {doGrupo.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label={doGrupo.length ? "Demais participantes" : "Participantes"}>
              {outros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </optgroup>
          </SelectNativo>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Função</Label>
          <SelectNativo value={funcao} onChange={(e) => setFuncao(e.target.value as typeof funcao)} aria-label="Função">
            <option value="relatoria">Relatoria</option>
            <option value="relatoria_adjunta">Relatoria adjunta</option>
            <option value="coordenacao">Coordenação</option>
          </SelectNativo>
        </div>
        <Button
          variant="outline"
          disabled={pendente || !pessoa}
          onClick={() =>
            iniciar(async () => {
              const x = await definirFuncaoAction(congressoId, grupoId, { participanteId: pessoa, funcao, escolha: escolhaPadrao })
              setR(x)
              if (!x.erro) setPessoa("")
            })
          }
        >
          Registrar função
        </Button>
      </div>
      <Mensagem r={r} />
    </div>
  )
}

export function ReabrirRelatorio({ congressoId, grupoId }: { congressoId: string; grupoId: string }) {
  const [r, setR] = useState<Resp | null>(null)
  const [pendente, iniciar] = useTransition()
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pendente}
        onClick={async () => {
          if (!(await confirmar("Reabrir o relatório? O grupo volta a poder alterar propostas e apontamentos."))) return
          iniciar(async () => setR(await reabrirRelatorioAction(congressoId, grupoId)))
        }}
      >
        <Undo2 />
        Reabrir relatório
      </Button>
      <Mensagem r={r} />
    </span>
  )
}

/** Caderno de teses, etapa anterior ou documento: cola o texto, uma proposta por parágrafo. */
export function ColarPropostas({
  congressoId,
  eixos,
  abrangencias,
}: {
  congressoId: string
  eixos: { id: string; nome: string }[]
  abrangencias: string[]
}) {
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState("")
  const [eixo, setEixo] = useState("")
  const [origem, setOrigem] = useState<"caderno" | "etapa_anterior" | "documento">("caderno")
  const [descricao, setDescricao] = useState("")
  const [abrangencia, setAbrangencia] = useState("")
  const [r, setR] = useState<Resp | null>(null)
  const [pendente, iniciar] = useTransition()
  const previa = separarPropostas(texto)
  if (!aberto) {
    return (
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
        <ClipboardPaste />
        Colar propostas (caderno de teses)
      </Button>
    )
  }
  return (
    <div className="grid w-full gap-3 rounded-lg border p-3">
      <div className="text-sm font-medium">Colar propostas</div>
      <p className="text-muted-foreground text-xs">
        Uma proposta por parágrafo, com linha em branco entre elas. Números no início (1., 2)…) são tirados.
      </p>
      <div className="flex flex-wrap gap-2">
        <div className="grid gap-1">
          <Label className="text-xs">Origem</Label>
          <SelectNativo value={origem} onChange={(e) => setOrigem(e.target.value as typeof origem)}>
            <option value="caderno">Caderno de teses</option>
            <option value="etapa_anterior">Etapa anterior</option>
            <option value="documento">Documento</option>
          </SelectNativo>
        </div>
        <div className="grid min-w-48 gap-1">
          <Label className="text-xs">Eixo</Label>
          <SelectNativo value={eixo} onChange={(e) => setEixo(e.target.value)}>
            <option value="">Sem eixo</option>
            {eixos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </SelectNativo>
        </div>
        {abrangencias.length > 0 && (
          <div className="grid gap-1">
            <Label className="text-xs">Abrangência</Label>
            <SelectNativo value={abrangencia} onChange={(e) => setAbrangencia(e.target.value)}>
              <option value="">—</option>
              {abrangencias.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </SelectNativo>
          </div>
        )}
        <div className="grid min-w-56 flex-1 gap-1">
          <Label className="text-xs">De onde (opcional)</Label>
          <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Tese da Diretoria, Encontro de Mulheres" />
        </div>
      </div>
      <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={10} aria-label="Texto das propostas" />
      <div className="text-muted-foreground text-xs">{previa.length} proposta(s) encontrada(s).</div>
      <div className="flex gap-2">
        <Button
          disabled={pendente || previa.length === 0}
          onClick={() =>
            iniciar(async () => {
              const x = await colarPropostasAction(congressoId, {
                texto,
                eixoId: eixo || null,
                origem,
                origemDescricao: descricao.trim() || null,
                abrangencia: abrangencia || null,
              })
              setR(x)
              if (!x.erro) setTexto("")
            })
          }
        >
          {pendente ? <Loader2 className="animate-spin" /> : <ClipboardPaste />}
          Incluir {previa.length || ""} proposta(s)
        </Button>
        <Button variant="ghost" onClick={() => setAberto(false)}>
          Fechar
        </Button>
      </div>
      <Mensagem r={r} />
    </div>
  )
}

export function AplicarGrupos({ congressoId }: { congressoId: string }) {
  const [r, setR] = useState<Resp | null>(null)
  const [pendente, iniciar] = useTransition()
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pendente}
        onClick={async () => {
          if (!(await confirmar("Aplicar a votação dos grupos? Cada proposta apreciada vai à plenária, fica aprovada nos grupos ou rejeitada, pela regra da configuração."))) return
          iniciar(async () => setR(await aplicarGruposAction(congressoId)))
        }}
      >
        {pendente && <Loader2 className="animate-spin" />}
        Aplicar a votação dos grupos
      </Button>
      <Mensagem r={r} />
    </span>
  )
}
