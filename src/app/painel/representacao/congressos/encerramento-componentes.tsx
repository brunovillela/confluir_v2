"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { Check, Loader2, Plus, Search, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { confirmar } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import { Textarea } from "@/components/ui/textarea"
import { ROTULO_DESTINO, ROTULO_SITUACAO_RESOLUCAO, type DestinoResolucao, type SituacaoResolucao } from "@/lib/congressos/encerramento"
import { semAcento } from "@/lib/texto"

import {
  apurarEleicaoAction,
  atualizarResolucaoAction,
  desfazerApuracaoAction,
  emitirCertificadosAction,
  encerrarCongressoAction,
  enviarEtapaSeguinteAction,
  gerarOficioAction,
  gerarResolucoesAction,
  inscreverChapaAction,
  novaResolucaoAction,
  reabrirCongressoAction,
  revogarCertificadoAction,
  situacaoChapaAction,
  vincularNegociacaoAction,
} from "./encerramento-actions"

type Resp = { erro?: string; ok?: string }

function Aviso({ r }: { r: Resp | null }) {
  if (!r) return null
  return (
    <p role="status" className={`text-sm ${r.erro ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
      {r.erro ?? r.ok}
    </p>
  )
}

/** Botão que roda uma ação (com pergunta antes, se houver) e mostra o resultado. */
export function BotaoAcao({
  rotulo,
  acao,
  pergunta,
  variante = "default",
}: {
  rotulo: string
  acao: () => Promise<Resp>
  pergunta?: string
  variante?: "default" | "outline" | "ghost"
}) {
  const [msg, setMsg] = useState<Resp | null>(null)
  const [pendente, iniciar] = useTransition()
  return (
    <div className="grid justify-items-start gap-1">
      <Button
        variant={variante}
        size="sm"
        disabled={pendente}
        onClick={async () => {
          if (pergunta && !(await confirmar(pergunta))) return
          iniciar(async () => setMsg(await acao()))
        }}
      >
        {pendente && <Loader2 className="animate-spin" />}
        {rotulo}
      </Button>
      <Aviso r={msg} />
    </div>
  )
}

export function EncerrarCongresso({ congressoId, encerrado }: { congressoId: string; encerrado: boolean }) {
  return encerrado ? (
    <BotaoAcao rotulo="Reabrir o congresso" variante="outline" pergunta="Reabrir? O congresso volta a Em andamento; resoluções e certificados continuam." acao={() => reabrirCongressoAction(congressoId)} />
  ) : (
    <BotaoAcao
      rotulo="Encerrar o congresso"
      pergunta="Encerrar? As resoluções do que foi aprovado são geradas, e o relatório, os certificados e as resoluções públicas ficam disponíveis."
      acao={() => encerrarCongressoAction(congressoId)}
    />
  )
}

export function GerarResolucoes({ congressoId }: { congressoId: string }) {
  return <BotaoAcao rotulo="Gerar do que foi aprovado" variante="outline" acao={() => gerarResolucoesAction(congressoId)} />
}

export function EmitirCertificados({ congressoId }: { congressoId: string }) {
  return <BotaoAcao rotulo="Emitir os certificados" acao={() => emitirCertificadosAction(congressoId)} />
}

export function EnviarEtapaSeguinte({ congressoId, destino }: { congressoId: string; destino: string }) {
  return (
    <BotaoAcao
      rotulo={`Levar ao ${destino}`}
      variante="outline"
      pergunta={`Levar os eleitos (como participantes) e as resoluções marcadas "Levar à etapa seguinte" (como propostas) ao ${destino}?`}
      acao={() => enviarEtapaSeguinteAction(congressoId)}
    />
  )
}

export function RevogarCertificado({ congressoId, id }: { congressoId: string; id: string }) {
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState("")
  const [msg, setMsg] = useState<Resp | null>(null)
  const [pendente, iniciar] = useTransition()
  if (!aberto)
    return (
      <Button size="sm" variant="ghost" onClick={() => setAberto(true)}>
        Revogar
      </Button>
    )
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo" aria-label="Motivo da revogação" className="h-8 w-48" />
      <Button size="sm" variant="destructive" disabled={pendente || motivo.trim().length < 3} onClick={() => iniciar(async () => setMsg(await revogarCertificadoAction(congressoId, id, motivo)))}>
        Revogar
      </Button>
      <Aviso r={msg} />
    </div>
  )
}

// ── Resoluções ──────────────────────────────────────────────────────────────

export type ResolucaoTela = {
  id: string
  numero: number
  titulo: string | null
  texto: string
  origem: string
  eixo: string | null
  reservada: boolean
  destino: DestinoResolucao
  responsavel: string | null
  prazo: string | null
  situacao: SituacaoResolucao
  atrasada: boolean
  negociacao: string | null
  oficioId: string | null
  podeOficio: boolean
  eventos: { quando: string; texto: string }[]
}

export function NovaResolucao({ congressoId, eixos }: { congressoId: string; eixos: { id: string; nome: string }[] }) {
  const [aberto, setAberto] = useState(false)
  const [titulo, setTitulo] = useState("")
  const [texto, setTexto] = useState("")
  const [eixo, setEixo] = useState("")
  const [reservada, setReservada] = useState(false)
  const [msg, setMsg] = useState<Resp | null>(null)
  const [pendente, iniciar] = useTransition()
  if (!aberto)
    return (
      <Button size="sm" variant="outline" onClick={() => setAberto(true)}>
        <Plus />
        Registrar resolução
      </Button>
    )
  return (
    <div className="grid w-full gap-2 rounded-lg border p-3">
      <Label htmlFor="res-titulo">Título (opcional)</Label>
      <Input id="res-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Plano de luta" />
      <Label htmlFor="res-texto">Texto aprovado</Label>
      <Textarea id="res-texto" value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} />
      <div className="flex flex-wrap items-center gap-3">
        <SelectNativo value={eixo} onChange={(e) => setEixo(e.target.value)} aria-label="Eixo" className="w-auto">
          <option value="">Sem eixo</option>
          {eixos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </SelectNativo>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={reservada} onCheckedChange={(v) => setReservada(v === true)} />
          Reservada (não divulgar)
        </label>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pendente || texto.trim().length < 5}
          onClick={() =>
            iniciar(async () => {
              const r = await novaResolucaoAction(congressoId, { titulo: titulo || null, texto, eixoId: eixo || null, reservada })
              setMsg(r)
              if (!r.erro) {
                setTexto("")
                setTitulo("")
                setAberto(false)
              }
            })
          }
        >
          Registrar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAberto(false)}>
          Voltar
        </Button>
      </div>
      <Aviso r={msg} />
    </div>
  )
}

export function CartaoResolucao({
  congressoId,
  r,
  negociacoes,
  gestor,
}: {
  congressoId: string
  r: ResolucaoTela
  negociacoes: { id: string; titulo: string }[]
  gestor: boolean
}) {
  const [destino, setDestino] = useState<DestinoResolucao>(r.destino)
  const [responsavel, setResponsavel] = useState(r.responsavel ?? "")
  const [prazo, setPrazo] = useState(r.prazo ?? "")
  const [situacao, setSituacao] = useState<SituacaoResolucao>(r.situacao)
  const [nota, setNota] = useState("")
  const [negociacao, setNegociacao] = useState("")
  const [verTrilha, setVerTrilha] = useState(false)
  const [msg, setMsg] = useState<Resp | null>(null)
  const [pendente, iniciar] = useTransition()
  const fazer = (fn: () => Promise<Resp>) => iniciar(async () => setMsg(await fn()))
  const mudou = destino !== r.destino || responsavel !== (r.responsavel ?? "") || prazo !== (r.prazo ?? "") || situacao !== r.situacao || nota.trim() !== ""

  return (
    <div className={`grid gap-2 rounded-lg border p-3 ${r.reservada ? "border-red-300 dark:border-red-900" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-foreground text-sm font-semibold">{r.numero}</span>
        <span className="text-muted-foreground">
          {r.origem}
          {r.eixo ? ` · ${r.eixo}` : ""}
        </span>
        {r.reservada && <Badge variant="destructive">Reservada</Badge>}
        <Badge variant={r.situacao === "cumprida" ? "success" : r.situacao === "nao_cumprida" ? "destructive" : "secondary"}>{ROTULO_SITUACAO_RESOLUCAO[r.situacao]}</Badge>
        {r.atrasada && <Badge variant="destructive">Prazo vencido</Badge>}
        {r.negociacao && <Badge variant="outline">Na negociação: {r.negociacao}</Badge>}
        {r.oficioId && (
          <Link href={`/painel/ferramentas/oficios/${r.oficioId}`} className="text-primary underline underline-offset-2">
            Ofício
          </Link>
        )}
      </div>
      <p className="text-sm whitespace-pre-wrap">
        {r.titulo && <strong>{r.titulo}. </strong>}
        {r.texto}
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1">
          <Label className="text-xs">Destino</Label>
          <SelectNativo value={destino} onChange={(e) => setDestino(e.target.value as DestinoResolucao)} aria-label={`Destino da resolução ${r.numero}`}>
            {Object.entries(ROTULO_DESTINO).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </SelectNativo>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Responsável</Label>
          <Input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder="Diretoria, secretaria, pessoa" aria-label={`Responsável pela resolução ${r.numero}`} />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Prazo</Label>
          <Input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} aria-label={`Prazo da resolução ${r.numero}`} />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Situação</Label>
          <SelectNativo value={situacao} onChange={(e) => setSituacao(e.target.value as SituacaoResolucao)} aria-label={`Situação da resolução ${r.numero}`}>
            {Object.entries(ROTULO_SITUACAO_RESOLUCAO).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </SelectNativo>
        </div>
      </div>
      <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota do acompanhamento (opcional)" aria-label={`Nota da resolução ${r.numero}`} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={pendente || !mudou}
          onClick={() =>
            fazer(async () => {
              const x = await atualizarResolucaoAction(congressoId, r.id, { destino, responsavel, prazo: prazo || null, situacao, nota })
              if (!x.erro) setNota("")
              return x
            })
          }
        >
          <Check />
          Salvar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pendente}
          onClick={async () => {
            const marcar = !r.reservada
            if (marcar && !(await confirmar("Marcar como reservada? Ela sai do caderno público, da página do congresso e do link dos participantes."))) return
            fazer(() => atualizarResolucaoAction(congressoId, r.id, { reservada: marcar }))
          }}
        >
          {r.reservada ? "Tornar pública" : "Marcar como reservada"}
        </Button>
        {gestor && !r.negociacao && negociacoes.length > 0 && (destino === "pauta_act" || r.destino === "pauta_act") && (
          <>
            <SelectNativo value={negociacao} onChange={(e) => setNegociacao(e.target.value)} aria-label="Negociação" className="h-8 w-auto text-xs">
              <option value="">Escolha a negociação…</option>
              {negociacoes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.titulo}
                </option>
              ))}
            </SelectNativo>
            <Button size="sm" variant="outline" disabled={pendente || !negociacao} onClick={() => fazer(() => vincularNegociacaoAction(congressoId, r.id, negociacao))}>
              Levar à negociação
            </Button>
          </>
        )}
        {gestor && r.podeOficio && !r.oficioId && (
          <Button size="sm" variant="outline" disabled={pendente} onClick={() => fazer(() => gerarOficioAction(congressoId, r.id))}>
            Gerar ofício
          </Button>
        )}
        {r.eventos.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setVerTrilha((v) => !v)}>
            {verTrilha ? "Esconder o acompanhamento" : `Acompanhamento (${r.eventos.length})`}
          </Button>
        )}
      </div>
      {verTrilha && (
        <ul className="bg-muted/40 grid gap-1 rounded-md p-2 text-xs">
          {r.eventos.map((e, i) => (
            <li key={i}>
              <span className="text-muted-foreground tabular-nums">{e.quando}</span> · {e.texto}
            </li>
          ))}
        </ul>
      )}
      <Aviso r={msg} />
    </div>
  )
}

