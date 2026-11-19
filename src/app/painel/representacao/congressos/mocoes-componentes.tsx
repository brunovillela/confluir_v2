"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { CheckCircle2, Loader2, Plus, Stamp, X } from "lucide-react"

import { LeitorQr } from "@/components/leitor-qr"
import { Button } from "@/components/ui/button"
import { confirmar } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import { Textarea } from "@/components/ui/textarea"
import type { Limiar } from "@/lib/congressos/mocoes"

import {
  alterarMocaoLinkAction,
  alterarMocaoPainelAction,
  criarMocaoLinkAction,
  criarMocaoPainelAction,
  decidirAction,
  lancarAssinaturaAction,
  protocolarLinkAction,
  protocolarPainelAction,
  retirarAssinaturaPainelAction,
  retirarMocaoLinkAction,
  retirarMocaoPainelAction,
  type DadosMocaoForm,
} from "./mocoes-actions"

type Resp = { erro?: string; ok?: string }
export type Origem = { tipo: "painel"; congressoId: string } | { tipo: "link"; token: string }

function Mensagem({ r }: { r: Resp | null }) {
  if (!r) return null
  return (
    <p role="status" className={`text-sm font-medium ${r.erro ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
      {r.erro ?? r.ok}
    </p>
  )
}

/** Progresso nas alternativas do limiar ("90% da base ou 20 delegados"). */
export function ProgressoLimiar({ limiar, gravado }: { limiar: Limiar; gravado?: boolean }) {
  if (!limiar.alternativas.length) {
    return <p className="text-muted-foreground text-sm">{limiar.aviso ?? "Sem mínimo de assinaturas."}</p>
  }
  return (
    <div className="grid gap-2">
      {limiar.alternativas.map((a, i) => {
        const pct = Math.min(100, Math.round((a.atual / Math.max(1, a.exigido)) * 100))
        return (
          <div key={a.rotulo} className="grid gap-1">
            {i > 0 && <div className="text-muted-foreground text-xs font-medium uppercase">{limiar.combinacao === "e" ? "e" : "ou"}</div>}
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span>{a.rotulo}</span>
              <span className={`tabular-nums font-semibold ${a.atingido ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
                {a.atual} / {a.exigido}
              </span>
            </div>
            <div className="bg-muted h-2 overflow-hidden rounded-full" role="progressbar" aria-valuenow={a.atual} aria-valuemax={a.exigido} aria-label={a.rotulo}>
              <div className={`h-full rounded-full ${a.atingido ? "bg-emerald-600" : "bg-primary"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      })}
      {limiar.aviso && <p className="text-xs text-amber-700 dark:text-amber-400">{limiar.aviso}</p>}
      <p className={`text-sm font-medium ${limiar.atingido ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>
        {limiar.atingido ? (gravado ? "Mínimo atingido no protocolo." : "Mínimo atingido: pode protocolar.") : gravado ? "Mínimo não atingido no protocolo." : "Mínimo ainda não atingido."}
      </p>
    </div>
  )
}

/** Apresentar ou alterar uma moção, pelo painel ou pelo link pessoal. */
export function MocaoForm({
  origem,
  tipos,
  bases,
  inicial,
  mocaoId,
  temAssinaturas,
  aoConcluir,
}: {
  origem: Origem
  tipos: string[]
  bases: { id: string; nome: string }[]
  inicial?: Partial<DadosMocaoForm>
  mocaoId?: string
  temAssinaturas?: boolean
  aoConcluir?: (r: Resp & { id?: string; codigo?: string }) => void
}) {
  const [d, setD] = useState<DadosMocaoForm>({
    tipo: inicial?.tipo ?? null,
    titulo: inicial?.titulo ?? "",
    destinatario: inicial?.destinatario ?? "",
    texto: inicial?.texto ?? "",
    unidadeId: inicial?.unidadeId ?? null,
  })
  const [r, setR] = useState<Resp | null>(null)
  const [pendente, iniciar] = useTransition()
  const enviar = async () => {
    if (mocaoId && temAssinaturas && !(await confirmar("A moção já tem assinaturas. Mudar o texto cria uma versão nova, e quem assinou precisará assinar de novo. Continuar?"))) return
    iniciar(async () => {
      const x = mocaoId
        ? origem.tipo === "painel"
          ? await alterarMocaoPainelAction(origem.congressoId, mocaoId, d)
          : await alterarMocaoLinkAction(origem.token, mocaoId, d)
        : origem.tipo === "painel"
          ? await criarMocaoPainelAction(origem.congressoId, d)
          : await criarMocaoLinkAction(origem.token, d)
      setR(x)
      aoConcluir?.(x)
    })
  }
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-3">
        {tipos.length > 0 && (
          <div className="grid gap-1">
            <Label htmlFor="mocao-tipo">Tipo</Label>
            <SelectNativo id="mocao-tipo" value={d.tipo ?? ""} onChange={(e) => setD({ ...d, tipo: e.target.value || null })}>
              <option value="">Escolha…</option>
              {tipos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </SelectNativo>
          </div>
        )}
        {bases.length > 0 && (
          <div className="grid min-w-48 gap-1">
            <Label htmlFor="mocao-base">Base de origem</Label>
            <SelectNativo id="mocao-base" value={d.unidadeId ?? ""} onChange={(e) => setD({ ...d, unidadeId: e.target.value || null })}>
              <option value="">—</option>
              {bases.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome}
                </option>
              ))}
            </SelectNativo>
          </div>
        )}
      </div>
      <div className="grid gap-1">
        <Label htmlFor="mocao-titulo">Título</Label>
        <Input id="mocao-titulo" value={d.titulo} onChange={(e) => setD({ ...d, titulo: e.target.value })} placeholder="Ex.: Moção de repúdio à privatização" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="mocao-destinatario">Destinatário (opcional)</Label>
        <Input id="mocao-destinatario" value={d.destinatario ?? ""} onChange={(e) => setD({ ...d, destinatario: e.target.value })} placeholder="A quem a moção se dirige" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="mocao-texto">Texto</Label>
        <Textarea id="mocao-texto" value={d.texto} onChange={(e) => setD({ ...d, texto: e.target.value })} rows={8} className="text-base" />
      </div>
      <Button className="justify-self-start" disabled={pendente || d.titulo.trim().length < 3 || d.texto.trim().length < 20} onClick={enviar}>
        {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
        {mocaoId ? "Salvar a moção" : "Apresentar a moção"}
      </Button>
      <Mensagem r={r} />
    </div>
  )
}

/** Nova moção no painel: abre o formulário e, ao criar, leva à página da moção. */
export function NovaMocaoPainel({ congressoId, tipos, bases }: { congressoId: string; tipos: string[]; bases: { id: string; nome: string }[] }) {
  const [aberto, setAberto] = useState(false)
  const router = useRouter()
  if (!aberto) {
    return (
      <Button onClick={() => setAberto(true)}>
        <Plus />
        Registrar moção
      </Button>
    )
  }
  return (
    <div className="w-full rounded-lg border p-4">
      <MocaoForm
        origem={{ tipo: "painel", congressoId }}
        tipos={tipos}
        bases={bases}
        aoConcluir={(r) => {
          if (r.id) router.push(`/painel/representacao/congressos/${congressoId}/mocoes/${r.id}`)
        }}
      />
    </div>
  )
}

/** Estação da mesa e lançamento do papel: identifica pelo crachá, CPF ou nome. */
export function LancarAssinatura({ congressoId, mocaoId, meioPermitido }: { congressoId: string; mocaoId: string; meioPermitido: "ambos" | "eletronico" | "papel" }) {
  const meios = meioPermitido === "papel" ? (["papel"] as const) : meioPermitido === "eletronico" ? (["estacao"] as const) : (["estacao", "papel"] as const)
  const [meio, setMeio] = useState<"estacao" | "papel">(meios[0])
  const [termo, setTermo] = useState("")
  const [candidatos, setCandidatos] = useState<{ id: string; nome: string; base: string | null }[]>([])
  const [r, setR] = useState<Resp | null>(null)
  const [pendente, iniciar] = useTransition()
  const lancar = (p: { texto?: string; participanteId?: string }) =>
    iniciar(async () => {
      const x = await lancarAssinaturaAction(congressoId, mocaoId, { ...p, meio })
      if (x.candidatos) {
        setCandidatos(x.candidatos.map((c) => ({ id: c.id, nome: c.nome, base: c.base })))
        setR(null)
        return
      }
      setCandidatos([])
      setR(x)
      if (!x.erro) setTermo("")
    })
  return (
    <div className="grid gap-3">
      {meios.length > 1 && (
        <div className="flex gap-1" role="radiogroup" aria-label="Meio">
          {meios.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={meio === m}
              onClick={() => setMeio(m)}
              className={`rounded-full border px-3 py-1 text-xs ${meio === m ? "bg-primary text-primary-foreground border-primary" : ""}`}
            >
              {m === "estacao" ? "Estação da mesa (a pessoa assina aqui)" : "Lançar do papel"}
            </button>
          ))}
        </div>
      )}
      <LeitorQr rotulo="Ler o crachá" continuo={meio === "papel"} aoLer={(t) => lancar({ texto: t })} />
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          lancar({ texto: termo })
        }}
      >
        <Input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Nome ou CPF" aria-label="Nome ou CPF de quem assina" className="max-w-xs" />
        <Button type="submit" variant="outline" disabled={pendente || termo.trim().length < 3}>
          {pendente ? <Loader2 className="animate-spin" /> : <Stamp />}
          Lançar assinatura
        </Button>
      </form>
      {candidatos.length > 0 && (
        <div className="grid gap-1 rounded-md border p-2">
          <div className="text-sm font-medium">Quem é?</div>
          {candidatos.map((c) => (
            <Button key={c.id} variant="outline" size="sm" className="justify-start" onClick={() => lancar({ participanteId: c.id })}>
              {c.nome}
              {c.base ? ` · ${c.base}` : ""}
            </Button>
          ))}
        </div>
      )}
      <Mensagem r={r} />
    </div>
  )
}

