"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { Check, Loader2, Mic, Pause, Play, Plus, SkipForward, Square, Vote, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { confirmar } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import { Textarea } from "@/components/ui/textarea"
import { OPCOES_SIMPLES, relogio, ROTULO_FALA, tempoRestante, type TipoFala } from "@/lib/congressos/ao-vivo"

import {
  abrirVotacaoAction,
  avaliarNaEstacaoAction,
  avaliarPeloLinkAction,
  buscarPessoaMesaAction,
  cancelarFalaAction,
  cancelarVotacaoAction,
  chamarFalaAction,
  definirSessaoAction,
  encerrarFalaAction,
  fecharVotacaoAction,
  identificarNaEstacaoAction,
  inscreverNaMesaAction,
  inscreverPeloLinkAction,
  inscricoesAction,
  maisTempoAction,
  novaRodadaAction,
  pausarFalaAction,
  sairDaFilaPeloLinkAction,
  votarNaEstacaoAction,
  votarPeloLinkAction,
} from "./ao-vivo-actions"

type Resp = { erro?: string; ok?: string }

// ── Estado consultado a cada poucos segundos ────────────────────────────────

type FalaTela = { id: string; nome: string; tipo: TipoFala; segundos?: number; inicioEm?: string | null; pausadaEm?: string | null; pausadoMs?: number; minha?: boolean; participanteId?: string | null }
type VotacaoTela = {
  id: string
  titulo: string
  tipo: "simples" | "priorizacao"
  sigilo: "aberta" | "secreta"
  itens: { chave: string; rotulo: string }[]
  maximoEscolhas: number | null
  aberta?: boolean
  fechadaEm?: string | null
  votaram: number
  baseVotantes: number | null
  resultado: Record<string, unknown> | null
}
export type EstadoTela = {
  agora: number
  sessao: { id: string; titulo: string } | null
  assunto: string | null
  inscricoesAbertas: boolean
  votacao: VotacaoTela | null
  parcial: { opcao: string; rotulo: string; votos: number }[] | null
  falando: (FalaTela & { segundos: number; inicioEm: string | null; pausadaEm: string | null; pausadoMs: number }) | null
  fila: FalaTela[]
  minhaPosicao?: number | null
}

/** Consulta o estado periodicamente e corrige a diferença entre o relógio do aparelho e o do servidor. */
function useEstado(url: string, intervalo: number) {
  const [estado, setEstado] = useState<EstadoTela | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const ativo = useRef(true)
  const atualizar = useCallback(async () => {
    try {
      const r = await fetch(url, { cache: "no-store" })
      const j = await r.json()
      if (!r.ok) throw new Error(j.erro ?? "Falha ao ler o estado.")
      if (!ativo.current) return
      setOffset(Date.now() - j.agora)
      setEstado(j)
      setErro(null)
    } catch (e) {
      if (ativo.current) setErro((e as Error).message || "Sem conexão. Tentando de novo…")
    }
  }, [url])
  useEffect(() => {
    ativo.current = true
    const primeiro = setTimeout(atualizar, 0)
    const t = setInterval(atualizar, intervalo)
    const visivel = () => document.visibilityState === "visible" && atualizar()
    document.addEventListener("visibilitychange", visivel)
    return () => {
      ativo.current = false
      clearTimeout(primeiro)
      clearInterval(t)
      document.removeEventListener("visibilitychange", visivel)
    }
  }, [atualizar, intervalo])
  return { estado, erro, offset, atualizar }
}

function Cronometro({ fala, offset, grande = false }: { fala: NonNullable<EstadoTela["falando"]>; offset: number; grande?: boolean }) {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 250)
    return () => clearInterval(t)
  }, [])
  const resta = tempoRestante({ segundos: fala.segundos, inicioEm: fala.inicioEm, pausadaEm: fala.pausadaEm, pausadoMs: fala.pausadoMs }, agora - offset)
  const cor = resta < 0 ? "text-destructive" : resta <= 30 ? "text-amber-600 dark:text-amber-400" : ""
  return (
    <span className={`font-mono tabular-nums ${grande ? "text-7xl font-semibold md:text-9xl" : "text-3xl font-semibold"} ${cor}`} role="timer" aria-label="Tempo restante">
      {relogio(resta)}
      {fala.pausadaEm && <span className="text-muted-foreground ml-2 align-middle text-sm font-normal">pausado</span>}
    </span>
  )
}

