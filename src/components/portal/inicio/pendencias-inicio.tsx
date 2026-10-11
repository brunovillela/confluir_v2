import Link from "next/link"
import { ArrowRight, CalendarClock, FileSignature, HandCoins, UsersRound, Vote } from "lucide-react"

import { AvaliacoesPendentes } from "@/app/portal/hospedagem/avaliacoes-pendentes"
import { ContagemRegressiva } from "@/components/portal/contagem-regressiva"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { estadoVotacao, ROTULOS_MODALIDADE } from "@/lib/assembleias-constantes"
import type { Filiado } from "@/lib/contas"
import { situacaoColetivaDoFiliado } from "@/lib/db/filiacao-coletiva"
import { pendenciasDaPessoa } from "@/lib/db/hospedagem-avaliacoes"
import { oposicoesParaFiliado } from "@/lib/db/oposicao"
import { avaliacoesPendentesSoLeitura, registrosDaPessoa, seguro } from "@/lib/db/portal-inicio"
import { assembleiasDoFiliado } from "@/lib/db/votacao-portal"
import { formatarData } from "@/lib/formato"

/** Cartão de destaque das pendências (o mesmo padrão em todas). */
const DESTAQUE =
  "group border-primary/40 bg-primary/5 hover:bg-primary/10 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 transition-colors"

/**
 * O que pede ação da pessoa, logo abaixo da saudação (onda 2, ordem do
 * Início): votação, oposição, avaliação da hospedagem e a filiação coletiva
 * com prazo de desistência. A situação da contribuição, quando há problema,
 * vem logo depois, no topo da faixa "Minha situação" (minha-situacao.tsx).
 *
 * Cada consulta tem a própria saída (A69): uma que falha some sozinha. No
 * "Ver como filiado" nada grava — as avaliações pendentes são só lidas, sem
 * gerar as que faltam.
 */
export async function PendenciasInicio({ filiado, preview }: { filiado: Filiado; preview: boolean }) {
  const [assembleias, oposicoes, avaliacoes, coletiva] = await Promise.all([
    filiado.ativo ? seguro("assembleias", () => assembleiasDoFiliado(filiado.cpf), []) : Promise.resolve([]),
    seguro("oposição", () => oposicoesParaFiliado(filiado.cpf), []),
    // Como o Uber: a avaliação da última hospedagem aparece logo ao entrar.
    seguro(
      "avaliações de hospedagem",
      async () => {
        const registros = await registrosDaPessoa(filiado.cpf)
        return preview ? avaliacoesPendentesSoLeitura(registros) : pendenciasDaPessoa(registros)
      },
      []
    ),
    seguro("filiação coletiva", () => situacaoColetivaDoFiliado(filiado.filiacaoId), null),
  ])

  const nada = assembleias.length === 0 && oposicoes.length === 0 && avaliacoes.length === 0 && !coletiva?.emProcesso
  if (nada) return null

  return (
    <div className="grid gap-3">
      {assembleias.map((a) => {
        // Mesma regra da lista /portal/votacao e da cédula (achado A3): só
        // quem pode votar AGORA vê "Votar" e a contagem "encerra em"; antes
        // da abertura e na carência o banner explica, sem botão.
        const estado = estadoVotacao(a)
        return (
          <Link
            key={a.assembleiaId}
            href={
              estado.chave === "votar"
                ? `/portal/votacao/${a.assembleiaId}`
                : estado.chave === "presencial" && a.rodadaId
                  ? `/portal/votacao/rodada/${a.rodadaId}`
                  : "/portal/votacao"
            }
            className={DESTAQUE}
          >
            <div className="flex min-w-0 items-start gap-3">
              <div className="bg-primary/15 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                {a.online ? <Vote className="size-5" /> : <CalendarClock className="size-5" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {estado.titulo}
                  {(estado.chave === "nao_abriu" || estado.chave === "carencia") && (
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
                      {a.termino ? <ContagemRegressiva ate={a.termino} /> : ROTULOS_MODALIDADE[a.modalidade]}
                    </>
                  ) : estado.chave === "presencial" ? (
                    <>
                      {" · "}
                      {a.inicio ? <>a partir de {formatarData(a.inicio)}</> : "confira as datas"}
                    </>
                  ) : null}
                </p>
                {/* "Ainda não abriu" já diz quando no título. */}
                {estado.detalhe && estado.chave !== "nao_abriu" && (
                  <p className="text-muted-foreground mt-0.5 text-xs">{estado.detalhe}</p>
                )}
              </div>
            </div>
            {estado.chave === "votar" ? (
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
                    <ContagemRegressiva ate={`${o.prazoFim}T23:59:59`} />
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

      <AvaliacoesPendentes pendencias={avaliacoes} preview={preview} />

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
          <span className={buttonVariants({ size: "sm", variant: "outline" })}>Saiba mais</span>
        </Link>
      )}
    </div>
  )
}
