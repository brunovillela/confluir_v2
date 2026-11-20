"use client"

import { useActionState, useState, useTransition } from "react"
import { AlertTriangle, Check, FileText, Loader2, Sparkles, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import { Textarea } from "@/components/ui/textarea"
import type { ItemCaderno } from "@/lib/congressos/ia"
import type { Sugestao } from "@/lib/db/congressos-ia"

import {
  aceitarRedacaoAction,
  aceitarTriagemMocaoAction,
  aplicarRegimentoAction,
  gravarCadernoAction,
  guardarSinteseAction,
  lerCadernoAction,
  lerRegimentoAction,
  recusarSugestaoAction,
  sugerirRedacaoAction,
  sugerirSinteseAction,
  triarMocaoAction,
  type EstadoCaderno,
  type EstadoRegimento,
} from "./ia-actions"

type Acesso = { congressoId: string; token?: undefined } | { token: string; congressoId?: undefined }
type Resp = { erro?: string; ok?: string }

export const AVISO_IA = "Sugestão da IA: confira antes de aceitar. Nada muda sem o seu aceite."

function Aviso({ r }: { r: Resp | null }) {
  if (!r) return null
  return (
    <p role="status" className={`text-xs ${r.erro ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
      {r.erro ?? r.ok}
    </p>
  )
}

// ── Redação ─────────────────────────────────────────────────────────────────

/**
 * Pede à IA uma redação mais clara para a proposta e mostra lado a lado, com
 * os alertas de mudança de sentido (da IA e da conferência sem IA).
 */
export function RedacaoIA({
  acesso,
  grupoId,
  propostaId,
  textoAtual,
  inicial,
  aoResultado,
}: {
  acesso: Acesso
  grupoId: string | null
  propostaId: string
  textoAtual: string
  inicial?: Sugestao | null
  aoResultado?: (r: Resp) => void
}) {
  const [s, setS] = useState<Sugestao | null>(inicial ?? null)
  const [texto, setTexto] = useState(String(inicial?.conteudo.texto ?? ""))
  const [msg, setMsg] = useState<Resp | null>(null)
  const [pendente, iniciar] = useTransition()

  function avisar(r: Resp) {
    setMsg(r)
    aoResultado?.(r)
  }

  if (!s) {
    return (
      <div className="grid gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="justify-self-start"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await sugerirRedacaoAction(acesso, grupoId, propostaId)
              if (r.sugestao) {
                setS(r.sugestao)
                setTexto(String(r.sugestao.conteudo.texto ?? ""))
                setMsg(null)
              } else setMsg({ erro: r.erro })
            })
          }
        >
          {pendente ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Sugerir redação
        </Button>
        <Aviso r={msg} />
      </div>
    )
  }

  const alertas = [...(s.conteudo.mudaSentido && s.conteudo.alerta ? [String(s.conteudo.alerta)] : []), ...((s.conteudo.alertasLocais as string[]) ?? [])]
  return (
    <div className="bg-muted/30 grid gap-2 rounded-md border p-2">
      <div className="text-muted-foreground flex items-center gap-1 text-xs">
        <Sparkles className="size-3" />
        {AVISO_IA}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div className="grid gap-1">
          <span className="text-xs font-medium">Texto atual</span>
          <p className="bg-background rounded border p-2 text-sm whitespace-pre-wrap">{textoAtual}</p>
        </div>
        <div className="grid gap-1">
          <Label className="text-xs font-medium" htmlFor={`redacao-${s.id}`}>
            Redação sugerida (pode ajustar)
          </Label>
          <Textarea id={`redacao-${s.id}`} value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} className="text-sm" />
        </div>
      </div>
      {alertas.length > 0 && (
        <Alert variant="warning" className="py-2">
          <AlertTriangle className="size-4" />
          <AlertDescription>
            <div className="font-medium">Pode ter mudado o sentido — confira:</div>
            <ul className="list-disc pl-5 text-xs">
              {alertas.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pendente || texto.trim().length < 5}
          onClick={() =>
            iniciar(async () => {
              const r = await aceitarRedacaoAction(acesso, grupoId, s.id, texto)
              avisar(r)
              if (!r.erro) setS(null)
            })
          }
        >
          <Check />
          Aceitar redação
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await recusarSugestaoAction(acesso, grupoId, s.id)
              avisar(r)
              if (!r.erro) setS(null)
            })
          }
        >
          <X />
          Recusar
        </Button>
      </div>
      <Aviso r={msg} />
    </div>
  )
}

// ── Síntese do grupo ────────────────────────────────────────────────────────

export function SinteseGrupo({
  acesso,
  grupoId,
  salva,
  pendenteInicial,
  iaLigada,
}: {
  acesso: Acesso
  grupoId: string
  salva: { texto: string; em: string | null; por: string | null } | null
  pendenteInicial: Sugestao | null
  iaLigada: boolean
}) {
  const textoDe = (s: Sugestao) => `${String(s.conteudo.resumo ?? "")}\n\n${String(s.conteudo.minuta ?? "")}`.trim()
  const [sugestao, setSugestao] = useState<Sugestao | null>(pendenteInicial)
  const [texto, setTexto] = useState(pendenteInicial ? textoDe(pendenteInicial) : (salva?.texto ?? ""))
  const [msg, setMsg] = useState<Resp | null>(null)
  const [pendente, iniciar] = useTransition()

  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">Síntese do grupo</div>
          <p className="text-muted-foreground text-xs">
            {salva?.em
              ? `Guardada${salva.por ? ` por ${salva.por}` : ""} em ${new Date(salva.em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`
              : "Resumo e minuta do relatório. A relatoria revisa antes de guardar."}
          </p>
        </div>
        {iaLigada && (
          <Button
            size="sm"
            variant="outline"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await sugerirSinteseAction(acesso, grupoId)
                if (r.sugestao) {
                  setSugestao(r.sugestao)
                  setTexto(textoDe(r.sugestao))
                  setMsg({ ok: "Rascunho pronto: revise e guarde." })
                } else setMsg({ erro: r.erro })
              })
            }
          >
            {pendente ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {sugestao || salva ? "Sugerir de novo" : "Sugerir síntese"}
          </Button>
        )}
      </div>
      {sugestao && (
        <p className="text-muted-foreground flex items-center gap-1 text-xs">
          <Sparkles className="size-3" />
          Rascunho da IA: revise, ajuste e guarde.
        </p>
      )}
      <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={8} aria-label="Síntese do grupo" className="text-sm" />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await guardarSinteseAction(acesso, grupoId, texto, sugestao?.id ?? null)
              setMsg(r)
              if (!r.erro) setSugestao(null)
            })
          }
        >
          Guardar síntese
        </Button>
        {sugestao && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                const r = await recusarSugestaoAction(acesso, grupoId, sugestao.id)
                setMsg(r)
                if (!r.erro) {
                  setSugestao(null)
                  setTexto(salva?.texto ?? "")
                }
              })
            }
          >
            Descartar rascunho
          </Button>
        )}
      </div>
      <Aviso r={msg} />
    </div>
  )
}

// ── Triagem de moção ────────────────────────────────────────────────────────

export function TriagemMocao({
  congressoId,
  mocaoId,
  pendenteInicial,
  tipoAtual,
  destinatarioAtual,
  emColeta,
  assinada,
}: {
  congressoId: string
  mocaoId: string
  pendenteInicial: Sugestao | null
  tipoAtual: string | null
  destinatarioAtual: string | null
  emColeta: boolean
  assinada: boolean
}) {
  const [msg, setMsg] = useState<Resp | null>(null)
  const [pendente, iniciar] = useTransition()
  const s = pendenteInicial
  const c = s?.conteudo ?? {}
  const tipoDiferente = !!c.tipo && c.tipo !== tipoAtual
  const destDiferente = !!c.destinatario && c.destinatario !== destinatarioAtual
  const [tipo, setTipo] = useState(true)
  const [dest, setDest] = useState(!assinada)

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pendente}
          onClick={() => iniciar(async () => setMsg(await triarMocaoAction(congressoId, mocaoId)))}
        >
          {pendente ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {s ? "Triar de novo" : "Triagem pela IA"}
        </Button>
        <span className="text-muted-foreground text-xs">Tipo, destinatário e alerta de conteúdo. A IA nunca habilita nem inabilita.</span>
      </div>
      {s && (
        <div className="bg-muted/30 grid gap-2 rounded-md border p-2 text-sm">
          {c.alertaConteudo ? (
            <Alert variant="warning" className="py-2">
              <AlertTriangle className="size-4" />
              <AlertDescription>
                <span className="font-medium">Alerta de conteúdo: </span>
                {String(c.alertaConteudo)} <span className="text-xs">(a decisão é da comissão)</span>
              </AlertDescription>
            </Alert>
          ) : (
            <p className="text-muted-foreground text-xs">Sem alerta de conteúdo ofensivo.</p>
          )}
          {tipoDiferente && emColeta && (
            <label className="flex items-center gap-2">
              <Checkbox checked={tipo} onCheckedChange={(v) => setTipo(v === true)} />
              Tipo: {tipoAtual ?? "—"} → <strong>{String(c.tipo)}</strong>
            </label>
          )}
          {destDiferente && emColeta && (
            <label className="flex items-center gap-2">
              <Checkbox checked={dest} onCheckedChange={(v) => setDest(v === true)} />
              Destinatário: {destinatarioAtual ?? "—"} → <strong>{String(c.destinatario)}</strong>
              {assinada && <span className="text-destructive text-xs">(cria versão nova; as assinaturas deixam de contar)</span>}
            </label>
          )}
          {!emColeta && (tipoDiferente || destDiferente) && (
            <p className="text-muted-foreground text-xs">
              Sugeriu {tipoDiferente ? `o tipo "${String(c.tipo)}"` : ""}
              {tipoDiferente && destDiferente ? " e " : ""}
              {destDiferente ? `o destinatário "${String(c.destinatario)}"` : ""}, mas a moção já foi protocolada e não muda.
            </p>
          )}
          {c.observacao ? <p className="text-xs">{String(c.observacao)}</p> : null}
          <div className="flex flex-wrap gap-2">
            {emColeta && (tipoDiferente || destDiferente) && (
              <Button
                size="sm"
                disabled={pendente || (!(tipo && tipoDiferente) && !(dest && destDiferente))}
                onClick={() =>
                  iniciar(async () => setMsg(await aceitarTriagemMocaoAction(congressoId, s.id, { tipo: tipo && tipoDiferente, destinatario: dest && destDiferente })))
                }
              >
                <Check />
                Aplicar o marcado
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={pendente} onClick={() => iniciar(async () => setMsg(await recusarSugestaoAction({ congressoId }, null, s.id)))}>
              {tipoDiferente || destDiferente ? "Recusar" : "Ciente"}
            </Button>
          </div>
        </div>
      )}
      <Aviso r={msg} />
    </div>
  )
}

// ── Caderno de teses ────────────────────────────────────────────────────────

export function LerCaderno({ congressoId, eixos }: { congressoId: string; eixos: { id: string; nome: string }[] }) {
  const [estado, acao, lendo] = useActionState<EstadoCaderno, FormData>(lerCadernoAction, {})
  const [itens, setItens] = useState<(ItemCaderno & { eixoId: string; manter: boolean })[] | null>(null)
  const [lidoDe, setLidoDe] = useState<string | null>(null)
  const [origem, setOrigem] = useState<"caderno" | "etapa_anterior" | "documento">("caderno")
  const [descricao, setDescricao] = useState("")
  const [msg, setMsg] = useState<Resp | null>(null)
  const [pendente, iniciar] = useTransition()
  const idPorNome = new Map(eixos.map((e) => [e.nome, e.id]))

  if (estado.sugestaoId && estado.sugestaoId !== lidoDe && estado.itens) {
    setLidoDe(estado.sugestaoId)
    setItens(estado.itens.map((i) => ({ ...i, eixoId: (i.eixo && idPorNome.get(i.eixo)) || "", manter: true })))
    setMsg(null)
  }

  return (
    <div className="grid gap-3">
      <form action={acao} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="congresso_id" value={congressoId} />
        <div className="grid gap-1">
          <Label htmlFor="caderno-arquivo" className="text-xs">
            Caderno de teses (PDF ou texto)
          </Label>
          <Input id="caderno-arquivo" name="arquivo" type="file" accept=".pdf,.txt,.md" className="max-w-80" />
        </div>
        <Button type="submit" variant="outline" disabled={lendo}>
          {lendo ? <Loader2 className="animate-spin" /> : <FileText />}
          Ler com a IA
        </Button>
        {lendo && <span className="text-muted-foreground text-xs">Lendo o documento… pode levar um minuto.</span>}
      </form>
      <Aviso r={estado.erro ? { erro: estado.erro } : null} />
      {itens && (
        <div className="grid gap-2 rounded-lg border p-3">
          <div className="text-sm font-medium">
            {itens.length} proposta(s) encontradas — confira o texto e o eixo antes de gravar. Desmarque o que não é proposta.
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label className="text-xs">Origem</Label>
              <SelectNativo value={origem} onChange={(e) => setOrigem(e.target.value as typeof origem)}>
                <option value="caderno">Caderno de teses</option>
                <option value="etapa_anterior">Etapa anterior</option>
                <option value="documento">Documento externo</option>
              </SelectNativo>
            </div>
            <div className="grid min-w-56 flex-1 gap-1">
              <Label className="text-xs">Descrição da origem</Label>
              <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Caderno de teses do 22º Congrenf" />
            </div>
          </div>
          <ol className="grid max-h-[60vh] gap-2 overflow-y-auto">
            {itens.map((i, k) => (
              <li key={k} className={`grid gap-1 rounded border p-2 ${i.manter ? "" : "opacity-50"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <Checkbox
                    checked={i.manter}
                    aria-label={`Manter o item ${k + 1}`}
                    onCheckedChange={(v) => setItens((xs) => xs!.map((x, j) => (j === k ? { ...x, manter: v === true } : x)))}
                  />
                  <span className="text-muted-foreground text-xs">Item {k + 1}</span>
                  {i.origem && <Badge variant="outline">{i.origem}</Badge>}
                  <SelectNativo
                    value={i.eixoId}
                    aria-label={`Eixo do item ${k + 1}`}
                    className="h-8 w-auto text-xs"
                    onChange={(e) => setItens((xs) => xs!.map((x, j) => (j === k ? { ...x, eixoId: e.target.value } : x)))}
                  >
                    <option value="">Sem eixo</option>
                    {eixos.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nome}
                      </option>
                    ))}
                  </SelectNativo>
                </div>
                <Textarea
                  value={i.texto}
                  rows={2}
                  aria-label={`Texto do item ${k + 1}`}
                  className="text-sm"
                  onChange={(e) => setItens((xs) => xs!.map((x, j) => (j === k ? { ...x, texto: e.target.value } : x)))}
                />
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pendente || !itens.some((i) => i.manter)}
              onClick={() =>
                iniciar(async () => {
                  const r = await gravarCadernoAction(
                    congressoId,
                    estado.sugestaoId!,
                    itens.filter((i) => i.manter).map((i) => ({ texto: i.texto, eixoId: i.eixoId || null })),
                    { origem, origemDescricao: descricao.trim() || null },
                    itens.length
                  )
                  setMsg(r)
                  if (!r.erro) setItens(null)
                })
              }
            >
              {pendente ? <Loader2 className="animate-spin" /> : <Check />}
              Gravar {itens.filter((i) => i.manter).length} proposta(s)
            </Button>
            <Button variant="ghost" onClick={() => setItens(null)}>
              Descartar
            </Button>
          </div>
        </div>
      )}
      <Aviso r={msg} />
    </div>
  )
}

