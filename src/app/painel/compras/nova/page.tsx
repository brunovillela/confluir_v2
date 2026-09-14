import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { requirePermissao } from "@/lib/auth"
import { escopoComprasDoUsuario } from "@/lib/db/compras-acesso"
import { podeAcessar } from "@/lib/permissoes"
import {
  listarCentrosCustoParaCompra,
  listarDepartamentos,
  listarFornecedores,
  listarProjetosAbertos,
} from "@/lib/db/compras"

import { NovaCompraForm } from "./nova-compra-form"

export const metadata: Metadata = { title: "Nova compra — Confluir" }

export default async function NovaCompraPage() {
  const sessao = await requirePermissao("aquisicoes_compras_edicao", ["aquisicoes_compra_direta"])
  const viaCompras = podeAcessar(sessao.permissoes, "aquisicoes_compras_edicao")
  const direta = podeAcessar(sessao.permissoes, "aquisicoes_compra_direta")

  const [todosDepartamentos, centros, projetos, fornecedores, escopo] = await Promise.all([
    listarDepartamentos(),
    listarCentrosCustoParaCompra(),
    listarProjetosAbertos(),
    listarFornecedores(),
    escopoComprasDoUsuario(sessao.usuario.id),
  ])
  // Só os departamentos pelos quais a pessoa compra (sem restrição: todos).
  const departamentos = escopo.todos
    ? todosDepartamentos
    : todosDepartamentos.filter((d) => escopo.departamentoIds.includes(d.id))

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/compras">
            <ArrowLeft />
            Compras
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Nova compra</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Solicitação via setor de compras ou registro de aquisição direta
        </p>
      </div>

      {!escopo.todos && (
        <Alert variant="info">
          <AlertDescription>
            Você compra pelos departamentos: {departamentos.map((d) => d.nome).join(", ") || "nenhum"}.
          </AlertDescription>
        </Alert>
      )}

      <NovaCompraForm
        permiteViaCompras={viaCompras}
        permiteDireta={direta}
        departamentos={departamentos}
        centrosCusto={centros}
        projetos={projetos}
        fornecedores={fornecedores.map((f) => ({
          id: f.id,
          nome: f.nome,
          cnpj_cpf: f.cnpj_cpf,
          bloqueado: f.bloqueado,
        }))}
      />
    </>
  )
}
