import type { Metadata } from "next"
import Link from "next/link"
import { ChevronDown, Inbox, Info, Reply } from "lucide-react"

import { MOTIVO_DESFILIACAO } from "@/app/portal/primeiro-acesso/regras"
import { SituacaoAtendimentoBadge } from "@/components/atendimento/conversa"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { CabecalhoPagina } from "@/components/portal/cabecalho-pagina"
import { EstadoVazio } from "@/components/portal/estado-vazio"
import { paginaIndisponivel } from "@/components/portal/guarda-parte"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  PEDIDOS_SAUDE,
  assuntoAtendimento,
  assuntoSigiloso,
  assuntosPorExtenso,
  pedidoSaude,
  prazoLegivel,
  type AssuntoAtendimento,
} from "@/lib/atendimento-constantes"
import { hojeSP } from "@/lib/db/comum"
import { registrosDoCpf } from "@/lib/db/filiado-portal"
import { meusAtendimentos, regrasDoAtendimento, type Atendimento } from "@/lib/db/portal-atendimentos"
import { bloqueioDaParte, estadoDaParte } from "@/lib/db/portal-partes"
import { minhasCats } from "@/lib/db/saude-portal"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { cn } from "@/lib/utils"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { AvisoEnvioParado } from "./aviso-envio-parado"
import { NovaSolicitacaoForm } from "./formularios"

export const metadata: Metadata = { title: "Atendimento" }

/** Acima disso, as concluídas recolhem: com duas ou três solicitações, esconder uma atrapalha. */
const RECOLHER_CONCLUIDAS_ACIMA = 5

type Parametros = {
  assunto?: string | string[]
  titulo?: string | string[]
  /** Saúde: o código do pedido (PEDIDOS_SAUDE) — o resumo clínico não vem na URL (R2). */
  pedido?: string | string[]
  /** Saúde, pedido "copia_cat": a CAT do próprio filiado. */
  cat?: string | string[]
  nova?: string | string[]
  /** "desfiliacao": o pedido vem de Minha filiação e passa pelo primeiro acesso pendente. */
  motivo?: string | string[]
}

