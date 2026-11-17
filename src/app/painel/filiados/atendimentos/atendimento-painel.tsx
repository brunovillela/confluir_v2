import Link from "next/link"
import { ExternalLink, TriangleAlert, UserRound } from "lucide-react"

import { ConversaAtendimento, SituacaoAtendimentoBadge } from "@/components/atendimento/conversa"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { conversaComMarcos, type Atendimento, type MensagemAtendimento } from "@/lib/db/portal-atendimentos"
import { configDaParte } from "@/lib/db/portal-partes"
import { getSessaoPainel } from "@/lib/auth"
import { formatarCpf } from "@/lib/cpf"
import { moduloDaRota, podeAcessarModulo } from "@/lib/permissoes"
import { formatarData, formatarDataHora } from "@/lib/formato"

import { RespostaAtendimentoForm } from "./resposta-form"

/**
 * O bloco de atendimento do painel — a conversa e o formulário de resposta.
 * Vive na página da solicitação e, igual, na página da Demanda que ela gerou.
 * O prazo para o filiado reabrir, na confirmação de "Responder e concluir", é
 * o da entidade (Filiados › Área do associado); na dúvida, o padrão.
 */
export async function AtendimentoPainel({
  atendimento: a,
  mensagens,
  mostrarCabecalho = true,
}: {
  atendimento: Atendimento
  mensagens: MensagemAtendimento[]
  mostrarCabecalho?: boolean
}) {
  // Uma leitura (com cache por requisição) para o prazo e o estado da parte.
  const parte = await configDaParte("atendimento").catch(() => null)
  const prazoReabrirDias = parte?.opcoes.prazo_reabrir_dias
  // Desabilitado em Filiados › Área do associado: a conversa some do portal e
  // o aviso da resposta não sai (nem e-mail) — quem responde precisa saber.
  const desabilitadoNoPortal = parte?.estado === "desabilitada"
  // O link para mudar só para quem abre a Área do associado (filiacao_gestao);
  // quem atende pela Saúde ou pelas Demandas lê a quem pedir.
  const AREA = "/painel/filiados/area-do-associado"
  const podeMudar = desabilitadoNoPortal
    ? await getSessaoPainel()
        .then((sessao) => {
          const modulo = moduloDaRota(AREA)
          return !!sessao && (!modulo || podeAcessarModulo(sessao.permissoes, modulo))
        })
        .catch(() => false)
    : false
  return (
    <>
      {mostrarCabecalho && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{a.titulo}</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {a.assuntoRotulo} · aberta em {formatarDataHora(a.criadoEm)}
              {a.prazo ? ` · prazo ${formatarData(a.prazo)}` : ""}
              {a.primeiraRespostaEm ? ` · primeira resposta em ${formatarDataHora(a.primeiraRespostaEm)}` : ""}
            </p>
          </div>
          <SituacaoAtendimentoBadge situacao={a.situacao} atrasada={a.atrasada} />
        </div>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2">
            <UserRound className="text-muted-foreground size-4" />
            <span>
              <strong>{a.nome ?? "Filiado"}</strong>
              <span className="text-muted-foreground"> · CPF {formatarCpf(a.cpf)}{a.email ? ` · ${a.email}` : ""}</span>
            </span>
          </span>
          <span className="flex flex-wrap gap-3 text-xs">
            {a.filiacaoId && (
              <Link href={`/painel/filiados/${a.filiacaoId}`} className="inline-flex items-center gap-1 underline underline-offset-4">
                <ExternalLink className="size-3.5" />
                Ficha do filiado
              </Link>
            )}
            {a.demandaId && (
              <Link href={`/painel/ferramentas/demandas/${a.demandaId}`} className="inline-flex items-center gap-1 underline underline-offset-4">
                <ExternalLink className="size-3.5" />
                Demanda
              </Link>
            )}
          </span>
        </CardContent>
      </Card>

      {desabilitadoNoPortal && (
        <Alert variant="warning">
          <TriangleAlert aria-hidden />
          <AlertTitle>O Atendimento está desabilitado no portal</AlertTitle>
          <AlertDescription>
            O associado não vê esta conversa e a resposta escrita aqui não chega a ele — nem pelo sino, nem por e-mail.{" "}
            {podeMudar ? (
              <>
                Avise-o por outro canal ou mude o Atendimento para suspenso em{" "}
                <Link href={`${AREA}#parte-atendimento`} className="underline underline-offset-2">
                  Filiados › Área do associado
                </Link>
                .
              </>
            ) : (
              "Avise-o por outro canal ou peça a quem gerencia a Área do associado para suspender o Atendimento."
            )}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conversa com o filiado</CardTitle>
          <CardDescription className="text-xs">O que a entidade escreve aqui aparece no portal e dispara um aviso ao filiado.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {/* Mesma linha do tempo do portal (aberta, primeira resposta, encerrada…), do lado da entidade. */}
          <ConversaAtendimento
            mensagens={conversaComMarcos(a, mensagens, "entidade")}
            ladoDeCa="entidade"
            anexoBase="/painel/filiados/atendimentos/anexo"
          />
          <RespostaAtendimentoForm
            atendimentoId={a.id}
            concluida={a.situacao === "concluida"}
            prazoReabrirDias={prazoReabrirDias}
          />
        </CardContent>
      </Card>
    </>
  )
}
