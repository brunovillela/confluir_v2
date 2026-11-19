"use client"

import { useState, useTransition } from "react"
import { Flag, Loader2, Plus, Undo2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { confirmar } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import { Textarea } from "@/components/ui/textarea"

import { destaqueAction, desfazerVotacaoAction, propostaPlenariaAction, retirarDestaqueAction, votacaoAction } from "../../relatoria-actions"

type Item = {
  id: string
  numero: number
  eixo: string | null
  texto: string
  situacao: string
  classificacao: "consenso" | "debate" | null
  destaquePor: string | null
}
type VotacaoLinha = { id: string; numeros: number[]; mocoes: number[]; forma: string; placar: string | null; resultado: string; createdAt: string }
type MocaoItem = { id: string; numero: number; titulo: string; texto: string; tipo: string | null; situacao: string }
type Regras = { maioria: string; semOposicao: boolean; emBloco: boolean; destaqueNome: boolean; formaVoto: string; novasPlenaria: string }
type Resp = { erro?: string; ok?: string }

const ROTULO_FORMA: Record<string, string> = { sem_oposicao: "Sem oposição", visual: "Crachá", contagem: "Contagem", urna: "Urna" }

/**
 * Mesa da plenária: a pauta em ordem, o bloco do que é consenso, o destaque
 * e o lançamento do resultado em poucos toques (sem oposição, crachá por
 * contraste ou contagem). Cada lançamento pode ser desfeito.
 */
export function Plenaria({
  congressoId,
  sessaoId,
  regras,
  eixos,
  propostas,
  mocoes = [],
  votacoes,
}: {
  congressoId: string
  sessaoId: string | null
  regras: Regras
  eixos: { id: string; nome: string }[]
  propostas: Item[]
  mocoes?: MocaoItem[]
  votacoes: VotacaoLinha[]
}) {
  const mocoesNaPauta = mocoes.filter((m) => m.situacao === "habilitada")
  const [msg, setMsg] = useState<Resp | null>(null)
  const pauta = propostas.filter((p) => p.situacao === "plenaria")
  const bloco = regras.emBloco ? pauta.filter((p) => p.classificacao === "consenso" && !p.destaquePor) : []
  const separadas = pauta.filter((p) => !bloco.includes(p))
  const votadas = propostas.filter((p) => p.situacao !== "plenaria")

  return (
    <div className="grid gap-4">
      {msg && (
        <p role="status" className={`text-sm font-medium ${msg.erro ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
          {msg.erro ?? msg.ok}
        </p>
      )}

      {pauta.length === 0 && mocoesNaPauta.length === 0 && (
        <p className="text-muted-foreground text-sm">Nada na pauta. Envie propostas à plenária na consolidação.</p>
      )}

      {bloco.length > 0 && (
        <section className="grid gap-2 rounded-lg border-2 border-dashed p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Bloco de consenso · {bloco.length} proposta(s)</h2>
            <span className="text-muted-foreground text-xs">Destaque tira a proposta do bloco.</span>
          </div>
          <ul className="grid gap-1 text-sm">
            {bloco.map((p) => (
              <li key={p.id} className="flex items-start gap-2">
                <span className="font-semibold tabular-nums">{p.numero}</span>
                <span className="min-w-0 flex-1 line-clamp-2">{p.texto}</span>
                <Destaque congressoId={congressoId} p={p} exigeNome={regras.destaqueNome} aoResultado={setMsg} />
              </li>
            ))}
          </ul>
          <Lancamento congressoId={congressoId} sessaoId={sessaoId} alvo={{ propostaIds: bloco.map((p) => p.id) }} regras={regras} rotulo="Votar o bloco" aoResultado={setMsg} />
        </section>
      )}

      {separadas.map((p) => (
        <section key={p.id} className="grid gap-2 rounded-lg border p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-foreground text-base font-semibold">{p.numero}</span>
              {p.eixo && <span>· {p.eixo}</span>}
              {p.destaquePor && <Badge variant="warning">Destaque: {p.destaquePor}</Badge>}
            </div>
            <Destaque congressoId={congressoId} p={p} exigeNome={regras.destaqueNome} aoResultado={setMsg} />
          </div>
          <p className="text-base whitespace-pre-wrap">{p.texto}</p>
          <Lancamento congressoId={congressoId} sessaoId={sessaoId} alvo={{ propostaIds: [p.id] }} regras={regras} rotulo="Resultado" aoResultado={setMsg} />
        </section>
      ))}

      {mocoesNaPauta.length > 0 && <h2 className="text-sm font-semibold">Moções habilitadas</h2>}
      {mocoesNaPauta.map((m) => (
        <section key={m.id} className="grid gap-2 rounded-lg border border-l-4 border-l-amber-500 p-3">
          <div className="text-muted-foreground text-xs">
            <span className="text-foreground text-base font-semibold">Moção {m.numero}</span>
            {m.tipo ? ` · ${m.tipo}` : ""}
          </div>
          <p className="font-medium">{m.titulo}</p>
          <p className="text-sm whitespace-pre-wrap">{m.texto}</p>
          <Lancamento congressoId={congressoId} sessaoId={sessaoId} alvo={{ mocaoIds: [m.id] }} regras={regras} rotulo="Resultado" aoResultado={setMsg} />
        </section>
      ))}

      {regras.novasPlenaria !== "proibidas" && <NovaEmPlenaria congressoId={congressoId} eixos={eixos} aoResultado={setMsg} />}

      {votacoes.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-sm font-semibold">Já votadas</h2>
          <ul className="divide-y rounded-lg border text-sm">
            {votacoes.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="font-semibold tabular-nums">
                  {v.mocoes.length ? `Moção ${v.mocoes.join(", ")}` : v.numeros.length > 1 ? `Bloco: ${v.numeros.join(", ")}` : v.numeros[0]}
                </span>
                <Badge variant={v.resultado === "aprovada" ? "success" : v.resultado === "rejeitada" ? "destructive" : "warning"}>
                  {v.resultado === "aprovada" ? "Aprovada" : v.resultado === "rejeitada" ? "Rejeitada" : "Empate"}
                </Badge>
                <span className="text-muted-foreground">
                  {ROTULO_FORMA[v.forma] ?? v.forma}
                  {v.placar ? ` · ${v.placar}` : ""} ·{" "}
                  {new Date(v.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}
                </span>
                <DesfazerVotacao congressoId={congressoId} id={v.id} aoResultado={setMsg} />
              </li>
            ))}
          </ul>
          {votadas.length > 0 && <p className="text-muted-foreground text-xs">{votadas.filter((p) => p.situacao === "aprovada").length} aprovada(s) até agora.</p>}
        </section>
      )}
    </div>
  )
}

function Lancamento({
  congressoId,
  sessaoId,
  alvo,
  regras,
  rotulo,
  aoResultado,
}: {
  congressoId: string
  sessaoId: string | null
  alvo: { propostaIds?: string[]; mocaoIds?: string[] }
  regras: Regras
  rotulo: string
  aoResultado: (r: Resp) => void
}) {
  const [contando, setContando] = useState(regras.formaVoto !== "cracha")
  const [c, setC] = useState({ aFavor: "", contra: "", abstencao: "" })
  const [pendente, iniciar] = useTransition()
  const forma = regras.formaVoto === "urna" ? "urna" : "contagem"

  function lancar(d: Omit<Parameters<typeof votacaoAction>[1], "propostaIds" | "mocaoIds" | "sessaoId">) {
    iniciar(async () => {
      const r = await votacaoAction(congressoId, { ...d, propostaIds: alvo.propostaIds ?? [], mocaoIds: alvo.mocaoIds ?? [], sessaoId })
      aoResultado(r)
    })
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <span className="text-muted-foreground self-center text-xs">{rotulo}:</span>
      {regras.semOposicao && (
        <Button size="sm" disabled={pendente} onClick={() => lancar({ forma: "sem_oposicao" })}>
          Aprovada sem oposição
        </Button>
      )}
      {regras.formaVoto === "cracha" && (
        <>
          <Button size="sm" variant="outline" disabled={pendente} onClick={() => lancar({ forma: "visual", declarado: "aprovada" })}>
            Crachá: aprovada
          </Button>
          <Button size="sm" variant="outline" disabled={pendente} onClick={() => lancar({ forma: "visual", declarado: "rejeitada" })}>
            Crachá: rejeitada
          </Button>
          {!contando && (
            <Button size="sm" variant="ghost" onClick={() => setContando(true)}>
              Contar
            </Button>
          )}
        </>
      )}
      {contando && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            lancar({ forma, aFavor: Number(c.aFavor), contra: Number(c.contra), abstencao: Number(c.abstencao || 0) })
          }}
        >
          {(["aFavor", "contra", "abstencao"] as const).map((k) => (
            <div key={k} className="grid w-20 gap-1">
              <Label className="text-xs">{k === "aFavor" ? "A favor" : k === "contra" ? "Contra" : "Abstenção"}</Label>
              <Input
                inputMode="numeric"
                value={c[k]}
                onChange={(e) => setC((x) => ({ ...x, [k]: e.target.value.replace(/\D/g, "") }))}
                className="h-9 tabular-nums"
              />
            </div>
          ))}
          <Button type="submit" size="sm" variant="outline" disabled={pendente || c.aFavor === "" || c.contra === ""}>
            {pendente && <Loader2 className="animate-spin" />}
            Lançar contagem
          </Button>
        </form>
      )}
    </div>
  )
}

function Destaque({ congressoId, p, exigeNome, aoResultado }: { congressoId: string; p: Item; exigeNome: boolean; aoResultado: (r: Resp) => void }) {
  const [pendente, iniciar] = useTransition()
  if (p.destaquePor) {
    return (
      <Button size="sm" variant="ghost" disabled={pendente} onClick={() => iniciar(async () => aoResultado(await retirarDestaqueAction(congressoId, p.id)))}>
        Retirar destaque
      </Button>
    )
  }
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pendente}
      onClick={() => {
        const nome = window.prompt(exigeNome ? "Quem pediu o destaque?" : "Quem pediu o destaque? (opcional)") ?? null
        if (nome === null || (exigeNome && !nome.trim())) return
        iniciar(async () => aoResultado(await destaqueAction(congressoId, p.id, nome)))
      }}
    >
      <Flag />
      Destaque
    </Button>
  )
}

function DesfazerVotacao({ congressoId, id, aoResultado }: { congressoId: string; id: string; aoResultado: (r: Resp) => void }) {
  const [pendente, iniciar] = useTransition()
  return (
    <Button
      size="sm"
      variant="ghost"
      className="ml-auto"
      disabled={pendente}
      onClick={async () => {
        if (!(await confirmar("Desfazer este lançamento? As propostas voltam à pauta e o registro fica marcado como desfeito."))) return
        iniciar(async () => aoResultado(await desfazerVotacaoAction(congressoId, id)))
      }}
    >
      <Undo2 />
      Desfazer
    </Button>
  )
}

function NovaEmPlenaria({ congressoId, eixos, aoResultado }: { congressoId: string; eixos: { id: string; nome: string }[]; aoResultado: (r: Resp) => void }) {
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState("")
  const [eixo, setEixo] = useState("")
  const [descricao, setDescricao] = useState("")
  const [pendente, iniciar] = useTransition()
  if (!aberto) {
    return (
      <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setAberto(true)}>
        <Plus />
        Proposta nova em plenária
      </Button>
    )
  }
  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <Label>Proposta nova em plenária</Label>
      <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} />
      <div className="flex flex-wrap gap-2">
        <SelectNativo value={eixo} onChange={(e) => setEixo(e.target.value)} aria-label="Eixo" className="w-auto">
          <option value="">Sem eixo</option>
          {eixos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </SelectNativo>
        <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Como chegou (acordo de texto, assinaturas…)" className="min-w-64 flex-1" />
      </div>
      <div className="flex gap-2">
        <Button
          disabled={pendente || texto.trim().length < 5}
          onClick={() =>
            iniciar(async () => {
              const r = await propostaPlenariaAction(congressoId, { texto, eixoId: eixo || null, descricao: descricao.trim() || null })
              aoResultado(r)
              if (!r.erro) {
                setTexto("")
                setAberto(false)
              }
            })
          }
        >
          Incluir
        </Button>
        <Button variant="ghost" onClick={() => setAberto(false)}>
          Voltar
        </Button>
      </div>
    </div>
  )
}
