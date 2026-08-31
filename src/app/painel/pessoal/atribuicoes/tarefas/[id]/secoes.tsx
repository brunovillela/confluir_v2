"use client"

import { useState } from "react"
import { useActionState } from "react"
import { CheckCircle2, Loader2, Sparkles, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  CATEGORIAS_RISCO,
  COR_CATEGORIA,
  FREQUENCIAS,
  PROBABILIDADES,
  RECORRENCIAS,
  ROTULO_CATEGORIA,
  ROTULO_FREQUENCIA,
  ROTULO_RECORRENCIA,
  ROTULO_TIPO_FERRAMENTA,
  SEVERIDADES,
  TIPOS_FERRAMENTA,
  formatarTempoMes,
  nivelRisco,
  sugerirRecorrencia,
} from "@/lib/pessoal-sst-constantes"

import {
  adicionarFerramenta,
  adicionarMedida,
  adicionarPerigo,
  adicionarRisco,
  analisarTarefaComIA,
  excluirExecutor,
  excluirFerramenta,
  excluirMedida,
  excluirPerigo,
  excluirRisco,
  marcarTarefaAvaliada,
  revalidarExecutor,
  salvarExecutor,
} from "../../actions"

const SELECT_CLS =
  "border-input bg-background h-9 rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Estado = { erro?: string; ok?: string }
type ActionForm = (p: Estado, fd: FormData) => Promise<Estado>

function BotaoExcluir({
  action,
  hidden,
}: {
  action: ActionForm
  hidden: Record<string, string>
}) {
  const [, act, pend] = useActionState(action, {})
  return (
    <form action={act}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pend}
        className="text-destructive hover:text-destructive h-7 px-2"
      >
        {pend ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <X className="size-3.5" />
        )}
      </Button>
    </form>
  )
}

function Badge({ cor, children }: { cor: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
      style={{ backgroundColor: cor }}
    >
      {children}
    </span>
  )
}

// ── Executores (tempo, recorrência e frequência por funcionário) ─────────────

type Executor = {
  id: string
  funcionarioId: string | null
  fornecedorId: string | null
  prestador: boolean
  nome: string | null
  tempo_min_mes: number | null
  recorrencia: string | null
  frequencia: string | null
  avaliado_em: string | null
  jornadaMinMes: number
}

function pctJornada(e: Executor): number | null {
  if (!e.jornadaMinMes || !e.tempo_min_mes) return null
  return Math.round((e.tempo_min_mes / e.jornadaMinMes) * 100)
}

