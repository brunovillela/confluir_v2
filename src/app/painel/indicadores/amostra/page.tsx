import { notFound } from "next/navigation"

import { GraficoColunas } from "@/components/graficos/colunas"
import { GraficoLinha } from "@/components/graficos/linha"
import { TileIndicador } from "@/components/graficos/tile"
import { rotuloMes } from "@/components/graficos/base"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requireSessaoPainel } from "@/lib/auth"

/**
 * Amostra dos gráficos com dados sintéticos — só em desenvolvimento, para
 * conferir marcas, tooltip, legenda, tabela e o tema escuro sem depender da
 * camada analítica. Em produção responde 404.
 */
export default async function AmostraGraficosPage() {
  if (process.env.NODE_ENV === "production") notFound()
  await requireSessaoPainel()
  const meses = Array.from({ length: 12 }, (_, i) => `2025-${String(((i + 10) % 12) + 1).padStart(2, "0")}-01`).map((m, i) => (i < 2 ? m : m.replace("2025", "2026")))
  const rotulos = meses.map(rotuloMes)
  const ativos = [4120, 4138, 4150, 4171, 4190, 4186, 4203, 4230, 4251, 4260, 4284, 4301]
  const entradas = [31, 28, 24, 35, 29, 18, 27, 36, 30, 22, 33, 27]
  const saidas = [12, 10, 12, 14, 10, 22, 10, 9, 9, 13, 9, 10]
  const arrec = [
    { nome: "Associativa", valores: [412000, 415000, 418000, 421000, 423000, 419000, 426000, 431000, 434000, 436000, 440000, 443000] },
    { nome: "Assistencial", valores: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { nome: "Sindical", valores: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  ]
  const desp = [
    { nome: "Contrato", valores: [120000, 118000, 125000, 121000, 119000, 130000, 122000, 124000, 126000, 123000, 128000, 125000] },
    { nome: "Folha de pagamento", valores: [210000, 210000, 212000, 212000, 215000, 215000, 215000, 218000, 218000, 218000, 220000, 220000] },
    { nome: "Compras", valores: [18000, 22000, 15000, 30000, 12000, 25000, 19000, 21000, 17000, 23000, 16000, 20000] },
    { nome: "Diária", valores: [9000, 7000, 11000, 8000, 12000, 6000, 9000, 10000, 8000, 11000, 7000, 9000] },
    { nome: "Outros (3)", valores: [5000, 4000, 6000, 5000, 4000, 7000, 5000, 6000, 4000, 5000, 6000, 5000], outros: true },
  ]
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Amostra dos gráficos (desenvolvimento)</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TileIndicador rotulo="Filiados ativos" valor="4.301" delta={{ texto: "+4,4%", sinal: 1 }} deltaRotulo="em 12 meses" sparkline={ativos} />
        <TileIndicador rotulo="Arrecadação em set/26" valor="R$ 443 mil" delta={{ texto: "+0,7%", sinal: 1 }} deltaRotulo="vs. mês anterior" nota="3.980 pagantes" />
        <TileIndicador rotulo="A pagar em 30 dias" valor="R$ 182,4 mil" nota="23 ordens" />
        <TileIndicador rotulo="Ordens vencidas" valor="4" nota="R$ 12,9 mil" delta={{ texto: "−2", sinal: -1 }} subirEhBom={false} deltaRotulo="vs. semana passada" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Linha</CardTitle></CardHeader>
          <CardContent><GraficoLinha categorias={rotulos} valores={ativos} nome="Ativos" titulo="Ativos por mês" /></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Colunas agrupadas</CardTitle></CardHeader>
          <CardContent>
            <GraficoColunas categorias={rotulos} series={[{ nome: "Filiações", valores: entradas }, { nome: "Desfiliações", valores: saidas }]} titulo="Filiações e desfiliações" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Empilhado (moeda)</CardTitle></CardHeader>
          <CardContent><GraficoColunas categorias={rotulos} series={arrec} empilhado emMoeda titulo="Arrecadação por tipo" /></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Empilhado com Outros</CardTitle></CardHeader>
          <CardContent><GraficoColunas categorias={rotulos} series={desp} empilhado emMoeda titulo="Despesa por tipo" /></CardContent>
        </Card>
      </div>
    </>
  )
}
