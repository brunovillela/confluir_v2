import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ArrowRight } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { requirePermissao } from "@/lib/auth"
import { hojeLocalISO } from "@/lib/compras-constantes"
import { contratoDoRpa, contratosParaRpa, obterConfigRpa } from "@/lib/db/compras-rpa"

import { RpaNovoForm } from "../rpa-forms"

export const metadata: Metadata = { title: "Novo RPA — Confluir" }

const SELECT_CLS =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/**
 * O RPA é uma forma de pagamento de um contrato: sempre nasce de um. Com
 * `?contrato=`, abre o recibo; sem, pede o contrato (só os de prestador
 * pessoa física).
 */
export default async function NovoRpaPage({
  searchParams,
}: {
  searchParams: Promise<{ contrato?: string }>
}) {
  await requirePermissao("aquisicoes_contratos_edicao")
  const { contrato: contratoId } = await searchParams
  const contrato = contratoId ? await contratoDoRpa(contratoId) : null

  const voltar = contrato
    ? { href: `/painel/compras/contratos/${contrato.id}`, rotulo: contrato.codigo ?? "Contrato" }
    : { href: "/painel/compras/contratos/rpa", rotulo: "RPAs" }

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href={voltar.href}>
            <ArrowLeft />
            {voltar.rotulo}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Novo RPA</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          O RPA é uma forma de pagamento de um contrato com autônomo: o prestador é o fornecedor
          do contrato, e o recibo gera a ordem de pagamento do valor líquido.
        </p>
      </div>

      {!contrato ? (
        <EscolherContrato contratos={await contratosParaRpa()} naoAchado={Boolean(contratoId)} />
      ) : !contrato.fornecedorId || contrato.fornecedorPessoaJuridica ? (
        <Alert variant="warning" className="max-w-3xl">
          <AlertDescription>
            {contrato.fornecedorId
              ? `O fornecedor deste contrato (${contrato.fornecedorNome ?? "sem nome"}) é pessoa jurídica — RPA é só para autônomo (pessoa física). Pague pelas ordens do contrato.`
              : "Este contrato não tem fornecedor. Defina o prestador no contrato antes de emitir o RPA."}
          </AlertDescription>
        </Alert>
      ) : (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle className="text-base">Dados do recibo</CardTitle>
            <CardDescription>
              Informe o valor bruto (o sistema calcula as retenções e o líquido) ou o líquido
              combinado (a conta inversa acha o bruto). As retenções usam as tabelas da área de
              RPA — confira se estão atualizadas para o ano.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RpaNovoForm
              contrato={{
                id: contrato.id,
                codigo: contrato.codigo,
                objeto: contrato.objeto,
                fornecedorNome: contrato.fornecedorNome,
              }}
              hoje={hojeLocalISO()}
              config={await obterConfigRpa()}
            />
          </CardContent>
        </Card>
      )}
    </>
  )
}

function EscolherContrato({
  contratos,
  naoAchado,
}: {
  contratos: Awaited<ReturnType<typeof contratosParaRpa>>
  naoAchado: boolean
}) {
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle className="text-base">De qual contrato?</CardTitle>
        <CardDescription>
          Aparecem os contratos com prestador pessoa física. Para um serviço avulso de autônomo,
          cadastre antes um contrato simples com ele.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {naoAchado && (
          <Alert variant="warning" className="mb-4">
            <AlertDescription>Contrato não encontrado.</AlertDescription>
          </Alert>
        )}
        {contratos.length === 0 ? (
          <div className="grid gap-3 text-sm">
            <p className="text-muted-foreground">
              Nenhum contrato com prestador pessoa física.
            </p>
            <div>
              <Button asChild variant="outline" size="sm">
                <Link href="/painel/compras/contratos/novo">Cadastrar contrato</Link>
              </Button>
            </div>
          </div>
        ) : (
          <form action="/painel/compras/contratos/rpa/novo" className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="contrato">Contrato *</Label>
              <select id="contrato" name="contrato" required defaultValue="" className={SELECT_CLS}>
                <option value="" disabled>
                  Escolha o contrato…
                </option>
                {contratos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {[c.codigo, c.objeto].filter(Boolean).join(" — ") || "(sem código)"} ·{" "}
                    {c.fornecedorNome ?? "sem fornecedor"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Button type="submit">
                Continuar
                <ArrowRight />
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