// ── Regimento ───────────────────────────────────────────────────────────────

export function LerRegimento({
  congressoId,
  valoresAtuais,
  exigeDeliberacao,
}: {
  congressoId: string
  /** chave → valor atual já descrito (ex.: "Maioria simples"). */
  valoresAtuais: Record<string, string>
  exigeDeliberacao: boolean
}) {
  const [estado, acao, lendo] = useActionState<EstadoRegimento, FormData>(lerRegimentoAction, {})
  const [marcadas, setMarcadas] = useState<Set<string> | null>(null)
  const [lidoDe, setLidoDe] = useState<string | null>(null)
  const [deliberacao, setDeliberacao] = useState("")
  const [msg, setMsg] = useState<Resp | null>(null)
  const [pendente, iniciar] = useTransition()

  if (estado.sugestaoId && estado.sugestaoId !== lidoDe && estado.ajustes) {
    setLidoDe(estado.sugestaoId)
    setMarcadas(new Set(estado.ajustes.filter((a) => !a.igualAtual).map((a) => a.chave)))
    setMsg(null)
  }
  const ajustes = marcadas ? (estado.ajustes ?? []) : []

  return (
    <div className="grid gap-3">
      <form action={acao} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="congresso_id" value={congressoId} />
        <div className="grid gap-1">
          <Label htmlFor="regimento-arquivo" className="text-xs">
            Regimento (PDF ou texto)
          </Label>
          <Input id="regimento-arquivo" name="arquivo" type="file" accept=".pdf,.txt,.md" className="max-w-80" />
        </div>
        <Button type="submit" variant="outline" disabled={lendo}>
          {lendo ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Ler o regimento com a IA
        </Button>
        {lendo && <span className="text-muted-foreground text-xs">Lendo… pode levar um minuto.</span>}
      </form>
      <Aviso r={estado.erro ? { erro: estado.erro } : null} />
      {marcadas && ajustes.length > 0 && (
        <div className="grid gap-2 rounded-lg border p-3">
          <div className="text-sm font-medium">{ajustes.length} regra(s) lidas do regimento, {ajustes.filter((a) => !a.igualAtual).length} diferente(s) da configuração atual — confira cada uma, com o artigo, antes de aplicar.</div>
          <ul className="grid gap-2">
            {ajustes.map((a) => (
              <li key={a.chave} className="flex items-start gap-2 rounded border p-2 text-sm">
                <Checkbox
                  className="mt-1"
                  checked={marcadas.has(a.chave)}
                  aria-label={`Aplicar ${a.rotulo}`}
                  onCheckedChange={(v) =>
                    setMarcadas((s) => {
                      const n = new Set(s)
                      if (v === true) n.add(a.chave)
                      else n.delete(a.chave)
                      return n
                    })
                  }
                />
                <div className="grid min-w-0 gap-0.5">
                  <div className="font-medium">{a.rotulo}</div>
                  <div className="text-xs">
                    <span className="text-muted-foreground">{valoresAtuais[a.chave] ?? "—"}</span> → <strong>{a.descricao ?? String(a.valor)}</strong>
                    {a.igualAtual && <span className="text-muted-foreground ml-2">(já está assim)</span>}
                    {a.artigo && <Badge variant="outline" className="ml-2">{a.artigo}</Badge>}
                  </div>
                  {a.trecho && <blockquote className="text-muted-foreground border-l-2 pl-2 text-xs italic">{a.trecho}</blockquote>}
                </div>
              </li>
            ))}
          </ul>
          {exigeDeliberacao && (
            <div className="grid gap-1">
              <Label className="text-xs" htmlFor="regimento-deliberacao">
                Deliberação da plenária que autorizou (o regimento já foi aprovado)
              </Label>
              <Input id="regimento-deliberacao" value={deliberacao} onChange={(e) => setDeliberacao(e.target.value)} />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pendente || marcadas.size === 0 || (exigeDeliberacao && !deliberacao.trim())}
              onClick={() =>
                iniciar(async () => {
                  const r = await aplicarRegimentoAction(congressoId, estado.sugestaoId!, [...marcadas], deliberacao)
                  setMsg(r)
                  if (!r.erro) setMarcadas(null)
                })
              }
            >
              <Check />
              Aplicar {marcadas.size} ajuste(s)
            </Button>
            <Button variant="ghost" onClick={() => setMarcadas(null)}>
              Descartar
            </Button>
          </div>
        </div>
      )}
      <Aviso r={msg} />
    </div>
  )
}
