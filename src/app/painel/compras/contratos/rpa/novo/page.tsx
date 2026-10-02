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
import {
  compraDoRpa,
  comprasParaRpa,
  contratoDoRpa,
  contratosParaRpa,
  obterConfigRpa,
} from "@/lib/db/compras-rpa"
import { formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import { cn } from "@/lib/utils"

import { RpaNovoForm } from "../rpa-forms"

export const metadata: Metadata = { title: "Novo RPA — Confluir" }

const SELECT_CLS =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/**
 * O RPA nasce de um CONTRATO (o prestador é o fornecedor dele) ou de uma
 * COMPRA DE SERVIÇO (`?fornecimento=`: prestador, serviço, departamento,
 * centro de custo e valor vêm da compra; falta só o pagamento). Sem nenhum
 * dos dois, pede o contrato ou lista as compras de serviço aguardando RPA.
 * O RPA avulso saiu em 02/10/2026: a porta de entrada dele é a compra.
 */
export default async function NovoRpaPage({
  searchParams,
}: {
  searchParams: Promise<{ contrato?: string; fornecimento?: string; modo?: string }>
}) {
  const sessao = await requirePermissao("aquisicoes_contratos_edicao", [
    "aquisicoes_compras_edicao",
    "aquisicoes_comprador",
    "aquisicoes_compra_direta",
  ])
  const editaContratos = podeAcessar(sessao.permissoes, "aquisicoes_contratos_edicao")
  const { contrato: contratoId, fornecimento: fornecimentoId, modo } = await searchParams
  const compra = fornecimentoId ? await compraDoRpa(fornecimentoId) : null
  const abaCompra = Boolean(fornecimentoId) || modo === "compra" || !editaContratos
  const contrato = !abaCompra && contratoId ? await contratoDoRpa(contratoId) : null

  const voltar = compra
    ? { href: `/painel/compras/${compra.processoId}`, rotulo: compra.processoCodigo ?? "Compra" }
    : contrato
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
          Recibo de pagamento a autônomo (pessoa física): de um contrato com ele ou de uma compra
          de serviço. O recibo gera a ordem de pagamento do valor líquido.
        </p>
      </div>

      {!contrato && !compra && editaContratos && <EscolherModo daCompra={abaCompra} />}

      {fornecimentoId ? (
        !compra ? (
          <Alert variant="warning" className="max-w-3xl">
            <AlertDescription>Compra não encontrada.</AlertDescription>
          </Alert>
        ) : compra.impedimento || compra.valor === null || !compra.fornecedorId ? (
          <Alert variant="warning" className="max-w-3xl">
            <AlertDescription>{compra.impedimento ?? "A compra está sem valor ou fornecedor."}</AlertDescription>
          </Alert>
        ) : (
          <CartaoRecibo>
            <RpaNovoForm
              contrato={null}
              compra={{
                fornecimentoId: compra.fornecimentoId,
                processoId: compra.processoId,
                processoCodigo: compra.processoCodigo,
                servico: compra.servico,
                valor: compra.valor,
                fornecedorId: compra.fornecedorId,
                fornecedorNome: compra.fornecedorNome,
              }}
              hoje={hojeLocalISO()}
              config={await obterConfigRpa()}
              caixas={await contasAbertasParaCompras()}
            />
          </CartaoRecibo>
        )
      ) : abaCompra ? (
        <EscolherCompra compras={await comprasParaRpa()} />
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
            compra={null}
            hoje={hojeLocalISO()}
            config={await obterConfigRpa()}
            caixas={await contasAbertasParaCompras()}
          />
        </CartaoRecibo>
      )}
    </>
  )
}

/** "De um contrato" × "De uma compra de serviço" — links, para o modo ficar no endereço. */
function EscolherModo({ daCompra }: { daCompra: boolean }) {
  const opcoes = [
    { href: "/painel/compras/contratos/rpa/novo", rotulo: "De um contrato", ativo: !daCompra },
    { href: "/painel/compras/contratos/rpa/novo?modo=compra", rotulo: "De uma compra de serviço", ativo: daCompra },
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

/** Compras de serviço com prestador pessoa física cujo fornecimento ainda não tem ordem. */
function EscolherCompra({ compras }: { compras: Awaited<ReturnType<typeof comprasParaRpa>> }) {
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle className="text-base">De qual compra de serviço?</CardTitle>
        <CardDescription>
          Aparecem as compras do tipo <strong>Prestação de serviço</strong> com prestador pessoa
          física (CPF) ainda sem ordem de pagamento. O serviço avulso, sem contrato, começa em{" "}
          <Link href="/painel/compras/nova" className="text-primary hover:underline">
            Nova compra
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent>
        {compras.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma compra de serviço aguardando RPA.</p>
        ) : (
          <ul className="divide-y">
            {compras.map((c) => (
              <li key={c.fornecimentoId}>
                <Link
                  href={`/painel/compras/contratos/rpa/novo?fornecimento=${c.fornecimentoId}`}
                  className="hover:bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-2.5 text-sm"
                >
                  <span className="min-w-0">
                    <span className="font-medium tabular-nums">{c.processoCodigo ?? "(sem código)"}</span>
                    <span className="text-muted-foreground"> — {c.servico ?? "(sem descrição)"}</span>
                    <span className="text-muted-foreground block text-xs">{c.fornecedorNome ?? "—"}</span>
                  </span>
                  <span className="flex items-center gap-2 tabular-nums">
                    {formatarMoeda(c.valor)}
                    <ArrowRight className="size-4" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
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
          Aparecem os contratos com prestador pessoa física. Serviço pontual, sem contrato? Ele
          entra como compra de serviço — aba <strong>De uma compra de serviço</strong>.
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
