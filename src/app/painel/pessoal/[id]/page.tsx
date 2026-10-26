import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { AvatarPessoa } from "@/components/pessoa-nome"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { carreiraDoFuncionario, type CarreiraFuncionario } from "@/lib/db/carreira"
import {
  dadosBancariosDoFuncionario,
  type DadosBancarios,
} from "@/lib/db/contracheques-ordens"
import { fotosDosUsuarios } from "@/lib/db/fotos-usuarios"
import { buscarPerfilFuncionario } from "@/lib/db/pessoal"

import { ResumoAreas } from "@/components/pessoal/resumo-areas"

import { DadosBancariosFuncionario } from "./dados-bancarios"
import { DadosCadastrais, ExcluirFuncionario, VinculoFuncionario } from "./cadastro-forms"
import { descreverLancamentos, lancamentosDoFuncionario, obterDadosCadastrais } from "@/lib/db/pessoal-cadastro"
import { formatarData } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = { title: "Funcionário — Confluir" }

function BadgeSimNao({
  valor,
  sim = "Sim",
  nao = "Não",
}: {
  valor: boolean | null
  sim?: string
  nao?: string
}) {
  if (valor === true)
    return (
      <Badge
        variant="outline"
        className="border-success/40 text-success-fg"
      >
        {sim}
      </Badge>
    )
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {nao}
    </Badge>
  )
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground py-6 text-center text-sm">{children}</p>
  )
}

export default async function FuncionarioPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const sessao = await requirePermissao("pessoal_gestao", [
    "pessoal_contracheque",
  ])
  // Gestão vê tudo; a chave dedicada `pessoal_contracheque` libera só a
  // área de contracheques (o painel Áreas filtra pelas permissões).
  const temGestao = podeAcessar(sessao.permissoes, "pessoal_gestao")

  const { id } = await params
  const [perfil, cadastro, fotos] = await Promise.all([buscarPerfilFuncionario(id), obterDadosCadastrais(id), fotosDosUsuarios([id])])
  if (!perfil) notFound()

  // Anuênios, níveis salariais e conta bancária são remuneração — só a gestão vê.
  const [carreira, dadosBancarios]: [CarreiraFuncionario, DadosBancarios | null] = temGestao
    ? await Promise.all([carreiraDoFuncionario(id), dadosBancariosDoFuncionario(id)])
    : [{ anuenios: [], niveis: [] }, null]

  const { usuario, vinculos, dependentes } = perfil
  // O que impede excluir o funcionário (lançamentos no Pessoal) — só a gestão vê.
  const lancamentos = temGestao ? await lancamentosDoFuncionario(id) : []

  const vinculoAtual = vinculos.find((v) => !v.contrato_demissao) ?? vinculos[0]
  const ativo = Boolean(vinculoAtual && !vinculoAtual.contrato_demissao)

  return (
    <>
      <RotuloTrilha valores={{ [id]: usuario.nome_completo ?? usuario.nome_guerra ?? "Funcionário" }} />
      <div>
        <div className="mb-3">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href="/painel/pessoal">
              <ArrowLeft />
              Pessoal
            </Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AvatarPessoa
            nome={usuario.nome_completo ?? usuario.nome_guerra ?? null}
            fotoUrl={fotos.get(id)}
            size="lg"
            className="size-12"
          />
          <h1 className="text-2xl font-semibold tracking-tight">
            {usuario.nome_completo ?? usuario.nome_guerra ?? "(sem nome)"}
          </h1>
          {ativo ? (
            <Badge
              variant="outline"
              className="border-success/40 text-success-fg"
            >
              Ativo
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Desligado
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {[
            vinculoAtual?.cargo,
            vinculoAtual?.lotacao,
            vinculoAtual?.matricula && `matrícula ${vinculoAtual.matricula}`,
          ]
            .filter(Boolean)
            .join(" · ") || "Sem vínculo ativo"}
        </p>
      </div>

      <DadosCadastrais
        usuarioId={id}
        podeEditar={temGestao}
        dados={{
          nomeCompleto: cadastro?.nomeCompleto ?? usuario.nome_completo ?? "",
          nomeGuerra: cadastro?.nomeGuerra ?? usuario.nome_guerra,
          cpf: cadastro?.cpf ?? null,
          dataNascimento: cadastro?.dataNascimento ?? null,
          whatsapp: cadastro?.whatsapp ?? null,
          email: usuario.email,
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Vínculos com a entidade
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              {vinculos.length} registro{vinculos.length === 1 ? "" : "s"}
            </span>
          </CardTitle>
          {temGestao && (
            <p className="text-muted-foreground text-xs">
              O lápis edita o vínculo — inclusive a data de desligamento — e permite
              excluir o vínculo de quem nunca fez parte da entidade.
            </p>
          )}
        </CardHeader>
        <CardContent>
          {vinculos.map((v) => (
            <VinculoFuncionario key={v.id} usuarioId={id} vinculo={v} podeEditar={temGestao} />
          ))}
        </CardContent>
      </Card>

      {temGestao && <DadosBancariosFuncionario usuarioId={id} dados={dadosBancarios} cpfFuncionario={cadastro?.cpf ?? null} />}

      {/* 17/10: a ficha é o ponto de entrada — cada área tem a página da pessoa (padrão de 3 níveis). */}
      <ResumoAreas usuarioId={id} perfil={perfil} carreira={carreira} permissoes={sessao.permissoes} />

      {temGestao && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Dependentes
                <span className="text-muted-foreground ml-2 text-sm font-normal">
                  {dependentes.length} registro
                  {dependentes.length === 1 ? "" : "s"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dependentes.length === 0 ? (
                <Vazio>Nenhum dependente registrado.</Vazio>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Parentesco</TableHead>
                      <TableHead className="hidden sm:table-cell">
                        Nascimento
                      </TableHead>
                      <TableHead>Situação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dependentes.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="max-w-64 truncate font-medium">
                          {d.nome_completo ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {d.grau_parentesco ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden whitespace-nowrap sm:table-cell">
                          {formatarData(d.nascimento)}
                        </TableCell>
                        <TableCell>
                          <BadgeSimNao valor={d.ativo} sim="Ativo" nao="Inativo" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
      {temGestao && (
        <ExcluirFuncionario
          usuarioId={id}
          nome={usuario.nome_completo ?? usuario.nome_guerra ?? "este funcionário"}
          impedimentos={lancamentos.length ? descreverLancamentos(lancamentos) : null}
        />
      )}
    </>
  )
}
