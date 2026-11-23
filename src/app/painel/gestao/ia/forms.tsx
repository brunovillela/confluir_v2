"use client"

import { useActionState, useState } from "react"
import { KeyRound, Loader2, PlugZap, Save, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { CampoSenha } from "@/components/ui/campo-senha"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { SelectNativo } from "@/components/ui/select-nativo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"
import { MODULOS_IA, PROCESSOS_IA } from "@/lib/ia-processos"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

import {
  recifrarChaveAction,
  removerChaveAction,
  salvarChaveAction,
  salvarCotasAction,
  salvarModelosProcessoAction,
  salvarPrincipaisAction,
  salvarPreferenciasAction,
  testarChaveSalvaAction,
} from "./actions"

function Retorno({ estado }: { estado: EstadoForm }) {
  if (estado.ok) {
    return (
      <Alert variant="success">
        <AlertDescription>{estado.ok}</AlertDescription>
      </Alert>
    )
  }
  if (estado.erro && !estado.campo) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{estado.erro}</AlertDescription>
      </Alert>
    )
  }
  return null
}

/** Cadastro (ou troca) da chave. O campo é de senha e nunca volta preenchido. */
export function ChaveForm({ temChave, podeGuardar }: { temChave: boolean; podeGuardar: boolean }) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(salvarChaveAction, {})
  return (
    <form action={action} className="grid gap-3" key={estado.ok ?? "form"}>
      <ErroNoCampo estado={estado} />
      <div className="grid gap-1.5">
        <Label htmlFor="chave">{temChave ? "Trocar pela chave" : "Chave de API da OpenAI"}</Label>
        <CampoSenha
          id="chave"
          name="chave"
          placeholder="sk-…"
          autoComplete="off"
          spellCheck={false}
          className="max-w-md font-mono"
          required
          disabled={!podeGuardar}
        />
        <p className="text-muted-foreground text-xs">
          Testamos a chave antes de guardar. Ela é cifrada no servidor e não aparece de novo — nem para você.
        </p>
      </div>
      <div>
        <Button type="submit" disabled={pendente || !podeGuardar}>
          {pendente ? <Loader2 className="animate-spin" /> : <KeyRound />}
          {temChave ? "Testar e trocar" : "Testar e salvar"}
        </Button>
      </div>
      <Retorno estado={estado} />
    </form>
  )
}

export function TestarChaveBotao() {
  const [estado, action, pendente] = useActionState<EstadoForm>(testarChaveSalvaAction, {})
  return (
    <form action={action} className="grid gap-2">
      <div>
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <PlugZap />}
          Testar agora
        </Button>
      </div>
      <Retorno estado={estado} />
    </form>
  )
}

export function RecifrarChaveBotao() {
  const [estado, action, pendente] = useActionState<EstadoForm>(recifrarChaveAction, {})
  return (
    <form action={action} className="grid gap-2">
      <div>
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <KeyRound />}
          Recifrar com a chave atual
        </Button>
      </div>
      <Retorno estado={estado} />
    </form>
  )
}

export function RemoverChaveBotao({ final }: { final: string | null }) {
  const [estado, action, pendente] = useActionState<EstadoForm>(removerChaveAction, {})
  return (
    <form
      action={action}
      className="grid gap-2"
      onSubmit={(e) =>
        confirmarEnvio(e, `Remover a chave${final ? ` terminada em ${final}` : ""}? A IA volta a usar a conta da plataforma.`)
      }
    >
      <div>
        <Button type="submit" size="sm" variant="ghost" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
          Remover chave
        </Button>
      </div>
      <Retorno estado={estado} />
    </form>
  )
}

export type PreferenciasIniciais = {
  modelo: string | null
  modeloPadrao: string
  iaAtiva: boolean
  modulosDesligados: string[]
  limiteMensalUsd: number | null
  bloquearNoLimite: boolean
  precoEntrada: number | null
  precoEntradaCache: number | null
  precoSaida: number | null
  cotacaoUsdBrl: number | null
}

function br(n: number | null): string {
  return n === null ? "" : String(n).replace(".", ",")
}