function Aviso({ r }: { r: Resp | null }) {
  if (!r) return null
  return (
    <p role="status" className={`text-sm ${r.erro ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
      {r.erro ?? r.ok}
    </p>
  )
}

function Placar({ v }: { v: VotacaoTela }) {
  const r = v.resultado ?? {}
  if (v.tipo === "simples") {
    const explicacao = r.explicacao as string | undefined
    return (
      <div className="grid gap-1">
        <div className="flex flex-wrap gap-4 text-lg tabular-nums">
          <span>A favor: <strong>{String(r.aFavor ?? 0)}</strong></span>
          <span>Contra: <strong>{String(r.contra ?? 0)}</strong></span>
          <span>Abstenção: <strong>{String(r.abstencao ?? 0)}</strong></span>
        </div>
        {r.resultado ? <Badge variant={r.resultado === "aprovada" ? "success" : r.resultado === "rejeitada" ? "destructive" : "secondary"}>{r.resultado === "aprovada" ? "Aprovada" : r.resultado === "rejeitada" ? "Rejeitada" : "Empate"}</Badge> : null}
        {explicacao && <p className="text-muted-foreground text-xs">{explicacao}</p>}
      </div>
    )
  }
  const ranking = (r.ranking as { rotulo: string; votos: number; posicao: number }[] | undefined) ?? []
  return (
    <ol className="grid gap-1 text-sm">
      {ranking.map((x, i) => (
        <li key={i} className="flex gap-2">
          <span className="w-8 font-semibold tabular-nums">{x.posicao}º</span>
          <span className="min-w-0 flex-1">{x.rotulo}</span>
          <span className="tabular-nums">{x.votos}</span>
        </li>
      ))}
    </ol>
  )
}

// ── Mesa ao vivo ────────────────────────────────────────────────────────────

export type ItemPauta = { id: string; rotulo: string; tipo: "proposta" | "mocao" }

export function MesaAoVivo({
  congressoId,
  sessoes,
  pauta,
  votoEletronico,
}: {
  congressoId: string
  sessoes: { id: string; titulo: string }[]
  pauta: ItemPauta[]
  votoEletronico: "nao" | "secreto" | "aberto" | "mesa_escolhe"
}) {
  const { estado, erro, offset, atualizar } = useEstado(`/painel/representacao/congressos/${congressoId}/telao/estado?mesa=1`, 2000)
  const [msg, setMsg] = useState<Resp | null>(null)
  const [pendente, iniciar] = useTransition()
  const fazer = (fn: () => Promise<Resp>) =>
    iniciar(async () => {
      setMsg(await fn())
      await atualizar()
    })

  if (!estado) return <p className="text-muted-foreground text-sm">{erro ?? "Carregando a plenária…"}</p>

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="grid content-start gap-4">
        <section className="grid gap-2 rounded-lg border p-3">
          <h2 className="text-sm font-semibold">Sessão e assunto</h2>
          <SessaoAssunto congressoId={congressoId} sessoes={sessoes} estado={estado} aoFazer={fazer} pendente={pendente} />
        </section>

        <section className="grid gap-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Com a palavra</h2>
            <Button size="sm" variant={estado.inscricoesAbertas ? "outline" : "default"} disabled={pendente} onClick={() => fazer(() => inscricoesAction(congressoId, !estado.inscricoesAbertas))}>
              {estado.inscricoesAbertas ? "Encerrar inscrições" : "Reabrir inscrições"}
            </Button>
          </div>
          {estado.falando ? (
            <div className="grid gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <div className="text-lg font-semibold">{estado.falando.nome}</div>
                  <div className="text-muted-foreground text-xs">{ROTULO_FALA[estado.falando.tipo]}</div>
                </div>
                <Cronometro fala={estado.falando} offset={offset} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={pendente} onClick={() => fazer(() => pausarFalaAction(congressoId, estado.falando!.id))}>
                  {estado.falando.pausadaEm ? <Play /> : <Pause />}
                  {estado.falando.pausadaEm ? "Retomar" : "Pausar"}
                </Button>
                <Button size="sm" variant="outline" disabled={pendente} onClick={() => fazer(() => maisTempoAction(congressoId, estado.falando!.id, 30))}>
                  <Plus />
                  30 s
                </Button>
                <Button size="sm" variant="ghost" disabled={pendente} onClick={() => fazer(() => encerrarFalaAction(congressoId))}>
                  <Square />
                  Encerrar
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Ninguém falando.</p>
          )}
          <Button className="justify-self-start" disabled={pendente || !estado.fila.length} onClick={() => fazer(() => chamarFalaAction(congressoId))}>
            <SkipForward />
            Chamar o próximo{estado.fila[0] ? `: ${estado.fila[0].nome}` : ""}
          </Button>
          <div className="grid gap-1">
            <div className="text-xs font-medium">
              Fila · {estado.fila.length} {estado.inscricoesAbertas ? "" : "· inscrições encerradas"}
            </div>
            {estado.fila.length === 0 ? (
              <p className="text-muted-foreground text-sm">Ninguém inscrito.</p>
            ) : (
              <ol className="grid gap-1 text-sm">
                {estado.fila.map((f, i) => (
                  <li key={f.id} className="flex items-center gap-2">
                    <span className="text-muted-foreground w-6 tabular-nums">{i + 1}.</span>
                    <span className="min-w-0 flex-1">
                      {f.nome} <span className="text-muted-foreground text-xs">· {ROTULO_FALA[f.tipo]}</span>
                    </span>
                    <Button size="sm" variant="ghost" aria-label={`Dar a palavra a ${f.nome}`} disabled={pendente} onClick={() => fazer(() => chamarFalaAction(congressoId, f.id))}>
                      <Mic />
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Retirar ${f.nome} da fila`} disabled={pendente} onClick={() => fazer(() => cancelarFalaAction(congressoId, f.id))}>
                      <X />
                    </Button>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <InscreverNaMesa congressoId={congressoId} aoResultado={(r) => (setMsg(r), atualizar())} />
        </section>
        <Aviso r={msg} />
      </div>

      <section className="grid content-start gap-3 rounded-lg border p-3">
        <h2 className="text-sm font-semibold">Votação eletrônica</h2>
        {votoEletronico === "nao" ? (
          <p className="text-muted-foreground text-sm">
            A configuração deste congresso não prevê votação eletrônica (vale o crachá, a contagem ou a urna, lançados na mesa da plenária).
          </p>
        ) : estado.votacao && !estado.votacao.fechadaEm && estado.votacao.aberta !== false ? (
          <VotacaoAberta congressoId={congressoId} v={estado.votacao} parcial={estado.parcial} aoFazer={fazer} pendente={pendente} />
        ) : (
          <>
            {estado.votacao?.fechadaEm && (
              <div className="bg-muted/40 grid gap-1 rounded-md p-2">
                <div className="text-xs font-medium">Última: {estado.votacao.titulo} · {estado.votacao.votaram} votante(s)</div>
                <Placar v={estado.votacao} />
              </div>
            )}
            <AbrirVotacao congressoId={congressoId} pauta={pauta} votoEletronico={votoEletronico} aoFazer={fazer} pendente={pendente} />
          </>
        )}
      </section>
    </div>
  )
}

