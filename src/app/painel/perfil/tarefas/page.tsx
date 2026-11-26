import type { Metadata } from "next"
import Link from "next/link"
import { Bell, ListChecks, MessageSquare } from "lucide-react"

import { TileIndicador } from "@/components/graficos/tile"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { VoltarPerfil } from "@/components/voltar-perfil"
import { requireSessaoPainel } from "@/lib/auth"
import { listarTarefas } from "@/lib/db/nucleo"
import { itensSeguidos } from "@/lib/db/seguidores"
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

  const [{ tarefas: lista }, { tarefas: abertas }, tarefaDoAviso, seguidos] = await Promise.all([
    listarTarefas({ status, demandadoId: eu }),
    listarTarefas({ status: "pendentes", demandadoId: eu }),
    // O link do aviso de mensagem (?conversa=<id>) abre a conversa direto —
    // também para quem pediu a tarefa, que não a vê nesta lista.
    conversa ? tarefaDaConversa(conversa, { id: eu, permissoes: p }) : Promise.resolve(null),
    itensSeguidos(eu),
  ])
  // O que a pessoa segue (Onda 4): demanda só para quem vê Demandas.
  const seguidosVisiveis = seguidos.filter((i) => i.tipo === "tarefa" || veDemandas)
  // De onde vem a tarefa (demanda, projeto, anomalia), embaixo do título: o
  // link só para quem tem a permissão daquela área. O nome do projeto ou da
  // demanda vai para quem executa (26/11/2026: ajuda a saber de onde é a
  // tarefa); o da anomalia, só para quem vê Anomalias.
  const tarefas = lista.map((t) => {
    if (t.paiTipo === "anomalia" && !veAnomalias) return { ...t, paiId: null, paiNome: null }
    const semLink = (t.paiTipo === "demanda" && !veDemandas) || (t.paiTipo === "projeto" && !veProjetos)
    return semLink ? { ...t, paiId: null } : t
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

      {seguidosVisiveis.length > 0 && (
        <Card>
          <CardContent>
            <p className="mb-1 flex items-center gap-2 text-sm font-medium">
              <Bell className="text-muted-foreground size-4" />
              O que você segue <span className="text-muted-foreground font-normal">({seguidosVisiveis.length})</span>
            </p>
            <p className="text-muted-foreground mb-3 text-xs">
              Você recebe os avisos destas tarefas e demandas. Para deixar de seguir, abra e clique em Seguindo.
            </p>
            <ul className="grid divide-y">
              {seguidosVisiveis.map((i) => (
                <li key={`${i.tipo}-${i.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <Link
                    href={i.tipo === "tarefa" ? `/painel/perfil/tarefas?conversa=${i.id}` : `/painel/ferramentas/demandas/${i.id}`}
                    className={`hover:text-primary flex min-w-0 items-center gap-2 hover:underline ${i.concluido ? "text-muted-foreground line-through" : ""}`}
                  >
                    {i.tipo === "tarefa" ? <MessageSquare className="size-3.5 shrink-0" /> : <ListChecks className="size-3.5 shrink-0" />}
                    <span className="truncate">{i.titulo}</span>
                  </Link>
                  <span className="text-muted-foreground text-xs">
                    {i.tipo === "tarefa" ? "Tarefa" : "Demanda"}
                    {i.mencao ? " · você foi mencionado" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  )
}
