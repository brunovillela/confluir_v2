"use client"

import { useRef, useState, useTransition } from "react"
import { CheckCircle2, Loader2, Lock, Pencil, Plus, Send, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { confirmar } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import { Textarea } from "@/components/ui/textarea"
import { ROTULO_APRECIACAO } from "@/lib/congressos/relatoria"
import type { Sugestao } from "@/lib/db/congressos-ia"
import type { DadosDoGrupo, TipoApontamento } from "@/lib/db/congressos-relatoria"

import { RedacaoIA, SinteseGrupo } from "./ia-componentes"

import {
  apontamentoAction,
  apreciacaoAction,
  entregarRelatorioAction,
  novaPropostaGrupoAction,
  retirarApontamentoAction,
  versaoGrupoAction,
  type Acesso,
} from "./relatoria-actions"

const TIPOS: { valor: TipoApontamento; rotulo: string }[] = [
  { valor: "apontamento", rotulo: "Apontamento" },
  { valor: "acrescimo", rotulo: "Acréscimo" },
  { valor: "supressao", rotulo: "Supressão" },
  { valor: "alteracao", rotulo: "Alteração" },
  { valor: "dissenso", rotulo: "Dissenso" },
]
const ROTULO_TIPO = new Map(TIPOS.map((t) => [t.valor, t.rotulo]))

/**
 * Tela da relatoria do grupo — feita para o celular e para digitar rápido.
 * A mesma tela serve ao painel e ao relator pelo link pessoal (`acesso`).
 */
/** O que a IA tem para este grupo (Fase 5); ausente = sem IA. */
export type IAdoGrupo = {
  ligada: boolean
  redacoes: Record<string, Sugestao>
  sintese: { texto: string; em: string | null; por: string | null } | null
  sintesePendente: Sugestao | null
}

export function RelatoriaGrupo({ acesso, d, ia }: { acesso: Acesso; d: DadosDoGrupo; ia?: IAdoGrupo }) {
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [alvo, setAlvo] = useState<string>("")
  const [tipo, setTipo] = useState<TipoApontamento>("apontamento")
  const [texto, setTexto] = useState("")
  const [pendente, iniciar] = useTransition()
  const campo = useRef<HTMLTextAreaElement>(null)
  const travado = d.travado.travado
  const grupoId = d.grupo.id

  function avisar(r: { erro?: string; ok?: string }) {
    setMsg(r.erro ? { ok: false, texto: r.erro } : { ok: true, texto: r.ok ?? "Feito." })
  }

  function apontarEm(propostaId: string) {
    setAlvo(propostaId)
    campo.current?.focus()
    campo.current?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  const porProposta = new Map<string, typeof d.apontamentos>()
  for (const a of d.apontamentos) if (a.propostaId) porProposta.set(a.propostaId, [...(porProposta.get(a.propostaId) ?? []), a])
  const gerais = d.apontamentos.filter((a) => !a.propostaId)
  const apreciacao = new Map(d.apreciacoes.map((a) => [a.propostaId, a]))

  return (
    <div className="grid gap-4">
      {travado ? (
        <Alert>
          <Lock className="size-4" />
          <AlertDescription>
            {d.travado.motivo}
            {d.grupo.relatorioEntreguePor ? ` Entregue por ${d.grupo.relatorioEntreguePor}.` : ""}
          </AlertDescription>
        </Alert>
      ) : null}
      {msg && (
        <p role="status" className={`text-sm font-medium ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>
          {msg.texto}
        </p>
      )}

      {!travado && (
        <form
          className="bg-card sticky top-2 z-10 grid gap-2 rounded-lg border p-3 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault()
            if (texto.trim().length < 2) return
            iniciar(async () => {
              const r = await apontamentoAction(acesso, grupoId, { propostaId: alvo || null, tipo, texto })
              avisar(r)
              if (!r.erro) {
                setTexto("")
                campo.current?.focus()
              }
            })
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <SelectNativo value={alvo} onChange={(e) => setAlvo(e.target.value)} aria-label="Sobre qual proposta" className="min-w-0 flex-1">
              <option value="">Geral (sem proposta)</option>
              {d.propostas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.numero}. {p.texto.slice(0, 60)}
                  {p.texto.length > 60 ? "…" : ""}
                </option>
              ))}
            </SelectNativo>
          </div>
          <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Tipo">
            {TIPOS.map((t) => (
              <button
                key={t.valor}
                type="button"
                role="radio"
                aria-checked={tipo === t.valor}
                onClick={() => setTipo(t.valor)}
                className={`rounded-full border px-3 py-1 text-xs ${tipo === t.valor ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}
              >
                {t.rotulo}
              </button>
            ))}
          </div>
          <Textarea
            ref={campo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={2}
            placeholder="O que o grupo apontou"
            aria-label="Texto do apontamento"
            className="text-base"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit()
            }}
          />
          <Button type="submit" disabled={pendente || texto.trim().length < 2} className="h-11 justify-self-start">
            {pendente ? <Loader2 className="animate-spin" /> : <Send />}
            Registrar
          </Button>
        </form>
      )}

      <div className="grid gap-3">
        {d.propostas.length === 0 && <p className="text-muted-foreground text-sm">Nenhuma proposta para este grupo ainda.</p>}
        {d.propostas.map((p) => (
          <CartaoProposta
            key={p.id}
            p={p}
            apontamentos={porProposta.get(p.id) ?? []}
            apreciacao={apreciacao.get(p.id) ?? null}
            haVotacao={d.regras.haVotacao}
            editavel={!travado && p.grupoId === grupoId}
            travado={travado}
            acesso={acesso}
            grupoId={grupoId}
            ia={ia?.ligada ? { redacao: ia.redacoes[p.id] ?? null } : null}
            aoApontar={() => apontarEm(p.id)}
            aoResultado={avisar}
          />
        ))}
      </div>

      {gerais.length > 0 && (
        <div className="grid gap-1 rounded-lg border p-3">
          <div className="text-sm font-medium">Apontamentos gerais</div>
          <ListaApontamentos itens={gerais} travado={travado} acesso={acesso} grupoId={grupoId} aoResultado={avisar} />
        </div>
      )}

      {!travado && <NovaProposta d={d} acesso={acesso} aoResultado={avisar} />}

      {ia && (ia.ligada || ia.sintese) && (
        <SinteseGrupo acesso={acesso} grupoId={grupoId} salva={ia.sintese} pendenteInicial={ia.sintesePendente} iaLigada={ia.ligada} />
      )}

      {!travado && (
        <div className="grid gap-2 rounded-lg border border-dashed p-3">
          <div className="text-sm font-medium">Entregar o relatório do grupo</div>
          <p className="text-muted-foreground text-xs">
            Depois de entregue, o grupo não altera mais propostas nem apontamentos, e a relatoria geral começa a consolidar.
          </p>
          <Button
            variant="outline"
            className="justify-self-start"
            disabled={pendente}
            onClick={async () => {
              if (!(await confirmar("Entregar o relatório? O grupo não poderá mais alterar propostas nem apontamentos."))) return
              iniciar(async () => avisar(await entregarRelatorioAction(acesso, grupoId)))
            }}
          >
            <CheckCircle2 />
            Entregar relatório
          </Button>
        </div>
      )}
    </div>
  )
}