export function SecaoExecutores({
  atividadeId,
  executores,
  opcoes,
  fornecedores,
  limiar,
}: {
  atividadeId: string
  executores: Executor[]
  opcoes: { usuarioId: string; nome: string | null }[]
  fornecedores: { id: string; nome: string }[]
  limiar: string
}) {
  const [estado, action, pend] = useActionState(salvarExecutor, {})
  const [frequencia, setFrequencia] = useState("")
  const [recorrencia, setRecorrencia] = useState("")
  const [recTocada, setRecTocada] = useState(false)
  const sugestao = sugerirRecorrencia(frequencia || null, limiar)
  const totalMin = executores.reduce((s, e) => s + (e.tempo_min_mes ?? 0), 0)

  return (
    <div className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {executores.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Ninguém executa esta tarefa ainda — vincule funcionários ou
          prestadores de serviço.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {executores.map((e) => {
            const pct = pctJornada(e)
            return (
              <li key={e.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="flex-1 text-sm">
                  {e.nome ?? "(sem nome)"}
                  {e.prestador && (
                    <span className="bg-muted text-muted-foreground ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium">
                      prestador
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground text-xs">
                  {e.recorrencia ? ROTULO_RECORRENCIA[e.recorrencia] : "recorrência —"}
                  {e.frequencia ? ` · ${ROTULO_FREQUENCIA[e.frequencia]}` : ""}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {formatarTempoMes(e.tempo_min_mes)}/mês
                  {pct !== null && ` · ${pct}% da jornada`}
                </span>
                <BotaoRevalidar
                  id={e.id}
                  atividadeId={atividadeId}
                  avaliadoEm={e.avaliado_em}
                />
                <BotaoExcluir
                  action={excluirExecutor}
                  hidden={{ id: e.id, atividade_id: atividadeId }}
                />
              </li>
            )
          })}
        </ul>
      )}
      {totalMin > 0 && (
        <p className="text-muted-foreground text-xs">
          Tempo somado: {formatarTempoMes(totalMin)}/mês entre os executores.
        </p>
      )}

      <form action={action} className="grid gap-2 rounded-lg border p-3">
        <input type="hidden" name="atividade_id" value={atividadeId} />
        <div className="flex flex-wrap items-end gap-2">
          <select name="executor" required defaultValue="" className={`${SELECT_CLS} flex-1`}>
            <option value="" disabled>
              Funcionário ou prestador…
            </option>
            <optgroup label="Funcionários">
              {opcoes.map((o) => (
                <option key={o.usuarioId} value={`f:${o.usuarioId}`}>
                  {o.nome ?? "(sem nome)"}
                </option>
              ))}
            </optgroup>
            {fornecedores.length > 0 && (
              <optgroup label="Prestadores de serviço (fornecedores)">
                {fornecedores.map((f) => (
                  <option key={f.id} value={`p:${f.id}`}>
                    {f.nome}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <Input
            name="tempo_horas_mes"
            inputMode="decimal"
            placeholder="Horas/mês"
            className="w-28"
          />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid flex-1 gap-1">
            <span className="text-muted-foreground text-xs">Frequência</span>
            <select
              name="frequencia"
              value={frequencia}
              onChange={(ev) => {
                const v = ev.target.value
                setFrequencia(v)
                if (!recTocada) {
                  setRecorrencia(sugerirRecorrencia(v || null, limiar) ?? "")
                }
              }}
              className={SELECT_CLS}
            >
              <option value="">— não definida —</option>
              {FREQUENCIAS.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="grid flex-1 gap-1">
            <span className="text-muted-foreground text-xs">Recorrência</span>
            <select
              name="recorrencia"
              value={recorrencia}
              onChange={(ev) => {
                setRecorrencia(ev.target.value)
                setRecTocada(true)
              }}
              className={SELECT_CLS}
            >
              <option value="">— não definida —</option>
              {RECORRENCIAS.map((r) => (
                <option key={r.valor} value={r.valor}>
                  {r.rotulo}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="secondary" disabled={pend}>
            {pend && <Loader2 className="animate-spin" />}
            Salvar
          </Button>
        </div>
        {sugestao && (
          <p className="text-muted-foreground text-xs">
            Sugestão pela frequência:{" "}
            <strong>{ROTULO_RECORRENCIA[sugestao]}</strong>.
          </p>
        )}
      </form>
      <p className="text-muted-foreground text-xs">
        Re-selecionar o mesmo funcionário atualiza os dados dele. Tempo,
        recorrência e frequência são POR EXECUTOR — cada um pode ter carga e
        cadência diferentes na mesma tarefa.
      </p>
    </div>
  )
}

function BotaoRevalidar({
  id,
  atividadeId,
  avaliadoEm,
}: {
  id: string
  atividadeId: string
  avaliadoEm: string | null
}) {
  const [, act, pend] = useActionState(revalidarExecutor, {})
  return (
    <form action={act}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="atividade_id" value={atividadeId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pend}
        className="h-7 px-2 text-xs"
        title={avaliadoEm ? `Última: ${avaliadoEm}` : "Nunca revalidada"}
      >
        {pend ? <Loader2 className="size-3.5 animate-spin" /> : "Revalidar"}
      </Button>
    </form>
  )
}

// ── Ferramentas ──────────────────────────────────────────────────────────────

export function SecaoFerramentas({
  atividadeId,
  ferramentas,
}: {
  atividadeId: string
  ferramentas: { id: string; nome: string; tipo: string | null }[]
}) {
  const [estado, action, pend] = useActionState(adicionarFerramenta, {})
  return (
    <div className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {ferramentas.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {ferramentas.map((f) => (
            <li key={f.id} className="flex items-center gap-2 px-3 py-2">
              <span className="flex-1 text-sm">
                {f.nome}
                {f.tipo && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {ROTULO_TIPO_FERRAMENTA[f.tipo] ?? f.tipo}
                  </span>
                )}
              </span>
              <BotaoExcluir
                action={excluirFerramenta}
                hidden={{ id: f.id, atividade_id: atividadeId }}
              />
            </li>
          ))}
        </ul>
      )}
      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="atividade_id" value={atividadeId} />
        <Input name="nome" placeholder="Ferramenta/equipamento" required className="flex-1" />
        <select name="tipo" defaultValue="" className={SELECT_CLS}>
          <option value="">Tipo…</option>
          {TIPOS_FERRAMENTA.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.rotulo}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" disabled={pend}>
          {pend && <Loader2 className="animate-spin" />}
          Adicionar
        </Button>
      </form>
    </div>
  )
}

// ── Perigos ──────────────────────────────────────────────────────────────────

type Perigo = {
  id: string
  descricao: string
  fonte: string | null
  severidade: number | null
  norma: string | null
}

export function SecaoPerigos({
  atividadeId,
  perigos,
}: {
  atividadeId: string
  perigos: Perigo[]
}) {
  const [estado, action, pend] = useActionState(adicionarPerigo, {})
  return (
    <div className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {perigos.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {perigos.map((p) => (
            <li key={p.id} className="flex items-start gap-2 px-3 py-2">
              <span className="flex-1 text-sm">
                {p.descricao}
                <span className="text-muted-foreground text-xs">
                  {p.fonte ? ` · fonte: ${p.fonte}` : ""}
                  {p.norma ? ` · ${p.norma}` : ""}
                  {p.severidade ? ` · severidade ${p.severidade}` : ""}
                </span>
              </span>
              <BotaoExcluir
                action={excluirPerigo}
                hidden={{ id: p.id, atividade_id: atividadeId }}
              />
            </li>
          ))}
        </ul>
      )}
      <form action={action} className="grid gap-2">
        <input type="hidden" name="atividade_id" value={atividadeId} />
        <Input name="descricao" placeholder="Perigo (ex.: contato com parte móvel)" required />
        <div className="flex flex-wrap items-end gap-2">
          <Input name="fonte" placeholder="Fonte/agente" className="flex-1" />
          <Input name="norma" placeholder="NR (ex.: NR-12)" className="w-32" />
          <select name="severidade" defaultValue="" className={SELECT_CLS}>
            <option value="">Severidade…</option>
            {SEVERIDADES.map((s) => (
              <option key={s.valor} value={s.valor}>
                {s.rotulo}
              </option>
            ))}
          </select>
          <Button type="submit" variant="secondary" disabled={pend}>
            {pend && <Loader2 className="animate-spin" />}
            Adicionar
          </Button>
        </div>
      </form>
    </div>
  )
}

// ── Riscos (por EXECUTOR: a probabilidade depende da exposição da pessoa) ────

type Risco = {
  id: string
  executor_id: string | null
  perigo_id: string | null
  categoria: string | null
  probabilidade: number | null
  severidade: number | null
  probabilidade_residual: number | null
  severidade_residual: number | null
  observacao: string | null
}

function LinhaRisco({
  r,
  atividadeId,
  perigos,
}: {
  r: Risco
  atividadeId: string
  perigos: Perigo[]
}) {
  const nv = nivelRisco(r.probabilidade, r.severidade)
  const nvR = nivelRisco(r.probabilidade_residual, r.severidade_residual)
  const perigo = r.perigo_id ? perigos.find((p) => p.id === r.perigo_id) : null
  return (
    <li className="flex items-start gap-2 px-3 py-2">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {r.categoria && (
          <Badge cor={COR_CATEGORIA[r.categoria] ?? "#64748b"}>
            {ROTULO_CATEGORIA[r.categoria] ?? r.categoria}
          </Badge>
        )}
        {nv && <Badge cor={nv.cor}>Risco: {nv.rotulo} ({nv.valor})</Badge>}
        {nvR && (
          <Badge cor={nvR.cor}>
            Residual: {nvR.rotulo} ({nvR.valor})
          </Badge>
        )}
        {perigo && (
          <span className="text-muted-foreground text-xs">
            perigo: {perigo.descricao.slice(0, 40)}
          </span>
        )}
        {r.observacao && (
          <span className="text-muted-foreground text-xs">{r.observacao}</span>
        )}
      </div>
      <BotaoExcluir
        action={excluirRisco}
        hidden={{ id: r.id, atividade_id: atividadeId }}
      />
    </li>
  )
}

export function SecaoRiscos({
  atividadeId,
  riscos,
  perigos,
  executores,
}: {
  atividadeId: string
  riscos: Risco[]
  perigos: Perigo[]
  executores: Executor[]
}) {
  const [estado, action, pend] = useActionState(adicionarRisco, {})
  const semExecutor = riscos.filter((r) => !r.executor_id)

  return (
    <div className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      {executores.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Adicione executores primeiro — o risco (probabilidade × severidade,
          bruto e residual) é avaliado por pessoa, conforme a exposição de cada
          uma.
        </p>
      )}

      {executores.map((e) => {
        const doExecutor = riscos.filter((r) => r.executor_id === e.id)
        const pct = pctJornada(e)
        return (
          <div key={e.id} className="rounded-lg border">
            <div className="bg-muted/50 flex flex-wrap items-center gap-2 rounded-t-lg px-3 py-2">
              <span className="text-sm font-medium">
                {e.nome ?? "(sem nome)"}
              </span>
              {e.prestador && (
                <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium">
                  prestador
                </span>
              )}
              <span className="text-muted-foreground text-xs">
                exposição: {formatarTempoMes(e.tempo_min_mes)}/mês
                {pct !== null && ` (${pct}% da jornada)`}
                {e.recorrencia
                  ? ` · ${ROTULO_RECORRENCIA[e.recorrencia]}`
                  : ""}
              </span>
            </div>
            {doExecutor.length === 0 ? (
              <p className="text-muted-foreground px-3 py-2 text-sm">
                Nenhum risco avaliado para esta pessoa.
              </p>
            ) : (
              <ul className="divide-y">
                {doExecutor.map((r) => (
                  <LinhaRisco
                    key={r.id}
                    r={r}
                    atividadeId={atividadeId}
                    perigos={perigos}
                  />
                ))}
              </ul>
            )}
          </div>
        )
      })}

      {semExecutor.length > 0 && (
        <div className="border-warning/40 rounded-lg border">
          <p className="text-warning-fg px-3 py-2 text-xs font-medium">
            Avaliações antigas sem executor (feitas quando o risco era da
            tarefa) — reavalie por pessoa e exclua estas:
          </p>
          <ul className="divide-y">
            {semExecutor.map((r) => (
              <LinhaRisco
                key={r.id}
                r={r}
                atividadeId={atividadeId}
                perigos={perigos}
              />
            ))}
          </ul>
        </div>
      )}

      {executores.length > 0 && (
        <form action={action} className="grid gap-2 rounded-lg border p-3">
          <input type="hidden" name="atividade_id" value={atividadeId} />
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid flex-1 gap-1">
              <span className="text-muted-foreground text-xs">Executor *</span>
              <select name="executor_id" required defaultValue="" className={SELECT_CLS}>
                <option value="" disabled>
                  Executor…
                </option>
                {executores.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome ?? "(sem nome)"}
                    {e.prestador ? " (prestador)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1">
              <span className="text-muted-foreground text-xs">Categoria *</span>
              <select name="categoria" required defaultValue="" className={SELECT_CLS}>
                <option value="" disabled>
                  Categoria…
                </option>
                {CATEGORIAS_RISCO.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.rotulo}
                  </option>
                ))}
              </select>
            </div>
            {perigos.length > 0 && (
              <div className="grid gap-1">
                <span className="text-muted-foreground text-xs">Perigo</span>
                <select name="perigo_id" defaultValue="" className={SELECT_CLS}>
                  <option value="">— nenhum —</option>
                  {perigos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.descricao.slice(0, 40)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <fieldset className="rounded-md border p-2">
              <legend className="text-muted-foreground px-1 text-xs">
                Risco bruto
              </legend>
              <div className="flex gap-2">
                <select name="probabilidade" defaultValue="" className={`${SELECT_CLS} flex-1`}>
                  <option value="">Probabilidade…</option>
                  {PROBABILIDADES.map((p) => (
                    <option key={p.valor} value={p.valor}>
                      {p.rotulo}
                    </option>
                  ))}
                </select>
                <select name="severidade" defaultValue="" className={`${SELECT_CLS} flex-1`}>
                  <option value="">Severidade…</option>
                  {SEVERIDADES.map((s) => (
                    <option key={s.valor} value={s.valor}>
                      {s.rotulo}
                    </option>
                  ))}
                </select>
              </div>
            </fieldset>
            <fieldset className="rounded-md border p-2">
              <legend className="text-muted-foreground px-1 text-xs">
                Risco residual (após treinamento + EPI)
              </legend>
              <div className="flex gap-2">
                <select name="probabilidade_residual" defaultValue="" className={`${SELECT_CLS} flex-1`}>
                  <option value="">Probabilidade…</option>
                  {PROBABILIDADES.map((p) => (
                    <option key={p.valor} value={p.valor}>
                      {p.rotulo}
                    </option>
                  ))}
                </select>
                <select name="severidade_residual" defaultValue="" className={`${SELECT_CLS} flex-1`}>
                  <option value="">Severidade…</option>
                  {SEVERIDADES.map((s) => (
                    <option key={s.valor} value={s.valor}>
                      {s.rotulo}
                    </option>
                  ))}
                </select>
              </div>
            </fieldset>
          </div>
          <div className="flex items-end gap-2">
            <Input name="observacao" placeholder="Observação (opcional)" className="flex-1" />
            <Button type="submit" variant="secondary" disabled={pend}>
              {pend && <Loader2 className="animate-spin" />}
              Adicionar risco
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Quem passa mais tempo na tarefa tem mais probabilidade de sofrer com
            os perigos dela — use a exposição mostrada em cada executor para
            calibrar a probabilidade.
          </p>
        </form>
      )}
    </div>
  )
}

// ── Medidas (treinamento/EPI) ────────────────────────────────────────────────

type Medida = {
  id: string
  tipo: string
  descricao: string
  treinamento_id: string | null
  recorrencia_meses: number | null
  epi_ca: string | null
}

export function SecaoMedidas({
  atividadeId,
  medidas,
  treinamentos,
}: {
  atividadeId: string
  medidas: Medida[]
  treinamentos: { id: string; nome: string | null }[]
}) {
  const [estado, action, pend] = useActionState(adicionarMedida, {})
  const treinos = medidas.filter((m) => m.tipo === "treinamento")
  const epis = medidas.filter((m) => m.tipo === "epi")

  return (
    <div className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium">Treinamentos necessários</p>
          {treinos.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {treinos.map((m) => (
                <li key={m.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="flex-1 text-sm">
                    {m.descricao}
                    {m.recorrencia_meses && (
                      <span className="text-muted-foreground text-xs">
                        {" "}
                        · a cada {m.recorrencia_meses} meses
                      </span>
                    )}
                    {m.treinamento_id && (
                      <span className="text-muted-foreground text-xs">
                        {" "}
                        · no catálogo
                      </span>
                    )}
                  </span>
                  <BotaoExcluir
                    action={excluirMedida}
                    hidden={{ id: m.id, atividade_id: atividadeId }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-1 text-xs font-medium">EPIs</p>
          {epis.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {epis.map((m) => (
                <li key={m.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="flex-1 text-sm">
                    {m.descricao}
                    {m.epi_ca && (
                      <span className="text-muted-foreground text-xs">
                        {" "}
                        · CA {m.epi_ca}
                      </span>
                    )}
                  </span>
                  <BotaoExcluir
                    action={excluirMedida}
                    hidden={{ id: m.id, atividade_id: atividadeId }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <form action={action} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
        <input type="hidden" name="atividade_id" value={atividadeId} />
        <div className="grid gap-1 sm:col-span-2">
          <div className="flex flex-wrap items-end gap-2">
            <select name="tipo" required defaultValue="treinamento" className={SELECT_CLS}>
              <option value="treinamento">Treinamento</option>
              <option value="epi">EPI</option>
            </select>
            <Input name="descricao" placeholder="Descrição da medida" required className="flex-1" />
          </div>
        </div>
        <div className="flex items-end gap-2">
          <select name="treinamento_id" defaultValue="" className={`${SELECT_CLS} flex-1`}>
            <option value="">Vincular ao catálogo (treinamento)…</option>
            {treinamentos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome ?? "(sem nome)"}
              </option>
            ))}
          </select>
          <Input
            name="recorrencia_meses"
            inputMode="numeric"
            placeholder="Recorr. (meses)"
            className="w-32"
          />
        </div>
        <div className="flex items-end gap-2">
          <Input name="epi_ca" placeholder="CA do EPI (se EPI)" className="flex-1" />
          <Button type="submit" variant="secondary" disabled={pend}>
            {pend && <Loader2 className="animate-spin" />}
            Adicionar
          </Button>
        </div>
      </form>
      <p className="text-muted-foreground text-xs">
        Vincule o treinamento ao catálogo para ele entrar na matriz de
        treinamento por funcionário.
      </p>
    </div>
  )
}

// ── IA e avaliação da tarefa ─────────────────────────────────────────────────

export function BotaoAnalisarIA({ atividadeId }: { atividadeId: string }) {
  const [estado, action, pend] = useActionState(analisarTarefaComIA, {})
  return (
    <div className="grid gap-2">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <form action={action}>
        <input type="hidden" name="atividade_id" value={atividadeId} />
        <Button type="submit" variant="outline" disabled={pend}>
          {pend ? <Loader2 className="animate-spin" /> : <Sparkles className="size-4" />}
          Analisar riscos com IA
        </Button>
      </form>
    </div>
  )
}

export function BotaoAvaliarTarefa({
  atividadeId,
  avaliadaEm,
}: {
  atividadeId: string
  avaliadaEm: string | null
}) {
  const [estado, action, pend] = useActionState(marcarTarefaAvaliada, {})
  return (
    <div className="grid gap-2">
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <form action={action} className="flex items-center gap-2">
        <input type="hidden" name="id" value={atividadeId} />
        <Button type="submit" variant="secondary" size="sm" disabled={pend}>
          {pend ? (
            <Loader2 className="animate-spin" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          Registrar avaliação nesta data
        </Button>
        <span className="text-muted-foreground text-xs">
          {avaliadaEm ? `Última avaliação: ${avaliadaEm}` : "Nunca avaliada"}
        </span>
      </form>
    </div>
  )
}