export function PreferenciasForm({ inicial }: { inicial: PreferenciasIniciais }) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(salvarPreferenciasAction, {})
  return (
    <form action={action} className="grid gap-5">
      <ErroNoCampo estado={estado} />

      <label htmlFor="ia_ativa" className="flex items-start gap-2 text-sm">
        <input id="ia_ativa" type="checkbox" name="ia_ativa" defaultChecked={inicial.iaAtiva} className="mt-0.5" />
        <span>
          <span className="font-medium">IA ligada na entidade</span>
          <span className="text-muted-foreground block text-xs">
            Desmarcado, nenhuma tela chama a IA: os botões avisam que ela está desligada.
          </span>
        </span>
      </label>

      <fieldset className="grid gap-1.5">
        <legend className="mb-1 text-sm font-medium">Módulos com IA</legend>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {MODULOS_IA.filter((m) => m.slug !== "outros").map((m) => (
            <label key={m.slug} htmlFor={`modulo-${m.slug}`} className="flex items-center gap-2 text-sm">
              <input
                id={`modulo-${m.slug}`}
                type="checkbox"
                name="modulos"
                value={m.slug}
                defaultChecked={!inicial.modulosDesligados.includes(m.slug)}
              />
              {m.titulo}
            </label>
          ))}
          {/* "Outros" (processos fora do catálogo e o teste da chave) fica sempre ligado. */}
          <input type="hidden" name="modulos" value="outros" />
        </div>
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="modelo">Modelo geral</Label>
        <Input
          id="modelo"
          name="modelo"
          defaultValue={inicial.modelo ?? ""}
          placeholder={`${inicial.modeloPadrao} (padrão da plataforma)`}
          className="max-w-xs font-mono"
          maxLength={64}
        />
        <p className="text-muted-foreground text-xs">
          Em branco, vale o padrão. Um modelo menor (ex.: gpt-5.4-mini) custa menos; a chave precisa ter acesso a ele. Para trocar só em alguns processos, use o Modelo por processo, abaixo.
        </p>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Preços do modelo geral (US$ por 1 milhão de tokens)</legend>
        <p className="text-muted-foreground text-xs">
          Copie da página de preços da OpenAI. Servem para estimar o custo no relatório e no teto; sem eles, o relatório mostra só os tokens.
        </p>
        <div className="flex flex-wrap gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="preco_entrada">Entrada</Label>
            <Input id="preco_entrada" name="preco_entrada" inputMode="decimal" defaultValue={br(inicial.precoEntrada)} className="w-32" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="preco_entrada_cache">Entrada em cache</Label>
            <Input id="preco_entrada_cache" name="preco_entrada_cache" inputMode="decimal" defaultValue={br(inicial.precoEntradaCache)} className="w-32" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="preco_saida">Saída</Label>
            <Input id="preco_saida" name="preco_saida" inputMode="decimal" defaultValue={br(inicial.precoSaida)} className="w-32" />
          </div>
        </div>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Teto mensal</legend>
        <div className="grid gap-1.5">
          <Label htmlFor="limite_mensal_usd">Custo estimado por mês (US$)</Label>
          <Input
            id="limite_mensal_usd"
            name="limite_mensal_usd"
            inputMode="decimal"
            defaultValue={br(inicial.limiteMensalUsd)}
            placeholder="sem teto"
            className="w-40"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cotacao_usd_brl">Cotação do dólar (R$ por US$ 1)</Label>
          <Input
            id="cotacao_usd_brl"
            name="cotacao_usd_brl"
            inputMode="decimal"
            defaultValue={br(inicial.cotacaoUsdBrl)}
            placeholder="só dólar"
            className="w-40"
          />
          <p className="text-muted-foreground text-xs">
            Com a cotação, o custo, o teto e as cotas aparecem também em reais (aqui, nos avisos e na planilha). Atualize quando quiser; o teto continua em dólar.
          </p>
        </div>
        <label htmlFor="bloquear_no_limite" className="flex items-start gap-2 text-sm">
          <input id="bloquear_no_limite" type="checkbox" name="bloquear_no_limite" defaultChecked={inicial.bloquearNoLimite} className="mt-0.5" />
          <span>
            Parar a IA ao atingir o teto
            <span className="text-muted-foreground block text-xs">
              Desmarcado, o teto só aparece como alerta aqui e no painel da Gestão.
            </span>
          </span>
        </label>
      </fieldset>

      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar configuração
        </Button>
      </div>
      <Retorno estado={estado} />
    </form>
  )
}

