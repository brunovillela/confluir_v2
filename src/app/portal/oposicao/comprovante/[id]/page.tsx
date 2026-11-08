import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  CircleHelp,
  Clock,
  Download,
  ExternalLink,
  FileText,
  FileWarning,
  Mail,
  MessageSquare,
  ShieldAlert,
  XCircle,
} from "lucide-react"

import { Marca } from "@/components/marca"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ValidacaoAssinatura } from "@/lib/assinatura-pdf"
import { requireSessaoTrabalhador } from "@/lib/auth"
import { hojeSP } from "@/lib/db/comum"
import { minhaOposicao, obterCampanhaPublica, obterComprovante, registrarAcessoDoTitular, type Comprovante } from "@/lib/db/oposicao"
import { orientacoesDaCampanha } from "@/lib/db/oposicao-ciencia"
import { dadosDaCarta, estadoDaAssinaturaCarta, type EstadoAssinaturaCarta } from "@/lib/db/oposicao-assinatura"
import type { DadosCartaOposicao } from "@/lib/pdf/carta-oposicao"
import { nomeEntidade, obterOrganizacao } from "@/lib/db/organizacao"
import { configDoPortal } from "@/lib/db/portal-partes"
import { formatarCnpjCpf, formatarData, formatarDataHora } from "@/lib/formato"
import { mascaraCpf } from "@/lib/mascaras"
import { aceitaCartaEnviada, assinaPeloConfluir, estadoPrazo } from "@/lib/oposicao-constantes"
import { origemAtual } from "@/lib/tenant-url"
import { regrasDaCampanha } from "@/lib/db/oposicao-regras"
import { getVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import {
  DEPOIS_DE_ACEITA,
  fraseResultado,
  ROTULO_SITUACAO_PORTAL,
  VARIANTE_SITUACAO_PORTAL,
} from "../../situacao-portal"
import { PerguntasFrequentes } from "../../orientacoes"
import { AssinarCartaConfluir, BotaoImprimir, EnviarDocumento } from "./comprovante-forms"

export const metadata: Metadata = { title: "Comprovante de oposição" }

/** Assinador gratuito do governo — o mesmo da ficha de filiação. */
const ASSINADOR_GOVBR = "https://assinador.iti.br"

/** Extrai o id do YouTube de um id cru ou URL (o mesmo do fluxo da oposição). */
function idYoutube(v: string | null): string | null {
  if (!v) return null
  const s = v.trim()
  if (/^[\w-]{11}$/.test(s)) return s
  const m = s.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/)
  return m ? m[1] : null
}

