"use client"

import { useActionState, useState } from "react"
import {
  CalendarPlus,
  FileCheck2,
  Loader2,
  Pencil,
  Receipt,
  ScrollText,
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

import {
  criarContratoAction,
  editarContratoAction,
  finalizarContratoAction,
  gerarOrdemAluguelAction,
  prorrogarContratoAction,
} from "./actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type Opcao = { id: string; rotulo: string }

/** Opções dos selects do contrato (novo e edição). */
export type OpcoesContrato = {
  fornecedores: FornecedorOpcao[]
  usuarios: Opcao[]
  departamentos: Opcao[]
  centrosCusto: Opcao[]
}

/** Valores atuais, na edição. */
export type ContratoAtual = {
  numero: string | null
  fornecedor_id: string | null
  responsavel_id: string | null
  vigencia_inicio: string | null
  vigencia_termino: string | null
  valor_mensal: string
  finalidade: string | null
  centro_custo_id: string | null
  departamento_id: string | null
  temArquivo: boolean
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
  // O valor atual fica na lista mesmo fora dela (pessoa inativa, centro
  // desativado): sem isso o select pegaria outra opção e a edição gravaria
  // uma troca que ninguém fez.
  const comAtual = (lista: Opcao[], atualId: string | null | undefined) =>
    atualId && !lista.some((o) => o.id === atualId)
      ? [{ id: atualId, rotulo: "(o atual, fora da lista)" }, ...lista]
      : lista
  const usuarios = comAtual(opcoes.usuarios, atual?.responsavel_id)
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
          defaultValue={atual ? (atual.responsavel_id ?? "") : responsavelPadraoId}
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
  return (
    <form action={formAction} {...envio2} className="grid gap-2">
      <input type="hidden" name="contrato_id" value={contratoId} />
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor={`periodo-inicio-${contratoId}`} className="text-xs">
            Período cobrado — de *
          </Label>
          <Input
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
            id={`vencimento-${contratoId}`}
            name="vencimento"
            type="date"
            className="h-8 text-sm [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor={`fatura-${contratoId}`} className="text-xs">
            Fatura da locadora (PDF/JPG/PNG)
          </Label>
          <Input
            id={`fatura-${contratoId}`}
            name="fatura"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="h-8 text-xs"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`boleto-${contratoId}`} className="text-xs">
            Boleto, se houver
          </Label>
          <Input
            id={`boleto-${contratoId}`}
            name="boleto"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="h-8 text-xs"
          />
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        Uma cobrança por fatura: o período não precisa ser o mês inteiro —
        locação curta e prorrogação no mesmo mês saem em cobranças separadas. O
        vencimento pode cair depois do término do contrato e é corrigível depois
        na ordem, no Financeiro. Com boleto, a forma de pagamento vira Boleto.
      </p>
      {estado.erro && <p className="text-destructive text-xs">{estado.erro}</p>}
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
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
        "Finalizar este contrato? Os veículos vinculados serão desvinculados.",
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
}: {
  contratoId: string
  atual: ContratoAtual
  opcoes: OpcoesContrato
}) {
  const [aberto, setAberto] = useState(false)
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
}: {
  contratoId: string
  terminoAtual: string | null
  valorAtual: string
}) {
  const [aberto, setAberto] = useState(false)
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
