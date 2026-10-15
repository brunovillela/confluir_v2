import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { contasAbertasParaCompras } from "@/lib/db/caixa"
import {
  buscarProcesso,
  listarCentrosCustoParaCompra,
  listarDepartamentos,
  listarFornecedores,
  listarProjetosAbertos,
} from "@/lib/db/compras"
import { compraNoEscopo, escopoComprasDoUsuario } from "@/lib/db/compras-acesso"
import { compradoresPossiveis } from "@/lib/db/compras-compradores"
import { edicaoDaCompra } from "@/lib/db/compras-edicao"
import { listarCartoes, nomeCartao } from "@/lib/db/compras-pagamento"
import { podeAcessar } from "@/lib/permissoes"
import { createAdminClient } from "@/lib/supabase/admin"

import { EditarCompraForm } from "./editar-compra-form"

export const metadata: Metadata = { title: "Editar compra — Confluir" }

export default async function EditarCompraPage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await requirePermissao("aquisicoes_compras_edicao", [
    "aquisicoes_compra_direta",
    "aquisicoes_comprador",
  ])
  const { id } = await params
  const processo = await buscarProcesso(id)
  if (!processo) notFound()
  const comprador = podeAcessar(sessao.permissoes, "aquisicoes_comprador")
  const escopo = await escopoComprasDoUsuario(sessao.usuario.id)
  if (
    !comprador &&
    !compraNoEscopo(escopo, { departamentoId: processo.departamento_id, solicitanteId: processo.solicitante_id })
  ) {
    redirect("/painel/compras?fora=1")
  }
  const ed = await edicaoDaCompra(processo)

  const voltar = (
    <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
      <Link href={`/painel/compras/${processo.id}`}>
        <ArrowLeft />
        Processo {processo.codigo ?? ""}
      </Link>
    </Button>
  )
  if (!ed.pode) {
    return (
      <>
        <div>
          {voltar}
          <h1 className="text-2xl font-semibold tracking-tight">Editar compra</h1>
        </div>
        <Alert variant="warning">
          <AlertDescription>{ed.motivo}</AlertDescription>
        </Alert>
      </>
    )
  }

  const f = ed.completa ? (processo.fornecimentos ?? [])[0] : null
  const admin = await createAdminClient()
  const [todosDepartamentos, centros, projetos, fornecedores, cartoes, caixas, compradores, ordem] = await Promise.all([
    listarDepartamentos(),
    listarCentrosCustoParaCompra(),
    listarProjetosAbertos(),
    ed.fornecedorEditavel ? listarFornecedores() : Promise.resolve([]),
    ed.completa ? listarCartoes() : Promise.resolve({ disponivel: false, cartoes: [] }),
    ed.completa ? contasAbertasParaCompras() : Promise.resolve([]),
    ed.completa ? compradoresPossiveis(String(sessao.usuario.id)) : Promise.resolve([]),
    ed.ordemId
      ? admin.from("ordens_pagamento").select("forma_pagamento, vencimento, situacao").eq("id", ed.ordemId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  // Departamentos pelos quais a pessoa compra — e o atual da compra, sempre.
  const departamentos =
    escopo.todos || comprador
      ? todosDepartamentos
      : todosDepartamentos.filter((d) => escopo.departamentoIds.includes(d.id) || d.id === processo.departamento_id)
  const listaProjetos =
    processo.projeto_id && !projetos.some((p) => p.id === processo.projeto_id)
      ? [{ id: processo.projeto_id, nome: processo.projetoNome ?? "(projeto atual)", centroCustoId: null }, ...projetos]
      : projetos
  const listaCompradores =
    f?.comprador_id && !compradores.some((c) => c.id === f.comprador_id)
      ? [{ id: f.comprador_id, nome: f.compradorNome ?? "(comprador atual)", origem: "" }, ...compradores]
      : compradores

  return (
    <>
      <div>
        {voltar}
        <h1 className="text-2xl font-semibold tracking-tight">Editar compra {processo.codigo ?? ""}</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Enquanto nenhuma ordem da compra foi autorizada, ela está nas suas mãos: corrija o que for preciso. Ao
          salvar, a auditoria (regras e IA) analisa a compra de novo e os alertas passam a ser os da compra
          editada.
        </p>
      </div>
      {ordem.data?.situacao === "Aguardando informações" && (
        <Alert variant="info">
          <AlertDescription>
            A ordem foi devolvida para informações: ao salvar a edição, ela volta para a autorização.
          </AlertDescription>
        </Alert>
      )}
      {ed.motivo && (
        <Alert variant="info">
          <AlertDescription>{ed.motivo}</AlertDescription>
        </Alert>
      )}
      <EditarCompraForm
        processoId={processo.id}
        direta={processo.aquisicao_direta === true}
        edicao={{
          completa: ed.completa,
          porRpa: ed.porRpa,
          caixaDebitado: ed.caixaDebitado,
          fornecedorEditavel: ed.fornecedorEditavel,
        }}
        atual={{
          produto: processo.produto ?? "",
          observacao: processo.observacao ?? "",
          tipo: processo.e_produto === null ? "" : processo.e_produto ? "bem" : "servico",
          departamentoId: processo.departamento_id ?? "",
          centroCustoId: processo.centro_custo_id ?? "",
          projetoId: processo.projeto_id ?? "",
          entregaNoAto: processo.entrega_no_ato,
          dataLimite: processo.data_limite ?? "",
          localEntrega: processo.local_entrega ?? "",
          fornecedorId: f?.fornecedor_id ?? "",
          fornecedorNome: f?.fornecedorNome ?? "",
          valor: f?.valor ?? null,
          dataCompra: f?.data_compra ?? processo.compra_data ?? "",
          compradorId: f?.comprador_id ?? "",
          forma: (ordem.data?.forma_pagamento as string | null) ?? f?.forma_pagamento ?? "",
          vencimento: (ordem.data?.vencimento as string | null) ?? "",
          temNota: Boolean(f?.nota_fiscal_url),
        }}
        departamentos={departamentos}
        centrosCusto={centros}
        projetos={listaProjetos}
        fornecedores={fornecedores.map((x) => ({
          id: x.id,
          nome: x.nome,
          cnpj_cpf: x.cnpj_cpf,
          razao: x.nome_razao ?? null,
          bloqueado: x.bloqueado,
        }))}
        cartoes={cartoes.cartoes.filter((c) => c.ativo).map((c) => ({ id: c.id, nome: nomeCartao(c) }))}
        caixas={caixas}
        compradores={listaCompradores}
      />
    </>
  )
}