export default async function ComprovantePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ registrada?: string }>
}) {
  // Na visualização da gestão, a sessão de trabalhador seria a de QUEM ATENDE:
  // a tela mostraria o comprovante dele sob a faixa "Visualizando a área
  // de…". O comprovante abre na conta do trabalhador; a lista mostra a
  // situação do filiado visualizado.
  const vis = await getVisualizacaoPortal()
  if (vis?.preview) redirect("/portal/oposicao")

  const sessao = await requireSessaoTrabalhador(`/portal/oposicao/comprovante/${(await params).id}`)
  const { id } = await params
  const c = await obterComprovante(id, sessao.cpf)
  if (!c) notFound()
  // Prova de que a pessoa viu o resultado (M9).
  await registrarAcessoDoTitular(c.id, "comprovante_visto")

  const aguardando = c.situacao === "aguardando_documento"
  // Decisões jurídicas da campanha: carta depois do prazo e assinaturas aceitas.
  const { efetivas: regras } = await regrasDaCampanha(c.campanhaId)
  const cartaForaRecusada = regras.carta_fora_prazo === "recusar"
  // Assinatura pelo próprio Confluir (08/11/2026): disponível conforme a
  // decisão "assinaturas aceitas"; a carta enviada em PDF fica como
  // alternativa (confluir_ou_carta) ou some (confluir).
  const assinaConfluir = aguardando && assinaPeloConfluir(regras.assinaturas_aceitas)
  const aceitaCarta = aceitaCartaEnviada(regras.assinaturas_aceitas)
  const [estadoCarta, dadosCarta] = assinaConfluir
    ? await Promise.all([estadoDaAssinaturaCarta(c, sessao, regras.assinaturas_aceitas), dadosDaCarta(c).then((d) => d.dados)])
    : [null, null]
  // "Não quero me opor" não é oposição: nada de "Oposição registrada" nem de
  // comprovante para imprimir — só a escolha e, no prazo, o caminho de volta.
  const desistente = c.situacao === "desistente"
  if (desistente && c.campanhaId) {
    // Sem unique em cpf+campanha, a mesma pessoa pode ter também uma oposição
    // de fato nesta campanha (legado, ou duas abas): vale a oposição, e esta
    // página não pode dizer que nenhuma foi registrada.
    const vigente = await minhaOposicao(c.campanhaId, sessao.cpf)
    if (vigente && vigente.situacao !== "desistente" && vigente.id !== c.id) {
      redirect(`/portal/oposicao/comprovante/${vigente.id}`)
    }
  }
  const prazo = c.campanhaAberta
    ? estadoPrazo(c.prazo_inicio, c.prazo_fim, hojeSP())
    : "depois"
  // Troca do PDF enviado: em análise e dentro do prazo (a lib confere de novo).
  const podeTrocar = c.situacao === "nao_avaliada" && c.temDocumento && prazo === "aberto"
  const filiado = sessao.perfil === "filiado"

  const [org, origem, cfg] = await Promise.all([
    desistente ? null : obterOrganizacao().catch(() => null),
    desistente ? null : origemAtual().catch(() => null),
    // Filiados › Área do associado: esta página abre mesmo com o portal fora
    // do ar, e o Atendimento pode estar desabilitado. Na dúvida, vale.
    vis ? configDoPortal().catch(() => null) : null,
  ])
  // Discordar, perguntar, o desconto que veio mesmo assim: o filiado tem o
  // Atendimento do portal; o trabalhador não filiado — ou o filiado com o
  // Atendimento fora de alcance —, o e-mail da entidade; sem e-mail e com o
  // portal no ar, O sindicato (nunca desabilitado junto com o Atendimento).
  const portalNoAr = Boolean(vis) && (!cfg || cfg.partes.portal.estado !== "desabilitada")
  const atendimentoNoPortal = portalNoAr && (!cfg || cfg.partes.atendimento.estado !== "desabilitada")
  const contato =
    portalNoAr || org?.emailContato ? (
      <FalarComEntidade
        noPortal={atendimentoNoPortal ? "atendimento" : portalNoAr ? "sindicato" : null}
        email={org?.emailContato ?? null}
        protocolo={c.protocolo}
      />
    ) : null

  // Vídeo de agradecimento da campanha (baixo da avaliação): só logo depois
  // de registrar a oposição, não a cada visita ao comprovante.
  const { registrada } = await searchParams
  const embedAgradecimento = registrada === "1" && !desistente ? idYoutube(c.videoAgradecimentoUrl) : null
  const videoAgradecimento = embedAgradecimento ? (
    <div className="aspect-video w-full overflow-hidden rounded-lg border print:hidden">
      <iframe
        src={`https://www.youtube.com/embed/${embedAgradecimento}`}
        title="Vídeo de agradecimento da entidade"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
        allowFullScreen
        className="h-full w-full"
      />
    </div>
  ) : null

  // Passos da carta assinada fora (gov.br/e-CPF) e enviada em PDF.
  const passosCarta = (
    <ol className="grid list-decimal gap-3 pl-5 text-sm">
      <li>
        <p>Baixe a sua carta de oposição, já preenchida com seus dados.</p>
        <div className="mt-2 grid gap-1.5">
          <Button variant="outline" asChild className="w-fit">
            <a
              href={`/portal/oposicao/comprovante/${c.id}/carta`}
              target="_blank"
              rel="noreferrer"
            >
              <Download />
              Baixar carta (PDF)
            </a>
          </Button>
          {/* O modelo que a gestão cadastrou na campanha chega ao
              trabalhador, como alternativa à carta gerada — um
              documento só é assinado e enviado. */}
          {c.modeloUrl && (
            <p className="text-muted-foreground text-xs">
              A entidade também oferece um modelo próprio:{" "}
              <a
                href={c.modeloUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline underline-offset-4"
              >
                baixar o modelo da entidade (PDF)
              </a>
              . Assine e envie só um dos dois documentos.
            </p>
          )}
        </div>
      </li>
      <li>
        <p>
          Assine a carta no{" "}
          <a
            href={ASSINADOR_GOVBR}
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex items-center gap-1 underline underline-offset-4"
          >
            Assinador gov.br
            <ExternalLink className="size-3" />
            <span className="sr-only">(abre em outra aba)</span>
          </a>
          .
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          É gratuito e pede uma conta gov.br nível prata ou ouro. Assine com a
          SUA conta: o CPF da assinatura precisa ser o seu. O gov.br devolve
          um arquivo novo, já assinado — é ele que você envia.
          {regras.assinaturas_aceitas === "govbr_icp"
            ? " Sem conta prata ou ouro? A carta também pode ser assinada com certificado digital e-CPF (ICP-Brasil)."
            : " Esta campanha aceita só a assinatura do gov.br."}
        </p>
        <PassoAPassoAssinador />
      </li>
      <li>
        <p>
          Envie aqui o PDF assinado
          {c.prazo_fim && prazo === "aberto" ? ` até ${formatarData(c.prazo_fim)}` : ""}.
        </p>
        <div className="mt-2">
          {!(cartaForaRecusada && prazo === "depois") && (
            <EnviarDocumento opositorId={c.id} campanhaId={c.campanhaId} />
          )}
        </div>
      </li>
    </ol>
  )
  const blocoAssinatura = !assinaConfluir ? (
    passosCarta
  ) : (
    <div className="grid gap-5">
      <AssinarPeloConfluir c={c} estado={estadoCarta} dadosCarta={dadosCarta} bloqueada={cartaForaRecusada && prazo === "depois"} />
      {aceitaCarta && (
        <details className="rounded-md border px-3 print:hidden">
          <summary className="text-primary focus-visible:ring-ring/50 flex min-h-11 cursor-pointer items-center rounded-md text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3">
            Prefere assinar no gov.br e enviar o PDF?
          </summary>
          <div className="pb-3">{passosCarta}</div>
        </details>
      )}
    </div>
  )

  const conteudo = desistente ? (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-base font-semibold">Você optou por não se opor</h1>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm">
          {c.dia ? `Em ${formatarData(c.dia)}, você` : "Você"} escolheu não
          registrar oposição
          {c.campanhaNome ? (
            <>
              {" "}
              na campanha <strong>{c.campanhaNome}</strong>
            </>
          ) : (
            " nesta campanha"
          )}
          . Nenhuma oposição foi registrada em seu nome.
        </p>
        {prazo === "aberto" && c.campanhaId ? (
          <>
            <p className="text-sm">
              O prazo segue aberto até{" "}
              <strong>{formatarData(c.prazo_fim)}</strong> — você pode mudar
              de ideia.
            </p>
            <Button asChild className="w-fit">
              <Link href={`/portal/oposicao/${c.campanhaId}`}>
                Registrar oposição
                <ArrowRight />
              </Link>
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            {prazo === "antes"
              ? `O prazo para se opor começa em ${formatarData(c.prazo_inicio)}.`
              : c.prazo_fim
                ? `O prazo para se opor terminou em ${formatarData(c.prazo_fim)}.`
                : "O prazo para se opor já encerrou."}
          </p>
        )}
      </CardContent>
    </Card>
  ) : aguardando ? (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileWarning className="text-warning-fg size-5" />
          <h1 className="text-base font-semibold">{assinaConfluir ? "Falta assinar a carta" : "Falta enviar a carta assinada"}</h1>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        <p className="text-sm">
          Sua oposição foi registrada (protocolo{" "}
          <strong className="tabular-nums">{c.protocolo ?? "—"}</strong>, em{" "}
          {formatarDataHora(c.confirmado_em)}), mas só é avaliada depois que a
          {assinaConfluir ? " carta for assinada" : " carta assinada no gov.br chegar"}
          {c.prazo_fim && prazo === "aberto" ? (
            <>
              {" "}
              — {assinaConfluir ? "assine" : "envie"} até <strong>{formatarData(c.prazo_fim)}</strong>
            </>
          ) : null}
          .
        </p>
        {c.reprovacao_motivo && (
          <Alert variant="warning">
            <AlertTitle>A entidade pediu uma nova carta</AlertTitle>
            <AlertDescription>{c.reprovacao_motivo}</AlertDescription>
          </Alert>
        )}
        {prazo === "depois" && (
          <Alert variant="warning">
            <AlertDescription>
              O prazo da campanha terminou
              {c.prazo_fim ? ` em ${formatarData(c.prazo_fim)}` : ""}.{" "}
              {cartaForaRecusada
                ? "A carta assinada não pode mais ser enviada. Fale com a entidade."
                : "A carta ainda pode ser enviada aqui; a entidade vai ver que chegou depois do prazo."}
            </AlertDescription>
          </Alert>
        )}

        {/* Como assinar: pelo Confluir (08/11/2026), pela carta no gov.br (A105), ou os dois. */}
        {blocoAssinatura}

        <OQueAcontece filiado={filiado} faltaCarta />

        <div className="flex flex-wrap gap-2 border-t pt-4 print:hidden">
          <BotaoPdfComprovante id={c.id} rotulo="Baixar comprovante do registro (PDF)" />
          {contato}
        </div>
      </CardContent>
    </Card>
  ) : (
    <>
      {/* Só no papel: a identificação da entidade, que a casca da tela não
          imprime (A107). */}
      <div className="hidden gap-0.5 border-b pb-3 text-sm print:grid">
        <p className="font-semibold">{org?.nomeRazao ?? org?.nomeFantasia ?? "—"}</p>
        {org?.cnpjCpf && <p>CNPJ {formatarCnpjCpf(org.cnpjCpf)}</p>}
        <p>
          Comprovante eletrônico de oposição — protocolo {c.protocolo ?? "—"} —
          emitido em {formatarDataHora(new Date().toISOString())}
        </p>
        {origem && <p className="break-all">{`${origem}/portal/oposicao/comprovante/${c.id}`}</p>}
      </div>

      <ResultadoAvaliacao c={c} contato={contato} />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>
              <h1 className="text-base font-semibold">Comprovante de oposição</h1>
            </CardTitle>
            <SeloSituacao situacao={c.situacao} />
          </div>
        </CardHeader>
        <CardContent className="grid gap-5">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Protocolo" valor={c.protocolo?.toString() ?? "—"} />
            <Campo
              rotulo="Registrada em"
              valor={formatarDataHora(c.confirmado_em)}
            />
            <Campo rotulo="Nome" valor={c.nome} />
            <Campo
              rotulo="CPF"
              valor={c.cpf ? mascaraCpf(c.cpf) : "—"}
            />
            <Campo rotulo="Fonte pagadora" valor={c.empregadorNome} />
            <Campo rotulo="Matrícula" valor={c.matricula} />
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground text-xs">Campanha</dt>
              <dd className="mt-0.5 text-sm">
                {c.campanhaNome ?? "—"}
                {c.detalhe_desconto && (
                  <span className="text-muted-foreground">
                    {" "}
                    — {c.detalhe_desconto}
                  </span>
                )}
              </dd>
            </div>
          </dl>

          {c.texto_declaracao && (
            <div className="bg-muted/40 rounded-md border p-4 text-sm whitespace-pre-wrap">
              {c.texto_declaracao}
            </div>
          )}

          {c.temDocumento && (
            <DocumentoEnviado c={c} podeTrocar={podeTrocar} />
          )}

          {c.situacao === "nao_avaliada" && <OQueAcontece filiado={filiado} />}

          <p className="text-muted-foreground text-xs">
            Documento gerado eletronicamente. O registro da oposição, com data,
            hora e origem do acesso, fica guardado pela entidade.
          </p>

          <div className="flex flex-wrap gap-2 print:hidden">
            <BotaoPdfComprovante id={c.id} rotulo="Baixar comprovante (PDF)" />
            <BotaoImprimir />
          </div>
        </CardContent>
      </Card>
    </>
  )

  // Perguntas frequentes da campanha (30/10/2026): as gerais e as da
  // campanha — a carta e o caminho até a empresa são dúvidas daqui. Falha na
  // leitura só tira o cartão.
  const nomeDaEntidade = await nomeEntidade()
  const campanhaPublica = c.campanhaId ? await obterCampanhaPublica(c.campanhaId).catch(() => null) : null
  const perguntas = campanhaPublica ? orientacoesDaCampanha(campanhaPublica, filiado, nomeDaEntidade).perguntas : []
  const faq =
    perguntas.length > 0 ? (
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle role="heading" aria-level={2} className="text-base">
            Perguntas frequentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PerguntasFrequentes itens={perguntas} />
        </CardContent>
      </Card>
    ) : null

  // Na casca do portal (filiado logado — a regra do layout), menu e <main> são
  // do layout: a página é a coluna de leitura com o caminho de volta à lista,
  // como nas outras subpáginas do portal (A17). A casca some na impressão.
  if (vis) {
    return (
      <div className="mx-auto grid w-full max-w-2xl gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href="/portal/oposicao">
              <ArrowLeft />
              Contribuição assistencial
            </Link>
          </Button>
          {/* A ajuda do portal é só de quem está nele (A106). */}
          <Button variant="link" asChild className="px-0">
            <Link href="/portal/ajuda/oposicao">
              <CircleHelp />
              Como funciona
            </Link>
          </Button>
        </div>
        {videoAgradecimento}
        {conteudo}
        {faq}
      </div>
    )
  }

  // Trabalhador não filiado: tela enxuta, com o <main> como landmark (A181).
  const entidade = nomeDaEntidade
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between print:hidden">
        <Marca tenant={entidade} />
        <Button variant="ghost" size="sm" asChild>
          <Link href="/portal/oposicao">
            <ArrowLeft />
            Voltar
          </Link>
        </Button>
      </header>
      <main id="conteudo" className="grid gap-6">
        {videoAgradecimento}
        {conteudo}
        {faq}
      </main>
    </div>
  )
}