export function RetirarAssinaturaMesa({ congressoId, mocaoId, participanteId, nome }: { congressoId: string; mocaoId: string; participanteId: string; nome: string }) {
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        aria-label={`Retirar a assinatura de ${nome}`}
        className="text-muted-foreground hover:text-destructive"
        disabled={pendente}
        onClick={async () => {
          if (!(await confirmar(`Retirar a assinatura de ${nome}? Fica registrada como retirada.`))) return
          iniciar(async () => {
            const r = await retirarAssinaturaPainelAction(congressoId, mocaoId, participanteId)
            setErro(r.erro ?? null)
          })
        }}
      >
        <X className="size-4" />
      </button>
      {erro && <span className="text-destructive text-xs">{erro}</span>}
    </span>
  )
}

/** Protocolar, decidir a habilitação e retirar. */
export function AcoesMocao({
  origem,
  mocaoId,
  situacao,
  podeDecidir,
}: {
  origem: Origem
  mocaoId: string
  situacao: string
  podeDecidir: boolean
}) {
  const [r, setR] = useState<Resp | null>(null)
  const [pendente, iniciar] = useTransition()
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {situacao === "coleta" && (
          <Button
            disabled={pendente}
            onClick={async () => {
              if (!(await confirmar("Protocolar a moção? O limiar é calculado agora e fica gravado; depois disso não se colhem mais assinaturas."))) return
              iniciar(async () =>
                setR(origem.tipo === "painel" ? await protocolarPainelAction(origem.congressoId, mocaoId) : await protocolarLinkAction(origem.token, mocaoId))
              )
            }}
          >
            {pendente ? <Loader2 className="animate-spin" /> : <Stamp />}
            Protocolar
          </Button>
        )}
        {podeDecidir && origem.tipo === "painel" && ["protocolada", "habilitada", "nao_habilitada"].includes(situacao) && (
          <>
            {situacao !== "habilitada" && (
              <Button variant="outline" disabled={pendente} onClick={() => iniciar(async () => setR(await decidirAction(origem.congressoId, mocaoId, true, null)))}>
                <CheckCircle2 />
                Habilitar
              </Button>
            )}
            {situacao !== "nao_habilitada" && (
              <Button
                variant="outline"
                disabled={pendente}
                onClick={() => {
                  const motivo = window.prompt("Motivo da não habilitação:")
                  if (!motivo?.trim()) return
                  iniciar(async () => setR(await decidirAction(origem.congressoId, mocaoId, false, motivo)))
                }}
              >
                Não habilitar
              </Button>
            )}
          </>
        )}
        {!["aprovada", "rejeitada", "retirada"].includes(situacao) && (
          <Button
            variant="ghost"
            disabled={pendente}
            onClick={async () => {
              if (origem.tipo === "painel") {
                const motivo = window.prompt("Motivo da retirada (opcional):")
                if (motivo === null) return
                iniciar(async () => setR(await retirarMocaoPainelAction(origem.congressoId, mocaoId, motivo)))
              } else {
                if (!(await confirmar("Retirar a moção? Ela sai da coleta e da pauta."))) return
                iniciar(async () => setR(await retirarMocaoLinkAction(origem.token, mocaoId)))
              }
            }}
          >
            Retirar a moção
          </Button>
        )}
      </div>
      <Mensagem r={r} />
    </div>
  )
}
