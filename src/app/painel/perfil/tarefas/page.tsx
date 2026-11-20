import type { Metadata } from "next"
import Link from "next/link"

import { TileIndicador } from "@/components/graficos/tile"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { VoltarPerfil } from "@/components/voltar-perfil"
import { requireSessaoPainel } from "@/lib/auth"
import { listarTarefas } from "@/lib/db/nucleo"
import { tarefaDaConversa } from "@/lib/db/tarefa-conversa"
import { podeAcessar } from "@/lib/permissoes"

import { ConversaTarefa } from "../../ferramentas/tarefas/conversa-tarefa"
import { TarefasLista } from "../../ferramentas/tarefas/tarefas-lista"

export const metadata: Metadata = { title: "Minhas tarefas — Confluir" }

const FILTROS = [
  { valor: "pendentes", rotulo: "Pendentes" },
  { valor: "atrasadas", rotulo: "Atrasadas" },
  { valor: "concluidas", rotulo: "Concluídas" },
  { valor: "todas", rotulo: "Todas" },
] as const
type Filtro = (typeof FILTROS)[number]["valor"]

/**
 * Autosserviço: as tarefas de que a pessoa é a responsável. Qualquer pessoa do
 * painel pode receber tarefa — também quem não tem a permissão de Tarefas —,
 * então é aqui que levam os avisos de prazo e a caixa de entrada. Ela só
 * conclui ou reabre; editar, excluir e reatribuir ficam com quem cuida de
 * Tarefas/Demandas.
 */
export default async function MinhasTarefasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; conversa?: string }>
}) {
  const sessao = await requireSessaoPainel()
  const { status: bruto, conversa } = await searchParams
  const status: Filtro = FILTROS.some((f) => f.valor === bruto) ? (bruto as Filtro) : "pendentes"
  const eu = String(sessao.usuario.id)
  const p = sessao.permissoes
  const veDemandas = podeAcessar(p, "ferramentas_demandas", ["ferramentas_tarefas"])
  const veProjetos = podeAcessar(p, "ferramentas_projetos", ["ferramentas_projetos_edicao"])
  const veAnomalias = podeAcessar(p, "ferramentas_anomalias")

  const [{ tarefas: lista }, { tarefas: abertas }, tarefaDoAviso] = await Promise.all([
    listarTarefas({ status, demandadoId: eu }),
    listarTarefas({ status: "pendentes", demandadoId: eu }),
    // O link do aviso de mensagem (?conversa=<id>) abre a conversa direto —
    // também para quem pediu a tarefa, que não a vê nesta lista.
    conversa ? tarefaDaConversa(conversa, { id: eu, permissoes: p }) : Promise.resolve(null),
  ])
  // De onde vem a tarefa (demanda, projeto, anomalia): só o nome e o link
  // para quem tem a permissão daquela área.
  const tarefas = lista.map((t) => {
    const oculta =
      (t.paiTipo === "demanda" && !veDemandas) ||
      (t.paiTipo === "projeto" && !veProjetos) ||
      (t.paiTipo === "anomalia" && !veAnomalias)
    return oculta ? { ...t, paiId: null, paiNome: null } : t
  })
  const atrasadas = abertas.filter((t) => t.situacao === "atrasada").length
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())
  const venceHoje = abertas.filter((t) => t.prazo === hoje).length

  return (
    <>
      <VoltarPerfil />
      {tarefaDoAviso && (
        <ConversaTarefa tarefaId={tarefaDoAviso.id} titulo={tarefaDoAviso.titulo} abertaDeInicio semBotao />
      )}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Minhas tarefas</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          As tarefas de que você é o responsável. Conclua aqui; para mudar o prazo, fale com quem pediu.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <TileIndicador rotulo="Pendentes" valor={String(abertas.length)} />
        <TileIndicador rotulo="Atrasadas" valor={String(atrasadas)} />
        <TileIndicador rotulo="Vencem hoje" valor={String(venceHoje)} />
      </section>

      <nav className="flex flex-wrap gap-2" aria-label="Situação">
        {FILTROS.map((f) => (
          <Button key={f.valor} size="sm" variant={f.valor === status ? "secondary" : "outline"} asChild>
            <Link href={f.valor === "pendentes" ? "/painel/perfil/tarefas" : `/painel/perfil/tarefas?status=${f.valor}`} aria-current={f.valor === status ? "page" : undefined}>
              {f.rotulo}
            </Link>
          </Button>
        ))}
      </nav>

      <Card>
        <CardContent>
          <TarefasLista
            tarefas={tarefas}
            vazio={status === "atrasadas" ? "Nenhuma tarefa sua atrasada." : "Nenhuma tarefa sua com este filtro."}
          />
        </CardContent>
      </Card>
    </>
  )
}
