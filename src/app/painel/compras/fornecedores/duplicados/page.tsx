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
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeEditarFornecedores, podeVerFinanceiroFornecedores } from "@/lib/fornecedores-acesso"
import { formatarCnpjCpf } from "@/lib/mascaras"

import { MesclaGrupoForm, type CadastroDuplicado } from "./mescla-form"

export const metadata: Metadata = { title: "Fornecedores duplicados — Confluir" }

const digitos = (v: string | null) => (v ?? "").replace(/\D/g, "")

/**
 * Sugestão do cadastro que fica: o que tem mais ordens, depois o mais
 * completo (conta/Pix e endereço) e, no empate, o mais antigo.
 */
function sugerir(grupo: LinhaFornecedor[]): string {
  const peso = (l: LinhaFornecedor) =>
    l.ordens * 100 +
    (l.problemas.some((p) => p.codigo === "sem_pagamento") ? 0 : 10) +
    (l.problemas.some((p) => p.codigo === "sem_endereco") ? 0 : 5) +
    (l.bloqueado ? -1 : 0)
  return [...grupo].sort(
    (a, b) => peso(b) - peso(a) || (a.created_at ?? "").localeCompare(b.created_at ?? "")
  )[0].id
}

export default async function FornecedoresDuplicadosPage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string }>
}) {
  const sessao = await requirePermissao("aquisicoes_fornecedores", [
    "aquisicoes_fornecedores_edicao",
    "aquisicoes_compras_edicao",
  ])
  const podeEditar = podeEditarFornecedores(sessao.permissoes)
  const verFinanceiro = podeVerFinanceiroFornecedores(sessao.permissoes)
  const { doc } = await searchParams
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

  const paraForm = (l: LinhaFornecedor): CadastroDuplicado => ({
    id: l.id,
    nome: l.nome,
    razao: l.nome_razao,
    detalhes: [
      l.apoiada ? "Entidade apoiada" : l.pessoa_juridica ? "Pessoa jurídica" : "Pessoa física",
      l.created_at ? `cadastrado em ${formatarData(l.created_at.slice(0, 10))}` : null,
      l.legado ? "migrado do Bubble" : "criado no Confluir",
      verFinanceiro ? `${l.ordens.toLocaleString("pt-BR")} ordem(ns)` : null,
      verFinanceiro && l.pagoTotal ? `${formatarMoeda(l.pagoTotal)} pagos` : null,
    ].filter((v): v is string => Boolean(v)),
    alertas: [
      l.bloqueado ? "Bloqueado" : null,
      ...l.problemas.filter((p) => p.codigo !== "documento_duplicado").map((p) => p.rotulo),
    ].filter((v): v is string => Boolean(v)),
  })

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
          Fornecedores ativos com o mesmo CPF/CNPJ — em geral a mesma empresa registrada duas
          vezes, pela migração de outra base ou por cadastro repetido.
          {podeEditar &&
            " Escolha o cadastro que fica: ordens de pagamento, contratos e demais registros dos outros passam para ele."}
        </p>
      </div>

      {filtroDoc && (
        <p className="text-sm">
          Mostrando só o CPF/CNPJ {formatarCnpjCpf(filtroDoc)}.{" "}
          <Link href="/painel/compras/fornecedores/duplicados" className="text-primary hover:underline">
            Ver todos os duplicados
          </Link>
        </p>
      )}

      {grupos.length === 0 ? (
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