export type UsoProcesso = { chamadas: number; tokens: number; custo: number | null }

export type ModelosProcessoIniciais = {
  modeloGeral: string
  modelos: Record<string, string>
  precos: Record<string, { entrada: number | null; cache: number | null; saida: number | null }>
  sugestoes: string[]
  /** Uso dos últimos 30 dias por processo, para escolher onde vale trocar. */
  uso: Record<string, UsoProcesso>
  temTeto: boolean
}

const fmtInteiro = new Intl.NumberFormat("pt-BR")

function resumoUso(u: UsoProcesso | undefined): string {
  if (!u || u.chamadas === 0) return "sem uso em 30 dias"
  const custo = u.custo === null ? "" : ` · US$ ${u.custo.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `${fmtInteiro.format(u.chamadas)} ${u.chamadas === 1 ? "chamada" : "chamadas"} · ${fmtInteiro.format(u.tokens)} tokens${custo} em 30 dias`
}

/**
 * Modelo por processo: em branco, o processo usa o modelo geral. Os campos são
 * controlados (os preços aparecem para cada modelo escolhido), por isso o
 * formulário não reinicia depois de salvar (`manter`).
 */
export function ModelosProcessoForm({ inicial }: { inicial: ModelosProcessoIniciais }) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(salvarModelosProcessoAction, {})
  const envio = useEnvioFormulario(action, estado, { manter: true })
  const [modelos, setModelos] = useState<Record<string, string>>(inicial.modelos)
  // O salvo pode mudar por fora (botão "Usar" da sugestão de troca): o estado local
  // acompanha, para que salvar este formulário não desfaça a troca.
  const salvo = JSON.stringify(inicial.modelos)
  const [salvoAnterior, setSalvoAnterior] = useState(salvo)
  if (salvo !== salvoAnterior) {
    setSalvoAnterior(salvo)
    setModelos(inicial.modelos)
  }
  const usados = [...new Set(Object.values(modelos).map((m) => m.trim()).filter((m) => m && m !== inicial.modeloGeral))].sort()
  const modulos = MODULOS_IA.map((mod) => ({
    ...mod,
    processos: PROCESSOS_IA.filter((p) => p.modulo === mod.slug),
  })).filter((m) => m.processos.length > 0)

  return (
    <form action={action} {...envio} className="grid gap-5">
      <ErroNoCampo estado={estado} />
      <datalist id="modelos-ia">
        {inicial.sugestoes.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      <div className="grid gap-2">
        {modulos.map((mod) => {
          const trocados = mod.processos.filter((p) => (modelos[p.chave] ?? "").trim()).length
          // Abre pelo que está salvo: apagar o campo não fecha o grupo na mão de quem edita.
          const salvos = mod.processos.filter((p) => inicial.modelos[p.chave]).length
          return (
            <details key={mod.slug} className="rounded-lg border px-3 py-2" open={salvos > 0 || undefined}>
              <summary className="cursor-pointer text-sm font-medium">
                {mod.titulo}
                <span className="text-muted-foreground ml-2 text-xs font-normal">
                  {trocados ? `${trocados} com modelo próprio` : "todos no modelo geral"}
                </span>
              </summary>
              <ul className="mt-2 divide-y">
                {mod.processos.map((p) => (
                  <li key={p.chave} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <label htmlFor={`modelo-${p.chave}`} className="text-sm">
                        {p.titulo}
                      </label>
                      <p className="text-muted-foreground text-xs">{resumoUso(inicial.uso[p.chave])}</p>
                    </div>
                    <Input
                      id={`modelo-${p.chave}`}
                      name={`modelo:${p.chave}`}
                      list="modelos-ia"
                      value={modelos[p.chave] ?? ""}
                      onChange={(e) => setModelos((atual) => ({ ...atual, [p.chave]: e.target.value }))}
                      placeholder={`geral (${inicial.modeloGeral})`}
                      className="w-56 font-mono text-xs"
                      maxLength={64}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </li>
                ))}
              </ul>
            </details>
          )
        })}
      </div>

      {usados.length > 0 && (
        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-medium">Preços dos outros modelos (US$ por 1 milhão de tokens)</legend>
          <p className="text-muted-foreground text-xs">
            Para estimar o custo das chamadas desses modelos.
            {inicial.temTeto ? " Sem preço, elas não contam no teto mensal." : ""}
          </p>
          {usados.map((m) => {
            const p = inicial.precos[m]
            return (
              <div key={m} className="flex flex-wrap items-end gap-3">
                <span className="w-44 pb-2 font-mono text-xs">{m}</span>
                {(["entrada", "cache", "saida"] as const).map((campo) => (
                  <div key={campo} className="grid gap-1.5">
                    <Label htmlFor={`preco-${m}-${campo}`} className="text-xs">
                      {campo === "entrada" ? "Entrada" : campo === "cache" ? "Entrada em cache" : "Saída"}
                    </Label>
                    <Input
                      id={`preco-${m}-${campo}`}
                      name={`preco:${m}:${campo}`}
                      inputMode="decimal"
                      defaultValue={br(p?.[campo] ?? null)}
                      className="w-28"
                    />
                  </div>
                ))}
              </div>
            )
          })}
        </fieldset>
      )}

      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar modelos
        </Button>
      </div>
      <Retorno estado={estado} />
    </form>
  )
}

export type CotaLinha = { id: string; nome: string; cota: number | null; gasto: number }

function usdBR(n: number): string {
  return `US$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Cota mensal por departamento; em branco = sem cota própria (vale só o teto geral). */
export function CotasForm({ linhas, bloqueia, cotacao }: { linhas: CotaLinha[]; bloqueia: boolean; cotacao: number | null }) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(salvarCotasAction, {})
  const envio = useEnvioFormulario(action, estado, { manter: true })
  return (
    <form action={action} {...envio} className="grid gap-4">
      <ErroNoCampo estado={estado} />
      <ul className="divide-y">
        {linhas.map((l) => {
          const fracao = l.cota ? l.gasto / l.cota : null
          return (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <label htmlFor={`cota-${l.id}`} className="text-sm">
                  {l.nome}
                </label>
                <p className={`text-xs ${fracao !== null && fracao >= 0.8 ? "text-warning-fg" : "text-muted-foreground"}`}>
                  {usdBR(l.gasto)}
                  {cotacao ? ` (R$ ${(l.gasto * cotacao).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : ""} neste mês
                  {l.cota ? ` · ${Math.round((fracao ?? 0) * 100)}% da cota${cotacao ? ` de R$ ${(l.cota * cotacao).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ""}` : ""}
                </p>
              </div>
              <Input
                id={`cota-${l.id}`}
                name={`cota:${l.id}`}
                inputMode="decimal"
                defaultValue={br(l.cota)}
                placeholder="sem cota"
                className="w-32"
              />
            </li>
          )
        })}
      </ul>
      <p className="text-muted-foreground text-xs">
        {bloqueia
          ? "Com \"Parar a IA ao atingir o teto\" marcado na Configuração, o departamento que atinge a cota fica sem IA até o dia 1º."
          : "Como \"Parar a IA ao atingir o teto\" está desmarcado na Configuração, a cota só avisa."}{" "}
        A Gestão e o coordenador são avisados a 80% e a 100%. Conta pelo departamento de quem pediu (o que coordena; senão, o primeiro de que faz parte).
      </p>
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar cotas
        </Button>
      </div>
      <Retorno estado={estado} />
    </form>
  )
}

export type PessoaPrincipal = { usuarioId: string; nome: string; departamentos: { id: string; nome: string }[]; principalId: string | null }

/** Quem está em mais de um departamento: por qual deles conta (IA e revisão de acessos). */
export function PrincipaisForm({ pessoas }: { pessoas: PessoaPrincipal[] }) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(salvarPrincipaisAction, {})
  const envio = useEnvioFormulario(action, estado, { manter: true })
  return (
    <form action={action} {...envio} className="grid gap-3">
      <ul className="divide-y">
        {pessoas.map((p) => (
          <li key={p.usuarioId} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <label htmlFor={`principal-${p.usuarioId}`} className="text-sm">
              {p.nome}
            </label>
            <SelectNativo id={`principal-${p.usuarioId}`} name={`principal:${p.usuarioId}`} defaultValue={p.principalId ?? ""} className="w-60">
              <option value="">Automático (o que coordena; senão, o primeiro)</option>
              {p.departamentos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </SelectNativo>
          </li>
        ))}
      </ul>
      <div>
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar departamentos principais
        </Button>
      </div>
      <Retorno estado={estado} />
    </form>
  )
}
