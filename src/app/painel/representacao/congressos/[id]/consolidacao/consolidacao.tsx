"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { GitMerge, History, Loader2, Pencil, Undo2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { confirmar } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import { Textarea } from "@/components/ui/textarea"
import type { SituacaoProposta } from "@/lib/db/congressos-relatoria"
import { semAcento } from "@/lib/texto"

import { ajustarAction, desfazerFusaoAction, fundirAction, versaoConsolidacaoAction } from "../../relatoria-actions"

export type ItemConsolidacao = {
  id: string
  numero: number
  eixoId: string | null
  grupo: string | null
  origem: string
  ehFusao: boolean
  abrangencia: string | null
  texto: string
  versao: number
  situacao: SituacaoProposta
  classificacao: "consenso" | "debate" | null
  apontamentos: { id: string; tipo: string; texto: string; grupo: string }[]
  apreciacoes: { grupo: string; placar: string; resultado: string }[]
}

const SITUACOES: { valor: SituacaoProposta | "abertas" | "todas"; rotulo: string }[] = [
  { valor: "abertas", rotulo: "A consolidar" },
  { valor: "plenaria", rotulo: "Na pauta da plenária" },
  { valor: "aprovada", rotulo: "Aprovadas" },
  { valor: "rejeitada", rotulo: "Rejeitadas" },
  { valor: "fundida", rotulo: "Fundidas" },
  { valor: "anais", rotulo: "Só aos anais" },
  { valor: "retirada", rotulo: "Retiradas" },
  { valor: "todas", rotulo: "Todas" },
]
const ROTULO_SITUACAO: Record<SituacaoProposta, string> = {
  em_debate: "Em debate",
  entregue: "Entregue",
  fundida: "Fundida",
  plenaria: "Na pauta",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada",
  retirada: "Retirada",
  anais: "Anais",
}