/**
 * O caminho dentro do Assinador gov.br (07/11/2026), com as dicas do celular
 * — onde mais se perde a carta: o PDF que abre na tela em vez de baixar, o
 * arquivo assinado que fica em Downloads, o print no lugar do arquivo. A API
 * de assinatura do gov.br é só para órgãos públicos; a assinatura segue fora
 * do sistema, e este guia encurta o vaivém.
 */
function PassoAPassoAssinador() {
  return (
    <details className="bg-muted/40 mt-2 rounded-md border px-3 print:hidden">
      <summary className="text-primary focus-visible:ring-ring/50 flex min-h-11 cursor-pointer items-center rounded-md text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3">
        Passo a passo no Assinador (com dicas para celular)
      </summary>
      <div className="grid gap-3 pb-3 text-sm">
        <ol className="grid list-[lower-alpha] gap-1.5 pl-5">
          <li>
            Abra o{" "}
            <a href={ASSINADOR_GOVBR} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">
              assinador.iti.br
            </a>{" "}
            e entre com a sua conta gov.br (CPF e senha).
          </li>
          <li>Escolha o arquivo da carta que você baixou no passo 1.</li>
          <li>Toque no documento para posicionar a assinatura e siga para assinar.</li>
          <li>Confirme com o código que o gov.br manda para o seu celular (pelo aplicativo gov.br ou por SMS).</li>
          <li>
            Baixe o documento assinado. É um arquivo novo, que costuma terminar em “_assinado.pdf”.
          </li>
          <li>Volte a esta página e envie esse arquivo no passo 3.</li>
        </ol>
        <div className="grid gap-1">
          <p className="font-medium">No celular</p>
          <ul className="text-muted-foreground grid list-disc gap-1 pl-5">
            <li>
              Se a carta abrir na tela em vez de baixar, use o botão de compartilhar e escolha “Salvar em Arquivos” (iPhone)
              ou “Baixar” (Android).
            </li>
            <li>
              Os arquivos baixados ficam em “Arquivos › Downloads” (iPhone) ou em “Downloads” (Android). É lá que você
              escolhe o arquivo, no Assinador e aqui.
            </li>
            <li>Deixe esta página aberta em outra aba para voltar sem precisar entrar de novo.</li>
          </ul>
        </div>
        <Alert variant="warning">
          <AlertDescription>
            Não envie foto, print da tela nem a carta impressa e escaneada: isso apaga a assinatura digital, e a entidade
            pode não aceitar.
          </AlertDescription>
        </Alert>
      </div>
    </details>
  )
}