function SessaoAssunto({
  congressoId,
  sessoes,
  estado,
  aoFazer,
  pendente,
}: {
  congressoId: string
  sessoes: { id: string; titulo: string }[]
  estado: EstadoTela
  aoFazer: (fn: () => Promise<Resp>) => void
  pendente: boolean
}) {
  const [sessao, setSessao] = useState(estado.sessao?.id ?? "")
  const [assunto, setAssunto] = useState(estado.assunto ?? "")
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <SelectNativo value={sessao} onChange={(e) => setSessao(e.target.value)} aria-label="Sessão" className="w-auto">
          <option value="">Sessão…</option>
          {sessoes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.titulo}
            </option>
          ))}
        </SelectNativo>
        <Input value={assunto} onChange={(e) => setAssunto(e.target.value)} placeholder="Assunto em debate (aparece no telão)" aria-label="Assunto em debate" className="min-w-48 flex-1" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={pendente} onClick={() => aoFazer(() => definirSessaoAction(congressoId, sessao || null, assunto || null))}>
          Atualizar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pendente}
          onClick={async () => {
            if (!(await confirmar("Começar nova rodada? Quem está na fila sai, e as inscrições reabrem."))) return
            aoFazer(() => novaRodadaAction(congressoId, assunto || null))
          }}
        >
          Nova rodada
        </Button>
      </div>
    </div>
  )
}

