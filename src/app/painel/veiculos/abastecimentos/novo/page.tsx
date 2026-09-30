import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { listarCondutores, listarVeiculos } from "@/lib/db/veiculos"

import { ImportarAbastecimentosForm, NovoAbastecimentoForm } from "../abastecimento-forms"
import { ImportarRelatorioAbastecimentoIa } from "../importar-relatorio-ia"

export const metadata: Metadata = { title: "Incluir abastecimentos — Confluir" }

/** As três formas de incluir: relatório lido pela IA, CSV no modelo, manual. */
export default async function IncluirAbastecimentosPage() {
  await requirePermissao("veiculos_gestao")
  const [frota, condutoresRes] = await Promise.all([listarVeiculos({ situacao: "todos" }), listarCondutores()])
  const veiculos = frota
    .filter((v) => !v.inativo)
    .map((v) => ({ id: v.id, rotulo: `${v.placa ?? "s/ placa"} — ${v.marca_modelo ?? ""}` }))
  const condutores = condutoresRes.condutores
    .map((c) => ({ id: c.usuario_id, rotulo: c.usuarioNome ?? "(sem nome)" }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"))

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/veiculos/abastecimentos">
            <ArrowLeft />
            Abastecimentos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Incluir abastecimentos</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Relatório lido pela IA, planilha no modelo do sistema ou um lançamento por vez
        </p>
      </div>

      <GrupoColapsavel
        titulo="Ler relatório com IA"
        descricao="Fatura do cartão-combustível, extrato do posto ou cupom — PDF, Excel, CSV ou foto"
        aberto
      >
        <ImportarRelatorioAbastecimentoIa veiculos={veiculos} />
      </GrupoColapsavel>

      <GrupoColapsavel
        titulo="Importar fatura (CSV no modelo)"
        descricao="Planilha já no layout do sistema: placa; data; hora; posto; cidade; combustivel; litros; valor; hodometro"
      >
        <ImportarAbastecimentosForm />
      </GrupoColapsavel>

      <GrupoColapsavel
        titulo="Lançamento manual"
        descricao="Um abastecimento por vez — exige veículo, condutor e hodômetro"
      >
        <NovoAbastecimentoForm veiculos={veiculos} condutores={condutores} />
      </GrupoColapsavel>
    </>
  )
}