export function Consolidacao({
  congressoId,
  itens,
  eixos,
  grupos,
  abrangencias,
  consensoDebate,
}: {
  congressoId: string
  itens: ItemConsolidacao[]
  eixos: { id: string; nome: string }[]
  grupos: string[]
  abrangencias: string[]
  consensoDebate: boolean
}) {
  const [filtro, setFiltro] = useState<string>("abertas")
  const [eixo, setEixo] = useState("")
  const [grupo, setGrupo] = useState("")
  const [busca, setBusca] = useState("")
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [fusao, setFusao] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ erro?: string; ok?: string } | null>(null)
  const [pendente, iniciar] = useTransition()
  const nomeEixo = new Map(eixos.map((e) => [e.id, e.nome]))

  const visiveis = useMemo(() => {
    const b = semAcento(busca)
    return itens.filter((p) => {
      if (filtro === "abertas" && !["em_debate", "entregue"].includes(p.situacao)) return false
      if (filtro !== "abertas" && filtro !== "todas" && p.situacao !== filtro) return false
      if (eixo === "-" ? p.eixoId : eixo && p.eixoId !== eixo) return false
      if (grupo && p.grupo !== grupo && !p.apontamentos.some((a) => a.grupo === grupo)) return false
      if (b && !semAcento(`${p.numero} ${p.texto}`).includes(b)) return false
      return true
    })
  }, [itens, filtro, eixo, grupo, busca])

  const porEixo = useMemo(() => {
    const m = new Map<string, ItemConsolidacao[]>()
    for (const p of visiveis) {
      const k = p.eixoId ?? ""
      m.set(k, [...(m.get(k) ?? []), p])
    }
    return [...m.entries()].sort(([a], [b]) => {
      const ia = eixos.findIndex((e) => e.id === a)
      const ib = eixos.findIndex((e) => e.id === b)
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
    })
  }, [visiveis, eixos])

  const ids = [...marcadas]
  const selecionadas = itens.filter((p) => marcadas.has(p.id))

  function ajustar(d: Parameters<typeof ajustarAction>[2], pergunta?: string) {
    return async () => {
      if (pergunta && !(await confirmar(pergunta))) return
      iniciar(async () => {
        const r = await ajustarAction(congressoId, ids, d)
        setMsg(r)
        if (!r.erro) setMarcadas(new Set())
      })
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <Label className="text-xs">Situação</Label>
          <SelectNativo value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            {SITUACOES.map((s) => (
              <option key={s.valor} value={s.valor}>
                {s.rotulo}
              </option>
            ))}
          </SelectNativo>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Eixo</Label>
          <SelectNativo value={eixo} onChange={(e) => setEixo(e.target.value)}>
            <option value="">Todos</option>
            {eixos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
            <option value="-">Sem eixo</option>
          </SelectNativo>
        </div>
        {grupos.length > 0 && (
          <div className="grid gap-1">
            <Label className="text-xs">Grupo</Label>
            <SelectNativo value={grupo} onChange={(e) => setGrupo(e.target.value)}>
              <option value="">Todos</option>
              {grupos.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </SelectNativo>
          </div>
        )}
        <div className="grid min-w-48 flex-1 gap-1">
          <Label className="text-xs">Buscar</Label>
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Número ou palavra do texto" />
        </div>
      </div>

      {marcadas.size > 0 && (
        <div className="bg-card sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border p-2 shadow-sm">
          <span className="text-sm font-medium">{marcadas.size} marcada(s)</span>
          {marcadas.size >= 2 && (
            <Button size="sm" onClick={() => setFusao(selecionadas.map((p) => p.texto).join("\n\n"))}>
              <GitMerge />
              Fundir
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={pendente} onClick={ajustar({ situacao: "plenaria" })}>
            Enviar à plenária
          </Button>
          {consensoDebate && (
            <>
              <Button size="sm" variant="outline" disabled={pendente} onClick={ajustar({ classificacao: "consenso" })}>
                Consenso
              </Button>
              <Button size="sm" variant="outline" disabled={pendente} onClick={ajustar({ classificacao: "debate" })}>
                Debate
              </Button>
            </>
          )}
          <SelectNativo
            value=""
            aria-label="Mover para o eixo"
            className="h-8 w-auto text-xs"
            onChange={(e) => e.target.value && ajustar({ eixoId: e.target.value === "-" ? null : e.target.value })()}
          >
            <option value="">Mover para o eixo…</option>
            {eixos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
            <option value="-">Sem eixo</option>
          </SelectNativo>
          {abrangencias.length > 0 && (
            <SelectNativo
              value=""
              aria-label="Abrangência"
              className="h-8 w-auto text-xs"
              onChange={(e) => e.target.value && ajustar({ abrangencia: e.target.value === "-" ? null : e.target.value })()}
            >
              <option value="">Abrangência…</option>
              {abrangencias.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
              <option value="-">Sem abrangência</option>
            </SelectNativo>
          )}
          <Button size="sm" variant="ghost" disabled={pendente} onClick={ajustar({ situacao: "anais" }, "Mandar só aos anais? Não vão à votação.")}>
            Só aos anais
          </Button>
          <Button size="sm" variant="ghost" disabled={pendente} onClick={ajustar({ situacao: "entregue" })}>
            Voltar a consolidar
          </Button>
          <Button size="sm" variant="ghost" disabled={pendente} onClick={ajustar({ situacao: "retirada" }, "Retirar as propostas marcadas? Elas ficam no histórico.")}>
            Retirar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMarcadas(new Set())}>
            Desmarcar
          </Button>
        </div>
      )}

      {fusao !== null && (
        <Fusao
          congressoId={congressoId}
          ids={ids}
          numeros={selecionadas.map((p) => p.numero)}
          textoInicial={fusao}
          eixos={eixos}
          eixoInicial={selecionadas[0]?.eixoId ?? null}
          abrangencias={abrangencias}
          aoFechar={(r) => {
            setFusao(null)
            if (r) {
              setMsg(r)
              if (!r.erro) setMarcadas(new Set())
            }
          }}
        />
      )}

      {msg && (
        <p role="status" className={`text-sm ${msg.erro ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
          {msg.erro ?? msg.ok}
        </p>
      )}

      {visiveis.length === 0 && <p className="text-muted-foreground text-sm">Nenhuma proposta neste filtro.</p>}
      {porEixo.map(([eixoId, ps]) => (
        <section key={eixoId || "sem"} className="grid gap-2">
          <h2 className="text-sm font-semibold">
            {eixoId ? (nomeEixo.get(eixoId) ?? "Eixo") : "Sem eixo"} <span className="text-muted-foreground font-normal">· {ps.length}</span>
          </h2>
          {ps.map((p) => (
            <Cartao
              key={p.id}
              p={p}
              congressoId={congressoId}
              marcada={marcadas.has(p.id)}
              aoMarcar={(v) =>
                setMarcadas((s) => {
                  const n = new Set(s)
                  if (v) n.add(p.id)
                  else n.delete(p.id)
                  return n
                })
              }
              aoResultado={setMsg}
            />
          ))}
        </section>
      ))}
    </div>
  )
}

function Cartao({
  p,
  congressoId,
  marcada,
  aoMarcar,
  aoResultado,
}: {
  p: ItemConsolidacao
  congressoId: string
  marcada: boolean
  aoMarcar: (v: boolean) => void
  aoResultado: (r: { erro?: string; ok?: string }) => void
}) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(p.texto)
  const [pendente, iniciar] = useTransition()
  const fechada = ["aprovada", "rejeitada", "fundida"].includes(p.situacao)
  return (
    <div className={`grid gap-2 rounded-lg border p-3 ${marcada ? "border-primary ring-primary/30 ring-2" : ""}`}>
      <div className="flex flex-wrap items-start gap-2">
        {!fechada && (
          <input
            type="checkbox"
            checked={marcada}
            onChange={(e) => aoMarcar(e.target.checked)}
            className="accent-primary mt-0.5 size-5"
            aria-label={`Marcar a proposta ${p.numero}`}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-foreground font-semibold">{p.numero}</span>
            <span>· {p.origem}</span>
            {p.grupo && <span>· {p.grupo}</span>}
            {p.abrangencia && <span>· {p.abrangencia}</span>}
            {p.versao > 1 && <span>· versão {p.versao}</span>}
            <Badge variant={p.situacao === "aprovada" ? "success" : p.situacao === "rejeitada" ? "destructive" : "secondary"}>{ROTULO_SITUACAO[p.situacao]}</Badge>
            {p.classificacao && <Badge variant="outline">{p.classificacao === "consenso" ? "Consenso" : "Debate"}</Badge>}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          {!fechada && !editando && (
            <Button size="sm" variant="ghost" aria-label={`Editar o texto da proposta ${p.numero}`} onClick={() => setEditando(true)}>
              <Pencil />
            </Button>
          )}
          {p.ehFusao && !fechada && (
            <Button
              size="sm"
              variant="ghost"
              aria-label="Desfazer a fusão"
              disabled={pendente}
              onClick={async () => {
                if (!(await confirmar("Desfazer esta fusão? As propostas de origem voltam a consolidar."))) return
                iniciar(async () => aoResultado(await desfazerFusaoAction(congressoId, p.id)))
              }}
            >
              <Undo2 />
            </Button>
          )}
          <Button asChild size="sm" variant="ghost" aria-label="Rastro da proposta">
            <Link href={`/painel/representacao/congressos/${congressoId}/propostas/${p.id}`}>
              <History />
            </Link>
          </Button>
        </div>
      </div>
      {editando ? (
        <div className="grid gap-2">
          <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} aria-label="Texto consolidado" />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pendente}
              onClick={() =>
                iniciar(async () => {
                  const r = await versaoConsolidacaoAction(congressoId, p.id, texto)
                  aoResultado(r)
                  if (!r.erro) setEditando(false)
                })
              }
            >
              {pendente && <Loader2 className="animate-spin" />}
              Salvar texto consolidado
            </Button>
            <Button size="sm" variant="ghost" onClick={() => (setEditando(false), setTexto(p.texto))}>
              Voltar
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm whitespace-pre-wrap">{p.texto}</p>
      )}
      {p.apontamentos.length > 0 && (
        <ul className="bg-muted/40 grid gap-1 rounded-md p-2 text-sm">
          {p.apontamentos.map((a) => (
            <li key={a.id} className="flex gap-2">
              <Badge variant="outline" className="shrink-0">
                {a.tipo}
              </Badge>
              <span className="min-w-0 flex-1">{a.texto}</span>
              {a.grupo && <span className="text-muted-foreground shrink-0 text-xs">{a.grupo}</span>}
            </li>
          ))}
        </ul>
      )}
      {p.apreciacoes.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {p.apreciacoes.map((a) => (
            <span key={a.grupo} className="rounded border px-2 py-0.5">
              {a.grupo}: <span className="tabular-nums">{a.placar}</span> · {a.resultado}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Fusao({
  congressoId,
  ids,
  numeros,
  textoInicial,
  eixos,
  eixoInicial,
  abrangencias,
  aoFechar,
}: {
  congressoId: string
  ids: string[]
  numeros: number[]
  textoInicial: string
  eixos: { id: string; nome: string }[]
  eixoInicial: string | null
  abrangencias: string[]
  aoFechar: (r?: { erro?: string; ok?: string }) => void
}) {
  const [texto, setTexto] = useState(textoInicial)
  const [eixo, setEixo] = useState(eixoInicial ?? "")
  const [abrangencia, setAbrangencia] = useState("")
  const [pendente, iniciar] = useTransition()
  return (
    <div className="grid gap-2 rounded-lg border-2 border-dashed p-3">
      <div className="text-sm font-medium">Fundir as propostas {numeros.join(", ")}</div>
      <p className="text-muted-foreground text-xs">Escreva o texto único. As propostas de origem ficam ligadas à nova e não se perdem.</p>
      <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={8} aria-label="Texto da proposta fundida" />
      <div className="flex flex-wrap gap-2">
        <SelectNativo value={eixo} onChange={(e) => setEixo(e.target.value)} aria-label="Eixo" className="w-auto">
          <option value="">Sem eixo</option>
          {eixos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </SelectNativo>
        {abrangencias.length > 0 && (
          <SelectNativo value={abrangencia} onChange={(e) => setAbrangencia(e.target.value)} aria-label="Abrangência" className="w-auto">
            <option value="">Abrangência…</option>
            {abrangencias.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </SelectNativo>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          disabled={pendente || texto.trim().length < 5}
          onClick={() => iniciar(async () => aoFechar(await fundirAction(congressoId, ids, { texto, eixoId: eixo || null, abrangencia: abrangencia || null })))}
        >
          {pendente ? <Loader2 className="animate-spin" /> : <GitMerge />}
          Criar a proposta fundida
        </Button>
        <Button variant="ghost" onClick={() => aoFechar()}>
          Voltar
        </Button>
      </div>
    </div>
  )
}
