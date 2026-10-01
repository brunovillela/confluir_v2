import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Building2, MapPin } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CartaoArea, GRADE_AREAS } from "@/components/cartao-area"
import { requirePermissao } from "@/lib/auth"
import {
  listarDepartamentosCompletos,
  pessoasParaDepartamento,
} from "@/lib/db/departamentos"
import {
  enderecoDaSede,
  listarSedes,
  obterOrganizacao,
  regrasFiliacao,
} from "@/lib/db/organizacao"
import { OPCOES_EXIGE_FONTE } from "@/lib/filiacao"
import { formatarCnpjCpf } from "@/lib/formato"

import { AbrirFormulario } from "./abrir-formulario"
import { DepartamentoForm } from "./departamento-forms"
import { OrganizacaoForm } from "./organizacao-forms"
import { RegrasFiliacaoForm } from "./regras-filiacao-form"

export const metadata: Metadata = { title: "Organização — Confluir" }

/**
 * Organização: os dados da entidade (lidos, com "Editar organização"), as
 * sedes e os departamentos em cartões na grade das áreas — cada um abre a
 * própria página (pedido do Bruno, 18/09/2026).
 */
export default async function OrganizacaoPage() {
  await requirePermissao("configuracoes")

  const [org, { disponivel, sedes }, departamentos, pessoas, regras] = await Promise.all([
    obterOrganizacao(),
    listarSedes(),
    listarDepartamentosCompletos(),
    pessoasParaDepartamento(),
    regrasFiliacao(),
  ])
  const regraAtual = OPCOES_EXIGE_FONTE.find((o) => (o.valor === "sim") === regras.exigeFonte)!
  const ativos = departamentos.filter((d) => !d.legado)
  const legados = departamentos.filter((d) => d.legado)

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/painel/institucional">
            <ArrowLeft />
            Institucional
          </Link>
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organização</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Identidade da entidade, sedes e departamentos
        </p>
      </div>

      <Card>
        <CardContent>
          <p className="mb-3 font-medium">Dados da organização</p>
          {org ? (
            <AbrirFormulario
              rotulo="Editar organização"
              resumo={
                <div className="flex flex-wrap items-start gap-5">
                  {org.logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={org.logoUrl}
                      alt={`Logo de ${org.nomeFantasia ?? org.nomeRazao ?? "a entidade"}`}
                      className="h-16 w-auto max-w-40 object-contain"
                    />
                  )}
                  <dl className="grid flex-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <Dado rotulo="Razão social" valor={org.nomeRazao} />
                    <Dado rotulo="Nome fantasia" valor={org.nomeFantasia} />
                    <Dado rotulo="CNPJ" valor={org.cnpjCpf ? formatarCnpjCpf(org.cnpjCpf) : null} />
                    <Dado rotulo="Site" valor={org.siteUrl} />
                    <Dado rotulo="E-mail de contato" valor={org.emailContato} />
                    <Dado rotulo="Página de notícias" valor={org.noticiasUrl} />
                  </dl>
                </div>
              }
            >
              <OrganizacaoForm
                dados={{
                  nomeRazao: org.nomeRazao,
                  nomeFantasia: org.nomeFantasia,
                  cnpjCpf: org.cnpjCpf,
                  siteUrl: org.siteUrl,
                  emailContato: org.emailContato,
                  noticiasUrl: org.noticiasUrl,
                  noticiasFeedUrl: org.noticiasFeedUrl,
                }}
                logoUrl={org.logoUrl}
              />
            </AbrirFormulario>
          ) : (
            <p className="text-muted-foreground text-sm">
              Registro da organização não encontrado.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <p className="mb-3 font-medium">Regras de filiação</p>
          {!regras.disponivel ? (
            <Alert variant="warning">
              <AlertDescription>
                Esta regra usa uma coluna nova — rode{" "}
                <code>supabase/empresa-filiacao-exige-fonte.sql</code> no Supabase. Até lá,
                vale o funcionamento de sempre: todo recebimento entra por uma fonte pagadora.
              </AlertDescription>
            </Alert>
          ) : (
            <AbrirFormulario
              rotulo="Editar regras"
              resumo={
                <dl className="grid gap-1 text-sm">
                  <dt className="text-muted-foreground text-xs">
                    A filiação depende de uma fonte pagadora?
                  </dt>
                  <dd className="font-medium">{regraAtual.rotulo}</dd>
                  <dd className="text-muted-foreground max-w-2xl text-xs leading-relaxed">
                    {regraAtual.explicacao}
                  </dd>
                </dl>
              }
            >
              <RegrasFiliacaoForm exigeFonte={regras.exigeFonte} />
            </AbrirFormulario>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <MapPin className="text-muted-foreground size-4" />
          Sedes
        </h2>
        <p className="text-muted-foreground mt-0.5 mb-3 text-xs">
          Endereço e telefones de cada sede compõem o rodapé dos ofícios
        </p>

        {!disponivel ? (
          <Alert variant="warning">
            <AlertDescription>
              O campo de telefones das sedes usa uma coluna nova — rode{" "}
              <code>supabase/organizacao-diretoria.sql</code> no Supabase.
            </AlertDescription>
          </Alert>
        ) : (
          <div className={GRADE_AREAS}>
            {sedes.map((sede) => (
              <CartaoArea
                key={sede.id}
                titulo={sede.nome ?? "Sede"}
                descricao={enderecoDaSede(sede) ?? "Endereço não preenchido"}
                href={`/painel/institucional/organizacao/sedes/${sede.id}`}
                icone={MapPin}
                indicador={sede.telefones}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Building2 className="text-muted-foreground size-4" />
              Departamentos
            </h2>
            <p className="text-muted-foreground mt-0.5 mb-3 text-xs">
              Pessoas vinculadas e um coordenador escolhido entre elas. Aquisição,
              Demandas e Ofícios usam esta lista — em Ofícios, cada pessoa vê os
              ofícios dos seus departamentos.
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          <AbrirFormulario rotulo="Novo departamento" icone="novo">
            <Card>
              <CardContent>
                <p className="mb-3 font-medium">Novo departamento</p>
                <DepartamentoForm pessoas={pessoas} />
              </CardContent>
            </Card>
          </AbrirFormulario>

          {ativos.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum departamento cadastrado.</p>
          ) : (
            <div className={GRADE_AREAS}>
              {ativos.map((d) => (
                <CartaoArea
                  key={d.id}
                  titulo={d.nome}
                  descricao={d.coordenadorNome ? `Coordenação: ${d.coordenadorNome}` : "Sem coordenador"}
                  href={`/painel/institucional/organizacao/departamentos/${d.id}`}
                  icone={Building2}
                  indicador={`${d.integrantes.length} ${d.integrantes.length === 1 ? "pessoa" : "pessoas"}`}
                />
              ))}
            </div>
          )}

          {legados.length > 0 && (
            <p className="text-muted-foreground text-xs">
              Legados (fora das listas de escolha):{" "}
              {legados.map((d, i) => (
                <span key={d.id}>
                  {i > 0 && ", "}
                  <Link
                    href={`/painel/institucional/organizacao/departamentos/${d.id}`}
                    className="hover:text-foreground underline underline-offset-2"
                  >
                    {d.nome}
                  </Link>
                </span>
              ))}
            </p>
          )}
        </div>
      </div>
    </>
  )
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="truncate">{valor ?? "—"}</dd>
    </div>
  )
}