/**
 * Assinar a carta aqui mesmo, pelo Confluir (08/11/2026): o texto da carta
 * para ler e o formulário (nome, aceites e, fora da janela da sessão, o
 * código). Sem baixar nem enviar arquivo.
 */
function AssinarPeloConfluir({
  c,
  estado,
  dadosCarta,
  bloqueada,
}: {
  c: Comprovante
  estado: EstadoAssinaturaCarta | null
  dadosCarta: DadosCartaOposicao | null
  bloqueada: boolean
}) {
  return (
    <section aria-labelledby="assinar-confluir" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="assinar-confluir" className="text-sm font-semibold">
          Assine a carta aqui mesmo
        </h2>
        <p className="text-muted-foreground text-sm">
          Sem baixar nem enviar arquivo. Leia a carta, confirme e assine: você e a entidade ficam com o PDF assinado e
          um certificado que qualquer pessoa pode conferir.
        </p>
      </div>
      {dadosCarta && <CartaParaLer d={dadosCarta} />}
      {bloqueada ? (
        <Alert variant="warning">
          <AlertDescription>O prazo para assinar a carta terminou. Fale com a entidade.</AlertDescription>
        </Alert>
      ) : (
        <AssinarCartaConfluir
          opositorId={c.id}
          nome={c.nome}
          emailMascarado={estado?.emailMascarado ?? null}
          dispensaCodigo={Boolean(estado?.prova.dispensaCodigo)}
          codigoPendente={Boolean(estado?.codigoPendente)}
        />
      )}
    </section>
  )
}

