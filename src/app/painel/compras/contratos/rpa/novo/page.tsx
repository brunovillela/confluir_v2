import type { Metadata } from "next"
import type { ReactNode } from "react"
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
import { contasAbertasParaCompras } from "@/lib/db/caixa"
import { listarCentrosCustoParaCompra, listarDepartamentos } from "@/lib/db/compras"
import {
  contratoDoRpa,
  contratosParaRpa,
  obterConfigRpa,
  prestadoresParaRpa,
} from "@/lib/db/compras-rpa"
import { cn } from "@/lib/utils"

import { RpaNovoForm } from "../rpa-forms"

export const metadata: Metadata = { title: "Novo RPA — Confluir" }

const SELECT_CLS =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/**
 * O RPA nasce de um contrato (o prestador é o fornecedor dele) ou AVULSO
 * (`?modo=avulso`: escolhe o prestador pessoa física e a classificação da
 * despesa). Com `?contrato=`, abre o recibo do contrato; sem, pede o contrato
 * (só os de prestador pessoa física).
 */
export default async function NovoRpaPage({
  searchParams,
}: {
  searchParams: Promise<{ contrato?: string; modo?: string }>
}) {
  await requirePermissao("aquisicoes_contratos_edicao")
  const { contrato: contratoId, modo } = await searchParams
  const avulso = modo === "avulso" && !contratoId
  const contrato = !avulso && contratoId ? await contratoDoRpa(contratoId) : null

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
          Recibo de pagamento a autônomo (pessoa física): de um contrato com ele ou avulso. O
          recibo gera a ordem de pagamento do valor líquido.
        </p>
      </div>

      {!contrato && <EscolherModo avulso={avulso} />}

      {avulso ? (
        <CartaoRecibo>
          <FormAvulso />
        </CartaoRecibo>
      ) : !contrato ? (
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
        <CartaoRecibo>
          <RpaNovoForm
            contrato={{
              id: contrato.id,
              codigo: contrato.codigo,
              objeto: contrato.objeto,
              fornecedorId: contrato.fornecedorId,
              fornecedorNome: contrato.fornecedorNome,
            }}
            avulso={null}
            hoje={hojeLocalISO()}
            config={await obterConfigRpa()}
            caixas={await contasAbertasParaCompras()}
          />
        </CartaoRecibo>
      )}
    </>
  )
}

/** "De um contrato" × "Avulso" — links, para o modo ficar no endereço. */
function EscolherModo({ avulso }: { avulso: boolean }) {
  const opcoes = [
    { href: "/painel/compras/contratos/rpa/novo", rotulo: "De um contrato", ativo: !avulso },
    { href: "/painel/compras/contratos/rpa/novo?modo=avulso", rotulo: "Avulso", ativo: avulso },
  ]
  return (
    <div className="bg-muted inline-flex w-fit gap-1 rounded-lg p-1" role="tablist">
      {opcoes.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          role="tab"
          aria-selected={o.ativo}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            o.ativo
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.rotulo}
        </Link>
      ))}
    </div>
  )
}

function CartaoRecibo({ children }: { children: ReactNode }) {
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle className="text-base">Dados do recibo</CardTitle>
        <CardDescription>
          Informe o valor bruto (o sistema calcula as retenções e o líquido) ou o líquido
          combinado (a conta inversa acha o bruto). As retenções usam as tabelas da área de
          RPA — confira se estão atualizadas para o ano.
        </CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/** RPA avulso: o que o contrato daria — prestador, departamento e centro de custo. */
async function FormAvulso() {
  const [prestadores, departamentos, centros, config, caixas] = await Promise.all([
    prestadoresParaRpa(),
    listarDepartamentos(),
    listarCentrosCustoParaCompra(),
    obterConfigRpa(),
    contasAbertasParaCompras(),
  ])
  return (
    <RpaNovoForm
      contrato={null}
      avulso={{
        prestadores: prestadores.map((p) => ({
          id: p.id,
          nome: p.nome,
          cnpj_cpf: p.cnpj_cpf,
          razao: p.nome_razao,
          bloqueado: p.bloqueado,
        })),
        departamentos,
        centros,
      }}
      hoje={hojeLocalISO()}
      config={config}
      caixas={caixas}
    />
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
          Aparecem os contratos com prestador pessoa física. Serviço pontual, sem contrato? Use a
          aba <strong>Avulso</strong>.
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
