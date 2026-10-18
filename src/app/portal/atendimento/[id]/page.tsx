import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CheckCheck, Plus } from "lucide-react"

import { ehPedidoDeDesfiliacao, MOTIVO_DESFILIACAO } from "@/app/portal/primeiro-acesso/regras"
import { ConversaAtendimento, SituacaoAtendimentoBadge } from "@/components/atendimento/conversa"
import { AvisoDaUrl } from "@/components/portal/aviso-da-url"
import { CabecalhoPagina } from "@/components/portal/cabecalho-pagina"
import { paginaIndisponivel } from "@/components/portal/guarda-parte"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { explicacaoSituacaoAtendimento, prazoLegivel, reabrirAte } from "@/lib/atendimento-constantes"
import { hojeSP } from "@/lib/db/comum"
import {
  atendimentoDoFiliado,
  concluidaPeloFiliado,
  conversaComMarcos,
  regrasDoAtendimento,
} from "@/lib/db/portal-atendimentos"
import { bloqueioDaParte, estadoDaParte } from "@/lib/db/portal-partes"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { AvisoEnvioParado } from "../aviso-envio-parado"
import { EncerrarSolicitacaoForm, ReabrirSolicitacaoForm, ResponderForm } from "../formularios"

export const metadata: Metadata = { title: "Solicitação" }

