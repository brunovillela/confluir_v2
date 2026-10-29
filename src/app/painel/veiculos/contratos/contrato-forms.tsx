"use client"

import { useActionState, useRef, useState } from "react"
import {
  ArrowLeftRight,
  Barcode,
  CalendarPlus,
  FileCheck2,
  FileText,
  Link2,
  Loader2,
  Paperclip,
  Pencil,
  Receipt,
  RotateCcw,
  ScrollText,
  Sparkles,
  Unlink,
} from "lucide-react"

import {
  EmpresaCombobox as FornecedorCombobox,
  type EmpresaOpcao as FornecedorOpcao,
} from "@/components/empresa-combobox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ACEITA_NOTA, prepararArquivo } from "@/lib/arquivo-envio"

import {
  criarContratoAction,
  editarContratoAction,
  finalizarContratoAction,
  gerarOrdemAluguelAction,
  prorrogarContratoAction,
  trocarCondutorAction,
  anexarDocumentosOrdemAluguelAction,
  desvincularVeiculoAction,
  reabrirContratoAction,
  vincularVeiculoAction,
} from "./actions"
import { lerFaturaLocacao, type LeituraFaturaLocacao } from "./ia-actions"
import { CATEGORIAS_LOCACAO, type CategoriaLocacao } from "@/lib/locacao-periodo"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type Opcao = { id: string; rotulo: string }

const USOS = [
  { valor: "dedicado", rotulo: "Dedicado", ajuda: "Fica com um condutor. Não é oferecido a quem pede carro na recepção." },
  { valor: "coletivo", rotulo: "Coletivo", ajuda: "Sem condutor fixo. Entra na escala, em lista própria na página de Veículos." },
] as const

/** Opções dos selects do contrato (novo e edição). */
export type OpcoesContrato = {
  fornecedores: FornecedorOpcao[]
  usuarios: Opcao[]
  departamentos: Opcao[]
  centrosCusto: Opcao[]
  /** Condutores aptos — o condutor do uso dedicado. */
  condutores: Opcao[]
}

/** Valores atuais, na edição. */
export type ContratoAtual = {
  numero: string | null
  fornecedor_id: string | null
  responsavel_id: string | null
  /** Nome do responsável atual, para quando ele não está mais na lista. */
  responsavelNome?: string | null
  vigencia_inicio: string | null
  vigencia_termino: string | null
  valor_mensal: string
  finalidade: string | null
  centro_custo_id: string | null
  departamento_id: string | null
  temArquivo: boolean
  uso: "dedicado" | "coletivo" | null
  uso_justificativa: string | null
  condutor_dedicado_id: string | null
  condutorDedicadoNome: string | null
  /** Contrato vigente: o uso é obrigatório também na edição. */
  usoObrigatorio: boolean
}

