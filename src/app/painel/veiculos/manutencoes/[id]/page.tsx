import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink, ShoppingCart } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { urlArquivoVeiculos } from "@/lib/db/veiculos"
import {
  hodometroAtual,
  obterManutencao,
} from "@/lib/db/veiculos-manutencoes"
import { formatarData, formatarMoeda } from "@/lib/formato"

export const metadata: Metadata = { title: "Manutenção — Confluir" }

function Linha({
  rotulo,
  valor,
}: {
  rotulo: string
  valor: React.ReactNode
}) {
  if (valor === null || valor === undefined || valor === "") return null
  return (
    <div className="grid gap-1">
      <span className="text-muted-foreground text-xs">{rotulo}</span>
      <span className="text-sm">{valor}</span>
    </div>
  )
}

export default async function ManutencaoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("veiculos", ["veiculos_gestao"])
  const { id } = await params
  const m = await obterManutencao(id)
  if (!m) notFound()

  const [nfUrl, kmAtual] = await Promise.all([
    urlArquivoVeiculos(m.nota_fiscal_url),
    hodometroAtual(m.veiculo_id),
  ])

  const hoje = new Date().toISOString().slice(0, 10)
  const garantiaPorData = m.garantia_ate !== null && m.garantia_ate >= hoje
  const garantiaPorKm =
    m.garantia_hodometro !== null &&
    kmAtual !== null &&
    kmAtual <= m.garantia_hodometro
  const emGarantia = garantiaPorData || garantiaPorKm
  const teveGarantia = m.garantia_ate !== null || m.garantia_hodometro !== null

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/veiculos/manutencoes">
            <ArrowLeft />
            Manutenções
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {m.veiculoRotulo ?? "Manutenção"}
          </h1>
          <Badge variant={m.tipo === "corretiva" ? "warning" : "secondary"}>
            {m.tipo === "corretiva" ? "Corretiva" : "Preventiva"}
          </Badge>
          {emGarantia && <Badge variant="success">em garantia</Badge>}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {formatarData(m.realizada_em)}
          {m.hodometro !== null
            ? ` · ${m.hodometro.toLocaleString("pt-BR")} km`
            : ""}
          {m.registradaPorNome ? ` · registrada por ${m.registradaPorNome}` : ""}
        </p>
      </div>

      {emGarantia && (
        <Alert variant="success">
          <AlertDescription>
            Serviço <strong>ainda em garantia</strong>
            {m.garantia_ate && garantiaPorData
              ? ` até ${formatarData(m.garantia_ate)}`
              : ""}
            {m.garantia_hodometro && garantiaPorKm
              ? `${m.garantia_ate && garantiaPorData ? " e" : ""} até ${m.garantia_hodometro.toLocaleString("pt-BR")} km`
              : ""}
            . Se o mesmo problema voltar, cobre a oficina antes de pagar de novo.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>O que foi feito</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm whitespace-pre-wrap">{m.descricao ?? "—"}</p>
          {m.planoDescricao && (
            <p className="text-muted-foreground text-xs">
              Cumpriu a programação: <strong>{m.planoDescricao}</strong>
            </p>
          )}
          {m.observacoes && (
            <div className="grid gap-1">
              <span className="text-muted-foreground text-xs">Observações</span>
              <p className="text-sm whitespace-pre-wrap">{m.observacoes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Onde e quanto</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Linha rotulo="Local" valor={m.local_nome} />
            <Linha
              rotulo="Valor"
              valor={m.valor !== null ? formatarMoeda(m.valor) : null}
            />
            <Linha rotulo="Nota fiscal" valor={m.nota_fiscal_numero} />
            {nfUrl && (
              <div>
                <Button asChild size="sm" variant="outline">
                  <a href={nfUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink />
                    Abrir nota fiscal
                  </a>
                </Button>
              </div>
            )}
            {m.compra_id && (
              <div>
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/painel/compras/${m.compra_id}`}>
                    <ShoppingCart />
                    Compra {m.compraCodigo ?? ""}
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {teveGarantia && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Garantia</CardTitle>
              <CardDescription>
                {emGarantia ? "Vigente." : "Já expirou."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Linha
                rotulo="Prazo"
                valor={
                  m.garantia_meses
                    ? `${m.garantia_meses} ${m.garantia_meses === 1 ? "mês" : "meses"}`
                    : null
                }
              />
              <Linha
                rotulo="Vence em"
                valor={m.garantia_ate ? formatarData(m.garantia_ate) : null}
              />
              <Linha
                rotulo="Quilometragem"
                valor={
                  m.garantia_km
                    ? `${m.garantia_km.toLocaleString("pt-BR")} km`
                    : null
                }
              />
              <Linha
                rotulo="Vale até o hodômetro"
                valor={
                  m.garantia_hodometro
                    ? `${m.garantia_hodometro.toLocaleString("pt-BR")} km${
                        kmAtual !== null
                          ? ` (hoje: ${kmAtual.toLocaleString("pt-BR")} km)`
                          : ""
                      }`
                    : null
                }
              />
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