/** O texto da carta na tela — o mesmo do PDF (lib/pdf/carta-oposicao). */
function CartaParaLer({ d }: { d: DadosCartaOposicao }) {
  const alvo = d.detalhe || "contribuição assistencial"
  return (
    <div className="bg-muted/40 grid gap-3 rounded-md border p-4 text-sm">
      <p className="text-center text-xs font-semibold tracking-wide uppercase">
        Carta de oposição à contribuição assistencial
      </p>
      <p>
        Eu, <strong>{d.nome ?? "—"}</strong>, inscrito(a) no CPF sob o nº{" "}
        <strong className="tabular-nums">{d.cpf ? mascaraCpf(d.cpf) : "—"}</strong>
        {d.matricula ? `, matrícula ${d.matricula}` : ""}, trabalhador(a)
        {d.empregador ? (
          <>
            {" "}
            vinculado(a) à fonte pagadora <strong>{d.empregador}</strong>
            {d.empregadorCnpj ? `, CNPJ ${d.empregadorCnpj}` : ""}
          </>
        ) : null}
        , venho, pela presente, manifestar de forma livre e expressa a minha <strong>OPOSIÇÃO</strong> ao desconto{" "}
        {d.detalhe ? `de ${alvo}` : `da ${alvo}`}
        {d.campanha ? ` (${d.campanha})` : ""}, nos termos da legislação vigente.
      </p>
      {d.declaracao && <p className="bg-background rounded border p-3 text-xs whitespace-pre-wrap">{d.declaracao}</p>}
      <p>
        Declaro estar ciente de que esta manifestação será encaminhada à entidade sindical e submetida à avaliação
        cabível.
      </p>
      {d.protocolo != null && <p className="text-muted-foreground text-xs">Protocolo: {d.protocolo}</p>}
    </div>
  )
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5 text-sm">{valor ?? "—"}</dd>
    </div>
  )
}

