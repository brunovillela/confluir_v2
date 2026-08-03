import type { Metadata } from "next"
import Link from "next/link"
import {
  Building2,
  CalendarDays,
  ClipboardList,
  HeartPulse,
  MapPin,
  ShieldCheck,
  Siren,
  Stethoscope,
  TriangleAlert,
  Users,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CartaoArea } from "@/components/cartao-area"
import { requirePermissao } from "@/lib/auth"
import { contagensAtendimento } from "@/lib/db/atendimentos"
import { resumoSaude } from "@/lib/db/saude"
import { formatarData } from "@/lib/formato"

export const metadata: Metadata = { title: "Saúde — Confluir" }

export default async function SaudePage() {
  await requirePermissao("saude_cat", ["saude_atendimento", "saude_gestao"])

  const [
    resumo,
    { atendimentos, assistidos, agendamentos, profissionais, cipa },
  ] = await Promise.all([resumoSaude(), contagensAtendimento()])
  const maiorAno = Math.max(1, ...resumo.porAno.map((a) => a.total))

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Saúde</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Comunicações de acidente de trabalho, atendimentos e CIPA
          </p>
        </div>
        <Button asChild>
          <Link href="/painel/saude/cat">
            <ClipboardList />
            Ver CATs
          </Link>
        </Button>
      </div>

      {!resumo.disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            A tabela de CATs ainda não está disponível — rode{" "}
            <code>supabase/saude-cat-schema.sql</code> no SQL Editor do Supabase.
          </AlertDescription>
        </Alert>
      )}

      {/* Indicadores macro */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          rotulo="CATs registradas"
          valor={resumo.total}
          href="/painel/saude/cat"
        />
        <Indicador
          rotulo="Com afastamento"
          valor={resumo.comAfastamento}
          detalhe={pct(resumo.comAfastamento, resumo.total)}
          href="/painel/saude/cat?afastamento=sim"
        />
        <Indicador
          rotulo="Com internação"
          valor={resumo.comInternacao}
          detalhe={pct(resumo.comInternacao, resumo.total)}
          href="/painel/saude/cat?internacao=sim"
        />
        <Indicador
          rotulo="Óbitos"
          valor={resumo.obitos}
          destaque={resumo.obitos > 0}
          href="/painel/saude/cat?obito=sim"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador rotulo="Empresas envolvidas" valor={resumo.empregadores} />
        <Indicador
          rotulo="Acidente mais recente"
          valor={resumo.ultimoAcidente ? formatarData(resumo.ultimoAcidente) : "—"}
        />
        {resumo.porTipo.slice(0, 2).map((t) => (
          <Indicador
            key={t.rotulo}
            rotulo={t.rotulo}
            valor={t.total}
            detalhe={pct(t.total, resumo.total)}
          />
        ))}
      </div>

      {resumo.aRevisar > 0 && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertDescription>
            <strong>{resumo.aRevisar.toLocaleString("pt-BR")}</strong> CATs vieram
            da migração com a descrição truncada e sem o código oficial dos
            campos 31, 32, 34 e 45. O texto foi preservado como estava na
            origem — nada foi inferido.{" "}
            <Link
              href="/painel/saude/cat?revisao=truncadas"
              className="font-medium underline"
            >
              Ver os registros
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* Áreas do módulo */}
      <div>
        <h2 className="mb-3 text-sm font-medium">Áreas</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CardArea
            icone={ClipboardList}
            titulo="CAT"
            descricao="Comunicações de acidente de trabalho"
            indicador={`${resumo.total.toLocaleString("pt-BR")} registros`}
            href="/painel/saude/cat"
          />
          <CardArea
            icone={Stethoscope}
            titulo="Atendimentos"
            descricao="Registro de atendimentos e relatório clínico"
            indicador={
              atendimentos === null
                ? "Configurar"
                : `${atendimentos.toLocaleString("pt-BR")} ${atendimentos === 1 ? "registro" : "registros"}`
            }
            href="/painel/saude/atendimentos"
          />
          <CardArea
            icone={Users}
            titulo="Assistidos"
            descricao="Pessoas acompanhadas pelo serviço"
            indicador={
              assistidos === null
                ? "Configurar"
                : `${assistidos.toLocaleString("pt-BR")} ${assistidos === 1 ? "cadastro" : "cadastros"}`
            }
            href="/painel/saude/assistidos"
          />
          <CardArea
            icone={CalendarDays}
            titulo="Agenda"
            descricao="Atendimentos agendados"
            indicador={
              agendamentos === null
                ? "Configurar"
                : `${agendamentos.toLocaleString("pt-BR")} ${agendamentos === 1 ? "agendamento" : "agendamentos"}`
            }
            href="/painel/saude/agenda"
          />
          <CardArea
            icone={Stethoscope}
            titulo="Profissionais e tipos"
            descricao="Quem atende, de qual especialidade"
            indicador={
              profissionais === null
                ? "Configurar"
                : `${profissionais.toLocaleString("pt-BR")} ${profissionais === 1 ? "profissional" : "profissionais"}`
            }
            href="/painel/saude/profissionais"
          />
          <CardArea
            icone={ShieldCheck}
            titulo="CIPA"
            descricao="Reuniões nas empresas, representação e pauta"
            indicador={
              cipa === null
                ? "Configurar"
                : `${cipa.toLocaleString("pt-BR")} ${cipa === 1 ? "convite" : "convites"}`
            }
            href="/painel/saude/cipa"
          />
        </div>
      </div>

      {/* Distribuições */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardContent>
            <p className="mb-3 flex items-center gap-2 text-sm font-medium">
              <CalendarDays className="text-muted-foreground size-4" />
              Acidentes por ano
            </p>
            {resumo.porAno.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sem dados.</p>
            ) : (
              <ul className="grid gap-2">
                {resumo.porAno.map((a) => (
                  <li key={a.ano} className="grid gap-1">
                    <div className="flex items-baseline justify-between text-sm">
                      <Link
                        href={`/painel/saude/cat?ano=${a.ano}`}
                        className="tabular-nums hover:underline"
                      >
                        {a.ano}
                      </Link>
                      <span className="text-muted-foreground tabular-nums">
                        {a.total.toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <div
                      className="bg-muted h-1.5 overflow-hidden rounded-full"
                      role="presentation"
                    >
                      <div
                        className="bg-primary h-full rounded-full"
                        style={{ width: `${(a.total / maiorAno) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <ListaTop
          icone={Building2}
          titulo="Empresas com mais CATs"
          itens={resumo.topEmpregadores}
          href={(nome) => `/painel/saude/cat?busca=${encodeURIComponent(nome)}`}
        />
        <ListaTop
          icone={MapPin}
          titulo="Municípios com mais CATs"
          itens={resumo.topMunicipios}
          href={(nome) => `/painel/saude/cat?municipio=${encodeURIComponent(nome)}`}
        />
      </div>
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
  destaque,
}: {
  rotulo: string
  valor: number | string
  detalhe?: string
  href?: string
  destaque?: boolean
}) {
  const conteudo = (
    <CardContent>
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${destaque ? "text-warning-fg" : ""}`}
      >
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
  icone: typeof HeartPulse
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

function ListaTop({
  icone: Icone,
  titulo,
  itens,
  href,
}: {
  icone: typeof Siren
  titulo: string
  itens: { nome: string; total: number }[]
  href: (nome: string) => string
}) {
  return (
    <Card>
      <CardContent>
        <p className="mb-3 flex items-center gap-2 text-sm font-medium">
          <Icone className="text-muted-foreground size-4" />
          {titulo}
        </p>
        {itens.length === 0 ? (
          <p className="text-muted-foreground text-sm">Sem dados.</p>
        ) : (
          <ul className="grid gap-1.5">
            {itens.map((i) => (
              <li
                key={i.nome}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <Link href={href(i.nome)} className="line-clamp-1 hover:underline">
                  {i.nome}
                </Link>
                <span className="text-muted-foreground tabular-nums">
                  {i.total.toLocaleString("pt-BR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
