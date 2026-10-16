import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CheckCircle2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { panoramaFornecedores, type LinhaFornecedor } from "@/lib/db/fornecedores-indicadores"
import { podeEditarFornecedores, podeVerFinanceiroFornecedores } from "@/lib/fornecedores-acesso"
import { formatarCnpjCpf } from "@/lib/mascaras"

import { digitos, gruposPorNome, paraFormDe, sugerir } from "./grupos"
import { MesclaGrupoForm } from "./mescla-form"

export const metadata: Metadata = { title: "Fornecedores duplicados — Confluir" }

export default async function FornecedoresDuplicadosPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string; ver?: string }>
}) {
  const sessao = await requirePermissao("aquisicoes_fornecedores", [
    "aquisicoes_fornecedores_edicao",
    "aquisicoes_compras_edicao",
  ])
  const podeEditar = podeEditarFornecedores(sessao.permissoes)
  const verFinanceiro = podeVerFinanceiroFornecedores(sessao.permissoes)
  const { doc, ver } = await searchParams
  const aba = ver === "nome" ? "nome" : "documento"
  const filtroDoc = digitos(doc ?? "")

  const linhas = await panoramaFornecedores()
  const porDoc = new Map<string, LinhaFornecedor[]>()
  for (const l of linhas) {
    const d = digitos(l.cnpj_cpf)
    if (!d || l.inativa) continue
    if (filtroDoc && d !== filtroDoc) continue
    porDoc.set(d, [...(porDoc.get(d) ?? []), l])
  }
  const grupos = [...porDoc.entries()]
    .filter(([, g]) => g.length > 1)
    .sort((a, b) => b[1].length - a[1].length || a[1][0].nome.localeCompare(b[1][0].nome, "pt-BR"))

  const porNome = filtroDoc
    ? []
    : gruposPorNome(linhas).sort((a, b) => b.length - a.length || a[0].nome.localeCompare(b[0].nome, "pt-BR"))

  const paraForm = paraFormDe(verFinanceiro)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/compras/fornecedores">
            <ArrowLeft />
            Fornecedores
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Cadastros duplicados</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          A mesma empresa registrada mais de uma vez — pela migração de outra base ou por cadastro
          repetido.
          {podeEditar &&
            " Escolha o cadastro que fica: ordens de pagamento, contratos e demais registros dos outros passam para ele."}
        </p>
      </div>

      {!filtroDoc && (
        <nav className="flex flex-wrap gap-2" aria-label="Tipo de duplicidade">
          <Button asChild size="sm" variant={aba === "documento" ? "default" : "outline"}>
            <Link href="/painel/compras/fornecedores/duplicados">Mesmo CPF/CNPJ ({grupos.length})</Link>
          </Button>
          <Button asChild size="sm" variant={aba === "nome" ? "default" : "outline"}>
            <Link href="/painel/compras/fornecedores/duplicados?ver=nome">
              Mesmo nome, documento faltando ou inválido ({porNome.length})
            </Link>
          </Button>
        </nav>
      )}

      {aba === "nome" && !filtroDoc && (
        <>
          <p className="text-muted-foreground text-sm">
            Cadastros ativos com o mesmo nome (sem acento, pontuação e LTDA/ME/EPP…) em que algum está sem
            CPF/CNPJ ou com um inválido. Confira antes de mesclar: o cadastro que fica herda o CPF/CNPJ válido
            do grupo. Dois documentos válidos e diferentes não aparecem aqui — são empresas diferentes.
          </p>
          {porNome.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <CheckCircle2 className="text-success-fg mx-auto mb-2 size-6" />
                <p className="text-sm">Nenhum possível duplicado por nome.</p>
              </CardContent>
            </Card>
          ) : (
            porNome.map((g) => (
              <Card key={g[0].id}>
                <CardHeader>
                  <CardTitle className="text-base">{g[0].nome}</CardTitle>
                  <CardDescription>{g.length} cadastros ativos com este nome</CardDescription>
                </CardHeader>
                <CardContent>
                  <MesclaGrupoForm cadastros={g.map(paraForm)} sugerido={sugerir(g)} podeEditar={podeEditar} />
                </CardContent>
              </Card>
            ))
          )}
        </>
      )}

      {filtroDoc && (
        <p className="text-sm">
          Mostrando só o CPF/CNPJ {formatarCnpjCpf(filtroDoc)}.{" "}
          <Link href="/painel/compras/fornecedores/duplicados" className="text-primary hover:underline">
            Ver todos os duplicados
          </Link>
        </p>
      )}

      {aba === "nome" && !filtroDoc ? null : grupos.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <CheckCircle2 className="text-success-fg mx-auto mb-2 size-6" />
            <p className="text-sm">Nenhum CPF/CNPJ repetido entre os fornecedores ativos.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            {grupos.length.toLocaleString("pt-BR")} CPF/CNPJ com mais de um cadastro ·{" "}
            {grupos.reduce((s, [, g]) => s + g.length, 0).toLocaleString("pt-BR")} cadastros
          </p>
          {grupos.map(([d, g]) => (
            <Card key={d}>
              <CardHeader>
                <CardTitle className="text-base tabular-nums">{formatarCnpjCpf(d)}</CardTitle>
                <CardDescription>{g.length} cadastros ativos com este documento</CardDescription>
              </CardHeader>
              <CardContent>
                <MesclaGrupoForm cadastros={g.map(paraForm)} sugerido={sugerir(g)} podeEditar={podeEditar} />
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </>
  )
}