const ICONE_SITUACAO = {
  aguardando_documento: FileWarning,
  nao_avaliada: Clock,
  aprovada: CheckCircle2,
  reprovada: XCircle,
  desistente: Clock,
} as const

/** A situação com o rótulo do trabalhador e um ícone — não só a cor (A15). */
function SeloSituacao({ situacao }: { situacao: Comprovante["situacao"] }) {
  const Icone = ICONE_SITUACAO[situacao]
  return (
    <Badge variant={VARIANTE_SITUACAO_PORTAL[situacao]}>
      <Icone />
      {ROTULO_SITUACAO_PORTAL[situacao]}
    </Badge>
  )
}

/**
 * O resultado da avaliação no lugar do antigo rodapé fixo "sujeita à
 * avaliação" (A15): aceita, não aceita com o motivo, ou em análise — e o que
 * fazer em cada caso. Sai também no papel; os botões, não.
 */
function ResultadoAvaliacao({ c, contato }: { c: Comprovante; contato: React.ReactNode }) {
  const frase = fraseResultado(c.situacao, {
    avaliadaEm: c.avaliacao_data,
    registradaEm: c.dia,
    prazoFim: c.prazo_fim,
  })
  // O botão fica fora do AlertDescription, que sublinha todo <a> dentro dele.
  const acao = contato ? <div className="col-start-2 mt-2 print:hidden">{contato}</div> : null
  if (c.situacao === "aprovada") {
    return (
      <Alert variant="success">
        <CheckCircle2 />
        <AlertTitle>{frase}</AlertTitle>
        <AlertDescription>{DEPOIS_DE_ACEITA}</AlertDescription>
        {acao}
      </Alert>
    )
  }
  if (c.situacao === "reprovada") {
    return (
      <Alert variant="error">
        <XCircle />
        <AlertTitle>{frase}</AlertTitle>
        <AlertDescription>
          <p>
            <strong>Motivo:</strong> {c.reprovacao_motivo ?? "a entidade não informou o motivo."}
          </p>
          <p>
            Se discordar da decisão, fale com a entidade informando o protocolo{" "}
            <strong className="tabular-nums">{c.protocolo ?? "—"}</strong>.
          </p>
        </AlertDescription>
        {acao}
      </Alert>
    )
  }
  return (
    <Alert variant="info">
      <Clock />
      <AlertTitle>{frase}</AlertTitle>
      <AlertDescription>Guarde este comprovante.</AlertDescription>
    </Alert>
  )
}