export default async function PortalAtendimentoDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ aberta?: string; encerrada?: string; reaberta?: string; motivo?: string }>
}) {
  // Desabilitado: o "indisponível" antes de qualquer leitura — o layout
  // renderiza junto com esta página e não a impede de rodar (nem o notFound).
  const indisponivel = await paginaIndisponivel("atendimento")
  if (indisponivel) return indisponivel
  const { filiado, preview } = await requireVisualizacaoPortal()
  const { id } = await params
  const { aberta, encerrada, reaberta, motivo } = await searchParams
  const [dados, regras, sindicato] = await Promise.all([
    atendimentoDoFiliado(id, filiado.cpf),
    regrasDoAtendimento(),
    estadoDaParte("sindicato").catch(() => "habilitada" as const),
  ])
  if (!dados) notFound()
  const { atendimento: a, mensagens } = dados
  // A marca da desfiliação (o portão deixa passar com ela) só dispensa o
  // primeiro acesso no próprio pedido de desfiliação: a conversa dele segue
  // com o primeiro acesso pendente. Nas outras, a marca não muda nada.
  const desfiliacao = motivo === MOTIVO_DESFILIACAO && ehPedidoDeDesfiliacao(a.titulo)
  const marca = desfiliacao ? MOTIVO_DESFILIACAO : null
  // Atendimento suspenso ou portal em modo de consulta: a conversa fica, os envios saem.
  const bloqueio = await bloqueioDaParte("atendimento", undefined, { ignorarPrimeiroAcesso: desfiliacao }).catch(
    () => null
  )
  const prazo = prazoLegivel(a, hojeSP())
  const concluida = a.situacao === "concluida"
  // Concluída há pouco: o associado ainda pode reabrir (A97), no prazo da entidade.
  const ate = reabrirAte(a, regras.prazoReabrirDias)
  const porVoce = concluidaPeloFiliado(a, mensagens)
  // A palavra final da entidade fecha a conversa (concluir exige texto desde a onda 5).
  const finalDaEntidade = mensagens.filter((m) => m.tipo === "mensagem").at(-1)?.autor === "entidade"

  // A conclusão não é silenciosa (A51): diz quando, quem concluiu, onde está
  // a palavra final e o que fazer se não resolveu.
  const avisoConcluida = concluida ? (
    <Alert variant="info">
      <CheckCheck />
      <AlertTitle>Solicitação concluída{a.concluidaEm ? ` em ${formatarDataHora(a.concluidaEm)}` : ""}</AlertTitle>
      <AlertDescription>
        {porVoce
          ? "Você marcou esta solicitação como resolvida."
          : finalDaEntidade
            ? "A entidade concluiu esta solicitação. A resposta final está no fim da conversa, abaixo."
            : "A entidade concluiu esta solicitação."}{" "}
        {!ate
          ? "Se o assunto voltou, abra uma nova solicitação."
          : bloqueio
            ? `Não resolveu? O prazo para reabrir vai até ${ate}, mas o envio pelo portal está parado no momento.`
            : `Não resolveu? Você pode reabri-la até ${ate}, no fim desta página.`}
      </AlertDescription>
    </Alert>
  ) : null

  return (
    <>
      <CabecalhoPagina
        secao="/portal/atendimento"
        voltar={{ base: "/portal/atendimento", rotulo: "Atendimento" }}
        titulo={a.titulo}
        subtitulo={
          <>
            {a.assuntoRotulo} · aberta em {formatarDataHora(a.criadoEm)}
            {prazo ? ` · ${prazo}` : ""}
          </>
        }
        acoes={<SituacaoAtendimentoBadge situacao={a.situacao} atrasada={a.atrasada} />}
      />

      {aberta === "1" && (
        <AvisoDaUrl parametros={["aberta"]}>
          <Alert variant="success">
            <AlertDescription>
              Solicitação enviada. A entidade responde por aqui{a.prazo ? ` até ${formatarData(a.prazo)}` : ""}, e você recebe um aviso.
            </AlertDescription>
          </Alert>
        </AvisoDaUrl>
      )}
      {/* Logo depois de o próprio associado encerrar, o aviso de sucesso basta;
          sem ele (voltar pelo histórico, com a URL já limpa), o "concluída". */}
      {encerrada === "1" && concluida && (
        <AvisoDaUrl parametros={["encerrada"]} senao={avisoConcluida}>
          <Alert variant="success">
            <AlertDescription>Solicitação encerrada. A entidade foi avisada.</AlertDescription>
          </Alert>
        </AvisoDaUrl>
      )}
      {reaberta === "1" && !concluida && (
        <AvisoDaUrl parametros={["reaberta"]}>
          <Alert variant="success">
            <AlertDescription>Solicitação reaberta. A entidade foi avisada — conte abaixo o que ainda falta.</AlertDescription>
          </Alert>
        </AvisoDaUrl>
      )}

      {concluida ? (
        encerrada !== "1" && avisoConcluida
      ) : (
        <p className="text-muted-foreground text-sm">{explicacaoSituacaoAtendimento(a.situacao, regras.prazoReabrirDias)}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Conversa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ConversaAtendimento mensagens={conversaComMarcos(a, mensagens, "filiado")} ladoDeCa="filiado" anexoBase="/portal/atendimento/anexo" />
        </CardContent>
      </Card>

      {bloqueio ? (
        // A visualização da gestão vê o mesmo aviso que o associado.
        <AvisoEnvioParado
          titulo={concluida ? "Reabertura parada no momento" : "Respostas paradas no momento"}
          mensagem={bloqueio}
          detalhe="A conversa e os anexos continuam aqui para consulta."
          canais={sindicato !== "desabilitada"}
        />
      ) : !concluida ? (
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              Responder
            </CardTitle>
          </CardHeader>
          {/* Na visualização da gestão os formulários ficam à vista e só os
              envios são desligados (A167). */}
          <CardContent className="grid gap-6">
            <ResponderForm atendimentoId={a.id} preview={preview} permitirAnexo={regras.permitirAnexo} motivo={marca} />
            <div className="border-t pt-4">
              <EncerrarSolicitacaoForm
                atendimentoId={a.id}
                preview={preview}
                prazoReabrirDias={regras.prazoReabrirDias}
                motivo={marca}
              />
            </div>
          </CardContent>
        </Card>
      ) : ate ? (
        <Card>
          <CardContent>
            <ReabrirSolicitacaoForm atendimentoId={a.id} ate={ate} preview={preview} motivo={marca} />
          </CardContent>
        </Card>
      ) : (
        <div>
          <Button variant="outline" asChild className="min-h-11 w-full sm:w-auto">
            <Link href={`/portal/atendimento?nova=1&assunto=${encodeURIComponent(a.assunto)}`}>
              <Plus />
              Abrir uma nova solicitação
            </Link>
          </Button>
        </div>
      )}
    </>
  )
}