// ── Eleição ─────────────────────────────────────────────────────────────────

type Candidato = { id: string; nome: string; base: string | null; podeCompor: boolean; chapa: number | null }

export function InscreverChapa({ congressoId, candidatos, vagas, suplentes }: { congressoId: string; candidatos: Candidato[]; vagas: number; suplentes: number }) {
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState("")
  const [busca, setBusca] = useState("")
  const [membros, setMembros] = useState<{ id: string; condicao: "titular" | "suplente" }[]>([])
  const [msg, setMsg] = useState<(Resp & { problemas?: string[] }) | null>(null)
  const [pendente, iniciar] = useTransition()
  const porId = new Map(candidatos.map((c) => [c.id, c]))
  const achados = useMemo(() => {
    const b = semAcento(busca.trim())
    if (b.length < 2) return []
    return candidatos.filter((c) => semAcento(`${c.nome} ${c.base ?? ""}`).includes(b) && !membros.some((m) => m.id === c.id)).slice(0, 8)
  }, [busca, candidatos, membros])
  const titulares = membros.filter((m) => m.condicao === "titular").length
  const sups = membros.filter((m) => m.condicao === "suplente").length

  if (!aberto)
    return (
      <Button size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Inscrever chapa
      </Button>
    )
  return (
    <div className="grid w-full gap-3 rounded-lg border p-3">
      <div className="grid gap-1">
        <Label htmlFor="chapa-nome">Nome da chapa</Label>
        <Input id="chapa-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="chapa-busca">
          Incluir pessoas · {titulares} de {vagas} titulares{suplentes ? ` · ${sups} de ${suplentes} suplentes` : ""}
        </Label>
        <div className="relative">
          <Search className="text-muted-foreground absolute top-2.5 left-2 size-4" />
          <Input id="chapa-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou base" className="pl-8" />
        </div>
        {achados.length > 0 && (
          <ul className="grid gap-1 rounded-md border p-1">
            {achados.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 flex-1">
                  {c.nome}
                  {c.base && <span className="text-muted-foreground"> · {c.base}</span>}
                  {!c.podeCompor && <span className="text-destructive text-xs"> · não pode compor</span>}
                  {c.chapa && <span className="text-destructive text-xs"> · já na chapa {c.chapa}</span>}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!c.podeCompor || !!c.chapa}
                  onClick={() => {
                    setMembros((m) => [...m, { id: c.id, condicao: titulares < vagas ? "titular" : "suplente" }])
                    setBusca("")
                  }}
                >
                  Incluir
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {membros.length > 0 && (
        <ol className="grid gap-1 text-sm">
          {membros.map((m, i) => {
            const c = porId.get(m.id)
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground w-6 tabular-nums">{i + 1}.</span>
                <span className="min-w-0 flex-1">
                  {c?.nome}
                  {c?.base && <span className="text-muted-foreground"> · {c.base}</span>}
                </span>
                {suplentes > 0 && (
                  <SelectNativo
                    value={m.condicao}
                    aria-label={`Condição de ${c?.nome}`}
                    className="h-8 w-auto text-xs"
                    onChange={(e) => setMembros((xs) => xs.map((x) => (x.id === m.id ? { ...x, condicao: e.target.value as "titular" | "suplente" } : x)))}
                  >
                    <option value="titular">Titular</option>
                    <option value="suplente">Suplente</option>
                  </SelectNativo>
                )}
                <Button size="sm" variant="ghost" aria-label={`Tirar ${c?.nome}`} onClick={() => setMembros((xs) => xs.filter((x) => x.id !== m.id))}>
                  <Trash2 />
                </Button>
              </li>
            )
          })}
        </ol>
      )}
      <div className="flex gap-2">
        <Button
          disabled={pendente || nome.trim().length < 2 || !membros.length}
          onClick={() =>
            iniciar(async () => {
              const r = await inscreverChapaAction(congressoId, { nome, membros: membros.map((m) => ({ participanteId: m.id, condicao: m.condicao })) })
              setMsg(r)
              if (!r.erro) {
                setNome("")
                setMembros([])
                setAberto(false)
              }
            })
          }
        >
          {pendente && <Loader2 className="animate-spin" />}
          Inscrever agora
        </Button>
        <Button variant="ghost" onClick={() => setAberto(false)}>
          Voltar
        </Button>
      </div>
      {msg?.erro && (
        <div role="status" className="text-destructive text-sm">
          {msg.erro}
          {msg.problemas && (
            <ul className="list-disc pl-5">
              {msg.problemas.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {msg?.ok && <Aviso r={msg} />}
    </div>
  )
}

export function AcoesChapa({ congressoId, chapaId, situacao }: { congressoId: string; chapaId: string; situacao: string }) {
  const [motivo, setMotivo] = useState("")
  const [msg, setMsg] = useState<Resp | null>(null)
  const [pendente, iniciar] = useTransition()
  const fazer = (s: "homologada" | "impugnada" | "retirada" | "inscrita") => iniciar(async () => setMsg(await situacaoChapaAction(congressoId, chapaId, s, motivo || null)))
  return (
    <div className="flex flex-wrap items-center gap-1">
      {situacao === "inscrita" && (
        <Button size="sm" variant="outline" disabled={pendente} onClick={() => fazer("homologada")}>
          Homologar
        </Button>
      )}
      {(situacao === "inscrita" || situacao === "homologada") && (
        <>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo" aria-label="Motivo" className="h-8 w-40" />
          <Button size="sm" variant="ghost" disabled={pendente || !motivo.trim()} onClick={() => fazer("impugnada")}>
            Impugnar
          </Button>
          <Button size="sm" variant="ghost" disabled={pendente || !motivo.trim()} onClick={() => fazer("retirada")}>
            Retirar
          </Button>
        </>
      )}
      {(situacao === "impugnada" || situacao === "retirada") && (
        <Button size="sm" variant="ghost" disabled={pendente} onClick={() => fazer("inscrita")}>
          Desfazer
        </Button>
      )}
      <Aviso r={msg} />
    </div>
  )
}

export function Apuracao({ congressoId, chapas, apurada }: { congressoId: string; chapas: { id: string; numero: number; nome: string; votos: number | null }[]; apurada: boolean }) {
  const [votos, setVotos] = useState<Record<string, string>>(Object.fromEntries(chapas.map((c) => [c.id, c.votos === null ? "" : String(c.votos)])))
  const [msg, setMsg] = useState<Resp | null>(null)
  const [pendente, iniciar] = useTransition()
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-end gap-3">
        {chapas.map((c) => (
          <div key={c.id} className="grid w-36 gap-1">
            <Label className="text-xs" htmlFor={`votos-${c.id}`}>
              Chapa {c.numero} · {c.nome}
            </Label>
            <Input
              id={`votos-${c.id}`}
              inputMode="numeric"
              value={votos[c.id] ?? ""}
              disabled={apurada}
              onChange={(e) => setVotos((v) => ({ ...v, [c.id]: e.target.value.replace(/\D/g, "") }))}
              className="tabular-nums"
            />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {apurada ? (
          <Button size="sm" variant="outline" disabled={pendente} onClick={async () => {
            if (!(await confirmar("Desfazer a apuração? Os votos e os eleitos são apagados para lançar de novo."))) return
            iniciar(async () => setMsg(await desfazerApuracaoAction(congressoId)))
          }}>
            Desfazer a apuração
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={pendente || chapas.some((c) => votos[c.id] === "")}
            onClick={() => iniciar(async () => setMsg(await apurarEleicaoAction(congressoId, Object.fromEntries(Object.entries(votos).map(([k, v]) => [k, Number(v || 0)])))))}
          >
            Apurar
          </Button>
        )}
      </div>
      <Aviso r={msg} />
    </div>
  )
}