function InscreverNaMesa({ congressoId, aoResultado }: { congressoId: string; aoResultado: (r: Resp) => void }) {
  const [termo, setTermo] = useState("")
  const [achados, setAchados] = useState<{ id: string; nome: string; base: string | null; papel: string | null }[]>([])
  const [tipo, setTipo] = useState<TipoFala>("fala")
  const [pendente, iniciar] = useTransition()
  return (
    <div className="grid gap-2 border-t pt-2">
      <div className="flex flex-wrap gap-2">
        <Input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Nome ou crachá de quem pede a palavra"
          aria-label="Quem pede a palavra"
          className="min-w-48 flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && termo.trim().length >= 2) iniciar(async () => setAchados(await buscarPessoaMesaAction(congressoId, termo)))
          }}
        />
        <SelectNativo value={tipo} onChange={(e) => setTipo(e.target.value as TipoFala)} aria-label="Tipo de fala" className="w-auto">
          {Object.entries(ROTULO_FALA).map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </SelectNativo>
        <Button size="sm" variant="outline" disabled={pendente || termo.trim().length < 2} onClick={() => iniciar(async () => setAchados(await buscarPessoaMesaAction(congressoId, termo)))}>
          {pendente ? <Loader2 className="animate-spin" /> : "Buscar"}
        </Button>
      </div>
      {achados.length > 0 && (
        <ul className="grid gap-1 text-sm">
          {achados.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1">
                {p.nome}
                <span className="text-muted-foreground text-xs">{[p.papel, p.base].filter(Boolean).map((x) => ` · ${x}`).join("")}</span>
              </span>
              <Button
                size="sm"
                disabled={pendente}
                onClick={() =>
                  iniciar(async () => {
                    aoResultado(await inscreverNaMesaAction(congressoId, { participanteId: p.id, nome: p.nome, tipo }))
                    setAchados([])
                    setTermo("")
                  })
                }
              >
                Inscrever
              </Button>
            </li>
          ))}
        </ul>
      )}
      {achados.length === 0 && termo.trim().length >= 2 && (
        <Button
          size="sm"
          variant="ghost"
          className="justify-self-start"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              aoResultado(await inscreverNaMesaAction(congressoId, { participanteId: null, nome: termo, tipo }))
              setTermo("")
            })
          }
        >
          Inscrever &ldquo;{termo.trim()}&rdquo; sem cadastro (convidado)
        </Button>
      )}
    </div>
  )
}