/** "O que acontece agora" (A106): sem prometer além do que o sistema faz. */
function OQueAcontece({ filiado, faltaCarta = false }: { filiado: boolean; faltaCarta?: boolean }) {
  return (
    <section aria-labelledby="o-que-acontece" className="grid gap-2">
      <h2 id="o-que-acontece" className="text-sm font-semibold">
        O que acontece agora
      </h2>
      <ol className="text-muted-foreground grid list-decimal gap-1 pl-5 text-sm">
        {/* Sem a carta, a gestão nem consegue avaliar (avaliarOpositor só
            aceita oposição em análise). */}
        <li>
          {faltaCarta
            ? "Quando a carta assinada chegar, a entidade analisa a sua oposição."
            : "A entidade analisa a sua oposição."}
        </li>
        <li>
          {filiado
            ? "O resultado aparece nos avisos do portal (e por e-mail, conforme as suas preferências) e neste comprovante."
            : "O resultado chega no seu e-mail e fica neste comprovante."}
        </li>
        <li>
          Se a oposição for aceita, a entidade informa a sua fonte pagadora
          para que a contribuição não seja descontada.
        </li>
      </ol>
    </section>
  )
}

/**
 * A carta que chegou (A53): quando, o resultado da conferência da assinatura
 * dito ao trabalhador (indicativo — quem decide é a entidade), o link para o
 * PDF enviado e, em análise e no prazo, a troca do arquivo.
 */
function DocumentoEnviado({ c, podeTrocar: podeTrocarArquivo }: { c: Comprovante; podeTrocar: boolean }) {
  // Assinada pelo Confluir: não há arquivo a trocar; há o certificado.
  const peloConfluir = c.validacao?.origem === "confluir"
  const podeTrocar = podeTrocarArquivo && !peloConfluir
  // A conferência automática só serve enquanto a entidade não decidiu: numa
  // oposição já aceita, "a entidade pode não aceitar o documento" assustaria
  // à toa; numa não aceita, o motivo de verdade está no resultado acima.
  const conferencia =
    c.situacao === "nao_avaliada"
      ? conferenciaDaAssinatura(c.validacao, podeTrocar ? c.prazo_fim : null)
      : null
  return (
    <section aria-labelledby="carta-enviada" className="grid gap-3 rounded-md border p-4">
      <h2 id="carta-enviada" className="text-sm font-semibold">
        Carta assinada
      </h2>
      <p className="text-sm">
        {peloConfluir ? "Assinada" : "Recebida"}
        {c.documentoRecebidoEm ? ` em ${formatarDataHora(c.documentoRecebidoEm)}` : ""}.
      </p>
      {conferencia && (
        <Alert variant={conferencia.variante} className="print:hidden">
          <conferencia.Icone />
          <AlertDescription>{conferencia.texto}</AlertDescription>
        </Alert>
      )}
      {c.documentoUrl && (
        <Button variant="outline" asChild className="w-fit print:hidden">
          <a href={c.documentoUrl} target="_blank" rel="noreferrer">
            <FileText />
            {peloConfluir ? "Baixar a carta assinada" : "Ver o PDF enviado"}
          </a>
        </Button>
      )}
      {peloConfluir && c.validacao?.certificado && (
        <p className="text-muted-foreground text-xs">
          Qualquer pessoa pode conferir a assinatura em{" "}
          <a
            href={`/verificar/${c.validacao.certificado}`}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-4"
          >
            /verificar/{c.validacao.certificado}
          </a>
          .
        </p>
      )}
      {podeTrocar &&
        (conferencia?.problema ? (
          <EnviarDocumento opositorId={c.id} campanhaId={c.campanhaId} rotulo="Enviar outro arquivo" />
        ) : (
          <details className="print:hidden">
            <summary className="text-primary focus-visible:ring-ring/50 flex min-h-11 w-fit cursor-pointer items-center rounded-md text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3">
              Enviou o arquivo errado? Enviar outro
            </summary>
            <div className="pt-2">
              <EnviarDocumento opositorId={c.id} campanhaId={c.campanhaId} rotulo="Enviar outro arquivo" />
            </div>
          </details>
        ))}
    </section>
  )
}