function ListaApontamentos({
  itens,
  travado,
  acesso,
  grupoId,
  aoResultado,
}: {
  itens: DadosDoGrupo["apontamentos"]
  travado: boolean
  acesso: Acesso
  grupoId: string
  aoResultado: (r: { erro?: string; ok?: string }) => void
}) {
  const [pendente, iniciar] = useTransition()
  return (
    <ul className="grid gap-1 text-sm">
      {itens.map((a) => (
        <li key={a.id} className="flex items-start gap-2">
          <Badge variant="outline" className="shrink-0">
            {ROTULO_TIPO.get(a.tipo) ?? a.tipo}
          </Badge>
          <span className="min-w-0 flex-1 whitespace-pre-wrap">{a.texto}</span>
          {!travado && (
            <button
              type="button"
              aria-label="Retirar apontamento"
              disabled={pendente}
              className="text-muted-foreground hover:text-destructive shrink-0"
              onClick={async () => {
                if (!(await confirmar("Retirar este apontamento? Ele fica no histórico, marcado como retirado."))) return
                iniciar(async () => aoResultado(await retirarApontamentoAction(acesso, grupoId, a.id)))
              }}
            >
              <X className="size-4" />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

function CartaoProposta({
  p,
  apontamentos,
  apreciacao,
  haVotacao,
  editavel,
  travado,
  acesso,
  grupoId,
  ia,
  aoApontar,
  aoResultado,
}: {
  p: DadosDoGrupo["propostas"][number]
  apontamentos: DadosDoGrupo["apontamentos"]
  apreciacao: DadosDoGrupo["apreciacoes"][number] | null
  haVotacao: boolean
  editavel: boolean
  travado: boolean
  acesso: Acesso
  grupoId: string
  ia: { redacao: Sugestao | null } | null
  aoApontar: () => void
  aoResultado: (r: { erro?: string; ok?: string }) => void
}) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(p.texto)
  const [cont, setCont] = useState({
    aFavor: apreciacao ? String(apreciacao.aFavor) : "",
    contra: apreciacao ? String(apreciacao.contra) : "",
    abstencao: apreciacao ? String(apreciacao.abstencao) : "",
  })
  const [pendente, iniciar] = useTransition()

  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-muted-foreground text-xs">
          Proposta {p.numero}
          {p.grupoId === grupoId ? " · nova no grupo" : ""}
          {p.versao > 1 ? ` · versão ${p.versao}` : ""}
          {p.abrangencia ? ` · ${p.abrangencia}` : ""}
        </div>
        {!travado && (
          <div className="flex shrink-0 gap-1">
            {editavel && !editando && (
              <Button size="sm" variant="ghost" onClick={() => setEditando(true)} aria-label={`Editar a proposta ${p.numero}`}>
                <Pencil />
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={aoApontar}>
              Apontar
            </Button>
          </div>
        )}
      </div>
      {editando ? (
        <div className="grid gap-2">
          <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} className="text-base" aria-label="Texto da proposta" />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pendente}
              onClick={() =>
                iniciar(async () => {
                  const r = await versaoGrupoAction(acesso, grupoId, p.id, texto)
                  aoResultado(r)
                  if (!r.erro) setEditando(false)
                })
              }
            >
              Salvar texto
            </Button>
            <Button size="sm" variant="ghost" onClick={() => (setEditando(false), setTexto(p.texto))}>
              Voltar
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm whitespace-pre-wrap">{p.texto}</p>
      )}
      {ia && editavel && !editando && (
        <RedacaoIA key={p.versao} acesso={acesso} grupoId={grupoId} propostaId={p.id} textoAtual={p.texto} inicial={ia.redacao} aoResultado={aoResultado} />
      )}
      {apontamentos.length > 0 && (
        <div className="bg-muted/40 rounded-md p-2">
          <ListaApontamentos itens={apontamentos} travado={travado} acesso={acesso} grupoId={grupoId} aoResultado={aoResultado} />
        </div>
      )}
      {haVotacao && (
        <div className="flex flex-wrap items-end gap-2">
          {(["aFavor", "contra", "abstencao"] as const).map((k) => (
            <div key={k} className="grid w-20 gap-1">
              <Label className="text-xs">{k === "aFavor" ? "A favor" : k === "contra" ? "Contra" : "Abstenção"}</Label>
              <Input
                inputMode="numeric"
                value={cont[k]}
                disabled={travado}
                onChange={(e) => setCont((c) => ({ ...c, [k]: e.target.value.replace(/\D/g, "") }))}
                className="h-10 text-base tabular-nums"
              />
            </div>
          ))}
          {!travado && (
            <Button
              size="sm"
              variant="outline"
              className="h-10"
              disabled={pendente || cont.aFavor === "" || cont.contra === ""}
              onClick={() =>
                iniciar(async () =>
                  aoResultado(
                    await apreciacaoAction(acesso, grupoId, p.id, {
                      aFavor: Number(cont.aFavor),
                      contra: Number(cont.contra),
                      abstencao: Number(cont.abstencao || 0),
                    })
                  )
                )
              }
            >
              Salvar votação
            </Button>
          )}
          {apreciacao && <Badge variant={apreciacao.resultado === "rejeitada" ? "secondary" : "success"}>{ROTULO_APRECIACAO[apreciacao.resultado]}</Badge>}
        </div>
      )}
    </div>
  )
}

function NovaProposta({ d, acesso, aoResultado }: { d: DadosDoGrupo; acesso: Acesso; aoResultado: (r: { erro?: string; ok?: string }) => void }) {
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState("")
  const [abrangencia, setAbrangencia] = useState("")
  const [pendente, iniciar] = useTransition()
  if (!d.novas.pode) {
    return <p className="text-muted-foreground text-xs">{d.novas.motivo}</p>
  }
  if (!aberto) {
    return (
      <Button variant="outline" className="justify-self-start" onClick={() => setAberto(true)}>
        <Plus />
        Nova proposta do grupo
      </Button>
    )
  }
  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <Label htmlFor="nova-proposta">Nova proposta do grupo</Label>
      <Textarea id="nova-proposta" value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} className="text-base" />
      {d.regras.abrangencias.length > 0 && (
        <SelectNativo value={abrangencia} onChange={(e) => setAbrangencia(e.target.value)} aria-label="Abrangência" className="max-w-56">
          <option value="">Abrangência…</option>
          {d.regras.abrangencias.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </SelectNativo>
      )}
      <div className="flex gap-2">
        <Button
          disabled={pendente || texto.trim().length < 5}
          onClick={() =>
            iniciar(async () => {
              const r = await novaPropostaGrupoAction(acesso, d.grupo.id, { texto, abrangencia: abrangencia || null })
              aoResultado(r)
              if (!r.erro) {
                setTexto("")
                setAberto(false)
              }
            })
          }
        >
          {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
          Registrar proposta
        </Button>
        <Button variant="ghost" onClick={() => setAberto(false)}>
          Voltar
        </Button>
      </div>
    </div>
  )
}
