import type { Metadata } from "next"
import Link from "next/link"
import { FileSignature, Gavel, ListChecks, Scale } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CartaoArea } from "@/components/cartao-area"
import { requirePermissao } from "@/lib/auth"
import {
  contarReembolsosAguardando,
  indicadoresHomologacoes,
  indicadoresProcessos,
} from "@/lib/db/juridico"

export const metadata: Metadata = { title: "Jurídico — Confluir" }

export default async function JuridicoPage() {
  await requirePermissao("juridico_geral", [
    "juridico_gestao",
    "juridico_homologacoes",
  ])

  const [ind, proc, reembolsosAguardando] = await Promise.all([
    indicadoresHomologacoes(),
    indicadoresProcessos(),
    contarReembolsosAguardando(),
  ])
  const maiorMotivo = Math.max(1, ...ind.porMotivo.map((m) => m.total))

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jurídico</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Homologações de rescisão trabalhista e processos
          </p>
        </div>
        <Button asChild>
          <Link href="/painel/juridico/homologacoes">
            <FileSignature />
            Ver homologações
          </Link>
        </Button>
      </div>

      {ind.total === 0 && (
        <Alert variant="warning">
          <AlertDescription>
            Nenhuma homologação encontrada — se a listagem também estiver vazia,
            rode <code>supabase/juridico.sql</code> no SQL Editor do Supabase.
          </AlertDescription>
        </Alert>
      )}

      {reembolsosAguardando > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            <strong>{reembolsosAguardando.toLocaleString("pt-BR")}</strong>{" "}
            {reembolsosAguardando === 1
              ? "reembolso aguardando aprovação"
              : "reembolsos aguardando aprovação"}
            .{" "}
            <Link
              href="/painel/juridico/reembolsos"
              className="font-medium underline"
            >
              Ver a fila
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* Indicadores — Homologações */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          rotulo="Homologações"
          valor={ind.total}
          href="/painel/juridico/homologacoes"
        />
        <Indicador
          rotulo={`Em ${ind.ano}`}
          valor={ind.noAno}
          href={`/painel/juridico/homologacoes?ano=${ind.ano}`}
        />
        <Indicador
          rotulo="De não-filiados"
          valor={ind.naoFiliados}
          detalhe={pct(ind.naoFiliados, ind.total)}
          href="/painel/juridico/homologacoes?filiacao=nao_filiados"
        />
        <Indicador
          rotulo="De filiados"
          valor={ind.total - ind.naoFiliados}
          detalhe={pct(ind.total - ind.naoFiliados, ind.total)}
          href="/painel/juridico/homologacoes?filiacao=filiados"
        />
      </div>

      {/* Indicadores — Processos */}
      {proc.disponivel && proc.total > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Indicador
            rotulo="Processos"
            valor={proc.total}
            href="/painel/juridico/processos"
          />
          <Indicador
            rotulo="Em andamento"
            valor={proc.emAndamento}
            href="/painel/juridico/processos?andamento=abertos"
          />
          <Indicador
            rotulo="Finalizados"
            valor={proc.finalizados}
            href="/painel/juridico/processos?andamento=finalizados"
          />
          <Indicador
            rotulo="Coletivos"
            valor={proc.coletivos}
            href="/painel/juridico/processos?natureza=coletivo"
          />
        </div>
      )}

      {/* Áreas do módulo */}
      <div>
        <h2 className="mb-3 text-sm font-medium">Áreas</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CardArea
            icone={FileSignature}
            titulo="Homologações"
            descricao="Rescisões trabalhistas homologadas pelo sindicato"
            indicador={`${ind.total.toLocaleString("pt-BR")} ${ind.total === 1 ? "registro" : "registros"}`}
            href="/painel/juridico/homologacoes"
          />
          <CardArea
            icone={Gavel}
            titulo="Processos"
            descricao="Ações judiciais acompanhadas pelo sindicato"
            indicador={
              !proc.disponivel
                ? "Configurar"
                : `${proc.total.toLocaleString("pt-BR")} ${proc.total === 1 ? "processo" : "processos"}`
            }
            href="/painel/juridico/processos"
          />
        </div>
      </div>

      {/* Distribuição por motivo */}
      {ind.porMotivo.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent>
              <p className="mb-3 flex items-center gap-2 text-sm font-medium">
                <ListChecks className="text-muted-foreground size-4" />
                Homologações por motivo
              </p>
              <ul className="grid gap-2">
                {ind.porMotivo.map((m) => (
                  <li key={m.motivo} className="grid gap-1">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <Link
                        href={`/painel/juridico/homologacoes?motivo=${encodeURIComponent(m.motivo)}`}
                        className="line-clamp-1 hover:underline"
                      >
                        {m.motivo}
                      </Link>
                      <span className="text-muted-foreground tabular-nums">
                        {m.total.toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <div
                      className="bg-muted h-1.5 overflow-hidden rounded-full"
                      role="presentation"
                    >
                      <div
                        className="bg-primary h-full rounded-full"
                        style={{ width: `${(m.total / maiorMotivo) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}

function pct(parte: number, total: number): string | undefined {
  if (!total) return undefined
  return `${((parte / total) * 100).toFixed(1).replace(".", ",")}% do total`
}

function Indicador({
  rotulo,
  valor,
  detalhe,
  href,
}: {
  rotulo: string
  valor: number | string
  detalhe?: string
  href?: string
}) {
  const conteudo = (
    <CardContent>
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {typeof valor === "number" ? valor.toLocaleString("pt-BR") : valor}
      </p>
      {detalhe && (
        <p className="text-muted-foreground mt-0.5 text-xs">{detalhe}</p>
      )}
    </CardContent>
  )
  if (!href) return <Card>{conteudo}</Card>
  return (
    <Link href={href} className="group">
      <Card className="group-hover:border-primary/40 h-full transition-colors">
        {conteudo}
      </Card>
    </Link>
  )
}

function CardArea({
  icone,
  titulo,
  descricao,
  indicador,
  href,
  emBreve,
}: {
  icone: typeof Scale
  titulo: string
  descricao: string
  indicador: string
  href?: string
  emBreve?: boolean
}) {
  return (
    <CartaoArea
      icone={icone}
      titulo={titulo}
      descricao={descricao}
      indicador={indicador}
      href={href}
      emBreve={emBreve}
    />
  )
}
