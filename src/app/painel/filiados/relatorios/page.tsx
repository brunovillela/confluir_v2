import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, Hourglass, ShieldOff, SlidersHorizontal } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { CartaoArea, GRADE_AREAS } from "@/components/cartao-area"
import { requirePermissao } from "@/lib/auth"
import { baseRelatorios, totaisRelatorios } from "@/lib/db/filiacao-relatorios"
import { ROTULO_MODELO } from "@/lib/filiacao-relatorios-constantes"
import { formatarDataHora } from "@/lib/formato"

export const metadata: Metadata = { title: "Relatórios de filiados — Confluir" }

/** Hub dos relatórios (gestão da filiação): três fixos e o personalizado. */
export default async function RelatoriosPage() {
  await requirePermissao("filiacao_gestao")
  const [base, totais] = await Promise.all([baseRelatorios(), totaisRelatorios()])
  const n = (v: number) => v.toLocaleString("pt-BR")

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/filiados">
            <ArrowLeft />
            Filiados
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Recortes prontos sobre os {n(totais.ativos)} filiados ativos e um
          relatório personalizado com filtros e colunas à escolha. Exportam em
          CSV e imprimem.
        </p>
      </div>

      {!base.carenciaAtiva && (
        <Alert variant="warning">
          <AlertDescription>
            A carência de voto está desligada em Configurações de filiação —
            sem ela, todo filiado ativo conta como pleno.
          </AlertDescription>
        </Alert>
      )}
      {!base.inadimplenciaConfigurada && (
        <Alert variant="warning">
          <AlertDescription>
            Nenhuma regra de inadimplência ligada em Configurações de filiação —
            o relatório de inadimplentes sai vazio.
          </AlertDescription>
        </Alert>
      )}

      <div className={GRADE_AREAS}>
        <CartaoArea
          titulo={ROTULO_MODELO.carencia.titulo}
          descricao={`${ROTULO_MODELO.carencia.descricao} (${base.carenciaVotoDias} dias)`}
          href="/painel/filiados/relatorios/carencia"
          icone={Hourglass}
          indicador={`${n(totais.emCarencia)} filiados`}
        />
        <CartaoArea
          titulo={ROTULO_MODELO.plenos.titulo}
          descricao={ROTULO_MODELO.plenos.descricao}
          href="/painel/filiados/relatorios/plenos"
          icone={CheckCircle2}
          indicador={`${n(totais.plenos)} filiados`}
        />
        <CartaoArea
          titulo={ROTULO_MODELO.inadimplentes.titulo}
          descricao={ROTULO_MODELO.inadimplentes.descricao}
          href="/painel/filiados/relatorios/inadimplentes"
          icone={ShieldOff}
          indicador={`${n(totais.inadimplentes)} filiados`}
        />
        <CartaoArea
          titulo={ROTULO_MODELO.personalizado.titulo}
          descricao={ROTULO_MODELO.personalizado.descricao}
          href="/painel/filiados/relatorios/personalizado"
          icone={SlidersHorizontal}
          indicador="filtros e colunas"
        />
      </div>

      <p className="text-muted-foreground text-xs">
        {totais.semData > 0
          ? `${n(totais.semData)} ativo(s) não têm data de filiação nem histórico de contribuição para contar a carência — aparecem no personalizado com o filtro "Sem data para contar". `
          : ""}
        Apuração guardada por 10 minutos; última em {formatarDataHora(base.geradoEm)}.
      </p>
    </>
  )
}
