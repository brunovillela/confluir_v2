"use client"

import { startTransition, useActionState, useRef, useState } from "react"
import { Loader2, Receipt } from "lucide-react"

import { ConfirmacaoAuditoria } from "@/components/confirmacao-auditoria"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  FORMAS_ORDEM_CONTRATO,
  ROTULO_FORMA_CONTRATO,
} from "@/lib/compras-constantes"
import type { EstadoComApontamentos } from "@/lib/auditoria-confirmacao"
import type { ContaFornecedor, PixFornecedor } from "@/lib/db/compras-pagamento"
import {
  PERIODICIDADES,
  parcelasSugeridas,
  primeiroVencimentoSugerido,
  type Periodicidade,
} from "@/lib/contratos-constantes"
import { formatarData } from "@/lib/formato"

import { DetalhePagamento, type CaixaOpcao } from "../nova/detalhe-pagamento"
import { gerarOrdensContratoAction, meiosDoFornecedorContrato } from "./actions"

// Ajudas devolve só erro/ok; Contratos também os apontamentos da auditoria.
type AcaoForm = (prev: EstadoComApontamentos, formData: FormData) => Promise<EstadoComApontamentos>

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const DATA =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/** Valor NUMERIC → texto pt-BR editável (sem símbolo). */
function valorParaTexto(valor: number | null): string {
  if (valor == null) return ""
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function GerarOrdensForm({
  contratoId,
  valorPadrao,
  vigenciaInicio,
  vigenciaTermino,
  hoje,
  ultimoVencimento = null,
  temFornecedor,
  fornecedorId,
  caixas,
  buscarMeios = meiosDoFornecedorContrato,
  acao = gerarOrdensContratoAction,
  beneficiarioRotulo = "fornecedor",
}: {
  contratoId: string
  valorPadrao: number | null
  vigenciaInicio: string | null
  vigenciaTermino: string | null
  hoje: string
  /** Vencimento da última parcela em vigor (não cancelada) — base da sugestão. */
  ultimoVencimento?: string | null
  temFornecedor: boolean
  /** Favorecido das ordens — dono das chaves Pix e contas para TED. */
  fornecedorId: string | null
  /** Contas de caixa abertas (forma Dinheiro). */
  caixas: CaixaOpcao[]
  buscarMeios?: (
    fornecedorId: string
  ) => Promise<{ pix: PixFornecedor[]; contas: ContaFornecedor[] }>
  /** Ação do submit — Contratos por padrão; Ajudas passa a sua. */
  acao?: AcaoForm
  /** "fornecedor" (contrato) ou "entidade apoiada" (ajuda). */
  beneficiarioRotulo?: string
}) {
  const [estado, formAction, pendente] = useActionState(acao, {})
  const formRef = useRef<HTMLFormElement>(null)
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>("mensal")
  const [forma, setForma] = useState("")
  const sugerir = (p: Periodicidade) =>
    primeiroVencimentoSugerido({ vigenciaInicio, hoje, ultimoVencimento, periodicidade: p })
  const [primeiro, setPrimeiro] = useState(() => sugerir("mensal"))
  // Enquanto a pessoa não digita a data, ela acompanha a periodicidade.
  const [dataEditada, setDataEditada] = useState(false)
  const [quantidade, setQuantidade] = useState(() =>
    String(parcelasSugeridas(sugerir("mensal"), vigenciaTermino, "mensal"))
  )
  const hojeIso = hoje.slice(0, 10)
  const noPassado = Boolean(primeiro) && primeiro < hojeIso
  const antesDaUltima = Boolean(primeiro && ultimoVencimento) && primeiro <= (ultimoVencimento ?? "")

  function trocarPeriodicidade(p: Periodicidade) {
    setPeriodicidade(p)
    const data = dataEditada ? primeiro : sugerir(p)
    if (!dataEditada) setPrimeiro(data)
    setQuantidade(String(parcelasSugeridas(data, vigenciaTermino, p)))
  }

  function trocarPrimeiro(data: string) {
    setPrimeiro(data)
    setDataEditada(true)
    if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      setQuantidade(String(parcelasSugeridas(data, vigenciaTermino, periodicidade)))
    }
  }

  if (!temFornecedor) {
    return (
      <Alert variant="warning">
        <AlertDescription>
          Defina o {beneficiarioRotulo} para gerar ordens de pagamento — ele é o
          favorecido das ordens.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <form
      ref={formRef}
      // Pelo onSubmit: a análise da auditoria pode devolver o formulário para
      // ajuste (boletos inclusive), e com `action=` o React o limparia.
      onSubmit={(e) => {
        e.preventDefault()
        const dados = new FormData(e.currentTarget)
        startTransition(() => formAction(dados))
      }}
      className="grid gap-4"
    >
      <input type="hidden" name="contrato_id" value={contratoId} />
      <ConfirmacaoAuditoria estado={estado} formRef={formRef} pendente={pendente} />

      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="periodicidade">Periodicidade</Label>
          <select
            id="periodicidade"
            name="periodicidade"
            className={SELECT}
            value={periodicidade}
            onChange={(e) =>
              trocarPeriodicidade(e.target.value as Periodicidade)
            }
          >
            {PERIODICIDADES.map((p) => (
              <option key={p.chave} value={p.chave}>
                {p.rotulo}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="valor_parcela">Valor por parcela</Label>
          <Input
            id="valor_parcela"
            name="valor_parcela"
            inputMode="decimal"
            placeholder="0,00"
            defaultValue={valorParaTexto(valorPadrao)}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="primeiro_vencimento">Primeiro vencimento</Label>
          <input
            id="primeiro_vencimento"
            name="primeiro_vencimento"
            type="date"
            className={DATA}
            value={primeiro}
            onChange={(e) => trocarPrimeiro(e.target.value)}
            aria-describedby="primeiro_vencimento_dica"
          />
          {/* A data sugerida vem da última parcela; avisar quando a escolhida
              fica no passado ou cai antes dela (induzia a lançar no mês errado). */}
          <p id="primeiro_vencimento_dica" className="text-muted-foreground text-xs">
            {ultimoVencimento
              ? `Última parcela em vigor: ${formatarData(ultimoVencimento)}.`
              : "Nenhuma parcela lançada ainda."}
          </p>
          {antesDaUltima ? (
            <p className="text-warning-fg text-xs font-medium">
              Atenção: data igual ou anterior à última parcela ({formatarData(ultimoVencimento)}).
            </p>
          ) : (
            noPassado && (
              <p className="text-warning-fg text-xs font-medium">
                Atenção: vencimento no passado ({formatarData(primeiro)}).
              </p>
            )
          )}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="quantidade">Parcelas</Label>
          <Input
            id="quantidade"
            name="quantidade"
            type="number"
            min={1}
            max={120}
            value={periodicidade === "unica" ? "1" : quantidade}
            disabled={periodicidade === "unica"}
            onChange={(e) => setQuantidade(e.target.value)}
          />
        </div>
      </div>

      {/* A forma é obrigatória: sem ela (e sem o "para onde") a ordem não
          pode ser paga. Mesmas regras da aquisição direta, sem cartão. */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="forma_pagamento">Forma de pagamento *</Label>
          <select
            id="forma_pagamento"
            name="forma_pagamento"
            required
            value={forma}
            onChange={(e) => setForma(e.target.value)}
            className={SELECT}
          >
            <option value="" disabled>
              Escolha a forma
            </option>
            {FORMAS_ORDEM_CONTRATO.map((f) => (
              <option key={f} value={f}>
                {ROTULO_FORMA_CONTRATO[f]}
              </option>
            ))}
          </select>
        </div>
        {forma && (
          <DetalhePagamento
            key={forma}
            forma={forma}
            fornecedorId={fornecedorId ?? ""}
            cartoes={[]}
            caixas={caixas}
            buscarMeios={buscarMeios}
            futuro
            boletosEsperados={
              periodicidade === "unica" ? 1 : Math.max(1, Number(quantidade) || 1)
            }
          />
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        {beneficiarioRotulo === "fornecedor" ? (
          <>
            Parcelas <strong>recorrentes</strong> (mensal, anual) nascem autorizadas pela autorização do
            contrato e esperam só o documento fiscal. Periodicidade <strong>única</strong> é pagamento
            extraordinário: nasce <strong>Em autorização</strong> e passa pela autorização pontual.
          </>
        ) : (
          <>As ordens nascem <strong>Em autorização</strong>.</>
        )}{" "}
        O {beneficiarioRotulo} do contrato é o favorecido. Vencimentos que já têm ordem deste contrato
        são pulados — dá para rodar de novo sem duplicar.
      </p>

      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Receipt />}
          Gerar ordens
        </Button>
      </div>
    </form>
  )
}
