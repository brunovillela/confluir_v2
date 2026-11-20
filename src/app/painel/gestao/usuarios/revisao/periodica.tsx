import Link from "next/link"
import { CalendarCheck } from "lucide-react"

import { AbrirRevisao, EncerrarRevisao, RespostaItem, TratarItem } from "@/components/gestao/revisao-periodica"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import type { AcessoLinha } from "@/lib/db/acessos"
import {
  contarItens,
  DIAS_ENTRE_REVISOES,
  itensDoCiclo,
  ROTULO_DECISAO,
  situacaoCiclos,
  tituloSugerido,
  type ItemRevisaoCiclo,
} from "@/lib/db/acessos-revisao-ciclo"
import { formatarData, formatarDataHora } from "@/lib/formato"

import { RevogarAcesso } from "../usuarios-forms"

const ROTA = "/painel/gestao/usuarios/revisao"

function hojeBR(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
}

function diasDesdeData(iso: string): number {
  return Math.floor((new Date().getTime() - new Date(iso).getTime()) / (24 * 3600_000))
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** O que a pessoa tem hoje: perfis e permissões diretas (retrato da abertura). */
export function ResumoDoAcesso({ item }: { item: ItemRevisaoCiclo }) {
  const { perfis, diretas, total } = item.resumo
  return (
    <span className="text-muted-foreground block text-xs">
      {perfis.length ? `Perfis: ${perfis.join(", ")}` : "Sem perfil"}
      {diretas.length > 0 && (
        <>
          {" · "}
          <details className="inline">
            <summary className="inline cursor-pointer underline-offset-2 hover:underline">
              {diretas.length} {diretas.length === 1 ? "permissão direta" : "permissões diretas"}
            </summary>
            <span className="block">{diretas.join(" · ")}</span>
          </details>
        </>
      )}
      {total > 0 && !diretas.length && !perfis.length ? ` · ${total} permissões` : ""}
    </span>
  )
}

function Decisao({ item }: { item: ItemRevisaoCiclo }) {
  if (!item.decisao) return <Badge variant="secondary">Sem resposta</Badge>
  const variante = item.decisao === "manter" ? "success" : item.decisao === "retirar" ? "destructive" : "warning"
  return (
    <span className="grid gap-0.5">
      <Badge variant={variante}>{ROTULO_DECISAO[item.decisao]}</Badge>
      {item.observacao && <span className="text-xs">“{item.observacao}”</span>}
      <span className="text-muted-foreground text-xs">
        {item.decididoPor ?? "—"}
        {item.decididoEm ? ` · ${formatarDataHora(item.decididoEm)}` : ""}
      </span>
    </span>
  )
}

/**
 * Revisão periódica (Gestão › Usuários › Revisão de acessos): abrir o ciclo,
 * acompanhar as respostas por departamento, resolver o que os coordenadores
 * marcaram e encerrar.
 */
export async function RevisaoPeriodica({ acessos, usuarioId }: { acessos: AcessoLinha[]; usuarioId: string }) {
  const situacao = await situacaoCiclos()
  if (!situacao.disponivel) {
    return (
      <Alert>
        <AlertDescription>A revisão periódica ainda está sendo instalada no banco de dados.</AlertDescription>
      </Alert>
    )
  }
  const acessoDe = new Map(acessos.filter((a) => a.usuarioId).map((a) => [a.usuarioId!, a]))
  const { aberto, ultimoEncerrado, anteriores } = situacao
  const diasDesde = ultimoEncerrado?.encerradoEm ? diasDesdeData(ultimoEncerrado.encerradoEm) : null

  return (
    <Card id="periodica">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarCheck className="text-muted-foreground size-4" />
          Revisão periódica
        </CardTitle>
        <CardDescription className="text-xs">
          De tempos em tempos (sugerimos a cada {DIAS_ENTRE_REVISOES} dias), cada coordenador confirma quem da equipe ainda precisa do acesso. O que ele marcar
          para retirar ou ajustar vem para cá; o acesso do próprio coordenador, de quem está fora de um departamento com coordenador e das contas de função é
          confirmado aqui. Encerrada, a revisão fica como registro de quem confirmou o quê.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {aberto ? <CicloAberto cicloId={aberto.id} titulo={aberto.titulo} prazo={aberto.prazo} acessoDe={acessoDe} usuarioId={usuarioId} /> : (
          <div className="grid gap-3">
            <p className="text-sm">
              {ultimoEncerrado
                ? `Última revisão: ${ultimoEncerrado.titulo}, encerrada em ${formatarData(ultimoEncerrado.encerradoEm!)} (há ${diasDesde} dias).`
                : "Nenhuma revisão periódica feita ainda."}
              {(diasDesde === null || diasDesde >= DIAS_ENTRE_REVISOES) && <span className="text-warning-fg"> Está na hora de uma nova.</span>}
            </p>
            <AbrirRevisao tituloSugerido={tituloSugerido()} prazoSugerido={somarDias(hojeBR(), 15)} />
          </div>
        )}

        {anteriores.length > 0 && (
          <details className="text-sm">
            <summary className="text-muted-foreground cursor-pointer text-xs">Revisões anteriores ({anteriores.length})</summary>
            <ul className="mt-2 grid gap-1">
              {anteriores.map((c) => (
                <li key={c.id} className="text-xs">
                  <Link href={`${ROTA}?ciclo=${c.id}#periodica`} className="text-primary hover:underline">
                    {c.titulo}
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    · aberta em {formatarData(c.abertoEm)} · encerrada em {formatarData(c.encerradoEm!)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  )
}

async function CicloAberto({
  cicloId,
  titulo,
  prazo,
  acessoDe,
  usuarioId,
}: {
  cicloId: string
  titulo: string
  prazo: string
  acessoDe: Map<string, AcessoLinha>
  usuarioId: string
}) {
  const itens = await itensDoCiclo(cicloId)
  const c = contarItens(itens)
  const vencido = prazo < hojeBR()
  const paraResolver = itens.filter((i) => i.decisao && i.decisao !== "manter" && !i.tratadoEm)
  const daGestao = itens.filter((i) => !i.revisorId && !i.decisao && !i.tratadoEm)
  const semRespostaCoord = itens.filter((i) => i.revisorId && !i.decisao && !i.tratadoEm)

  // Progresso por departamento (revisor).
  const grupos = new Map<string, { rotulo: string; total: number; respondidos: number }>()
  for (const i of itens) {
    const k = i.revisorId ? `${i.departamentoId}|${i.revisorId}` : "gestao"
    const g = grupos.get(k) ?? {
      rotulo: i.revisorId ? `${i.departamento ?? "Departamento"} — ${i.revisor ?? "coordenador"}` : "Com a Gestão",
      total: 0,
      respondidos: 0,
    }
    g.total++
    if (i.decisao || i.tratadoEm) g.respondidos++
    grupos.set(k, g)
  }

  const revogar = (i: ItemRevisaoCiclo) => {
    const a = acessoDe.get(i.usuarioId)
    return a ? <RevogarAcesso acessoId={a.id} voltar={ROTA} nome={i.nome} /> : <span className="text-muted-foreground text-xs">Acesso já revogado</span>
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span className="font-medium">{titulo}</span> · prazo {formatarData(prazo)}
          {vencido && <Badge variant="warning" className="ml-2">prazo vencido</Badge>}
        </p>
        <EncerrarRevisao cicloId={cicloId} pendentes={c.semResposta + c.paraResolver} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Contador rotulo="Acessos na revisão" valor={c.total} />
        <Contador rotulo="Respondidos" valor={c.respondidos} detalhe={`${c.manter} ainda precisam`} />
        <Contador rotulo="Para a Gestão resolver" valor={c.paraResolver} destaque={c.paraResolver > 0} detalhe={`${c.retirar} retirar · ${c.ajustar} ajustar`} />
        <Contador rotulo="Sem resposta" valor={c.semResposta} destaque={vencido && c.semResposta > 0} />
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-medium">Por quem revisa</p>
        {[...grupos.values()]
          .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"))
          .map((g) => (
            <div key={g.rotulo} className="grid gap-1">
              <div className="flex justify-between text-xs">
                <span>{g.rotulo}</span>
                <span className="text-muted-foreground tabular-nums">
                  {g.respondidos} de {g.total}
                </span>
              </div>
              <Progress value={Math.round((g.respondidos / g.total) * 100)} aria-label={`Respostas de ${g.rotulo}`} />
            </div>
          ))}
      </div>

      <Secao titulo="Para resolver" vazio="Nada marcado para retirar ou ajustar." quantidade={paraResolver.length}>
        {paraResolver.map((i) => (
          <li key={i.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto]">
            <div>
              <p className="font-medium">{i.nome}</p>
              <ResumoDoAcesso item={i} />
              <span className="text-muted-foreground block text-xs">{i.departamento ?? "Sem departamento"}</span>
              <div className="mt-1">
                <Decisao item={i} />
              </div>
            </div>
            <div className="grid content-start gap-2">
              {acessoDe.get(i.usuarioId) && (
                <Link href={`/painel/gestao/usuarios/${acessoDe.get(i.usuarioId)!.id}`} className="text-primary text-xs hover:underline">
                  Abrir o acesso para ajustar
                </Link>
              )}
              {i.decisao === "retirar" && revogar(i)}
              <TratarItem itemId={i.id} sugestao={i.decisao === "retirar" ? "Mantido após conversa" : "Ajustado conforme pedido"} />
            </div>
          </li>
        ))}
      </Secao>

      <Secao
        titulo="Com a Gestão"
        vazio="A Gestão já respondeu todos os dela."
        quantidade={daGestao.length}
        nota="Coordenadores, quem está fora de um departamento com coordenador e contas de função. Ninguém confirma o próprio acesso."
      >
        {daGestao.map((i) => (
          <li key={i.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_22rem]">
            <div>
              <p className="font-medium">{i.nome}</p>
              <ResumoDoAcesso item={i} />
              {acessoDe.get(i.usuarioId)?.contaFuncao && <span className="text-muted-foreground block text-xs">Conta de função</span>}
            </div>
            {i.usuarioId === usuarioId ? (
              <p className="text-muted-foreground text-xs">É o seu acesso: outra pessoa da Gestão confirma.</p>
            ) : (
              <RespostaItem itemId={i.id} nome={i.nome} observacao={i.observacao} />
            )}
          </li>
        ))}
      </Secao>

      {semRespostaCoord.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            Aguardando os coordenadores ({semRespostaCoord.length})
            {vencido && <span className="text-warning-fg text-xs font-normal"> — o prazo venceu; a Gestão pode responder no lugar</span>}
          </summary>
          <ul className="divide-y">
            {semRespostaCoord.map((i) => (
              <li key={i.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_22rem]">
                <div>
                  <p className="font-medium">{i.nome}</p>
                  <ResumoDoAcesso item={i} />
                  <span className="text-muted-foreground block text-xs">
                    {i.departamento} · revisa: {i.revisor ?? "coordenador"}
                  </span>
                </div>
                {i.usuarioId === usuarioId ? (
                  <p className="text-muted-foreground text-xs">É o seu acesso.</p>
                ) : (
                  <RespostaItem itemId={i.id} nome={i.nome} observacao={i.observacao} />
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function Contador({ rotulo, valor, detalhe, destaque }: { rotulo: string; valor: number; detalhe?: string; destaque?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${destaque ? "border-warning/60" : ""}`}>
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{valor}</p>
      {detalhe && <p className="text-muted-foreground mt-0.5 text-xs">{detalhe}</p>}
    </div>
  )
}

function Secao({
  titulo,
  vazio,
  quantidade,
  nota,
  children,
}: {
  titulo: string
  vazio: string
  quantidade: number
  nota?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1">
      <p className="text-sm font-medium">
        {titulo} <span className="text-muted-foreground font-normal">({quantidade})</span>
      </p>
      {nota && <p className="text-muted-foreground text-xs">{nota}</p>}
      {quantidade === 0 ? <p className="text-muted-foreground text-sm">{vazio}</p> : <ul className="divide-y">{children}</ul>}
    </div>
  )
}

/** Uma revisão encerrada, só leitura: o registro de quem confirmou o quê. */
export async function CicloHistorico({ cicloId }: { cicloId: string }) {
  const situacao = await situacaoCiclos()
  const ciclo = situacao.anteriores.find((c) => c.id === cicloId)
  if (!ciclo) return null
  const itens = await itensDoCiclo(cicloId)
  const c = contarItens(itens)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{ciclo.titulo}</CardTitle>
        <CardDescription className="text-xs">
          Aberta em {formatarData(ciclo.abertoEm)}, prazo {formatarData(ciclo.prazo)}, encerrada em {formatarData(ciclo.encerradoEm!)}. {c.total} acessos:{" "}
          {c.manter} confirmados, {c.retirar} para retirar, {c.ajustar} para ajustar, {c.semResposta} sem resposta.{" "}
          <Link href={`${ROTA}#periodica`} className="text-primary hover:underline">
            Fechar
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {itens.map((i) => (
            <li key={i.id} className="grid gap-2 py-2 sm:grid-cols-[1fr_16rem_14rem]">
              <div>
                <p className="font-medium">{i.nome}</p>
                <ResumoDoAcesso item={i} />
                <span className="text-muted-foreground block text-xs">
                  {i.departamento ?? "Sem departamento"} · revisou: {i.revisor ?? "Gestão"}
                </span>
              </div>
              <Decisao item={i} />
              <span className="text-xs">
                {i.tratadoEm ? (
                  <>
                    {i.tratamento ?? "Resolvido"}
                    <span className="text-muted-foreground block">
                      {i.tratadoPor ?? "—"} · {formatarDataHora(i.tratadoEm)}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
