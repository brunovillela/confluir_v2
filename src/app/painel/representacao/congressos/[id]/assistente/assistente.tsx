"use client"

import { useState, useTransition } from "react"
import { Check, GitMerge, Loader2, Sparkles, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import { Textarea } from "@/components/ui/textarea"
import { ROTULO_RELACAO, type Relacao } from "@/lib/congressos/ia"
import type { Sugestao } from "@/lib/db/congressos-ia"

import { aceitarFusaoAction, aceitarTriagemAction, levarDissensoAction, recusarSugestaoAction, rodarAssistenteAction } from "../../ia-actions"
import { LerCaderno } from "../../ia-componentes"

export type PropostaResumo = {
  id: string
  numero: number
  texto: string
  eixoId: string | null
  eixo: string | null
  origem: string
  abrangencia: string | null
}

type Resp = { erro?: string; ok?: string }

export function Assistente({
  congressoId,
  eixos,
  abrangencias,
  propostas,
  pendentes,
  obsoletas,
}: {
  congressoId: string
  eixos: { id: string; nome: string }[]
  abrangencias: string[]
  propostas: Record<string, PropostaResumo>
  pendentes: Sugestao[]
  obsoletas: number
}) {
  const [eixo, setEixo] = useState("")
  const [msg, setMsg] = useState<Resp | null>(null)
  const [rodando, setRodando] = useState<string | null>(null)
  const [, iniciar] = useTransition()

  function rodar(funcao: "mesclagem" | "triagem" | "correlacao") {
    setRodando(funcao)
    setMsg(null)
    iniciar(async () => {
      const r = await rodarAssistenteAction(congressoId, funcao, eixo || null)
      setMsg(r)
      setRodando(null)
    })
  }

  const fusoes = pendentes.filter((s) => s.funcao === "mesclagem")
  const triagem = pendentes.filter((s) => ["eixo", "abrangencia", "competencia"].includes(s.funcao))
  const correlacoes = pendentes.filter((s) => s.funcao === "correlacao")
  const botao = (funcao: "mesclagem" | "triagem" | "correlacao", rotulo: string) => (
    <Button variant="outline" disabled={!!rodando} onClick={() => rodar(funcao)}>
      {rodando === funcao ? <Loader2 className="animate-spin" /> : <Sparkles />}
      {rotulo}
    </Button>
  )

  return (
    <div className="grid gap-6">
      <div className="bg-card grid gap-3 rounded-lg border p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <Label className="text-xs">Eixo</Label>
            <SelectNativo value={eixo} onChange={(e) => setEixo(e.target.value)}>
              <option value="">Todos os eixos</option>
              {eixos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </SelectNativo>
          </div>
          {botao("mesclagem", "Procurar parecidas para fundir")}
          {botao("triagem", "Eixo, abrangência e competência")}
          {botao("correlacao", "Comparar grupos")}
        </div>
        {rodando && <p className="text-muted-foreground text-xs">A IA está lendo as propostas, em blocos por eixo. Pode levar um ou dois minutos.</p>}
        {msg && (
          <p role="status" className={`text-sm ${msg.erro ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
            {msg.erro ?? msg.ok}
          </p>
        )}
        {obsoletas > 0 && (
          <p className="text-muted-foreground text-xs">
            {obsoletas} sugestão(ões) ficaram para trás porque as propostas mudaram depois da leitura. Rode de novo para atualizar.
          </p>
        )}
      </div>

      <Secao titulo="Parecidas para fundir" quantas={fusoes.length} vazio="Nenhuma fusão sugerida pendente.">
        {fusoes.map((s) => (
          <FusaoSugerida key={s.id} s={s} congressoId={congressoId} propostas={propostas} eixos={eixos} abrangencias={abrangencias} />
        ))}
      </Secao>

      <Secao titulo="Contradições e temas entre grupos" quantas={correlacoes.length} vazio="Nenhuma correlação pendente.">
        {correlacoes.map((s) => (
          <CorrelacaoSugerida key={s.id} s={s} congressoId={congressoId} propostas={propostas} eixos={eixos} />
        ))}
      </Secao>

      <Secao titulo="Eixo, abrangência e competência" quantas={triagem.length} vazio="Nenhuma sugestão de eixo, abrangência ou competência pendente.">
        {triagem.map((s) => (
          <TriagemSugerida key={s.id} s={s} congressoId={congressoId} propostas={propostas} />
        ))}
      </Secao>

      <section className="grid gap-2">
        <h2 className="text-sm font-semibold">Ler o caderno de teses</h2>
        <p className="text-muted-foreground text-xs">A IA separa as propostas do documento e casa com os eixos. Você confere item a item antes de gravar.</p>
        <LerCaderno congressoId={congressoId} eixos={eixos} />
      </section>
    </div>
  )
}

function Secao({ titulo, quantas, vazio, children }: { titulo: string; quantas: number; vazio: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-sm font-semibold">
        {titulo} <span className="text-muted-foreground font-normal">· {quantas}</span>
      </h2>
      {quantas === 0 ? <p className="text-muted-foreground text-sm">{vazio}</p> : children}
    </section>
  )
}

function useDecisao() {
  const [msg, setMsg] = useState<Resp | null>(null)
  const [pendente, iniciar] = useTransition()
  const fazer = (fn: () => Promise<Resp>) => iniciar(async () => setMsg(await fn()))
  const aviso = msg ? (
    <p role="status" className={`text-xs ${msg.erro ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
      {msg.erro ?? msg.ok}
    </p>
  ) : null
  return { pendente, fazer, aviso }
}

function Origem({ p }: { p: PropostaResumo | undefined }) {
  if (!p) return <p className="text-muted-foreground text-xs">Proposta não encontrada.</p>
  return (
    <div className="grid gap-0.5">
      <div className="text-muted-foreground text-xs">
        <span className="text-foreground font-semibold">{p.numero}</span> · {p.origem}
        {p.eixo ? ` · ${p.eixo}` : ""}
      </div>
      <p className="text-sm whitespace-pre-wrap">{p.texto}</p>
    </div>
  )
}

function FusaoSugerida({
  s,
  congressoId,
  propostas,
  eixos,
  abrangencias,
}: {
  s: Sugestao
  congressoId: string
  propostas: Record<string, PropostaResumo>
  eixos: { id: string; nome: string }[]
  abrangencias: string[]
}) {
  const origens = s.propostaIds.map((id) => propostas[id]).filter((p): p is PropostaResumo => !!p)
  const [mantidas, setMantidas] = useState<Set<string>>(new Set(s.propostaIds))
  const [texto, setTexto] = useState(String(s.conteudo.texto ?? ""))
  const [eixoId, setEixoId] = useState(origens[0]?.eixoId ?? "")
  const [abr, setAbr] = useState(origens.find((p) => p.abrangencia)?.abrangencia ?? "")
  const { pendente, fazer, aviso } = useDecisao()
  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary">
          <Sparkles className="size-3" />
          Propostas {((s.conteudo.numeros as number[]) ?? []).join(", ")}
        </Badge>
        {s.conteudo.motivo ? <span className="text-muted-foreground">{String(s.conteudo.motivo)}</span> : null}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="grid gap-2">
          <span className="text-xs font-medium">De onde vem (desmarque o que não deve entrar)</span>
          {origens.map((p) => (
            <label key={p.id} className="flex items-start gap-2 rounded border p-2">
              <Checkbox
                className="mt-1"
                checked={mantidas.has(p.id)}
                aria-label={`Incluir a proposta ${p.numero}`}
                onCheckedChange={(v) =>
                  setMantidas((m) => {
                    const n = new Set(m)
                    if (v === true) n.add(p.id)
                    else n.delete(p.id)
                    return n
                  })
                }
              />
              <Origem p={p} />
            </label>
          ))}
        </div>
        <div className="grid content-start gap-2">
          <Label className="text-xs font-medium" htmlFor={`fusao-${s.id}`}>
            Texto único sugerido (pode ajustar)
          </Label>
          <Textarea id={`fusao-${s.id}`} value={texto} onChange={(e) => setTexto(e.target.value)} rows={6} className="text-sm" />
          <div className="flex flex-wrap gap-2">
            <SelectNativo value={eixoId} onChange={(e) => setEixoId(e.target.value)} aria-label="Eixo da proposta fundida" className="h-8 w-auto text-xs">
              <option value="">Sem eixo</option>
              {eixos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </SelectNativo>
            {abrangencias.length > 0 && (
              <SelectNativo value={abr} onChange={(e) => setAbr(e.target.value)} aria-label="Abrangência" className="h-8 w-auto text-xs">
                <option value="">Sem abrangência</option>
                {abrangencias.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </SelectNativo>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pendente || mantidas.size < 2 || texto.trim().length < 5}
          onClick={() => fazer(() => aceitarFusaoAction(congressoId, s.id, { propostaIds: [...mantidas], texto, eixoId: eixoId || null, abrangencia: abr || null }))}
        >
          <GitMerge />
          Fundir {mantidas.size}
        </Button>
        <Button size="sm" variant="ghost" disabled={pendente} onClick={() => fazer(() => recusarSugestaoAction({ congressoId }, null, s.id))}>
          <X />
          Recusar
        </Button>
      </div>
      {aviso}
    </div>
  )
}

function CorrelacaoSugerida({
  s,
  congressoId,
  propostas,
  eixos,
}: {
  s: Sugestao
  congressoId: string
  propostas: Record<string, PropostaResumo>
  eixos: { id: string; nome: string }[]
}) {
  const relacao = s.conteudo.relacao as Relacao
  const [a, b] = s.propostaIds.map((id) => propostas[id])
  const [fundindo, setFundindo] = useState(false)
  const [texto, setTexto] = useState(String(s.conteudo.texto ?? ""))
  const { pendente, fazer, aviso } = useDecisao()
  return (
    <div className={`grid gap-2 rounded-lg border p-3 ${relacao === "contraditoria" ? "border-amber-500/60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant={relacao === "contraditoria" ? "destructive" : "secondary"}>{ROTULO_RELACAO[relacao] ?? relacao}</Badge>
        {s.conteudo.motivo ? <span className="text-muted-foreground">{String(s.conteudo.motivo)}</span> : null}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="rounded border p-2">
          <Origem p={a} />
        </div>
        <div className="rounded border p-2">
          <Origem p={b} />
        </div>
      </div>
      {fundindo && (
        <div className="grid gap-1">
          <Label className="text-xs" htmlFor={`corr-${s.id}`}>
            Texto único
          </Label>
          <Textarea id={`corr-${s.id}`} value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} className="text-sm" />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {relacao === "contraditoria" ? (
          <Button size="sm" disabled={pendente} onClick={() => fazer(() => levarDissensoAction(congressoId, s.id))}>
            <Check />
            Levar como dissenso à plenária
          </Button>
        ) : fundindo ? (
          <Button
            size="sm"
            disabled={pendente || texto.trim().length < 5}
            onClick={() =>
              fazer(() =>
                aceitarFusaoAction(congressoId, s.id, {
                  propostaIds: s.propostaIds,
                  texto,
                  eixoId: a?.eixoId ?? b?.eixoId ?? eixos[0]?.id ?? null,
                  abrangencia: a?.abrangencia ?? b?.abrangencia ?? null,
                })
              )
            }
          >
            <GitMerge />
            Fundir as duas
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setFundindo(true)}>
            <GitMerge />
            Fundir as duas…
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={pendente} onClick={() => fazer(() => recusarSugestaoAction({ congressoId }, null, s.id))}>
          <X />
          Recusar
        </Button>
      </div>
      {aviso}
    </div>
  )
}

function TriagemSugerida({ s, congressoId, propostas }: { s: Sugestao; congressoId: string; propostas: Record<string, PropostaResumo> }) {
  const p = propostas[s.propostaIds[0]]
  const { pendente, fazer, aviso } = useDecisao()
  const c = s.conteudo
  const sugestao =
    s.funcao === "eixo"
      ? { rotulo: "Outro eixo", texto: `${p?.eixo ?? "Sem eixo"} → ${String(c.eixo)}`, motivo: String(c.motivo ?? ""), aceitar: "Mover de eixo" }
      : s.funcao === "abrangencia"
        ? { rotulo: "Abrangência", texto: `${p?.abrangencia ?? "—"} → ${String(c.abrangencia)}`, motivo: "", aceitar: "Aplicar" }
        : { rotulo: "Fora de competência?", texto: "", motivo: String(c.motivo ?? ""), aceitar: "Mandar só aos anais" }
  return (
    <div className="grid items-start gap-2 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_18rem]">
      <Origem p={p} />
      <div className="grid content-start gap-1 text-sm">
        <Badge variant={s.funcao === "competencia" ? "destructive" : "secondary"} className="justify-self-start">
          {sugestao.rotulo}
        </Badge>
        {sugestao.texto && <div className="font-medium">{sugestao.texto}</div>}
        {sugestao.motivo && <p className="text-muted-foreground text-xs">{sugestao.motivo}</p>}
        {s.funcao === "competencia" && <p className="text-muted-foreground text-xs">A decisão é da comissão.</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={s.funcao === "competencia" ? "outline" : "default"} disabled={pendente} onClick={() => fazer(() => aceitarTriagemAction(congressoId, s.id))}>
            <Check />
            {sugestao.aceitar}
          </Button>
          <Button size="sm" variant="ghost" disabled={pendente} onClick={() => fazer(() => recusarSugestaoAction({ congressoId }, null, s.id))}>
            {s.funcao === "competencia" ? "Manter" : "Recusar"}
          </Button>
        </div>
        {aviso}
      </div>
    </div>
  )
}
