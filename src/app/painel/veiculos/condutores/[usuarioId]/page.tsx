import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, IdCard, Pencil } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Params } from "@/components/veiculos-condutor/filtros"
import { PainelCondutor } from "@/components/veiculos-condutor/painel-condutor"
import { requirePermissao } from "@/lib/auth"
import { indicadoresDoCondutor, perfilDoCondutor } from "@/lib/db/veiculos-condutor"
import { historicoDeCnh } from "@/lib/db/veiculos-condutores-cnh"
import { formatarData } from "@/lib/formato"

export const metadata: Metadata = { title: "Condutor — Confluir" }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function CondutorPage({
  params,
  searchParams,
}: {
  params: Promise<{ usuarioId: string }>
  searchParams: Promise<Params>
}) {
  await requirePermissao("veiculos_gestao")
  const { usuarioId } = await params
  if (!UUID.test(usuarioId)) notFound()
  const sp = await searchParams
  const [perfil, ind] = await Promise.all([perfilDoCondutor(usuarioId), indicadoresDoCondutor(usuarioId)])
  if (!perfil) notFound()

  const cad = perfil.cadastro
  const cnhs = cad ? await historicoDeCnh(cad.id) : []

  return (
    <>
      <RotuloTrilha valores={{ [usuarioId]: perfil.nome }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/veiculos/condutores">
            <ArrowLeft />
            Condutores
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{perfil.nome}</h1>
              {!cad ? (
                <Badge variant="outline" className="text-muted-foreground">
                  Sem cadastro de condutor
                </Badge>
              ) : !cad.autorizado ? (
                <Badge variant="outline" className="text-muted-foreground">
                  Não autorizado
                </Badge>
              ) : cad.cnhVencida ? (
                <Badge variant="outline" className="border-destructive/40 text-destructive">
                  CNH vencida
                </Badge>
              ) : (
                <Badge variant="outline" className="border-success/40 text-success-fg">
                  Apto
                </Badge>
              )}
              {ind.emUso > 0 && (
                <Badge variant="outline" className="border-warning/40 text-warning-fg">
                  Com veículo agora
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1">
                <IdCard className="size-3.5" />
                {cad?.cnh_numero ? `CNH ${cad.cnh_numero}` : "CNH não informada"}
                {cad?.cnh_categoria ? ` · categoria ${cad.cnh_categoria}` : ""}
                {cad?.cnh_validade ? ` · validade ${formatarData(cad.cnh_validade)}` : ""}
              </span>
              {cad?.autorizado && cad.autorizadoPorNome && (
                <span>
                  autorizado por {cad.autorizadoPorNome}
                  {cad.autorizado_em ? ` em ${formatarData(cad.autorizado_em)}` : ""}
                </span>
              )}
              {perfil.email && <span>{perfil.email}</span>}
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/painel/veiculos/condutores">
              <Pencil />
              {cad ? "Atualizar CNH" : "Cadastrar condutor"}
            </Link>
          </Button>
        </div>
      </div>

      {sp.unificado === "1" && (
        <Alert variant="success">
          <AlertDescription>
            Cadastros unificados: este é o cadastro do condutor, com a CNH mais recente, e os lançamentos da outra conta
            já aparecem aqui.
          </AlertDescription>
        </Alert>
      )}

      {cnhs.length > 0 && (
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Histórico de CNH <span className="text-muted-foreground font-normal">({cnhs.length} anterior{cnhs.length === 1 ? "" : "es"})</span>
          </summary>
          <ul className="mt-3 grid gap-2">
            {cnhs.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="tabular-nums">CNH {h.numero ?? "—"}</span>
                {h.categoria && <span className="text-muted-foreground">categoria {h.categoria}</span>}
                <span className={h.vencida ? "text-muted-foreground" : ""}>validade {formatarData(h.validade)}</span>
                <Badge variant="outline" className="text-xs">
                  {h.origem === "unificacao" ? `veio da unificação${h.origemEmail ? ` (${h.origemEmail})` : ""}` : "substituída na renovação"}
                </Badge>
                <span className="text-muted-foreground text-xs">
                  {formatarData(h.registradoEm)}
                  {h.registradoPor ? ` · por ${h.registradoPor}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <PainelCondutor
        usuarioId={usuarioId}
        base={`/painel/veiculos/condutores/${usuarioId}`}
        ind={ind}
        params={sp}
        links={{ veiculos: true, gestao: true }}
      />
    </>
  )
}
