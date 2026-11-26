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
  modo,
  parcelasExistentes = 0,
}: {
  /**
   * Contratos (26/11/2026): "parcelas" gera as parcelas previstas, numeradas
   * no contrato; "avulso" registra um pagamento fora delas. Sem o modo (Ajudas),
   * o formulário de sempre, com a periodicidade "única" na lista.
   */
  modo?: "parcelas" | "avulso"
  /** Parcelas em vigor no contrato — a prévia mostra os números das novas. */
  parcelasExistentes?: number
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
  const avulso = modo === "avulso"
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>(avulso ? "unica" : "mensal")
  const [forma, setForma] = useState("")
  // O avulso não segue a sequência das parcelas: a sugestão é hoje.
  const sugerir = (p: Periodicidade) =>
    avulso ? hoje.slice(0, 10) : primeiroVencimentoSugerido({ vigenciaInicio, hoje, ultimoVencimento, periodicidade: p })
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
      {modo && <input type="hidden" name="modo" value={modo} />}
      {avulso && <input type="hidden" name="periodicidade" value="unica" />}
      <ConfirmacaoAuditoria estado={estado} formRef={formRef} pendente={pendente} />

      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      {avulso && (
        <div className="grid gap-1.5">
          <Label htmlFor="motivo_avulso">O que este pagamento paga *</Label>
          <Input
            id="motivo_avulso"
            name="motivo_avulso"
            required
            minLength={5}
            maxLength={200}
            placeholder="Ex.: hora extra de novembro; reembolso de despesa de viagem; serviço pedido em 12/11"
          />
        </div>
      )}

      <div className={avulso ? "grid gap-4 sm:grid-cols-2" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-4"}>
        {!avulso && (
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
            {PERIODICIDADES.filter((p) => !modo || p.chave !== "unica").map((p) => (
              <option key={p.chave} value={p.chave}>
                {p.rotulo}
              </option>
            ))}
          </select>
        </div>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="valor_parcela">{avulso ? "Valor *" : "Valor por parcela"}</Label>
          <Input
            id="valor_parcela"
            name="valor_parcela"
            inputMode="decimal"
            placeholder="0,00"
            defaultValue={avulso ? "" : valorParaTexto(valorPadrao)}
            required={avulso}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="primeiro_vencimento">{avulso ? "Vencimento *" : "Primeiro vencimento"}</Label>
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
          {!avulso && (
          <p id="primeiro_vencimento_dica" className="text-muted-foreground text-xs">
            {ultimoVencimento
              ? `Última parcela em vigor: ${formatarData(ultimoVencimento)}.`
              : "Nenhuma parcela lançada ainda."}
          </p>
          )}
          {!avulso && antesDaUltima ? (
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

        {!avulso && (
        <div className="grid gap-1.5">
          <Label htmlFor="quantidade">{modo ? "Quantas parcelas" : "Parcelas"}</Label>
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
        )}
      </div>

      {modo === "parcelas" && periodicidade !== "unica" && Number(quantidade) > 0 && (
        <p className="bg-muted/50 rounded-md px-3 py-2 text-sm">
          {(() => {
            const n = Math.min(Number(quantidade) || 1, 120)
            const de = parcelasExistentes + 1
            const ate = parcelasExistentes + n
            return n === 1
              ? `Será criada a parcela ${de}${primeiro ? `, com vencimento em ${formatarData(primeiro)}` : ""}.`
              : `Serão criadas as parcelas ${de} a ${ate} (${n} ${periodicidade === "anual" ? "anuais" : "mensais"}${primeiro ? `, a primeira em ${formatarData(primeiro)}` : ""}).`
          })()}
          {parcelasExistentes > 0 && (
            <span className="text-muted-foreground"> O contrato já tem {parcelasExistentes} parcela(s) em vigor.</span>
          )}
        </p>
      )}

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
        {modo === "parcelas" ? (
          <>
            As parcelas são os pagamentos <strong>previstos</strong> no contrato. Nascem autorizadas pela
            autorização do contrato e esperam só a nota de cada competência. Vencimento que já tem parcela é
            pulado — dá para rodar de novo sem duplicar.
          </>
        ) : avulso ? (
          <>
            Pagamento <strong>fora das parcelas</strong> — extraordinário ou de um contrato sob demanda. Nasce{" "}
            <strong>Em autorização</strong> e passa pela autorização pontual. O {beneficiarioRotulo} do contrato é o
            favorecido.
          </>
        ) : beneficiarioRotulo === "fornecedor" ? (
          <>
            Parcelas <strong>recorrentes</strong> (mensal, anual) nascem autorizadas pela autorização do
            contrato e esperam só o documento fiscal. Periodicidade <strong>única</strong> é pagamento
            extraordinário: nasce <strong>Em autorização</strong> e passa pela autorização pontual.
          </>
        ) : (
          <>As ordens nascem <strong>Em autorização</strong>.</>
        )}{" "}
        {!modo && (
          <>
            O {beneficiarioRotulo} do contrato é o favorecido. Vencimentos que já têm ordem deste contrato
            são pulados — dá para rodar de novo sem duplicar.
          </>
        )}
      </p>

      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Receipt />}
          {modo === "parcelas" ? "Gerar parcelas" : avulso ? "Registrar pagamento avulso" : "Gerar ordens"}
        </Button>
      </div>
    </form>
  )
}