function conferenciaDaAssinatura(
  v: ValidacaoAssinatura | null,
  ate: string | null
): {
  variante: "success" | "info" | "warning"
  Icone: typeof BadgeCheck
  texto: string
  problema: boolean
} | null {
  if (!v) return null
  if (v.origem === "confluir") {
    return {
      variante: "success",
      Icone: BadgeCheck,
      texto: `Carta assinada por você aqui no Confluir${v.certificado ? ` (certificado ${v.certificado})` : ""}. A entidade analisa a sua oposição.`,
      problema: false,
    }
  }
  const reenviar = ate
    ? ` Você pode enviar outro arquivo até ${formatarData(ate)}.`
    : " Se precisar, fale com a entidade."
  // "Com o seu CPF" só quando a conferência comparou e bateu (cpfConfere).
  const comCpf = v.cpfConfere === true ? " com o seu CPF" : ""
  if (v.situacao === "valida") {
    return {
      variante: "success",
      Icone: BadgeCheck,
      texto: `Assinatura digital conferida: o PDF está assinado${comCpf}.`,
      problema: false,
    }
  }
  if (v.situacao === "ressalva") {
    return {
      variante: "info",
      Icone: BadgeCheck,
      texto: `Encontramos a assinatura digital${comCpf}. A entidade confere o documento na avaliação.`,
      problema: false,
    }
  }
  if (v.situacao === "erro") {
    // O leitor de PDF falhou: não alarma — só não deu para conferir sozinho.
    return {
      variante: "info",
      Icone: ShieldAlert,
      texto: "Não conseguimos conferir a assinatura automaticamente. A entidade confere o documento na avaliação.",
      problema: false,
    }
  }
  // "Não é do seu CPF" só quando o certificado traz um CPF e ele é outro; se
  // nem deu para ler o CPF, vale a mensagem geral abaixo.
  if (v.cpfConfere === false && v.assinaturas.some((a) => Boolean(a.cpf))) {
    return {
      variante: "warning",
      Icone: ShieldAlert,
      texto: `A assinatura deste PDF não é do seu CPF, e a entidade pode não aceitar o documento. Assine com a sua própria conta gov.br.${reenviar}`,
      problema: true,
    }
  }
  return {
    variante: "warning",
    Icone: ShieldAlert,
    texto: `Não encontramos assinatura digital válida neste PDF, e a entidade pode não aceitar o documento. Se você assinou no gov.br, confira se enviou o arquivo assinado que ele devolve.${reenviar}`,
    problema: true,
  }
}

function BotaoPdfComprovante({ id, rotulo }: { id: string; rotulo: string }) {
  return (
    <Button variant="outline" asChild>
      <a href={`/portal/oposicao/comprovante/${id}/pdf`} target="_blank" rel="noreferrer">
        <Download />
        {rotulo}
      </a>
    </Button>
  )
}

/**
 * "Falar com a entidade": o Atendimento do portal para quem está nele (e com
 * ele no ar); senão, o e-mail de contato da entidade, se houver; por último,
 * a página O sindicato, para quem está no portal com o Atendimento
 * desabilitado.
 */
function FalarComEntidade({
  noPortal,
  email,
  protocolo,
}: {
  /** O canal do portal ao alcance: o Atendimento, O sindicato ou nenhum. */
  noPortal: "atendimento" | "sindicato" | null
  email: string | null
  protocolo: number | null
}) {
  if (noPortal === "atendimento") {
    return (
      <Button variant="outline" asChild>
        <Link href="/portal/atendimento">
          <MessageSquare />
          Falar com a entidade
        </Link>
      </Button>
    )
  }
  if (!email) {
    if (noPortal !== "sindicato") return null
    return (
      <Button variant="outline" asChild>
        <Link href="/portal/sindicato">
          <MessageSquare />
          Falar com a entidade
        </Link>
      </Button>
    )
  }
  const assunto = encodeURIComponent(
    `Oposição à contribuição${protocolo != null ? ` — protocolo ${protocolo}` : ""}`
  )
  return (
    <Button variant="outline" asChild>
      <a href={`mailto:${email}?subject=${assunto}`}>
        <Mail />
        Escrever para a entidade
      </a>
    </Button>
  )
}
