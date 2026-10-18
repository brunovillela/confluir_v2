import Link from "next/link"
import { ArrowRight, CalendarClock, FileSignature, HandCoins, UsersRound, Vote } from "lucide-react"

import { AvaliacoesPendentes } from "@/app/portal/hospedagem/avaliacoes-pendentes"
import { ContagemRegressiva } from "@/components/portal/contagem-regressiva"
import { Indisponivel } from "@/components/portal/inicio/indisponivel"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { estadoVotacao, ROTULOS_MODALIDADE } from "@/lib/assembleias-constantes"
import type { Filiado } from "@/lib/contas"
import { situacaoColetivaDoFiliado } from "@/lib/db/filiacao-coletiva"
import { pendenciasDaPessoa, type PendenciaAvaliacao } from "@/lib/db/hospedagem-avaliacoes"
import { oposicoesParaFiliado } from "@/lib/db/oposicao"
import {
  aceitaAcao,
  aparece,
  avaliacoesPendentesSoLeitura,
  registrosDaPessoa,
  type PartesDoInicio,
} from "@/lib/db/portal-inicio"
import type { AssembleiaDoFiliado } from "@/lib/db/votacao-portal"
import { formatarData, formatarDataHora } from "@/lib/formato"

import { assembleiasSeAtivo, tentar } from "./cargas"

/**
 * Cartão de destaque das pendências (o mesmo padrão em todas). O cartão
 * inteiro é o link: foco visível no próprio cartão, também no tema escuro
 * (A156), e nenhum <button> dentro dele.
 */
const DESTAQUE =
  "group border-primary/40 bg-primary/5 hover:bg-primary/10 focus-visible:border-ring focus-visible:ring-ring/50 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 transition-colors outline-none focus-visible:ring-3"

/**
 * Votação que pede ação agora (votar) ou que está aberta e trava a pessoa
 * (carência). A que já recebeu o voto, a que ainda vai abrir e a presencial
 * vão para "Seus próximos compromissos" (compromissos.tsx) — o laranja aqui
 * é só do que pede ação (A146).
 */
const PEDEM_ACAO = new Set(["votar", "carencia"])

/**
 * O que pede ação da pessoa, logo abaixo da saudação (onda 2, ordem do
 * Início): votação, oposição, avaliação da hospedagem e a filiação coletiva
 * com prazo de desistência. A situação da contribuição, quando há problema,
 * vem logo depois, no topo da faixa "Minha situação" (minha-situacao.tsx).
 *
 * Cada consulta tem a própria saída (A69): uma que falha não derruba as
 * outras — e não some calada (A187): a seção diz que algo não carregou, que
 * pode haver uma votação ou uma avaliação pendente que não apareceu. No
 * "Ver como filiado" nada grava — as avaliações pendentes são só lidas, sem
 * gerar as que faltam.
 *
 * A seção ganha o título "Para você resolver" (A146) e só aparece quando há
 * o que resolver (ou o aviso de que algo não carregou).
 *
 * Filiados › Área do associado: Votação ou Hospedagem desabilitada não é
 * consultada. Votação suspensa (ou o portal em modo de consulta) mantém o
 * aviso da votação aberta, sem "Votar" — o link pessoal do e-mail continua
 * valendo. Hospedagem sem poder gravar tira a avaliação (as estrelas levam a
 * gravar) e não gera as pendências que faltam. Oposição e filiação coletiva
 * nunca saem: são direitos com prazo.
 */
