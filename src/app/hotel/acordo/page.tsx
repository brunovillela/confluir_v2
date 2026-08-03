import type { Metadata } from "next"

import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requireSessaoHotel } from "@/lib/auth"
import { listarTarifas } from "@/lib/db/hospedagem"
import { formatarData, formatarMoeda } from "@/lib/formato"

import { HotelShell } from "../hotel-shell"

export const metadata: Metadata = { title: "Acordo e orientações — Confluir" }

const FAQ = [
  {
    p: "O que é o cupom de hospedagem?",
    r: "É a autorização de subsídio emitida pelo sindicato ao filiado. A retirada do cupom NÃO garante reserva nem serviço — a reserva só existe quando o hotel registra o serviço vinculando os cupons.",
  },
  {
    p: "Como registro uma reserva (serviço)?",
    r: "Em Início → Registrar reserva: escolha o período, marque se o quarto é individual ou coletivo e selecione os cupons dos hóspedes. O sistema aplica automaticamente a tarifa acordada para a quantidade de pessoas no quarto.",
  },
  {
    p: "Quais as regras do quarto coletivo?",
    r: "Quarto coletivo só com hóspedes do MESMO sexo (informado no cupom) e que aceitaram quarto coletivo ao retirar o cupom. Mesmo aceitando coletivo, a tarifa de cada hóspede é a da quantidade efetiva de pessoas no quarto, conforme a reserva.",
  },
  {
    p: "Como funciona o comparecimento?",
    r: "Na página da reserva, marque “Compareceu” para cada hóspede que se apresentou. O comparecimento registrado é o que torna o serviço faturável.",
  },
  {
    p: "O que é o relatório/extrato da reserva?",
    r: "Documento emitido pelo hotel e assinado pelos hóspedes que usaram o serviço. Hoje não é obrigatório, mas ajuda muito na conferência — envie o PDF na página da reserva. O sindicato pode passar a exigi-lo para o faturamento.",
  },
  {
    p: "Como recebo os subsídios?",
    r: "Em Faturamento → Nova fatura: selecione os serviços com comparecimento registrado, suba a DANFE em PDF no valor total do subsídio e escolha a forma de recebimento (Pix, Pix QR Code, depósito/TED ou boleto). O sistema gera a ordem de pagamento para o sindicato, com carência mínima de 4 dias no vencimento.",
  },
  {
    p: "E os impostos?",
    r: "Pelo acordo, todos os valores já contêm impostos inclusos: tanto a parte do hóspede (filiado), paga no ato da entrada do serviço, quanto o valor faturado ao sindicato. Não acrescente impostos na DANFE nem na cobrança do hóspede.",
  },
]

export default async function AcordoPage() {
  const { hotel } = await requireSessaoHotel()
  const tarifas = await listarTarifas(hotel.id)

  const inicio = hotel.acordo_vigencia_inicio ?? null
  const fim = hotel.acordo_vigencia_fim ?? null

  return (
    <HotelShell nomeHotel={hotel.nome ?? "Hotel parceiro"}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Acordo e orientações
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Tabela de preços do convênio, vigência do acordo e orientações de uso.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vigência do acordo</CardTitle>
        </CardHeader>
        <CardContent>
          {inicio || fim ? (
            <p className="text-sm">
              De <span className="font-medium">{formatarData(inicio)}</span> até{" "}
              <span className="font-medium">{formatarData(fim)}</span>
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              Vigência não registrada — confirme com o sindicato.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tabela de preços</CardTitle>
          <CardDescription>
            A tarifa de cada hóspede é a da quantidade efetiva de pessoas no
            quarto, conforme a reserva registrada.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Pessoas por quarto</TableHead>
                  <TableHead className="text-right">
                    Parte do hóspede (paga na entrada)
                  </TableHead>
                  <TableHead className="text-right">
                    Subsídio da entidade (faturado)
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tarifas.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-muted-foreground h-20 text-center text-sm"
                    >
                      Nenhuma tarifa cadastrada — fale com o sindicato.
                    </TableCell>
                  </TableRow>
                )}
                {tarifas.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="tabular-nums">
                      {t.pessoas_por_quarto ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatarMoeda(t.custo_por_filiado)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatarMoeda(t.custo_entidade)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Alert>
            <AlertDescription>
              Todos os valores da tabela já contêm impostos inclusos — tanto a
              parte do hóspede, paga no ato da entrada, quanto o valor faturado
              ao sindicato. Não acrescente impostos.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Perguntas e respostas</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {FAQ.map((item) => (
            <details key={item.p} className="group rounded-lg border px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium select-none">
                {item.p}
              </summary>
              <p className="text-muted-foreground mt-2 text-sm">{item.r}</p>
            </details>
          ))}
        </CardContent>
      </Card>
    </HotelShell>
  )
}
