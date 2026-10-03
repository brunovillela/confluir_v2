"use client"

import { startTransition, useMemo, useRef, useState } from "react"
import { useActionState } from "react"
import { FileCheck2, Loader2, Trash2, Upload } from "lucide-react"

import { ConfirmacaoAuditoria } from "@/components/confirmacao-auditoria"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  calcularPorBruto,
  calcularPorLiquido,
  FORMAS_PAGAMENTO_RPA,
  type ConfigRpa,
} from "@/lib/rpa-calculo"

import { ACEITA_NOTA, prepararArquivo } from "../../nova/arquivo-envio"
import { DetalhePagamento, type CaixaOpcao } from "../../nova/detalhe-pagamento"
import {
  anexarRpaAssinado,
  emitirRpa,
  excluirRpa,
  meiosDoPrestadorRpa,
  salvarConfigRpa,
} from "./actions"

const SELECT_CLS =
  "border-input bg-background h-9 rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function lerValor(v: string): number | null {
  const t = v.trim()
  if (!t) return null
  const n = Number(t.replace(/\./g, "").replace(",", "."))
  return Number.isFinite(n) && n > 0 ? n : null
}

export type ContratoDoForm = {
  id: string
  codigo: string | null
  objeto: string | null
  fornecedorId: string
  fornecedorNome: string | null
}

/** O fornecimento da compra de serviço que o RPA vai pagar. */
export type CompraDoForm = {
  fornecimentoId: string
  processoId: string
  processoCodigo: string | null
  servico: string | null
  valor: number
  fornecedorId: string
  fornecedorNome: string | null
}

/**
 * Emissão do RPA — de um contrato (o prestador é o fornecedor do contrato) ou
 * de uma COMPRA DE SERVIÇO (prestador, serviço, departamento e centro de
 * custo vêm da compra; o valor dela é o líquido do recibo). Nos dois, o
 * recibo gera a ordem de pagamento do líquido, com a forma e o "para onde"
 * completos.
 */