export async function PendenciasInicio({
  filiado,
  preview,
  partes,
}: {
  filiado: Filiado
  preview: boolean
  partes: PartesDoInicio
}) {
  const podeVotar = aceitaAcao(partes, "votacao")
  const [rAssembleias, rOposicoes, rAvaliacoes, rColetiva] = await Promise.all([
    aparece(partes, "votacao")
      ? assembleiasSeAtivo(filiado, "assembleias")
      : Promise.resolve({ valor: [] as AssembleiaDoFiliado[] }),
    tentar("oposição", () => oposicoesParaFiliado(filiado.cpf)),
    // Como o Uber: a avaliação da última hospedagem aparece logo ao entrar.
    aceitaAcao(partes, "hospedagem")
      ? tentar("avaliações de hospedagem", async () => {
          const registros = await registrosDaPessoa(filiado.cpf)
          return preview ? avaliacoesPendentesSoLeitura(registros) : pendenciasDaPessoa(registros)
        })
      : Promise.resolve({ valor: [] as PendenciaAvaliacao[] }),
    tentar("filiação coletiva", () => situacaoColetivaDoFiliado(filiado.filiacaoId)),
  ])
  const falhou = !rAssembleias || !rOposicoes || !rAvaliacoes || !rColetiva
  const assembleias = (rAssembleias?.valor ?? []).filter((a) => PEDEM_ACAO.has(estadoVotacao(a).chave))
  const oposicoes = rOposicoes?.valor ?? []
  const avaliacoes = rAvaliacoes?.valor ?? []
  const coletiva = rColetiva?.valor ?? null

  const nada = assembleias.length === 0 && oposicoes.length === 0 && avaliacoes.length === 0 && !coletiva?.emProcesso
  if (nada && !falhou) return null

  return (
    <section aria-labelledby="inicio-resolver" className="grid gap-3">
      <h2 id="inicio-resolver" className="text-lg font-semibold">
        Para você resolver
      </h2>
      {assembleias.map((a) => {
        // Mesma regra da lista /portal/votacao e da cédula (achado A3): só
        // quem pode votar AGORA vê "Votar" e a contagem "encerra em"; na
        // carência o banner explica, sem botão. Com o voto pelo portal
        // pausado (Área do associado), o banner leva à Votação, que explica.
        const estado = estadoVotacao(a)
        const votar = estado.chave === "votar" && podeVotar
        return (
          <Link
            key={a.assembleiaId}
            href={votar ? `/portal/votacao/${a.assembleiaId}` : "/portal/votacao"}
            className={DESTAQUE}
          >
            <div className="flex min-w-0 items-start gap-3">
              <div className="bg-primary/15 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                {a.online ? <Vote className="size-5" /> : <CalendarClock className="size-5" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {estado.titulo}
                  {estado.chave === "carencia" && (
                    <Badge variant={estado.variante} className="ml-2 align-middle">
                      {estado.rotulo}
                    </Badge>
                  )}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {a.nome ?? a.tema ?? "Assembleia"}
                  {a.empregador && <> · {a.empregador}</>}
                  {estado.chave === "votar" ? (
                    <>
                      {" · "}
                      {a.termino ? (
                        // O relógio muda a cada segundo e faz parte do nome
                        // do link: o leitor de tela ouve a hora fixa (A156).
                        <>
                          <span aria-hidden>
                            <ContagemRegressiva ate={a.termino} />
                          </span>
                          <span className="sr-only">encerra em {formatarDataHora(a.termino)}</span>
                        </>
                      ) : (
                        ROTULOS_MODALIDADE[a.modalidade]
                      )}
                    </>
                  ) : null}
                </p>
                {estado.detalhe && <p className="text-muted-foreground mt-0.5 text-xs">{estado.detalhe}</p>}
                {estado.chave === "votar" && !podeVotar && (
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    O voto pelo portal está pausado agora. Veja em Votação como participar.
                  </p>
                )}
              </div>
            </div>
            {votar ? (
              // Aparência de botão sem <button> dentro do <a>: o banner
              // inteiro já é o link.
              <span className={buttonVariants({ size: "sm" })}>
                <Vote />
                Votar
              </span>
            ) : (
              <ArrowRight className="text-muted-foreground size-4" />
            )}
          </Link>
        )
      })}

      {oposicoes.map((o) => (
        <Link
          key={o.campanhaId}
          href={
            o.pendenteDocumento && o.opositorId
              ? `/portal/oposicao/comprovante/${o.opositorId}`
              : `/portal/oposicao/${o.campanhaId}`
          }
          className={DESTAQUE}
        >
          <div className="flex min-w-0 items-start gap-3">
            <div className="bg-primary/15 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
              {o.pendenteDocumento ? <FileSignature className="size-5" /> : <HandCoins className="size-5" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {o.pendenteDocumento ? "Falta enviar sua carta assinada" : "Oposição à contribuição aberta"}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {o.nome ?? "Contribuição assistencial"}
                {o.detalhe && <> · {o.detalhe}</>}
                {o.prazoFim && (
                  <>
                    {" · "}
                    {/* 23:59:59 de Brasília, não do relógio do aparelho (A185):
                        é o mesmo fim que o servidor aplica (estadoPrazo). */}
                    <ContagemRegressiva ate={`${o.prazoFim.slice(0, 10)}T23:59:59-03:00`} />
                  </>
                )}
              </p>
            </div>
          </div>
          <span className={buttonVariants({ size: "sm" })}>
            {o.pendenteDocumento ? (
              <>
                <FileSignature />
                Enviar carta
              </>
            ) : (
              <>
                <HandCoins />
                Opor-me
              </>
            )}
          </span>
        </Link>
      ))}

      <AvaliacoesPendentes pendencias={avaliacoes} preview={preview} nivelTitulo={3} />

      {coletiva?.emProcesso && (
        <Link href="/portal/desfiliacao" className={DESTAQUE}>
          <div className="flex min-w-0 items-start gap-3">
            <div className="bg-background flex size-9 shrink-0 items-center justify-center rounded-lg">
              <UsersRound className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">Você foi filiado por decisão da assembleia</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Filiação coletiva aprovada em acordo coletivo
                {coletiva.prazo && (
                  <>
                    {" · desistência até "}
                    {formatarData(coletiva.prazo)}
                  </>
                )}
              </p>
            </div>
          </div>
          <span className={buttonVariants({ size: "sm", variant: "outline" })}>Ver minha filiação</span>
        </Link>
      )}

      {falhou && (
        <Indisponivel className="text-xs">
          {nada
            ? "Não foi possível conferir agora se há votação, avaliação ou outra pendência para você. Tente de novo daqui a pouco."
            : "Parte das pendências não carregou agora — pode haver outra além destas."}
        </Indisponivel>
      )}
    </section>
  )
}