function um(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

/**
 * O assunto que o link pré-escolhe entre os que a entidade oferece (Área do
 * associado): o próprio; fora da lista, "Outro assunto" ou, sem ele, o
 * primeiro — quem chega de outra página encontra o formulário pronto e troca
 * se quiser.
 */
function assuntoOferecido(pedido: AssuntoAtendimento, oferecidos: readonly AssuntoAtendimento[]): AssuntoAtendimento | null {
  if (oferecidos.includes(pedido)) return pedido
  if (oferecidos.includes("outro")) return "outro"
  return oferecidos[0] ?? null
}

/**
 * O resumo de um pedido de saúde a partir do código (PEDIDOS_SAUDE). Na
 * cópia de CAT, o número (ou a data) só entra se a CAT é do próprio filiado.
 */
async function tituloDoPedidoSaude(codigo: string | undefined, catId: string | undefined, cpf: string): Promise<string | null> {
  const pedido = pedidoSaude(codigo)
  if (!pedido) return null
  if (pedido === "copia_cat" && catId) {
    const cats = await registrosDoCpf(cpf)
      .then(minhasCats)
      .catch(() => [])
    const c = cats.find((x) => x.id === catId)
    if (c?.numero) return `Cópia da CAT nº ${c.numero}`
    if (c?.dataAcidente) return `Cópia da CAT do acidente de ${formatarData(c.dataAcidente)}`
  }
  return PEDIDOS_SAUDE[pedido]
}

/**
 * O filiado abre solicitações e acompanha cada uma (onda 4, F2). Quem já tem
 * solicitações vê primeiro a lista — as respondidas, que esperam por ele, no
 * topo e em destaque — com o formulário recolhido atrás de "Nova
 * solicitação" (A95/A96); quem não tem nenhuma, ou chega por um link com o
 * assunto já escolhido (?assunto=&titulo=, A23; ?nova=1), vê o formulário
 * aberto.
 *
 * Área do associado: o formulário oferece só os assuntos e o anexo que a
 * entidade escolheu; com o Atendimento suspenso (ou o portal em modo de
 * consulta), "Nova solicitação" dá lugar ao aviso e a lista segue.
 */
export default async function PortalAtendimentoPage({ searchParams }: { searchParams: Promise<Parametros> }) {
  // Desabilitado: o "indisponível" antes de qualquer leitura — o layout
  // renderiza junto com esta página e não a impede de rodar.
  const indisponivel = await paginaIndisponivel("atendimento")
  if (indisponivel) return indisponivel
  const { filiado, preview } = await requireVisualizacaoPortal()
  const p = await searchParams
  // Pedido de desfiliação (marca do botão de Minha filiação): só o primeiro
  // acesso pendente deixa de parar o envio; o resto da régua continua.
  const desfiliacao = um(p.motivo) === MOTIVO_DESFILIACAO
  const [{ lista, disponivel }, regras, bloqueio, sindicato] = await Promise.all([
    meusAtendimentos(filiado.cpf),
    regrasDoAtendimento(),
    bloqueioDaParte("atendimento", undefined, { ignorarPrimeiroAcesso: desfiliacao }).catch(() => null),
    estadoDaParte("sindicato").catch(() => "habilitada" as const),
  ])
  const hoje = hojeSP()

  // Só assunto da lista fechada (e oferecido pela entidade); o resumo, no tamanho do campo.
  const pedido = assuntoAtendimento(um(p.assunto))?.chave ?? null
  const assuntoInicial = pedido ? assuntoOferecido(pedido, regras.assuntos) : null
  // Saúde (RIPD de saúde, R2): `titulo` da URL é ignorado; o resumo sai do
  // código do pedido, montado aqui no servidor.
  const tituloInicial =
    (assuntoSigiloso(pedido)
      ? await tituloDoPedidoSaude(um(p.pedido), um(p.cat), filiado.cpf)
      : um(p.titulo)?.trim().replace(/\s+/g, " ").slice(0, 140)) || null
  const abrirFormulario = lista.length === 0 || um(p.nova) === "1" || !!assuntoInicial || !!tituloInicial
  // Sem assunto a oferecer (ex.: só "Saúde" marcado e a Saúde suspensa), também não há o que abrir.
  const semEnvio =
    bloqueio ?? (regras.assuntos.length === 0 ? "No momento não há assunto aberto para novas solicitações pelo portal." : null)
  const avisoSemEnvio = semEnvio ? (
    <AvisoEnvioParado titulo="Novas solicitações paradas" mensagem={semEnvio} canais={sindicato !== "desabilitada"} />
  ) : null

  const abertas = lista.filter((a) => a.situacao !== "concluida")
  const concluidas = lista.filter((a) => a.situacao === "concluida")
  const recolher = lista.length > RECOLHER_CONCLUIDAS_ACIMA && concluidas.length > 0

  // A key remonta o formulário quando outro link traz outro assunto/resumo
  // sem sair da página: o assunto escolhido vive num estado do formulário.
  // Na visualização da gestão o formulário fica aberto para leitura e só o
  // envio é desligado (A167): quem atende por telefone percorre os campos
  // junto com o filiado.
  const formulario = (
    <NovaSolicitacaoForm
      key={`${assuntoInicial ?? ""}|${tituloInicial ?? ""}`}
      assuntoInicial={assuntoInicial}
      tituloInicial={tituloInicial}
      hoje={hoje}
      preview={preview}
      assuntos={regras.assuntos}
      permitirAnexo={regras.permitirAnexo}
      motivo={desfiliacao ? MOTIVO_DESFILIACAO : null}
    />
  )

  return (
    <>
      <CabecalhoPagina
        secao="/portal/atendimento"
        titulo="Atendimento"
        subtitulo={
          regras.assuntos.length > 0
            ? `Fale com a entidade por aqui: ${assuntosPorExtenso(regras.assuntos)}. Cada pedido tem prazo de resposta.`
            : "Fale com a entidade por aqui. Cada pedido tem prazo de resposta."
        }
      />

      {!disponivel ? (
        <Alert>
          <Info />
          <AlertDescription>O atendimento pelo portal ainda não está disponível nesta entidade.</AlertDescription>
        </Alert>
      ) : lista.length === 0 && avisoSemEnvio ? (
        avisoSemEnvio
      ) : lista.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              Nova solicitação
            </CardTitle>
            <CardDescription>Escolha o assunto, resuma o pedido e conte os detalhes. A entidade responde por aqui e você recebe um aviso.</CardDescription>
          </CardHeader>
          <CardContent>{formulario}</CardContent>
        </Card>
      ) : (
        <>
          {/* Recolhido, é um botão de uma linha acima da lista (padrão da casa: GrupoColapsavel). */}
          {avisoSemEnvio ?? (
            <GrupoColapsavel titulo="Nova solicitação" descricao="Abrir um pedido novo à entidade" aberto={abrirFormulario}>
              {formulario}
            </GrupoColapsavel>
          )}

          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>
                Minhas solicitações
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {recolher ? (
                <>
                  {abertas.length > 0 ? (
                    <ListaSolicitacoes itens={abertas} hoje={hoje} />
                  ) : (
                    <EstadoVazio compacto icone={Inbox} titulo="Nenhuma solicitação em aberto." />
                  )}
                  <details className="group border-t pt-2">
                    <summary className="hover:bg-muted/40 -mx-2 flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md px-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                      Concluídas ({concluidas.length})
                      <ChevronDown className="text-muted-foreground size-4 transition-transform group-open:rotate-180" aria-hidden />
                    </summary>
                    <ListaSolicitacoes itens={concluidas} hoje={hoje} />
                  </details>
                </>
              ) : (
                <ListaSolicitacoes itens={lista} hoje={hoje} />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}

function ListaSolicitacoes({ itens, hoje }: { itens: Atendimento[]; hoje: string }) {
  return (
    <ul className="divide-y">
      {itens.map((a) => {
        const prazo = prazoLegivel(a, hoje)
        const respondida = a.situacao === "respondida"
        return (
          <li key={a.id}>
            <Link
              href={`/portal/atendimento/${a.id}`}
              className={cn(
                "-mx-2 flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-md px-2 py-3 transition-colors",
                // A resposta que espera pela pessoa salta aos olhos (vem primeiro na lista).
                respondida ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/40"
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{a.titulo}</span>
                {respondida && (
                  <span className="mt-0.5 flex items-center gap-1.5 text-sm">
                    <Reply className="text-primary size-4 shrink-0" aria-hidden />
                    A entidade respondeu — abra para ler
                  </span>
                )}
                <span className="text-muted-foreground mt-0.5 block text-xs">
                  {a.assuntoRotulo} · aberta em {formatarDataHora(a.criadoEm)}
                  {prazo ? ` · ${prazo}` : ""}
                </span>
              </span>
              <SituacaoAtendimentoBadge situacao={a.situacao} atrasada={a.atrasada} />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