export function RpaNovoForm({
  contrato,
  compra,
  hoje,
  config,
  caixas,
}: {
  contrato: ContratoDoForm | null
  compra: CompraDoForm | null
  hoje: string
  config: ConfigRpa
  caixas: CaixaOpcao[]
}) {
  const [estado, action, pend] = useActionState(emitirRpa, {})
  const formRef = useRef<HTMLFormElement>(null)
  // Na compra, o valor dela é o líquido: começa pela conta inversa.
  const [base, setBase] = useState<"bruto" | "liquido">(compra ? "liquido" : "bruto")
  const [valorTxt, setValorTxt] = useState(
    compra ? compra.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""
  )
  const [dependentes, setDependentes] = useState("0")
  const [reterInss, setReterInss] = useState(true)
  const [reterIrrf, setReterIrrf] = useState(true)
  const [reterIss, setReterIss] = useState(true)
  const [issTxt, setIssTxt] = useState(String(config.iss_aliquota_padrao))
  const [forma, setForma] = useState("")

  const fornecedorId = contrato?.fornecedorId ?? compra?.fornecedorId ?? ""

  const previa = useMemo(() => {
    const valor = lerValor(valorTxt)
    if (valor === null) return null
    const op = {
      dependentes: Math.max(0, Math.round(Number(dependentes) || 0)),
      reterInss,
      reterIrrf,
      reterIss,
      issAliquota:
        Number(issTxt.replace(",", ".")) || config.iss_aliquota_padrao,
    }
    return base === "liquido"
      ? calcularPorLiquido(valor, config, op)
      : calcularPorBruto(valor, config, op)
  }, [valorTxt, base, dependentes, reterInss, reterIrrf, reterIss, issTxt, config])

  return (
    <form
      ref={formRef}
      // Pelo onSubmit, e não por `action`: o React 19 limpa o formulário
      // depois de uma action, e um erro apagaria o serviço e as datas.
      onSubmit={(e) => {
        e.preventDefault()
        const dados = new FormData(e.currentTarget)
        startTransition(() => action(dados))
      }}
      className="grid gap-4"
    >
      <ConfirmacaoAuditoria estado={estado} formRef={formRef} pendente={pend} />
      {contrato && <input type="hidden" name="contrato_id" value={contrato.id} />}
      {compra && (
        <>
          <input type="hidden" name="modo" value="compra" />
          <input type="hidden" name="fornecimento_id" value={compra.fornecimentoId} />
        </>
      )}
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      {contrato ? (
        <dl className="bg-muted/40 grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground text-xs">Contrato</dt>
            <dd className="font-medium">
              {contrato.codigo ?? "(sem código)"}
              {contrato.objeto && <span className="text-muted-foreground font-normal"> — {contrato.objeto}</span>}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Prestador (fornecedor do contrato)</dt>
            <dd className="font-medium">{contrato.fornecedorNome ?? "—"}</dd>
          </div>
        </dl>
      ) : compra ? (
        <dl className="bg-muted/40 grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground text-xs">Compra de serviço</dt>
            <dd className="font-medium tabular-nums">{compra.processoCodigo ?? "(sem código)"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Prestador (fornecedor da compra)</dt>
            <dd className="font-medium">{compra.fornecedorNome ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Valor da compra</dt>
            <dd className="font-medium tabular-nums">{moeda(compra.valor)}</dd>
          </div>
          <p className="text-muted-foreground text-xs sm:col-span-3">
            Departamento e centro de custo vêm da compra.
          </p>
        </dl>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="descricao_servico">Serviço prestado *</Label>
        <Textarea
          id="descricao_servico"
          name="descricao_servico"
          rows={2}
          required
          defaultValue={contrato?.objeto ?? compra?.servico ?? ""}
          placeholder="Ex.: Manutenção elétrica da sede — troca do quadro de distribuição"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="data_servico">Data do serviço</Label>
          <input
            id="data_servico"
            name="data_servico"
            type="date"
            className={SELECT_CLS}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dependentes">Dependentes (IRRF)</Label>
          <Input
            id="dependentes"
            name="dependentes"
            inputMode="numeric"
            value={dependentes}
            onChange={(e) => setDependentes(e.target.value)}
          />
        </div>
      </div>

      <fieldset className="grid gap-2 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">Valor</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="base"
              value="bruto"
              checked={base === "bruto"}
              onChange={() => setBase("bruto")}
              className="size-4"
            />
            Parto do valor <strong>bruto</strong> (antes dos impostos)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="base"
              value="liquido"
              checked={base === "liquido"}
              onChange={() => setBase("liquido")}
              className="size-4"
            />
            Parto do valor <strong>líquido</strong> (conta inversa)
          </label>
        </div>
        <div className="flex items-end gap-2">
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="valor">
              Valor {base === "bruto" ? "bruto" : "líquido"} (R$) *
            </Label>
            <Input
              id="valor"
              name="valor"
              inputMode="decimal"
              placeholder="1.500,00"
              value={valorTxt}
              onChange={(e) => setValorTxt(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="reter_inss"
              checked={reterInss}
              onChange={(e) => setReterInss(e.target.checked)}
              className="size-4"
            />
            Reter INSS ({config.inss_aliquota}%)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="reter_irrf"
              checked={reterIrrf}
              onChange={(e) => setReterIrrf(e.target.checked)}
              className="size-4"
            />
            Reter IRRF (tabela)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="reter_iss"
              checked={reterIss}
              onChange={(e) => setReterIss(e.target.checked)}
              className="size-4"
            />
            Reter ISS
          </label>
          {reterIss && (
            <div className="grid gap-1">
              <span className="text-muted-foreground text-xs">Alíquota ISS (%)</span>
              <Input
                name="iss_aliquota"
                inputMode="decimal"
                value={issTxt}
                onChange={(e) => setIssTxt(e.target.value)}
                className="w-24"
              />
            </div>
          )}
        </div>
      </fieldset>

      {previa && (
        <div className="bg-muted/50 grid gap-1 rounded-lg border p-3 text-sm">
          <p className="mb-1 text-xs font-medium">Prévia do recibo</p>
          <Linha rotulo="Valor bruto" valor={moeda(previa.valorBruto)} forte />
          <Linha rotulo="INSS retido" valor={`− ${moeda(previa.inss)}`} />
          <Linha rotulo="IRRF retido" valor={`− ${moeda(previa.irrf)}`} />
          <Linha rotulo="ISS retido" valor={`− ${moeda(previa.iss)}`} />
          <Linha
            rotulo="Valor líquido a pagar"
            valor={moeda(previa.valorLiquido)}
            forte
          />
          {compra && (
            <p className="text-muted-foreground mt-1 text-xs">
              {Math.abs(previa.valorLiquido - compra.valor) < 0.005 ? (
                <>O líquido é o valor da compra.</>
              ) : (
                <>
                  O valor da compra passa de <strong>{moeda(compra.valor)}</strong> para{" "}
                  <strong>{moeda(previa.valorLiquido)}</strong> — o líquido do RPA.
                </>
              )}
            </p>
          )}
        </div>
      )}

      <fieldset className="grid gap-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">Pagamento</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="pagar_em">Pagar em *</Label>
            <input
              id="pagar_em"
              name="pagar_em"
              type="date"
              required
              defaultValue={hoje}
              className={SELECT_CLS}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="forma_pagamento">Forma de pagamento *</Label>
            <select
              id="forma_pagamento"
              name="forma_pagamento"
              required
              value={forma}
              onChange={(e) => setForma(e.target.value)}
              className={`${SELECT_CLS} w-full`}
            >
              <option value="" disabled>
                Escolha…
              </option>
              {FORMAS_PAGAMENTO_RPA.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        </div>
        {/* Bloco próprio: o DetalhePagamento ocupa várias colunas no grid da compra. */}
        {forma && (
          <div>
            <DetalhePagamento
              key={forma}
              forma={forma}
              fornecedorId={fornecedorId}
              cartoes={[]}
              caixas={caixas}
              buscarMeios={meiosDoPrestadorRpa}
              // A ordem do líquido ainda vai ser paga: o caixa só é debitado
              // no pagamento, e os textos falam do que será pago.
              futuro
            />
          </div>
        )}
        <p className="text-muted-foreground text-xs">
          Ao emitir, nasce a ordem de pagamento do <strong>valor líquido</strong> para o prestador,
          Em autorização{contrato ? " e ligada ao contrato" : " e ligada à compra"} — ela segue a
          alçada como qualquer ordem.
        </p>
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="observacoes">Observações</Label>
        <Textarea id="observacoes" name="observacoes" rows={2} />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pend}>
          {pend && <Loader2 className="animate-spin" />}
          Emitir RPA e gerar a ordem
        </Button>
      </div>
    </form>
  )
}

function Linha({
  rotulo,
  valor,
  forte,
}: {
  rotulo: string
  valor: string
  forte?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={forte ? "font-medium" : "text-muted-foreground"}>
        {rotulo}
      </span>
      <span className={`tabular-nums ${forte ? "font-semibold" : ""}`}>
        {valor}
      </span>
    </div>
  )
}

export function ConfigRpaForm({ config }: { config: ConfigRpa }) {
  const [estado, action, pend] = useActionState(salvarConfigRpa, {})
  return (
    <form action={action} className="grid gap-4">
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="inss_aliquota">INSS — alíquota (%)</Label>
          <Input
            id="inss_aliquota"
            name="inss_aliquota"
            inputMode="decimal"
            defaultValue={String(config.inss_aliquota)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="inss_teto">INSS — teto do salário (R$)</Label>
          <Input
            id="inss_teto"
            name="inss_teto"
            inputMode="decimal"
            defaultValue={String(config.inss_teto)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="irrf_deducao_dependente">
            IRRF — dedução/dependente (R$)
          </Label>
          <Input
            id="irrf_deducao_dependente"
            name="irrf_deducao_dependente"
            inputMode="decimal"
            defaultValue={String(config.irrf_deducao_dependente)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="iss_aliquota_padrao">ISS — alíquota padrão (%)</Label>
          <Input
            id="iss_aliquota_padrao"
            name="iss_aliquota_padrao"
            inputMode="decimal"
            defaultValue={String(config.iss_aliquota_padrao)}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-medium">Tabela progressiva do IRRF (mensal)</p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-left text-xs">
              <tr>
                <th className="px-3 py-2">Faixa</th>
                <th className="px-3 py-2">Base até (R$)</th>
                <th className="px-3 py-2">Alíquota (%)</th>
                <th className="px-3 py-2">Parcela a deduzir (R$)</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3, 4].map((i) => {
                const f = config.irrf_faixas[i]
                return (
                  <tr key={i} className="border-t">
                    <td className="text-muted-foreground px-3 py-1.5 text-xs">
                      {i + 1}ª{i === 4 ? " (sem teto)" : ""}
                    </td>
                    <td className="px-3 py-1.5">
                      {i === 4 ? (
                        <span className="text-muted-foreground text-xs">acima da 4ª</span>
                      ) : (
                        <Input
                          name={`faixa_ate_${i}`}
                          inputMode="decimal"
                          defaultValue={f?.ate != null ? String(f.ate) : ""}
                          className="h-8 w-32"
                        />
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        name={`faixa_aliquota_${i}`}
                        inputMode="decimal"
                        defaultValue={f ? String(f.aliquota) : ""}
                        className="h-8 w-24"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        name={`faixa_deduzir_${i}`}
                        inputMode="decimal"
                        defaultValue={f ? String(f.deduzir) : ""}
                        className="h-8 w-32"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground text-xs">
          Estes valores mudam todo ano (teto do INSS e tabela do IRRF) —
          confira com a contabilidade e atualize aqui. Alterações valem só para
          os próximos RPAs; os já emitidos não mudam.
        </p>
      </div>

      <div className="flex justify-end">
        <Button type="submit" variant="secondary" disabled={pend}>
          {pend && <Loader2 className="animate-spin" />}
          Salvar tabelas
        </Button>
      </div>
    </form>
  )
}

/**
 * Excluir o RPA (só o que ainda não tem recibo assinado — a página e a lista
 * escondem o botão nos assinados, e a action recusa). `compacto` é o botão de
 * ícone da lista, que volta para a lista.
 */
export function ExcluirRpa({
  id,
  numero,
  compacto,
}: {
  id: string
  numero?: number | null
  compacto?: boolean
}) {
  const [estado, action, pend] = useActionState(excluirRpa, {})
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !confirm(
            `Excluir o RPA${numero ? ` nº ${numero}` : ""} e a ordem de pagamento dele? O número fica vago e o recibo deixa de existir. Não pode ser desfeito.`
          )
        ) {
          e.preventDefault()
        }
      }}
      className={compacto ? "inline-flex flex-col items-end" : undefined}
    >
      {estado.erro &&
        (compacto ? (
          <span className="text-destructive max-w-56 text-right text-xs">{estado.erro}</span>
        ) : (
          <Alert variant="destructive" className="mb-3">
            <AlertDescription>{estado.erro}</AlertDescription>
          </Alert>
        ))}
      <input type="hidden" name="id" value={id} />
      {compacto && <input type="hidden" name="voltar" value="lista" />}
      <Button
        type="submit"
        variant="ghost"
        size={compacto ? "icon" : "default"}
        disabled={pend}
        className="text-destructive hover:text-destructive"
        title={compacto ? "Excluir RPA (sem recibo assinado)" : undefined}
        aria-label={compacto ? `Excluir o RPA${numero ? ` nº ${numero}` : ""}` : undefined}
      >
        {pend ? <Loader2 className="animate-spin" /> : <Trash2 />}
        {!compacto && "Excluir RPA"}
      </Button>
    </form>
  )
}

/**
 * Anexa (ou substitui) o recibo assinado pelo prestador — PDF ou foto, que é
 * reduzida no navegador se passar do limite do envio.
 */
export function AnexarRpaAssinado({ id, substituir }: { id: string; substituir?: boolean }) {
  const [estado, action, pend] = useActionState(anexarRpaAssinado, {})
  const [erroArquivo, setErroArquivo] = useState<string | null>(null)
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !substituir &&
          !confirm(
            "Anexar o recibo assinado? Depois disso o RPA não pode mais ser excluído (o arquivo pode ser substituído)."
          )
        ) {
          e.preventDefault()
        }
      }}
      className="grid gap-3"
    >
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
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-64 flex-1 gap-1.5">
          <Label htmlFor="arquivo_assinado">
            {substituir ? "Substituir o arquivo" : "Recibo assinado (PDF ou foto)"}
          </Label>
          <Input
            id="arquivo_assinado"
            name="arquivo"
            type="file"
            required
            accept={ACEITA_NOTA}
            onChange={async (e) => {
              const { erro } = await prepararArquivo(e.currentTarget)
              setErroArquivo(erro ?? null)
            }}
          />
        </div>
        <Button type="submit" variant={substituir ? "outline" : "default"} disabled={pend}>
          {pend ? <Loader2 className="animate-spin" /> : substituir ? <Upload /> : <FileCheck2 />}
          {substituir ? "Substituir" : "Anexar recibo assinado"}
        </Button>
      </div>
      {erroArquivo && <p className="text-destructive text-xs">{erroArquivo}</p>}
    </form>
  )
}