function VotacaoAberta({
  congressoId,
  v,
  parcial,
  aoFazer,
  pendente,
}: {
  congressoId: string
  v: VotacaoTela
  parcial: EstadoTela["parcial"]
  aoFazer: (fn: () => Promise<Resp>) => void
  pendente: boolean
}) {
  const pct = v.baseVotantes ? Math.round((v.votaram / v.baseVotantes) * 100) : null
  return (
    <div className="grid gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{v.sigilo === "secreta" ? "Secreta" : "Aberta (nominal)"}</Badge>
          <Badge variant="outline">{v.tipo === "simples" ? "A favor · Contra · Abstenção" : `Priorização: até ${v.maximoEscolhas}`}</Badge>
        </div>
        <div className="mt-1 text-lg font-semibold">{v.titulo}</div>
      </div>
      <div className="text-3xl font-semibold tabular-nums">
        {v.votaram}
        <span className="text-muted-foreground text-base font-normal">
          {v.baseVotantes ? ` de ${v.baseVotantes} em exercício${pct !== null ? ` (${pct}%)` : ""}` : " voto(s)"}
        </span>
      </div>
      {parcial && (
        <ul className="grid gap-0.5 text-sm">
          {parcial.map((p) => (
            <li key={p.opcao} className="flex justify-between gap-2">
              <span>{p.rotulo}</span>
              <span className="tabular-nums">{p.votos}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pendente}
          onClick={async () => {
            if (!(await confirmar(`Encerrar a votação com ${v.votaram} voto(s)? O resultado é calculado e registrado na pauta.`))) return
            aoFazer(() => fecharVotacaoAction(congressoId, v.id))
          }}
        >
          <Check />
          Encerrar e apurar
        </Button>
        <Button
          variant="ghost"
          disabled={pendente}
          onClick={async () => {
            if (!(await confirmar("Cancelar esta votação? Os votos dados não contam e é preciso abrir outra."))) return
            aoFazer(() => cancelarVotacaoAction(congressoId, v.id))
          }}
        >
          Cancelar
        </Button>
      </div>
    </div>
  )
}

function AbrirVotacao({
  congressoId,
  pauta,
  votoEletronico,
  aoFazer,
  pendente,
}: {
  congressoId: string
  pauta: ItemPauta[]
  votoEletronico: "secreto" | "aberto" | "mesa_escolhe" | "nao"
  aoFazer: (fn: () => Promise<Resp>) => void
  pendente: boolean
}) {
  const [tipo, setTipo] = useState<"simples" | "priorizacao">("simples")
  const [sigilo, setSigilo] = useState<"aberta" | "secreta">(votoEletronico === "aberto" ? "aberta" : "secreta")
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [titulo, setTitulo] = useState("")
  const [livres, setLivres] = useState("")
  const [maximo, setMaximo] = useState("3")
  const escolhidos = pauta.filter((p) => marcados.has(p.id))
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <SelectNativo value={tipo} onChange={(e) => setTipo(e.target.value as "simples" | "priorizacao")} aria-label="Tipo de votação" className="w-auto">
          <option value="simples">A favor, contra ou abstenção</option>
          <option value="priorizacao">Priorização (escolher até N)</option>
        </SelectNativo>
        {votoEletronico === "mesa_escolhe" && (
          <SelectNativo value={sigilo} onChange={(e) => setSigilo(e.target.value as "aberta" | "secreta")} aria-label="Sigilo" className="w-auto">
            <option value="secreta">Secreta</option>
            <option value="aberta">Aberta (nominal)</option>
          </SelectNativo>
        )}
      </div>
      {pauta.length > 0 && (
        <div className="grid max-h-64 gap-1 overflow-y-auto rounded-md border p-2">
          <span className="text-xs font-medium">{tipo === "simples" ? "O que será votado (um item ou um bloco)" : "Itens da priorização"}</span>
          {pauta.map((p) => (
            <label key={p.id} className="flex items-start gap-2 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={marcados.has(p.id)}
                onCheckedChange={(x) =>
                  setMarcados((m) => {
                    const n = new Set(m)
                    if (x === true) n.add(p.id)
                    else n.delete(p.id)
                    return n
                  })
                }
              />
              <span className="min-w-0 flex-1">{p.rotulo}</span>
            </label>
          ))}
        </div>
      )}
      <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={tipo === "simples" ? "Título (opcional quando há item marcado)" : "Título da priorização"} aria-label="Título da votação" />
      {tipo === "priorizacao" && (
        <>
          <Textarea value={livres} onChange={(e) => setLivres(e.target.value)} rows={3} placeholder="Outros itens, um por linha (opcional)" aria-label="Itens livres da priorização" />
          <div className="flex items-center gap-2 text-sm">
            <Label htmlFor="prior-max">Cada pessoa escolhe até</Label>
            <Input id="prior-max" value={maximo} onChange={(e) => setMaximo(e.target.value.replace(/\D/g, ""))} className="w-16" inputMode="numeric" />
          </div>
        </>
      )}
      <Button
        className="justify-self-start"
        disabled={pendente || (tipo === "simples" ? !escolhidos.length && titulo.trim().length < 3 : escolhidos.length + livres.split("\n").filter((l) => l.trim()).length < 2)}
        onClick={() => {
          const propostaIds = escolhidos.filter((p) => p.tipo === "proposta").map((p) => p.id)
          const mocaoIds = escolhidos.filter((p) => p.tipo === "mocao").map((p) => p.id)
          aoFazer(() =>
            abrirVotacaoAction(congressoId, {
              tipo,
              sigilo,
              titulo: titulo || null,
              propostaIds,
              mocaoIds: tipo === "simples" ? mocaoIds : [],
              itens: tipo === "priorizacao" ? livres.split("\n").map((l) => l.trim()).filter(Boolean).map((rotulo, k) => ({ chave: `livre${k + 1}`, rotulo })) : [],
              maximoEscolhas: Number(maximo || 1),
            }).then((r) => {
              if (!r.erro) setMarcados(new Set())
              return r
            })
          )
        }}
      >
        <Vote />
        Abrir a votação
      </Button>
    </div>
  )
}

// ── Cédula (link pessoal e estação) ─────────────────────────────────────────

function Cedula({ v, aoVotar, pendente }: { v: VotacaoTela; aoVotar: (opcoes: string[]) => void; pendente: boolean }) {
  const [escolhas, setEscolhas] = useState<string[]>([])
  if (v.tipo === "simples") {
    return (
      <div className="grid gap-2">
        {OPCOES_SIMPLES.map((o) => (
          <Button
            key={o.chave}
            size="lg"
            variant={o.chave === "favor" ? "default" : o.chave === "contra" ? "destructive" : "outline"}
            className="h-14 text-lg"
            disabled={pendente}
            onClick={async () => {
              if (!(await confirmar(`Confirmar o voto "${o.rotulo}"? Depois de enviado, não muda.`))) return
              aoVotar([o.chave])
            }}
          >
            {o.rotulo}
          </Button>
        ))}
      </div>
    )
  }
  const max = v.maximoEscolhas ?? 1
  return (
    <div className="grid gap-2">
      <p className="text-sm">
        Escolha até <strong>{max}</strong> · {escolhas.length} marcado(s)
      </p>
      {v.itens.map((i) => (
        <label key={i.chave} className={`flex items-start gap-3 rounded-md border p-3 text-sm ${escolhas.includes(i.chave) ? "border-primary bg-primary/5" : ""}`}>
          <Checkbox
            className="mt-0.5"
            checked={escolhas.includes(i.chave)}
            disabled={!escolhas.includes(i.chave) && escolhas.length >= max}
            onCheckedChange={(x) => setEscolhas((e) => (x === true ? [...e, i.chave] : e.filter((y) => y !== i.chave)))}
          />
          <span>{i.rotulo}</span>
        </label>
      ))}
      <Button
        size="lg"
        className="h-12"
        disabled={pendente || !escolhas.length}
        onClick={async () => {
          if (!(await confirmar(`Confirmar ${escolhas.length} escolha(s)? Depois de enviado, não muda.`))) return
          aoVotar(escolhas)
        }}
      >
        Enviar o voto
      </Button>
    </div>
  )
}

// ── Plenária pelo link pessoal ──────────────────────────────────────────────

export function PlenariaNoLink({ token, falaPeloLink }: { token: string; falaPeloLink: boolean }) {
  const { estado, erro, offset, atualizar } = useEstado(`/congresso/eu/${token}/plenaria/estado`, 3000)
  const [avaliacao, setAvaliacao] = useState<{ votacaoId: string | null; pode: boolean; motivo?: string; precisaCodigo?: boolean; jaVotou: boolean } | null>(null)
  const [codigo, setCodigo] = useState("")
  const [msg, setMsg] = useState<Resp | null>(null)
  const [pendente, iniciar] = useTransition()
  const votacaoId = estado?.votacao && estado.votacao.aberta ? estado.votacao.id : null

  // Reavalia quando muda a votação aberta (não a cada consulta: poupa o servidor).
  useEffect(() => {
    if (!votacaoId) return
    let vivo = true
    avaliarPeloLinkAction(token).then((a) => vivo && setAvaliacao(a))
    return () => {
      vivo = false
    }
  }, [token, votacaoId])

  if (!estado) return <p className="text-muted-foreground text-sm">{erro ?? "Carregando a plenária…"}</p>
  const v = estado.votacao
  const minha = estado.fila.find((f) => f.minha)
  const avalAtual = avaliacao && avaliacao.votacaoId === votacaoId ? avaliacao : null

  return (
    <div className="grid gap-4">
      {erro && <p className="text-muted-foreground text-xs">{erro}</p>}
      {estado.assunto && (
        <p className="text-sm">
          Em debate: <strong>{estado.assunto}</strong>
        </p>
      )}

      <section className="grid gap-3 rounded-lg border p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Vote className="size-4" />
          Votação
        </h2>
        {v && v.aberta ? (
          <>
            <div>
              <div className="text-lg font-semibold">{v.titulo}</div>
              <div className="text-muted-foreground text-xs">
                {v.sigilo === "secreta" ? "Voto secreto: ninguém vê em quem você votou." : "Votação aberta: o seu voto é nominal e fica registrado com o seu nome."}
              </div>
            </div>
            {avalAtual?.jaVotou ? (
              <p className="font-medium text-emerald-700 dark:text-emerald-400">Seu voto já foi registrado.</p>
            ) : avalAtual && !avalAtual.pode && !avalAtual.precisaCodigo ? (
              <p className="text-sm">{avalAtual.motivo}</p>
            ) : (
              <>
                {avalAtual?.precisaCodigo && (
                  <div className="grid gap-1">
                    <Label htmlFor="codigo-voto">Código da sala (no telão)</Label>
                    <Input id="codigo-voto" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} className="font-mono text-lg tracking-widest" maxLength={6} />
                  </div>
                )}
                <Cedula
                  v={v}
                  pendente={pendente}
                  aoVotar={(opcoes) =>
                    iniciar(async () => {
                      const r = await votarPeloLinkAction(token, v.id, opcoes, codigo || null)
                      setMsg(r)
                      if (!r.erro || /já foi registrado/.test(r.erro)) setAvaliacao({ votacaoId: v.id, pode: false, jaVotou: true })
                      else if (r.precisaCodigo) setAvaliacao({ votacaoId: v.id, pode: false, precisaCodigo: true, jaVotou: false, motivo: r.erro })
                      await atualizar()
                    })
                  }
                />
              </>
            )}
            <p className="text-muted-foreground text-xs">
              {v.votaram} voto(s){v.baseVotantes ? ` de ${v.baseVotantes} em exercício` : ""}
            </p>
          </>
        ) : v?.resultado ? (
          <div className="grid gap-1">
            <div className="text-sm">Resultado: {v.titulo}</div>
            <Placar v={v} />
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Nenhuma votação aberta. Quando a mesa abrir, ela aparece aqui sozinha.</p>
        )}
        <Aviso r={msg} />
      </section>

      <section className="grid gap-3 rounded-lg border p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Mic className="size-4" />
          Com a palavra
        </h2>
        {estado.falando ? (
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="font-semibold">{estado.falando.nome}</div>
              <div className="text-muted-foreground text-xs">{ROTULO_FALA[estado.falando.tipo]}</div>
            </div>
            <Cronometro fala={estado.falando} offset={offset} />
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Ninguém falando agora.</p>
        )}
        {minha ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>
              Você é o(a) <strong>{estado.minhaPosicao}º</strong> na fila ({ROTULO_FALA[minha.tipo]}).
            </span>
            <Button size="sm" variant="ghost" disabled={pendente} onClick={() => iniciar(async () => (setMsg(await sairDaFilaPeloLinkAction(token, minha.id)), await atualizar()))}>
              Sair da fila
            </Button>
          </div>
        ) : falaPeloLink ? (
          <div className="flex flex-wrap gap-2">
            {(["fala", "a_favor", "contra", "questao_ordem", "esclarecimento", "encaminhamento", "declaracao_voto"] as TipoFala[]).map((t) => (
              <Button
                key={t}
                size="sm"
                variant={t === "fala" ? "default" : "outline"}
                disabled={pendente || (!estado.inscricoesAbertas && ["fala", "a_favor", "contra"].includes(t))}
                onClick={() => iniciar(async () => (setMsg(await inscreverPeloLinkAction(token, t)), await atualizar()))}
              >
                {ROTULO_FALA[t]}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">Para falar, peça a inscrição na mesa.</p>
        )}
        {!estado.inscricoesAbertas && <p className="text-muted-foreground text-xs">Inscrições para falar encerradas; questões de ordem continuam abertas.</p>}
        {estado.fila.length > 0 && (
          <ol className="text-muted-foreground grid gap-0.5 text-xs">
            {estado.fila.slice(0, 8).map((f, i) => (
              <li key={f.id} className={f.minha ? "text-foreground font-medium" : ""}>
                {i + 1}. {f.nome} · {ROTULO_FALA[f.tipo]}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

// ── Estação de voto (na mesa) ───────────────────────────────────────────────

export function EstacaoDeVoto({ congressoId }: { congressoId: string }) {
  const { estado, erro } = useEstado(`/painel/representacao/congressos/${congressoId}/telao/estado`, 3000)
  const [termo, setTermo] = useState("")
  const [pessoas, setPessoas] = useState<{ id: string; nome: string; base: string | null }[]>([])
  const [pessoa, setPessoa] = useState<{ participanteId: string; nome: string; pode: boolean; motivo?: string } | null>(null)
  const [msg, setMsg] = useState<Resp | null>(null)
  const [pendente, iniciar] = useTransition()
  const campo = useRef<HTMLInputElement>(null)
  const v = estado?.votacao && !estado.votacao.fechadaEm ? estado.votacao : null

  function proximo(r?: Resp) {
    setPessoa(null)
    setPessoas([])
    setTermo("")
    if (r) setMsg(r)
    setTimeout(() => campo.current?.focus(), 50)
  }

  if (!estado) return <p className="text-muted-foreground text-sm">{erro ?? "Carregando…"}</p>
  if (!v) return <p className="text-lg">Nenhuma votação aberta. Esta tela atualiza sozinha.</p>

  return (
    <div className="grid max-w-xl gap-4">
      <div>
        <Badge>{v.sigilo === "secreta" ? "Secreta" : "Aberta (nominal)"}</Badge>
        <div className="mt-1 text-xl font-semibold">{v.titulo}</div>
      </div>
      {!pessoa ? (
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (termo.trim().length < 2) return
            iniciar(async () => {
              const r = await identificarNaEstacaoAction(congressoId, termo)
              setPessoas(r.pessoas)
              if (r.avaliacao) setPessoa(r.avaliacao)
              setMsg(r.pessoas.length ? null : { erro: "Ninguém encontrado." })
            })
          }}
        >
          <Label htmlFor="estacao-busca">Leia o QR do crachá ou digite o nome</Label>
          <Input id="estacao-busca" ref={campo} autoFocus value={termo} onChange={(e) => setTermo(e.target.value)} className="h-12 text-lg" />
          <Button type="submit" disabled={pendente} className="justify-self-start">
            {pendente ? <Loader2 className="animate-spin" /> : "Identificar"}
          </Button>
          {pessoas.length > 1 && (
            <ul className="grid gap-1">
              {pessoas.map((p) => (
                <li key={p.id}>
                  <Button variant="outline" className="w-full justify-start" onClick={() => iniciar(async () => setPessoa(await avaliarNaEstacaoAction(congressoId, p.id)))}>
                    {p.nome}
                    {p.base ? ` · ${p.base}` : ""}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </form>
      ) : (
        <div className="grid gap-3 rounded-lg border p-4">
          <div className="text-lg font-semibold">{pessoa.nome}</div>
          {pessoa.pode ? (
            <>
              <p className="text-muted-foreground text-sm">Vire a tela para a pessoa votar{v.sigilo === "secreta" ? " sozinha: o voto é secreto" : ""}.</p>
              <Cedula
                v={v}
                pendente={pendente}
                aoVotar={(opcoes) => iniciar(async () => proximo(await votarNaEstacaoAction(congressoId, pessoa.participanteId, v.id, opcoes)))}
              />
            </>
          ) : (
            <p>{pessoa.motivo}</p>
          )}
          <Button variant="ghost" className="justify-self-start" onClick={() => proximo()}>
            Próxima pessoa
          </Button>
        </div>
      )}
      <Aviso r={msg} />
      <p className="text-muted-foreground text-xs">{v.votaram} voto(s) até agora.</p>
    </div>
  )
}

// ── Telão ───────────────────────────────────────────────────────────────────

export function Telao({ congressoId, titulo }: { congressoId: string; titulo: string }) {
  const { estado, erro, offset } = useEstado(`/painel/representacao/congressos/${congressoId}/telao/estado`, 2000)
  if (!estado) return <p className="p-8 text-2xl">{erro ?? "Carregando…"}</p>
  const v = estado.votacao
  return (
    <div className="grid min-h-svh gap-6 p-6 md:p-10">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-muted-foreground text-xl">{titulo}</div>
        {estado.sessao && <div className="text-muted-foreground text-xl">{estado.sessao.titulo}</div>}
      </header>
      {estado.assunto && <div className="text-3xl font-semibold md:text-4xl">{estado.assunto}</div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="grid content-start gap-4">
          {estado.falando ? (
            <>
              <div className="text-muted-foreground text-xl">{ROTULO_FALA[estado.falando.tipo]}</div>
              <div className="text-4xl font-semibold md:text-6xl">{estado.falando.nome}</div>
              <Cronometro fala={estado.falando} offset={offset} grande />
            </>
          ) : (
            <div className="text-muted-foreground text-3xl">Ninguém com a palavra</div>
          )}
          {estado.fila.length > 0 && (
            <ol className="grid gap-1 text-2xl">
              <li className="text-muted-foreground text-lg">A seguir{estado.inscricoesAbertas ? "" : " · inscrições encerradas"}</li>
              {estado.fila.slice(0, 6).map((f, i) => (
                <li key={f.id}>
                  {i + 1}. {f.nome} <span className="text-muted-foreground text-lg">· {ROTULO_FALA[f.tipo]}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        {v && (
          <section className="grid content-start gap-4 rounded-2xl border p-6">
            <div className="text-muted-foreground text-xl">{v.fechadaEm ? "Resultado" : `Votação ${v.sigilo === "secreta" ? "secreta" : "aberta"} em curso`}</div>
            <div className="text-3xl font-semibold">{v.titulo}</div>
            {!v.fechadaEm ? (
              <>
                <div className="text-7xl font-semibold tabular-nums">
                  {v.votaram}
                  <span className="text-muted-foreground text-3xl font-normal">{v.baseVotantes ? ` de ${v.baseVotantes}` : ""} votaram</span>
                </div>
                {estado.parcial && (
                  <ul className="grid gap-1 text-2xl">
                    {estado.parcial.map((p) => (
                      <li key={p.opcao} className="flex justify-between">
                        <span>{p.rotulo}</span>
                        <span className="tabular-nums">{p.votos}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <div className="text-2xl">
                <Placar v={v} />
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