/** Campos do contrato, iguais no registro e na edição. */
function CamposContrato({
  opcoes,
  responsavelPadraoId,
  atual,
  prefixo,
}: {
  opcoes: OpcoesContrato
  responsavelPadraoId: string
  atual?: ContratoAtual
  /** Ids únicos quando há dois formulários na página. */
  prefixo: string
}) {
  const id = (campo: string) => `${prefixo}${campo}`
  const data = (v: string | null | undefined) => (v ?? "").slice(0, 10)
  const [uso, setUso] = useState<string>(atual?.uso ?? "")
  const usoExigido = !atual || atual.usoObrigatorio
  // O valor atual fica na lista mesmo fora dela (pessoa inativa, centro
  // desativado): sem isso o select pegaria outra opção e a edição gravaria
  // uma troca que ninguém fez.
  const comAtual = (
    lista: Opcao[],
    atualId: string | null | undefined,
    nome?: string | null,
  ) =>
    atualId && !lista.some((o) => o.id === atualId)
      ? [
          {
            id: atualId,
            rotulo: nome
              ? `${nome} (fora da lista)`
              : "(o atual, fora da lista)",
          },
          ...lista,
        ]
      : lista
  const usuarios = comAtual(
    opcoes.usuarios,
    atual?.responsavel_id,
    atual?.responsavelNome,
  )
  const departamentos = comAtual(opcoes.departamentos, atual?.departamento_id)
  const centrosCusto = comAtual(opcoes.centrosCusto, atual?.centro_custo_id)
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor={id("numero")}>Nº do contrato na locadora *</Label>
        <Input
          id={id("numero")}
          name="numero"
          required
          defaultValue={atual?.numero ?? ""}
          className="tabular-nums"
        />
      </div>
      <div className="grid gap-1.5">
        <Label>Locadora (fornecedor) *</Label>
        <FornecedorCombobox
          empresas={opcoes.fornecedores}
          name="fornecedor_id"
          defaultId={atual?.fornecedor_id ?? undefined}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("vigencia_inicio")}>Início da vigência *</Label>
        <Input
          id={id("vigencia_inicio")}
          name="vigencia_inicio"
          type="date"
          required
          defaultValue={data(atual?.vigencia_inicio)}
          className="[color-scheme:light] dark:[color-scheme:dark]"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("vigencia_termino")}>Término da vigência</Label>
        <Input
          id={id("vigencia_termino")}
          name="vigencia_termino"
          type="date"
          defaultValue={data(atual?.vigencia_termino)}
          className="[color-scheme:light] dark:[color-scheme:dark]"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("valor_mensal")}>Valor mensal (R$)</Label>
        <Input
          id={id("valor_mensal")}
          name="valor_mensal"
          inputMode="decimal"
          placeholder="3.500,00"
          defaultValue={atual?.valor_mensal ?? ""}
          className="tabular-nums"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("responsavel_id")}>Responsável</Label>
        <select
          id={id("responsavel_id")}
          name="responsavel_id"
          defaultValue={
            atual ? (atual.responsavel_id ?? "") : responsavelPadraoId
          }
          className={SELECT}
        >
          {atual && !atual.responsavel_id && (
            <option value="">(não informado)</option>
          )}
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.rotulo}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("departamento_id")}>Departamento</Label>
        <select
          id={id("departamento_id")}
          name="departamento_id"
          defaultValue={atual?.departamento_id ?? ""}
          className={SELECT}
        >
          <option value="">(não informado)</option>
          {departamentos.map((d) => (
            <option key={d.id} value={d.id}>
              {d.rotulo}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("centro_custo_id")}>Centro de custo</Label>
        <select
          id={id("centro_custo_id")}
          name="centro_custo_id"
          defaultValue={atual?.centro_custo_id ?? ""}
          className={SELECT}
        >
          <option value="">(não informado)</option>
          {centrosCusto.map((c) => (
            <option key={c.id} value={c.id}>
              {c.rotulo}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor={id("finalidade")}>Finalidade do aluguel</Label>
        <Input
          id={id("finalidade")}
          name="finalidade"
          defaultValue={atual?.finalidade ?? ""}
          placeholder="Ex.: transporte da diretoria; deslocamento para assembleias…"
        />
      </div>
      <fieldset className="grid gap-2 rounded-md border p-3 sm:col-span-2">
        <legend className="px-1 text-sm font-medium">Uso do carro{usoExigido ? " *" : ""}</legend>
        {usoExigido && <input type="hidden" name="uso_obrigatorio" value="1" />}
        <div className="grid gap-2 sm:grid-cols-2">
          {USOS.map((u) => (
            <label
              key={u.valor}
              className={`cursor-pointer rounded-md border px-3 py-2 text-sm ${uso === u.valor ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
            >
              <input
                type="radio"
                name="uso"
                value={u.valor}
                checked={uso === u.valor}
                onChange={() => setUso(u.valor)}
                required={usoExigido}
                className="mr-2"
              />
              <span className="font-medium">{u.rotulo}</span>
              <span className="text-muted-foreground block text-xs">{u.ajuda}</span>
            </label>
          ))}
        </div>
        {uso === "dedicado" && (
          <div className="grid gap-1.5">
            <Label htmlFor={id("condutor_dedicado_id")}>Condutor dedicado *</Label>
            <select
              id={id("condutor_dedicado_id")}
              name="condutor_dedicado_id"
              required
              defaultValue={atual?.condutor_dedicado_id ?? ""}
              className={SELECT}
            >
              <option value="" disabled>
                Escolha o condutor…
              </option>
              {comAtual(opcoes.condutores, atual?.condutor_dedicado_id, atual?.condutorDedicadoNome).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor={id("uso_justificativa")}>
            Justificativa da necessidade{usoExigido || uso ? " *" : ""}
          </Label>
          <Textarea
            id={id("uso_justificativa")}
            name="uso_justificativa"
            rows={2}
            required={usoExigido || Boolean(uso)}
            minLength={10}
            defaultValue={atual?.uso_justificativa ?? ""}
            placeholder={
              uso === "dedicado"
                ? "Ex.: o diretor de base percorre as unidades do interior toda semana"
                : "Ex.: a frota própria não cobre as viagens das assembleias de novembro"
            }
          />
        </div>
      </fieldset>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor={id("arquivo_contrato")}>
          {atual?.temArquivo
            ? "Substituir o contrato assinado (PDF/JPG/PNG) — vazio mantém o atual"
            : "Contrato assinado (PDF/JPG/PNG)"}
        </Label>
        <Input
          id={id("arquivo_contrato")}
          name="arquivo_contrato"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
        />
      </div>
    </div>
  )
}

export function NovoContratoForm({
  responsavelPadraoId,
  ...opcoes
}: OpcoesContrato & { responsavelPadraoId: string }) {
  const [estado, formAction, pendente] = useActionState(criarContratoAction, {})
  const envio1 = useEnvioFormulario(formAction, estado)
  return (
    <form action={formAction} {...envio1} className="grid max-w-2xl gap-4">
      <CamposContrato
        opcoes={opcoes}
        responsavelPadraoId={responsavelPadraoId}
        prefixo="novo_"
      />
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <ScrollText />}
          Registrar contrato
        </Button>
      </div>
    </form>
  )
}

export function GerarOrdemAluguelForm({
  contratoId,
  valorPadrao,
}: {
  contratoId: string
  valorPadrao: string
}) {
  const [estado, formAction, pendente] = useActionState(
    gerarOrdemAluguelAction,
    {},
  )
  const envio2 = useEnvioFormulario(formAction, estado)
  const [lendo, setLendo] = useState<"fatura" | "boleto" | null>(null)
  const [leitura, setLeitura] = useState<
    (LeituraFaturaLocacao & { papel: "fatura" | "boleto" }) | null
  >(null)
  const [erroArquivo, setErroArquivo] = useState<string | null>(null)
  const refInicio = useRef<HTMLInputElement>(null)
  const refFim = useRef<HTMLInputElement>(null)
  const refValor = useRef<HTMLInputElement>(null)
  const refVencimento = useRef<HTMLInputElement>(null)
  const refLinha = useRef<HTMLInputElement>(null)
  // A fatura manda no valor; o boleto lido depois só completa o que faltou.
  const valorDaFatura = useRef(false)
  const [categoria, setCategoria] = useState<CategoriaLocacao>("locacao")

  /** O valor mensal só serve de ponto de partida para a locação. */
  function trocarCategoria(nova: CategoriaLocacao) {
    setCategoria(nova)
    const el = refValor.current
    if (!el || valorDaFatura.current) return
    if (nova !== "locacao" && el.value === valorPadrao) el.value = ""
    if (nova === "locacao" && !el.value) el.value = valorPadrao
  }

  /** A IA lê o arquivo escolhido e preenche o que achou (a pessoa confere). */
  async function ler(arquivo: File, papel: "fatura" | "boleto") {
    setLendo(papel)
    setLeitura(null)
    try {
      const fd = new FormData()
      fd.set("arquivo", arquivo)
      fd.set("contrato_id", contratoId)
      fd.set("papel", papel)
      const r = await lerFaturaLocacao(fd)
      setLeitura({ ...r, papel })
      if (r.erro) return
      const por = (
        el: HTMLInputElement | null,
        v: string | undefined,
        soVazio = false,
      ) => {
        if (el && v && (!soVazio || !el.value)) el.value = v
      }
      if (papel === "fatura") {
        por(refInicio.current, r.periodoInicio)
        por(refFim.current, r.periodoFim)
        por(refValor.current, r.valor)
        por(refVencimento.current, r.vencimento)
        por(refLinha.current, r.linhaDigitavel, true)
        if (r.valor) valorDaFatura.current = true
        if (r.categoria) setCategoria(r.categoria as CategoriaLocacao)
      } else {
        por(refLinha.current, r.linhaDigitavel)
        por(refVencimento.current, r.vencimento, true)
        if (!valorDaFatura.current) por(refValor.current, r.valor)
        por(refInicio.current, r.periodoInicio, true)
        por(refFim.current, r.periodoFim, true)
      }
    } catch {
      setLeitura({
        papel,
        erro: "Não foi possível ler o arquivo agora — preencha à mão.",
      })
    } finally {
      setLendo(null)
    }
  }

  async function aoEscolher(
    e: React.ChangeEvent<HTMLInputElement>,
    papel: "fatura" | "boleto",
  ) {
    const input = e.currentTarget
    const { erro } = await prepararArquivo(input)
    setErroArquivo(erro ?? null)
    const arquivo = input.files?.[0]
    if (!erro && arquivo) await ler(arquivo, papel)
  }

  return (
    <form action={formAction} {...envio2} className="grid gap-2">
      <input type="hidden" name="contrato_id" value={contratoId} />
      <div className="grid gap-1">
        <Label htmlFor={`categoria-${contratoId}`} className="text-xs">
          O que está sendo cobrado
        </Label>
        <select
          id={`categoria-${contratoId}`}
          name="categoria"
          value={categoria}
          onChange={(e) => trocarCategoria(e.target.value as CategoriaLocacao)}
          className={`${SELECT} h-8`}
        >
          {CATEGORIAS_LOCACAO.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.rotulo}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <div className="grid gap-1">
          <Label htmlFor={`fatura-${contratoId}`} className="text-xs">
            Fatura da locadora (PDF ou foto) — a IA preenche o resto
          </Label>
          <Input
            id={`fatura-${contratoId}`}
            name="fatura"
            type="file"
            accept={ACEITA_NOTA}
            onChange={(e) => aoEscolher(e, "fatura")}
            className="h-8 text-xs"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`boleto-${contratoId}`} className="text-xs">
            Boleto em PDF, se houver
          </Label>
          <Input
            id={`boleto-${contratoId}`}
            name="boleto"
            type="file"
            accept="application/pdf"
            onChange={(e) => aoEscolher(e, "boleto")}
            className="h-8 text-xs"
          />
        </div>
      </div>
      {erroArquivo && <p className="text-destructive text-xs">{erroArquivo}</p>}
      {lendo && (
        <p className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
          <Loader2 className="size-3.5 animate-spin" />
          Lendo {lendo === "boleto" ? "o boleto" : "a fatura"} com IA…
        </p>
      )}
      {leitura && !lendo && (
        <div className="grid gap-1 text-xs" role="status">
          {leitura.erro ? (
            <p className="text-warning-fg">{leitura.erro}</p>
          ) : (
            <p className="text-success-fg inline-flex items-center gap-1.5">
              <Sparkles className="size-3.5" />
              {leitura.papel === "boleto" ? "Boleto lido" : "Fatura lida"} pela
              IA{leitura.resumo ? `: ${leitura.resumo}` : ""} — confira os
              campos antes de gerar.
            </p>
          )}
          {leitura.avisos?.map((a) => (
            <p key={a} className="text-warning-fg">
              • {a}
            </p>
          ))}
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor={`periodo-inicio-${contratoId}`} className="text-xs">
            Período cobrado — de *
          </Label>
          <Input
            ref={refInicio}
            id={`periodo-inicio-${contratoId}`}
            name="periodo_inicio"
            type="date"
            required
            className="h-8 text-sm [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`periodo-fim-${contratoId}`} className="text-xs">
            até *
          </Label>
          <Input
            ref={refFim}
            id={`periodo-fim-${contratoId}`}
            name="periodo_fim"
            type="date"
            required
            className="h-8 text-sm [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`valor-${contratoId}`} className="text-xs">
            Valor (R$) *
          </Label>
          <Input
            ref={refValor}
            id={`valor-${contratoId}`}
            name="valor"
            required
            inputMode="decimal"
            defaultValue={valorPadrao}
            className="h-8 text-sm tabular-nums"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`vencimento-${contratoId}`} className="text-xs">
            Vencimento
          </Label>
          <Input
            ref={refVencimento}
            id={`vencimento-${contratoId}`}
            name="vencimento"
            type="date"
            className="h-8 text-sm [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="grid gap-1 sm:col-span-2">
          <Label htmlFor={`linha-${contratoId}`} className="text-xs">
            Linha digitável do boleto
          </Label>
          <Input
            ref={refLinha}
            id={`linha-${contratoId}`}
            name="linha_digitavel"
            inputMode="numeric"
            placeholder="Para pagar por remessa bancária"
            className="h-8 text-sm tabular-nums"
          />
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        Uma cobrança por fatura: o período não precisa ser o mês inteiro —
        locação curta e prorrogação no mesmo mês saem em cobranças separadas. O
        vencimento pode cair depois do término do contrato e é corrigível depois
        na ordem, no Financeiro. Com boleto (arquivo ou linha digitável), a
        forma de pagamento vira Boleto.
      </p>
      {estado.erro && <p className="text-destructive text-xs">{estado.erro}</p>}
      <div>
        <Button type="submit" size="sm" disabled={pendente || lendo !== null}>
          {pendente ? <Loader2 className="animate-spin" /> : <Receipt />}
          Gerar cobrança
        </Button>
      </div>
    </form>
  )
}

export function FinalizarContratoForm({ contratoId }: { contratoId: string }) {
  const [estado, formAction, pendente] = useActionState(
    finalizarContratoAction,
    {},
  )
  const envio3 = useEnvioFormulario(formAction, estado, {
    antes: (e) => {
      confirmarEnvio(
        e,
        "Finalizar este contrato? Os veículos continuam registrados nele (o período se encerra hoje) e ficam livres para outro contrato.",
      )
    },
  })
  return (
    <form
      action={formAction}
      {...envio3}
      className="inline-flex flex-col items-end gap-1"
    >
      <input type="hidden" name="contrato_id" value={contratoId} />
      <Button type="submit" variant="outline" size="sm" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <FileCheck2 />}
        Finalizar contrato
      </Button>
      {estado.erro && (
        <span className="text-destructive text-xs">{estado.erro}</span>
      )}
    </form>
  )
}

type Estado = { erro?: string; ok?: string }

const TEXTAREA =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"

/** Ação que fecha o diálogo quando o servidor confirma. */
function useAcaoDoDialogo(
  acao: (prev: Estado, dados: FormData) => Promise<Estado>,
  fechar: () => void,
) {
  return useActionState(async (prev: Estado, dados: FormData) => {
    const r = await acao(prev, dados)
    if (r.ok) fechar()
    return r
  }, {})
}

/** Corrige os dados cadastrais do contrato, com motivo (antes/depois no histórico). */
export function EditarContratoDialog({
  contratoId,
  atual,
  opcoes,
  abertoAoEntrar = false,
}: {
  contratoId: string
  atual: ContratoAtual
  opcoes: OpcoesContrato
  abertoAoEntrar?: boolean
}) {
  const [aberto, setAberto] = useState(abertoAoEntrar)
  const [estado, formAction, pendente] = useAcaoDoDialogo(
    editarContratoAction,
    () => setAberto(false),
  )
  const envio = useEnvioFormulario(formAction, estado)
  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Pencil />
            Editar
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar contrato {atual.numero ?? ""}</DialogTitle>
            <DialogDescription>
              Para corrigir os dados do contrato. Estender a vigência com
              aditivo é pela Prorrogação. A alteração fica no histórico, com o
              antes e o depois.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} {...envio} className="grid gap-4">
            <input type="hidden" name="contrato_id" value={contratoId} />
            {estado.erro && (
              <Alert variant="destructive">
                <AlertDescription>{estado.erro}</AlertDescription>
              </Alert>
            )}
            <CamposContrato
              opcoes={opcoes}
              responsavelPadraoId=""
              atual={atual}
              prefixo="ed_"
            />
            <div className="grid gap-1.5">
              <Label htmlFor="ed_motivo">Motivo da alteração *</Label>
              <textarea
                id="ed_motivo"
                name="motivo"
                rows={2}
                required
                className={TEXTAREA}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAberto(false)}
              >
                Voltar
              </Button>
              <Button type="submit" disabled={pendente}>
                {pendente && <Loader2 className="animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {estado.ok && (
        <span className="text-success-fg text-xs">{estado.ok}</span>
      )}
    </div>
  )
}

/** Prorroga o contrato vigente: novo término, valor (se mudou) e aditivo. */
export function ProrrogarContratoDialog({
  contratoId,
  terminoAtual,
  valorAtual,
  abertoAoEntrar = false,
}: {
  contratoId: string
  terminoAtual: string | null
  valorAtual: string
  abertoAoEntrar?: boolean
}) {
  const [aberto, setAberto] = useState(abertoAoEntrar)
  const [estado, formAction, pendente] = useAcaoDoDialogo(
    prorrogarContratoAction,
    () => setAberto(false),
  )
  const envio = useEnvioFormulario(formAction, estado)
  const minimo = terminoAtual ? terminoAtual.slice(0, 10) : undefined
  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <CalendarPlus />
            Prorrogar
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Prorrogar contrato</DialogTitle>
            <DialogDescription>
              {terminoAtual
                ? `Hoje vence em ${terminoAtual.slice(0, 10).split("-").reverse().join("/")}. `
                : "O contrato não tem término definido. "}
              As cobranças do novo período passam a caber na vigência.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} {...envio} className="grid gap-3">
            <input type="hidden" name="contrato_id" value={contratoId} />
            {estado.erro && (
              <Alert variant="destructive">
                <AlertDescription>{estado.erro}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor={`pr_termino_${contratoId}`}>
                  Novo término *
                </Label>
                <Input
                  id={`pr_termino_${contratoId}`}
                  name="novo_termino"
                  type="date"
                  required
                  min={minimo}
                  className="[color-scheme:light] dark:[color-scheme:dark]"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`pr_valor_${contratoId}`}>
                  Novo valor mensal (R$)
                </Label>
                <Input
                  id={`pr_valor_${contratoId}`}
                  name="novo_valor_mensal"
                  inputMode="decimal"
                  placeholder={
                    valorAtual ? `Mantém ${valorAtual}` : "Sem alteração"
                  }
                  className="tabular-nums"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`pr_aditivo_${contratoId}`}>
                Aditivo assinado (PDF/JPG/PNG)
              </Label>
              <Input
                id={`pr_aditivo_${contratoId}`}
                name="aditivo"
                type="file"
                accept="application/pdf,image/jpeg,image/png"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`pr_motivo_${contratoId}`}>Observação</Label>
              <textarea
                id={`pr_motivo_${contratoId}`}
                name="motivo"
                rows={2}
                placeholder="Ex.: prorrogação por mais 10 dias para a assembleia de Macaé"
                className={TEXTAREA}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAberto(false)}
              >
                Voltar
              </Button>
              <Button type="submit" disabled={pendente}>
                {pendente && <Loader2 className="animate-spin" />}
                Prorrogar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {estado.ok && (
        <span className="text-success-fg text-xs">{estado.ok}</span>
      )}
    </div>
  )
}

/**
 * Fatura e boleto na linha da cobrança: abrir o que já foi anexado e, enquanto
 * a ordem não foi paga nem entrou em processamento, anexar ou trocar.
 */
export function DocumentosCobranca({
  contratoId,
  ordemId,
  codigo,
  faturaUrl,
  boletoUrl,
  podeAnexar,
}: {
  contratoId: string
  ordemId: string
  codigo: string | null
  faturaUrl: string | null
  boletoUrl: string | null
  podeAnexar: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, formAction, pendente] = useAcaoDoDialogo(
    anexarDocumentosOrdemAluguelAction,
    () => setAberto(false),
  )
  const envio = useEnvioFormulario(formAction, estado)
  const link =
    "text-primary inline-flex items-center gap-1 text-xs hover:underline"
  return (
    <div className="flex flex-wrap items-center gap-2">
      {faturaUrl ? (
        <a
          href={faturaUrl}
          target="_blank"
          rel="noreferrer"
          className={link}
          title="Abrir a fatura"
        >
          <FileText className="size-3.5" />
          Fatura
        </a>
      ) : (
        <span className="text-muted-foreground text-xs">sem fatura</span>
      )}
      {boletoUrl && (
        <a
          href={boletoUrl}
          target="_blank"
          rel="noreferrer"
          className={link}
          title="Abrir o boleto"
        >
          <Barcode className="size-3.5" />
          Boleto
        </a>
      )}
      {podeAnexar && (
        <Dialog open={aberto} onOpenChange={setAberto}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title="Anexar ou trocar fatura e boleto"
              aria-label={`Anexar ou trocar fatura e boleto da ordem ${codigo ?? ""}`}
            >
              <Paperclip />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Fatura e boleto — ordem {codigo ?? ""}</DialogTitle>
              <DialogDescription>
                Anexe o que faltou ou troque um arquivo errado. O anterior fica
                registrado no histórico da ordem.
              </DialogDescription>
            </DialogHeader>
            <form action={formAction} {...envio} className="grid gap-3">
              <input type="hidden" name="contrato_id" value={contratoId} />
              <input type="hidden" name="ordem_id" value={ordemId} />
              {estado.erro && (
                <Alert variant="destructive">
                  <AlertDescription>{estado.erro}</AlertDescription>
                </Alert>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor={`dc_fatura_${ordemId}`}>
                  {faturaUrl ? "Trocar a fatura" : "Fatura da locadora"}{" "}
                  (PDF/JPG/PNG)
                </Label>
                <Input
                  id={`dc_fatura_${ordemId}`}
                  name="fatura"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`dc_boleto_${ordemId}`}>
                  {boletoUrl ? "Trocar o boleto" : "Boleto"} (PDF)
                </Label>
                <Input
                  id={`dc_boleto_${ordemId}`}
                  name="boleto"
                  type="file"
                  accept="application/pdf"
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setAberto(false)}
                >
                  Voltar
                </Button>
                <Button type="submit" disabled={pendente}>
                  {pendente && <Loader2 className="animate-spin" />}
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {estado.ok && (
        <span className="text-success-fg text-xs">{estado.ok}</span>
      )}
    </div>
  )
}

/** Liga um veículo ativo ao contrato, pela tela do contrato. */
export function VincularVeiculoForm({
  contratoId,
  veiculos,
}: {
  contratoId: string
  veiculos: { id: string; rotulo: string; outroContrato: boolean }[]
}) {
  const [estado, formAction, pendente] = useActionState(
    vincularVeiculoAction,
    {},
  )
  const envio = useEnvioFormulario(formAction, estado)
  if (veiculos.length === 0) return null
  return (
    <form action={formAction} {...envio} className="grid gap-1">
      <input type="hidden" name="contrato_id" value={contratoId} />
      <div className="flex flex-wrap items-center gap-2">
        <select
          name="veiculo_id"
          required
          defaultValue=""
          aria-label="Veículo para vincular"
          className={`${SELECT} h-8 max-w-64 flex-1`}
        >
          <option value="" disabled>
            Vincular veículo…
          </option>
          {veiculos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.rotulo}
              {v.outroContrato ? " (sai do outro contrato)" : ""}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Link2 />}
          Vincular
        </Button>
      </div>
      {estado.erro && <p className="text-destructive text-xs">{estado.erro}</p>}
      {estado.ok && <p className="text-success-fg text-xs">{estado.ok}</p>}
    </form>
  )
}

/** Tira o veículo do contrato (com confirmação). */
export function DesvincularVeiculoBotao({
  contratoId,
  veiculoId,
  placa,
}: {
  contratoId: string
  veiculoId: string
  placa: string | null
}) {
  const [estado, formAction, pendente] = useActionState(
    desvincularVeiculoAction,
    {},
  )
  const envio = useEnvioFormulario(formAction, estado, {
    antes: (e) => {
      confirmarEnvio(e, `Desvincular o veículo ${placa ?? ""} deste contrato?`)
    },
  })
  return (
    <form
      action={formAction}
      {...envio}
      className="inline-flex items-center gap-1"
    >
      <input type="hidden" name="contrato_id" value={contratoId} />
      <input type="hidden" name="veiculo_id" value={veiculoId} />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-destructive size-6"
        disabled={pendente}
        title="Desvincular do contrato"
        aria-label={`Desvincular o veículo ${placa ?? ""} do contrato`}
      >
        {pendente ? <Loader2 className="animate-spin" /> : <Unlink />}
      </Button>
      {estado.erro && (
        <span className="text-destructive text-xs">{estado.erro}</span>
      )}
    </form>
  )
}

/** Desfaz a finalização do contrato, com motivo (fica no histórico). */
export function ReabrirContratoDialog({ contratoId }: { contratoId: string }) {
  const [aberto, setAberto] = useState(false)
  const [estado, formAction, pendente] = useAcaoDoDialogo(
    reabrirContratoAction,
    () => setAberto(false),
  )
  const envio = useEnvioFormulario(formAction, estado)
  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <RotateCcw />
            Reabrir contrato
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir contrato</DialogTitle>
            <DialogDescription>
              O contrato volta a vigente, com os veículos que estavam nele ao
              finalizar — menos os que já foram para outro contrato.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} {...envio} className="grid gap-3">
            <input type="hidden" name="contrato_id" value={contratoId} />
            {estado.erro && (
              <Alert variant="destructive">
                <AlertDescription>{estado.erro}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor={`re_motivo_${contratoId}`}>
                Motivo da reabertura *
              </Label>
              <textarea
                id={`re_motivo_${contratoId}`}
                name="motivo"
                rows={2}
                required
                placeholder="Ex.: finalizado por engano; a locação continua"
                className={TEXTAREA}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAberto(false)}
              >
                Voltar
              </Button>
              <Button type="submit" disabled={pendente}>
                {pendente && <Loader2 className="animate-spin" />}
                Reabrir
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {estado.ok && (
        <span className="text-success-fg max-w-64 text-right text-xs">
          {estado.ok}
        </span>
      )}
    </div>
  )
}

/** Troca o condutor do contrato de uso dedicado (com motivo, no histórico). */
export function TrocarCondutorDialog({
  contratoId,
  condutorAtualNome,
  condutores,
}: {
  contratoId: string
  condutorAtualNome: string | null
  condutores: Opcao[]
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, formAction, pendente] = useAcaoDoDialogo(trocarCondutorAction, () => setAberto(false))
  const envio = useEnvioFormulario(formAction, estado)
  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <ArrowLeftRight />
            Trocar condutor
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trocar o condutor dedicado</DialogTitle>
            <DialogDescription>
              {condutorAtualNome ? `Hoje o carro está com ${condutorAtualNome}. ` : ""}A troca fica no histórico do
              contrato, com o motivo.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} {...envio} className="grid gap-3">
            <input type="hidden" name="contrato_id" value={contratoId} />
            {estado.erro && (
              <Alert variant="destructive">
                <AlertDescription>{estado.erro}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor={`tc_condutor_${contratoId}`}>Novo condutor *</Label>
              <select
                id={`tc_condutor_${contratoId}`}
                name="condutor_dedicado_id"
                required
                defaultValue=""
                className={SELECT}
              >
                <option value="" disabled>
                  Escolha o condutor…
                </option>
                {condutores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`tc_motivo_${contratoId}`}>Motivo *</Label>
              <textarea
                id={`tc_motivo_${contratoId}`}
                name="motivo"
                rows={2}
                required
                placeholder="Ex.: o diretor saiu de licença; o carro passa ao suplente"
                className={TEXTAREA}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
                Voltar
              </Button>
              <Button type="submit" disabled={pendente}>
                {pendente && <Loader2 className="animate-spin" />}
                Trocar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {estado.ok && <span className="text-success-fg text-xs">{estado.ok}</span>}
    </div>
  )
}
