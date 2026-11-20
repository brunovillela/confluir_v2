import type { Metadata } from "next"
import Link from "next/link"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ListChecks, TriangleAlert } from "lucide-react"

import { requirePermissao } from "@/lib/auth"
import { listarPessoasAtribuiveis, listarTarefas, type TarefaLinha } from "@/lib/db/nucleo"
import { tarefaDaConversa } from "@/lib/db/tarefa-conversa"
import { podeAcessar } from "@/lib/permissoes"

import { ConversaTarefa } from "./conversa-tarefa"
import { AdicionarTarefa } from "./tarefa-forms"
import { TarefasLista } from "./tarefas-lista"

export const metadata: Metadata = { title: "Tarefas — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Params = { busca?: string; status?: string; minhas?: string; responsavel?: string; conversa?: string }

/** Atrasadas agrupadas por responsável, da pessoa com mais para a com menos. */
function atrasadasPorPessoa(tarefas: TarefaLinha[]): { id: string | null; nome: string; quantidade: number }[] {
  const mapa = new Map<string, { id: string | null; nome: string; quantidade: number }>()
  for (const t of tarefas) {
    const chave = t.demandadoId ?? ""
    const atual = mapa.get(chave) ?? { id: t.demandadoId, nome: t.demandadoNome ?? "Sem responsável", quantidade: 0 }
    atual.quantidade += 1
    mapa.set(chave, atual)
  }
  return [...mapa.values()].sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, "pt-BR"))
}

export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  // Quem só é responsável (sem a permissão de Tarefas) usa Meu perfil →
  // Minhas tarefas (/painel/perfil/tarefas).
  const sessao = await requirePermissao("ferramentas_tarefas", ["ferramentas_demandas"])
  const veAnomalias = podeAcessar(sessao.permissoes, "ferramentas_anomalias")
  const eu = String(sessao.usuario.id)

  const brutos = await searchParams
  const busca = (brutos.busca ?? "").trim()
  const status =
    brutos.status === "concluidas" ||
    brutos.status === "atrasadas" ||
    brutos.status === "todas"
      ? brutos.status
      : "pendentes"
  // "Minhas": as tarefas de que sou o responsável (o link dos avisos).
  const minhas = brutos.minhas === "1"
  const responsavel = minhas ? eu : (brutos.responsavel ?? "").trim() || undefined

  const [{ disponivel, tarefas: todas }, pessoas, atrasadasGerais, tarefaDoAviso] = await Promise.all([
    listarTarefas({ busca, status, demandadoId: responsavel }),
    listarPessoasAtribuiveis(),
    // O quadro de atrasadas por pessoa: quem acompanha a equipe (lista geral).
    minhas ? Promise.resolve(null) : listarTarefas({ status: "atrasadas" }),
    brutos.conversa ? tarefaDaConversa(brutos.conversa, { id: eu, permissoes: sessao.permissoes }) : Promise.resolve(null),
  ])
  // Tarefa de anomalia qualquer um executa; o CONTEÚDO da anomalia (nome e
  // link) só vai para quem tem a permissão de Anomalias — nem chega ao cliente.
  const tarefas = veAnomalias
    ? todas
    : todas.map((t) => (t.paiTipo === "anomalia" ? { ...t, paiId: null, paiNome: null } : t))
  const porPessoa = atrasadasGerais?.disponivel ? atrasadasPorPessoa(atrasadasGerais.tarefas) : []

  return (
    <>
      {tarefaDoAviso && (
        <ConversaTarefa tarefaId={tarefaDoAviso.id} titulo={tarefaDoAviso.titulo} abertaDeInicio semBotao />
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tarefas</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Tarefas de demandas, projetos e anomalias — ou avulsas
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/painel/ferramentas/demandas">
              <ListChecks />
              Demandas
            </Link>
          </Button>
          {veAnomalias && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/painel/ferramentas/anomalias">
                <TriangleAlert />
                Anomalias
              </Link>
            </Button>
          )}
        </div>
      </div>

      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            As tarefas usam colunas novas — rode{" "}
            <code>supabase/nucleo-ferramentas.sql</code> no SQL Editor do Supabase
            para habilitá-las.
          </AlertDescription>
        </Alert>
      )}

      {disponivel && (
        <Card>
          <CardContent>
            <p className="mb-3 text-sm font-medium">Nova tarefa avulsa</p>
            <AdicionarTarefa pessoas={pessoas} />
          </CardContent>
        </Card>
      )}

      {porPessoa.length > 0 && (
        <Card>
          <CardContent>
            <p className="mb-3 text-sm font-medium">
              Atrasadas por responsável{" "}
              <span className="text-muted-foreground font-normal">
                ({porPessoa.reduce((s, p) => s + p.quantidade, 0)})
              </span>
            </p>
            <ul className="flex flex-wrap gap-2">
              {porPessoa.map((p) => (
                <li key={p.id ?? "sem"}>
                  {p.id ? (
                    <Link
                      href={`/painel/ferramentas/tarefas?status=atrasadas&responsavel=${p.id}`}
                      className="hover:bg-muted inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                    >
                      {p.nome}
                      <span className="text-destructive font-semibold tabular-nums">{p.quantidade}</span>
                    </Link>
                  ) : (
                    <span className="text-muted-foreground inline-flex items-center gap-2 rounded-md border border-dashed px-3 py-1.5 text-sm">
                      {p.nome}
                      <span className="font-semibold tabular-nums">{p.quantidade}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <form
        className="flex flex-wrap items-center gap-2"
        action="/painel/ferramentas/tarefas"
      >
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Descrição da tarefa"
          className={`${SELECT_FILTRO} w-64 max-w-full`}
        />
        <select name="status" defaultValue={status} className={SELECT_FILTRO} aria-label="Situação">
          <option value="pendentes">Pendentes</option>
          <option value="atrasadas">Atrasadas</option>
          <option value="concluidas">Concluídas</option>
          <option value="todas">Todas</option>
        </select>
        <select
          name="responsavel"
          defaultValue={minhas ? eu : (responsavel ?? "")}
          className={SELECT_FILTRO}
          aria-label="Responsável"
        >
          <option value="">De todos</option>
          <option value={eu}>Minhas</option>
          {pessoas
            .filter((p) => p.id !== eu)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
        </select>
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
      </form>

      <Card>
        <CardContent>
          <TarefasLista
            tarefas={tarefas}
            vazio={minhas ? "Nenhuma tarefa sua com estes filtros." : "Nenhuma tarefa com estes filtros."}
            pessoas={pessoas}
          />
        </CardContent>
      </Card>
    </>
  )
}
