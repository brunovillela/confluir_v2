import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Search } from "lucide-react"

import { EmpresaCombobox } from "@/components/empresa-combobox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { panoramaFornecedores } from "@/lib/db/fornecedores-indicadores"
import { CHAVE_EDICAO_FORNECEDORES, podeVerFinanceiroFornecedores } from "@/lib/fornecedores-acesso"
import { formatarCnpjCpf } from "@/lib/mascaras"

import { digitos, docValido, paraFormDe, sugerir } from "../../duplicados/grupos"
import { MesclaGrupoForm } from "../../duplicados/mescla-form"

export const metadata: Metadata = { title: "Mesclar fornecedor — Confluir" }

/**
 * Mescla MANUAL a partir da ficha do fornecedor (16/10/2026): para os
 * duplicados do legado que não têm o mesmo CPF/CNPJ — um sem documento, outro
 * com documento inválido. Escolhe-se o outro cadastro, compara-se os dois e
 * decide-se qual fica; ele herda o CPF/CNPJ válido do par. Dois documentos
 * válidos e diferentes não se mesclam (lib/db/fornecedores.ts).
 */
export default async function MesclarFornecedorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ com?: string }>
}) {
  const sessao = await requirePermissao(CHAVE_EDICAO_FORNECEDORES)
  const verFinanceiro = podeVerFinanceiroFornecedores(sessao.permissoes)
  const { id } = await params
  const { com } = await searchParams

  const linhas = await panoramaFornecedores()
  const este = linhas.find((l) => l.id === id)
  if (!este) notFound()
  const outro = com && com !== id ? linhas.find((l) => l.id === com && !l.inativa) : undefined
  const opcoes = linhas
    .filter((l) => !l.inativa && l.id !== id)
    .map((l) => ({ id: l.id, nome: l.nome, razao: l.nome_razao, cnpj_cpf: l.cnpj_cpf, bloqueado: false }))

  const docEste = digitos(este.cnpj_cpf)
  const docOutro = outro ? digitos(outro.cnpj_cpf) : ""
  const conflito = outro && docValido(docEste) && docValido(docOutro) && docEste !== docOutro

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={`/painel/compras/fornecedores/${id}`}>
            <ArrowLeft />
            {este.nome}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Mesclar com outro cadastro</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Para a mesma empresa cadastrada duas vezes — inclusive quando um cadastro está sem CPF/CNPJ ou com
          um inválido, como no legado. Ordens, contratos, propostas, contas, endereços e demais registros do
          incorporado passam para o que fica; o que fica herda o CPF/CNPJ válido.
        </p>
      </div>

      {este.inativa && (
        <Alert variant="warning">
          <AlertDescription>Este cadastro está inativo — reative-o ou mescle a partir do outro.</AlertDescription>
        </Alert>
      )}

      {/* overflow-visible: o Card corta o que passa da borda, e a lista da
          busca abre para baixo, além do fim do cartão. */}
      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle className="text-base">Qual é o outro cadastro?</CardTitle>
          <CardDescription>
            Busque pelo nome, razão social ou CNPJ/CPF. Este:{" "}
            <strong>{este.nome}</strong> · {docEste ? `${formatarCnpjCpf(docEste)}${docValido(docEste) ? "" : " (inválido)"}` : "sem CPF/CNPJ"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 sm:max-w-md">
              <EmpresaCombobox empresas={opcoes} name="com" defaultId={outro?.id} />
            </div>
            <Button type="submit" variant="outline">
              <Search />
              Comparar
            </Button>
          </form>
        </CardContent>
      </Card>

      {outro && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Os dois cadastros</CardTitle>
            <CardDescription>
              Marque o que fica. O outro é incorporado e fica inativo, apontando para ele.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {conflito ? (
              <Alert variant="destructive">
                <AlertDescription>
                  Os dois têm CPF/CNPJ válidos e diferentes ({formatarCnpjCpf(docEste)} e{" "}
                  {formatarCnpjCpf(docOutro)}) — são empresas diferentes (matriz e filial, homônimas) e não se
                  mesclam. Se um dos documentos está errado, corrija o cadastro primeiro.
                </AlertDescription>
              </Alert>
            ) : (
              <MesclaGrupoForm
                cadastros={[este, outro].map(paraFormDe(verFinanceiro))}
                sugerido={sugerir([este, outro])}
                podeEditar
              />
            )}
          </CardContent>
        </Card>
      )}
      {com && !outro && (
        <Alert variant="warning">
          <AlertDescription>Escolha outro cadastro ativo, diferente deste.</AlertDescription>
        </Alert>
      )}
    </>
  )
}
