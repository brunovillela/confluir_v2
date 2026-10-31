import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { empresasParaSelecao } from "@/lib/db/cipa-apoio"
import { espacosParaRegistro } from "@/lib/db/espacos-solicitacao"
import { tenantAtual } from "@/lib/tenant"

import { RegistroForm } from "./registro-form"

export const metadata: Metadata = { title: "Registrar pedido de uso — Confluir" }

/**
 * O pedido que chega por telefone, ofício, balcão ou WhatsApp — ou a cessão
 * interna — registrado pela equipe. Sem código de e-mail: quem registra está
 * logado e fica na trilha.
 */
export default async function RegistrarPedidoPage({
  searchParams,
}: {
  searchParams: Promise<{ espaco?: string }>
}) {
  await requirePermissao("espacos", ["espacos_gestao"])
  const { espaco } = await searchParams
  const [espacos, empresas] = await Promise.all([
    espacosParaRegistro(await tenantAtual()),
    empresasParaSelecao(),
  ])

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/painel/espacos/pedidos" aria-label="Voltar para os pedidos">
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Registrar pedido de uso</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Para o pedido que chegou por telefone, ofício, balcão ou WhatsApp, ou
            para uma cessão interna
          </p>
        </div>
      </div>

      {espacos.length === 0 ? (
        <Alert variant="warning">
          <AlertDescription>
            Nenhum espaço ativo. Cadastre um espaço em{" "}
            <Link href="/painel/espacos" className="underline">
              Cessão de espaços
            </Link>{" "}
            antes de registrar pedidos.
          </AlertDescription>
        </Alert>
      ) : (
        <RegistroForm espacos={espacos} empresas={empresas} espacoInicial={espaco} />
      )}
    </>
  )
}
