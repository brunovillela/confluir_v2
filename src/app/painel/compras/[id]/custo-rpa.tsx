import Link from "next/link"
import { Calculator } from "lucide-react"

import type { CustoRpa } from "@/lib/db/rpa-retencoes"
import { formatarData, formatarMoeda } from "@/lib/formato"

const pct = (v: number | null) => (v == null ? "" : ` (${String(v).replace(".", ",")}%)`)

/**
 * Quanto o serviço pago por RPA custa à entidade — pedagógico: do líquido que
 * cai na conta do prestador até o custo total, linha a linha, dizendo de quem
 * sai cada valor e para onde vai. As retenções e a cota patronal são as que
 * formam as guias em Financeiro › Tributos.
 */
export function CustoDoRpa({ custo: c }: { custo: CustoRpa }) {
  const pago = c.ordemSituacao === "Paga" && c.dataPagamento
  const competencia = pago ? `${c.dataPagamento!.slice(5, 7)}/${c.dataPagamento!.slice(0, 4)}` : null
  const prestador = c.prestador ?? "o prestador"

  return (
    <div className="mt-3 rounded-md border p-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <Calculator className="text-muted-foreground size-4" />
        Quanto este serviço custa à entidade
        <Link href={`/painel/compras/rpa/${c.rpaId}`} className="text-primary text-xs font-normal hover:underline">
          RPA nº {c.numero ?? "—"}
        </Link>
      </p>
      <p className="text-muted-foreground mt-1 text-xs">
        No RPA, a entidade não paga ao autônomo o valor cheio: ela desconta os impostos dele e os recolhe ao governo,
        e ainda deve a sua própria parte do INSS. Por isso o custo do serviço é maior do que o valor pago a{" "}
        {prestador}.
      </p>

      <table className="mt-3 w-full text-sm">
        <tbody>
          <Linha
            valor={c.liquido}
            rotulo="Valor líquido pago ao prestador"
            explicacao={`É o que cai na conta de ${prestador}: o valor da compra e da ordem de pagamento.`}
          />
          <Linha
            sinal="+"
            valor={c.inss}
            rotulo={`INSS retido do prestador${pct(c.inssAliquota)}`}
            explicacao="Descontado do prestador. A entidade recolhe à Receita Federal na guia INSS RPA."
          />
          <Linha
            sinal="+"
            valor={c.irrf}
            rotulo="IRRF retido do prestador (tabela)"
            explicacao={
              c.irrf > 0
                ? "Imposto de renda descontado do prestador. A entidade recolhe por DARF (código 0588), na guia IRRF RPA."
                : "Não houve imposto de renda a reter neste recibo: o bruto ficou na faixa de isenção da tabela (ou a retenção foi desligada ao emitir)."
            }
          />
          <Linha
            sinal="+"
            valor={c.iss}
            rotulo={`ISS retido do prestador${pct(c.issAliquota)}`}
            explicacao={
              c.iss > 0
                ? "Imposto municipal sobre o serviço, descontado do prestador. A entidade recolhe à prefeitura na guia ISS RPA."
                : "Sem retenção de ISS neste recibo (o prestador recolhe por conta própria ou o serviço é isento)."
            }
          />
          <Linha
            sinal="="
            forte
            valor={c.bruto}
            rotulo="Valor bruto do serviço"
            explicacao="O valor do recibo: o que o prestador ganhou antes dos descontos. Os impostos acima saem dele, não da entidade."
          />
          <Linha
            sinal="+"
            valor={c.patronal}
            rotulo={`INSS patronal da entidade${pct(c.patronalAliquota)}`}
            explicacao={`Encargo da própria entidade sobre o bruto. Não é descontado do prestador: é um custo a mais, recolhido na mesma guia INSS RPA.${c.patronalRegistrado ? "" : " (Previsto — fica registrado quando a ordem for paga.)"}`}
          />
          <Linha
            sinal="="
            forte
            destaque
            valor={c.custoTotal}
            rotulo="Custo total para a entidade"
            explicacao="Bruto + INSS patronal: o que este serviço realmente custa."
          />
        </tbody>
      </table>

      <p className="text-muted-foreground mt-3 text-xs">
        {pago ? (
          <>
            A ordem foi paga em {formatarData(c.dataPagamento)}: os impostos acima já estão nas guias da competência{" "}
            <strong>{competencia}</strong> em Financeiro › Tributos (INSS RPA, IRRF RPA e ISS RPA), que vencem no mês
            seguinte. A entidade paga o líquido agora e os impostos depois, pelas guias.
          </>
        ) : (
          <>
            Quando a ordem for paga, os impostos acima entram nas guias do mês do pagamento em Financeiro › Tributos (INSS
            RPA, IRRF RPA e ISS RPA), que vencem no mês seguinte. A entidade paga o líquido ao prestador e os impostos
            depois, pelas guias.
          </>
        )}
      </p>
    </div>
  )
}

function Linha({
  sinal,
  rotulo,
  explicacao,
  valor,
  forte,
  destaque,
}: {
  sinal?: "+" | "="
  rotulo: string
  explicacao: string
  valor: number
  forte?: boolean
  destaque?: boolean
}) {
  return (
    <tr className={sinal === "=" ? "border-t" : undefined}>
      <td className="text-muted-foreground w-5 py-1.5 align-top font-mono">{sinal ?? ""}</td>
      <td className="py-1.5 pr-3 align-top">
        <span className={forte ? "font-medium" : undefined}>{rotulo}</span>
        <span className="text-muted-foreground block text-xs">{explicacao}</span>
      </td>
      <td
        className={`py-1.5 text-right align-top whitespace-nowrap tabular-nums ${forte ? "font-semibold" : ""} ${destaque ? "text-primary" : ""}`}
      >
        {formatarMoeda(valor)}
      </td>
    </tr>
  )
}
