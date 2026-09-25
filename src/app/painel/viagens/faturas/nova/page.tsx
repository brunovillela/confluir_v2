import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { FORMAS_PAGAMENTO_COMPRAS } from "@/lib/compras-constantes"
import { listarDepartamentos, listarFornecedores } from "@/lib/db/compras"
import { centrosDeCustoDespesa } from "@/lib/db/diarias-config"
import { itensFaturaveis } from "@/lib/db/viagens-faturas"

import { FaturaForm } from "./fatura-form"

export const metadata: Metadata = { title: "Nova fatura de viagens — Confluir" }

export default async function NovaFaturaPage() {
  await requirePermissao("viagens_gestao")
  const [{ itens }, fornecedores, centros, departamentos] = await Promise.all([
    itensFaturaveis(),
    listarFornecedores(),
    centrosDeCustoDespesa(),
    listarDepartamentos(),
  ])
  const nomeDepto = new Map(departamentos.map((d) => [d.id, d.nome]))
  const semConta = itens.filter((i) => !i.contaSugerida).length

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/painel/viagens/faturas">
            <ArrowLeft />
            Faturas
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Nova fatura</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Suba a fatura da agência, marque os bilhetes e hospedagens que ela cobra e confira a
          conta de cada um. {itens.length} {itens.length === 1 ? "item aguarda" : "itens aguardam"}{" "}
          fatura.
        </p>
      </div>

      {semConta > 0 && (
        <Alert>
          <AlertDescription>
            {semConta} {semConta === 1 ? "item não tem" : "itens não têm"} conta no de-para — dá
            para escolher na linha, ou{" "}
            <Link
              href="/painel/pessoal/diarias/contas?quadro=convidado"
              className="font-medium underline-offset-4 hover:underline"
            >
              configurar as contas
            </Link>{" "}
            (passagem e hospedagem, por quadro e departamento).
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          <FaturaForm
            fornecedores={fornecedores.map((f) => ({
              id: f.id,
              nome: f.nome,
              cnpj_cpf: f.cnpj_cpf,
              bloqueado: f.bloqueado,
            }))}
            itens={itens.map((i) => ({
              itemId: i.itemId,
              viagemNumero: i.viagemNumero,
              beneficiarioNome: i.beneficiarioNome,
              tipo: i.tipo,
              modal: i.modal,
              descricao: i.descricao,
              fornecedorId: i.fornecedorId,
              localizador: i.localizador,
              valor: i.valor,
              contaSugerida: i.contaSugerida,
              departamentoNome: i.departamentoNome,
            }))}
            contas={centros.map((c) => ({
              id: c.id,
              nome: c.nome,
              classificador: c.classificador,
              grupo: c.departamentoId
                ? (nomeDepto.get(c.departamentoId) ?? "Outros")
                : "Sem departamento",
            }))}
            departamentos={departamentos}
            formas={FORMAS_PAGAMENTO_COMPRAS}
          />
        </CardContent>
      </Card>
    </>
  )
}
