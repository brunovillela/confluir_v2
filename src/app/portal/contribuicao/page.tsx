import type { Metadata } from "next"
import Link from "next/link"
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Eye,
  FileText,
  Hourglass,
  Info,
  MessageSquareText,
  QrCode as QrCodeIcone,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react"
import QRCode from "qrcode"

import { AcaoVisualizacao } from "@/components/acao-visualizacao"
import { AvisoDaUrl } from "@/components/portal/aviso-da-url"
import { CabecalhoPagina } from "@/components/portal/cabecalho-pagina"
import { EstadoVazio } from "@/components/portal/estado-vazio"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ajudaDaRotaPortal, mapaAjudaPortal } from "@/lib/ajuda/mapa-portal"
import {
  fraseRegra,
  rotuloFonteDaLinha,
  rotuloTipoContribuicao,
  situacaoSemHistorico,
  type SituacaoSemHistorico,
} from "@/lib/contribuicao-situacao"
import { anoDaLinha, minhaContribuicao, type MinhaContribuicao, type RemessaPendente } from "@/lib/db/carteirinha"
import { rotuloCompetencia, type Cobranca } from "@/lib/db/cobrancas"
import { hojeSP } from "@/lib/db/comum"
import { cadastroDoFiliado } from "@/lib/db/filiado-portal"
import type { FormaRecebimento } from "@/lib/filiacao"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { CopiaECola } from "./cobranca-pix"

export const metadata: Metadata = { title: "Minha contribuição" }

type Busca = Promise<{ ano?: string | string[]; aviso?: string | string[] }>

function primeiro(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

/** "a, b e c" */
function juntar(itens: string[]): string {
  return itens.length <= 1 ? (itens[0] ?? "") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`
}

/** Meses MM/AAAA do mais antigo para o mais novo — numa frase, a leitura é cronológica. */
function crescente(meses: string[]): string[] {
  const ordem = (m: string) => Number(m.slice(3)) * 100 + Number(m.slice(0, 2))
  return [...meses].sort((a, b) => ordem(a) - ordem(b))
}

/**
 * Link para o Atendimento com o assunto "contribuicao" e o resumo já
 * preenchidos (A23) — o contrato com a página de Atendimento é esse par de
 * parâmetros.
 */
function linkAtendimento(titulo: string): string {
  return `/portal/atendimento?${new URLSearchParams({ assunto: "contribuicao", titulo })}`
}

/** "Desconto de 08/2026 e 09/2026 não localizado"; com muitos meses, o intervalo (o resumo do Atendimento tem 140 caracteres). */
function tituloFalta(meses: string[], porPix: boolean): string {
  const lista = crescente(meses)
  const oque = porPix ? "Pagamento" : "Desconto"
  if (lista.length > 4) return `${oque} de ${lista.length} meses não localizado (${lista[0]} a ${lista[lista.length - 1]})`
  return `${oque} de ${juntar(lista)} não localizado`
}

/**
 * "A relação de descontos de 09/2026 (Petrobras) ainda não chegou…",
 * agrupando os meses pelas mesmas fontes. "Remessa" é palavra do financeiro;
 * para o associado, é a relação de descontos que a empresa manda (A161).
 */
function frasesPendentes(pendentes: RemessaPendente[]): string[] {
  const porFontes = new Map<string, string[]>()
  for (const p of pendentes) {
    const chave = p.fontes.length === 0 ? "" : ` (${juntar(p.fontes)})`
    porFontes.set(chave, [...(porFontes.get(chave) ?? []), p.competencia])
  }
  return [...porFontes].map(([fontes, comps]) =>
    comps.length === 1
      ? `A relação de descontos de ${comps[0]}${fontes} ainda não chegou ao sindicato — quando chegar, a contribuição desse mês aparece aqui.`
      : `As relações de descontos de ${juntar(crescente(comps))}${fontes} ainda não chegaram ao sindicato — quando chegarem, as contribuições desses meses aparecem aqui.`
  )
}

const ICONE_SITUACAO: Record<SituacaoSemHistorico["variante"], LucideIcon> = {
  error: TriangleAlert,
  warning: CircleAlert,
  outline: CircleDashed,
  success: CircleCheck,
  info: Hourglass,
}
const COR_SITUACAO: Record<SituacaoSemHistorico["variante"], string> = {
  error: "text-error-fg",
  warning: "text-warning-fg",
  outline: "text-foreground",
  success: "text-success-fg",
  info: "text-info-fg",
}

const FORMA: Record<FormaRecebimento, string> = { consignado: "Desconto em folha", pix: "Pix", boleto: "Boleto" }

/** O que a forma quer dizer, na voz de quem paga. */
function explicacaoForma(c: MinhaContribuicao): string {
  const { forma, diaVencimento } = c.comoContribui
  if (forma === "consignado") return "A empresa desconta a contribuição no seu contracheque e repassa ao sindicato."
  if (forma === "pix") return `Você paga todo mês com o QR Code desta página${diaVencimento ? `; a cobrança vence no dia ${diaVencimento}` : ""}.`
  if (forma === "boleto") return "Você paga a contribuição por boleto."
  return "A forma de pagamento não está informada no seu cadastro. Se tiver dúvida, pergunte ao sindicato pelo Atendimento."
}

/** Quando sai a próxima cobrança Pix (A74); null quando não há o que dizer. */
function proximaCobranca(c: MinhaContribuicao): string | null {
  if (!c.porPix || !c.configPix?.disponivel) return null
  const seguinte = (comp: string) => {
    const [a, m] = comp.split("-").map(Number)
    return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`
  }
  // O mês que vem — ou depois, se a secretaria já adiantou a cobrança dele.
  const geradas = new Set(c.cobrancas.filter((x) => x.situacao !== "cancelada").map((x) => x.competencia))
  let prox = seguinte(hojeSP().slice(0, 7))
  for (let i = 0; i < 12 && geradas.has(prox); i++) prox = seguinte(prox)
  if (!c.comoContribui.geracaoNoDia1) return "As cobranças são geradas pela secretaria; você recebe um aviso no portal quando a próxima sair."
  const vence = c.comoContribui.diaVencimento ? `, com vencimento em ${formatarData(`${prox}-${String(c.comoContribui.diaVencimento).padStart(2, "0")}`)}` : ""
  return `A cobrança de ${rotuloCompetencia(prox)} fica disponível em ${formatarData(`${prox}-01`)}${vence}. Você recebe um aviso no portal quando ela sair.`
}

function situacaoDaCobranca(x: Cobranca): { rotulo: string; variante: "success" | "error" | "warning" | "outline" } {
  if (x.situacao === "paga") return { rotulo: "Paga", variante: "success" }
  if (x.situacao === "cancelada") return { rotulo: "Cancelada", variante: "outline" }
  return x.vencida ? { rotulo: "Vencida", variante: "error" } : { rotulo: "Em aberto", variante: "warning" }
}

/** "Avisar o sindicato" (A23): leva ao Atendimento com o assunto e o resumo preenchidos. Na visualização, desligado. */
function BotaoAvisar({ preview, titulo }: { preview: boolean; titulo: string }) {
  return (
    <AcaoVisualizacao preview={preview} nota="Só o próprio associado abre uma solicitação, pela conta dele.">
      {preview ? (
        // Na visualização, botão sem link: o envelope já esmaece.
        <Button type="button" disabled className="disabled:opacity-100">
          <MessageSquareText />
          Avisar o sindicato
        </Button>
      ) : (
        <Button asChild>
          <Link href={linkAtendimento(titulo)}>
            <MessageSquareText />
            Avisar o sindicato
          </Link>
        </Button>
      )}
    </AcaoVisualizacao>
  )
}

/**
 * Minha contribuição (onda 4, F6; onda 2 da avaliação de 11/10/2026): a
 * página de quem paga. Situação pela régua comum (contribuicao-situacao.ts),
 * o atraso com os meses e a regra (A6/A124), o botão para avisar o sindicato
 * (A23), como a pessoa contribui (A60), o recém-filiado (A126), as cobranças
 * Pix como comprovante (A74), a mensalidade separada dos outros tipos (A177)
 * e o histórico por ano com extrato em PDF (A61).
 */
export default async function ContribuicaoPage({ searchParams }: { searchParams: Busca }) {
  const { filiado, preview } = await requireVisualizacaoPortal()
  const busca = await searchParams
  const aviso = primeiro(busca.aviso)
  const cadastro = await cadastroDoFiliado(filiado.cpf)
  const c = cadastro
    ? await minhaContribuicao(filiado.cpf, cadastro.id).catch((e: unknown) => {
        console.error("minha contribuição:", e instanceof Error ? e.message : e)
        return null
      })
    : null
  const ajuda = ajudaDaRotaPortal(mapaAjudaPortal(), "/portal/contribuicao")

  return (
    <>
      <CabecalhoPagina
        secao="/portal/contribuicao"
        titulo="Minha contribuição"
        subtitulo={
          c?.porPix
            ? "Suas contribuições ao sindicato, mês a mês. Cada pagamento por Pix aparece aqui depois de reconhecido no extrato da entidade."
            : c?.comoContribui.forma === "boleto"
              ? "Suas contribuições ao sindicato, mês a mês. Cada pagamento aparece aqui depois de reconhecido pelo sindicato."
              : "O que a empresa descontou e repassou ao sindicato, mês a mês. Cada mês aparece aqui depois que a empresa envia ao sindicato a relação de descontos daquele mês."
        }
        acoes={
          <Button asChild variant="link" className="px-0">
            <Link href={ajuda.href}>Entenda sua contribuição</Link>
          </Button>
        }
      />

      {/* A rota do extrato devolve para cá quando é aberta na visualização ou falha. */}
      {preview && aviso === "visualizacao" && (
        <AvisoDaUrl parametros={["aviso"]}>
          <Alert role="status">
            <Eye />
            <AlertDescription>Na visualização pela gestão, o extrato não é emitido: só o próprio associado o emite, pela conta dele.</AlertDescription>
          </Alert>
        </AvisoDaUrl>
      )}
      {aviso === "extrato" && (
        <AvisoDaUrl parametros={["aviso"]}>
          <Alert variant="warning">
            <CircleAlert />
            <AlertDescription>Não foi possível gerar o extrato agora. Tente de novo em alguns minutos.</AlertDescription>
          </Alert>
        </AvisoDaUrl>
      )}

      {!c ? (
        <Alert variant="error">
          <TriangleAlert />
          <AlertDescription>Não foi possível carregar suas contribuições — fale com o sindicato.</AlertDescription>
        </Alert>
      ) : (
        <Conteudo c={c} preview={preview} anoPedido={primeiro(busca.ano)} />
      )}
    </>
  )
}

async function Conteudo({ c, preview, anoPedido }: { c: MinhaContribuicao; preview: boolean; anoPedido: string | undefined }) {
  const sit = situacaoSemHistorico(c)
  const IconeSituacao = ICONE_SITUACAO[sit.variante]
  const atraso = c.inadimplente ? c.detalheAtraso : null
  const faltas = !atraso && c.emFalta.length > 0
  const ultimaMensalidade = c.linhas.find((l) => !l.tipo || l.tipo === c.tipoMensalidade) ?? null
  // A resposta de relance sob a situação (A147): os meses em falta ou o último mês registrado.
  const apoioSituacao = atraso
    ? `Meses em falta: ${juntar(crescente(atraso.meses))}.`
    : faltas
      ? `Não localizados: ${juntar(crescente(c.emFalta))}.`
      : sit.chave === "em_dia" && ultimaMensalidade
        ? `Último mês registrado: ${ultimaMensalidade.competencia}.`
        : sit.apoio

  // Cobrança Pix: a mais recente em aberto vem com o QR; as outras, na lista.
  const abertas = c.cobrancas.filter((x) => x.situacao === "aberta")
  const aberta = abertas[0] ?? null
  const qrCobranca = aberta?.brcode ? await QRCode.toDataURL(aberta.brcode, { errorCorrectionLevel: "M", margin: 1, width: 280 }) : null
  const proxima = proximaCobranca(c)

  // Histórico por ano (A61): sem corte de linhas; o ano corrente por padrão, ou o mais recente com registro.
  const anos = [...new Set(c.linhas.map(anoDaLinha).filter((a): a is number => a !== null))].sort((a, b) => b - a)
  const temSemData = c.linhas.some((l) => anoDaLinha(l) === null)
  const anoAtual = Number(hojeSP().slice(0, 4))
  const ano: number | "sem-data" | null =
    anoPedido === "sem-data" && temSemData
      ? "sem-data"
      : anoPedido && /^\d{4}$/.test(anoPedido) && anos.includes(Number(anoPedido))
        ? Number(anoPedido)
        : anos.includes(anoAtual)
          ? anoAtual
          : (anos[0] ?? (temSemData ? "sem-data" : null))
  const doAno = c.linhas.filter((l) => (ano === "sem-data" ? anoDaLinha(l) === null : anoDaLinha(l) === ano))
  const filtros: { chave: string; rotulo: string }[] = [
    ...anos.map((a) => ({ chave: String(a), rotulo: String(a) })),
    ...(temSemData ? [{ chave: "sem-data", rotulo: "Sem mês informado" }] : []),
  ]

  const { comoContribui: como } = c
  // Sem valor conhecido, nada de número: na folha o desconto pode ser um percentual do salário.
  const valorPrevistoTexto = como.valorPrevisto
    ? como.forma === "pix"
      ? "O valor de cada cobrança por Pix."
      : "O valor registrado no seu cadastro."
    : como.forma === "pix"
      ? "O valor aparece em cada cobrança."
      : como.forma === "boleto"
        ? "O valor vem em cada boleto."
        : como.forma === "consignado"
          ? "É o que a empresa desconta pela regra da entidade e pode mudar de um mês para outro. Confira no seu contracheque."
          : "Pode mudar de um mês para outro."

  return (
    <>
      {atraso ? (
        <Alert variant="error">
          <TriangleAlert />
          <AlertTitle>
            Em atraso pela regra da entidade: {atraso.meses.length} {atraso.meses.length === 1 ? "mês" : "meses"} sem{" "}
            {/* A regra pode valer para outro tipo (assistencial…): o título diz qual. */}
            {atraso.tipo === c.tipoMensalidade ? "contribuição" : rotuloTipoContribuicao(atraso.tipo).toLowerCase()} (
            {juntar(crescente(atraso.meses))})
          </AlertTitle>
          <AlertDescription>
            <p>
              Último pagamento reconhecido: <strong>{atraso.ultimoPagamento ?? "nenhum registrado"}</strong>.{" "}
              {fraseRegra(atraso.regra)}
            </p>
            <p>
              Nada é suspenso automaticamente: a secretaria analisa cada caso e pode limitar serviços enquanto o atraso constar.{" "}
              {c.porPix
                ? "Se você já pagou, avise o sindicato e anexe o comprovante."
                : "Se o desconto está sendo feito, avise o sindicato e anexe o contracheque desses meses."}
            </p>
          </AlertDescription>
          {/* Fora do AlertDescription: o `[&_a]:underline` dele sublinhava o botão e escurecia o texto no hover. */}
          <div className="col-start-2 mt-2">
            <BotaoAvisar preview={preview} titulo="Regularizar contribuição" />
          </div>
        </Alert>
      ) : faltas ? (
        <Alert variant="warning">
          <CircleAlert />
          <AlertTitle>
            {c.porPix ? "Pagamento não localizado" : "Desconto não localizado"}: {juntar(crescente(c.emFalta))}
          </AlertTitle>
          <AlertDescription>
            <p>
              {c.porPix
                ? `A cobrança por Pix ${c.emFalta.length === 1 ? "desse mês" : "desses meses"} venceu sem pagamento registrado. Se você já pagou, avise o sindicato e anexe o comprovante.`
                : `A empresa já enviou ao sindicato a relação de descontos ${c.emFalta.length === 1 ? "desse mês" : "desses meses"}, e o seu desconto não está nela. Se ele aparece no seu contracheque, avise o sindicato e anexe o contracheque do mês.`}
              {c.regra && ` ${fraseRegra(c.regra)}`}
            </p>
          </AlertDescription>
          <div className="col-start-2 mt-2">
            <BotaoAvisar preview={preview} titulo={tituloFalta(c.emFalta, c.porPix)} />
          </div>
        </Alert>
      ) : null}

      {c.excecao && !c.inadimplente && (
        <Alert variant="info" role="status">
          <ShieldCheck />
          <AlertDescription>
            Pela regra, sua {rotuloTipoContribuicao(c.excecao.tipo).toLowerCase()} constaria em atraso, mas a entidade registrou uma exceção para o seu caso
            {c.excecao.ate ? `, válida até ${formatarData(c.excecao.ate)}` : ""}. Enquanto ela valer, essas faltas não contam como atraso.
          </AlertDescription>
        </Alert>
      )}

      {c.emFalta.length === 0 && c.pendentesDaFonte.length > 0 && (
        // Informativo, sem pedir ação: "status" em vez do "alert" padrão, que o leitor de tela anuncia com urgência.
        <Alert variant="info" role="status">
          <Info />
          <AlertDescription>
            {frasesPendentes(c.pendentesDaFonte).map((frase) => (
              <p key={frase}>{frase}</p>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {aberta && (
        <Card className="border-primary/40">
          <CardHeader>
            <div className="flex items-center gap-2">
              <QrCodeIcone className="text-primary size-5" />
              <CardTitle role="heading" aria-level={2}>
                Contribuição de {rotuloCompetencia(aberta.competencia)}: pague por Pix
              </CardTitle>
            </div>
            <CardDescription className="text-sm">
              Leia o QR Code no app do banco ou copie o código. O pagamento é reconhecido pelo extrato da entidade em até 2 dias úteis.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-lg font-semibold tabular-nums">{formatarMoeda(aberta.valor)}</p>
              <p className="text-sm">vence em {formatarData(aberta.vencimento)}</p>
              {aberta.vencida && <Badge variant="error">Vencida</Badge>}
            </div>
            {aberta.vencida && (
              <Alert variant="warning">
                <CircleAlert />
                <AlertDescription>
                  Esta cobrança venceu em {formatarData(aberta.vencimento)} e ainda não consta como paga. Ainda dá para pagar pelo QR Code abaixo; se você
                  já pagou, o reconhecimento leva até 2 dias úteis.
                </AlertDescription>
              </Alert>
            )}
            {abertas.length > 1 && (
              <Alert variant="warning">
                <CircleAlert />
                <AlertDescription>
                  Você tem {abertas.length} cobranças em aberto:{" "}
                  {juntar(
                    [...abertas].reverse().map((x) => `${rotuloCompetencia(x.competencia)} (${formatarMoeda(x.valor)})`)
                  )}
                  . O QR Code abaixo é o da mais recente; o código das outras está em &quot;Cobranças por Pix&quot;, mais abaixo.
                </AlertDescription>
              </Alert>
            )}
            <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
              {qrCobranca && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrCobranca} alt="QR Code Pix da contribuição" width={200} height={200} className="mx-auto rounded-lg bg-white p-2 sm:mx-0" />
              )}
              <div className="grid gap-3">
                {aberta.brcode && <CopiaECola codigo={aberta.brcode} />}
                <p className="text-sm">
                  Identificador: <span className="font-mono">{aberta.txid}</span>
                </p>
                {c.configPix?.mensagem && <p className="text-sm">{c.configPix.mensagem}</p>}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="grid gap-1 py-4">
            <p className="text-muted-foreground text-sm">Situação</p>
            <p className={`flex items-center gap-2 text-lg font-semibold ${COR_SITUACAO[sit.variante]}`}>
              <IconeSituacao className="size-5 shrink-0" />
              {sit.rotulo}
            </p>
            {apoioSituacao && <p className="text-muted-foreground text-sm">{apoioSituacao}</p>}
            {/* Com alerta na tela, a regra já está nele. */}
            {!atraso && !faltas && c.regra && <p className="text-muted-foreground text-sm">{fraseRegra(c.regra)}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-1 py-4">
            <p className="text-muted-foreground text-sm">Mensalidade nos últimos 12 meses</p>
            <p className="text-2xl font-semibold tabular-nums">{formatarMoeda(c.total12m)}</p>
            {c.outros12m.length > 0 && (
              <p className="text-muted-foreground text-sm">
                Fora da mensalidade, no mesmo período:{" "}
                {juntar(c.outros12m.map((o) => `${formatarMoeda(o.valor)} de ${rotuloTipoContribuicao(o.tipo).toLowerCase()}`))}.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-1 py-4">
            <p className="text-muted-foreground text-sm">Última contribuição</p>
            <p className="text-2xl font-semibold tabular-nums">{c.ultima ? formatarMoeda(c.ultima.valor) : "—"}</p>
            {c.ultima && (
              <p className="text-muted-foreground text-sm">
                {[c.ultima.competencia, rotuloTipoContribuicao(c.ultima.tipo), rotuloFonteDaLinha(c.ultima)].filter((x) => x && x !== "—").join(" · ")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle role="heading" aria-level={2}>
            Como você contribui
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground text-sm">Forma de pagamento</dt>
              <dd className="mt-0.5 font-medium">{como.forma ? FORMA[como.forma] : "Não informada"}</dd>
              <dd className="text-muted-foreground mt-1 text-sm">{explicacaoForma(c)}</dd>
            </div>
            {(como.fontes.length > 0 || como.forma === "consignado") && (
              <div>
                <dt className="text-muted-foreground text-sm">Fonte pagadora</dt>
                <dd className="mt-0.5 font-medium">{como.fontes.length ? juntar(como.fontes) : "Não informada"}</dd>
                <dd className="text-muted-foreground mt-1 text-sm">
                  {como.forma === "consignado" ? "A empresa (ou o fundo de pensão) que desconta e repassa." : "A empresa com que você tem vínculo."}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground text-sm">Valor previsto por mês</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{como.valorPrevisto ? formatarMoeda(como.valorPrevisto) : "Definido pela entidade"}</dd>
              <dd className="text-muted-foreground mt-1 text-sm">{valorPrevistoTexto}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {(c.porPix || c.cobrancas.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle role="heading" aria-level={2}>
              Cobranças por Pix
            </CardTitle>
            {c.cobrancas.length > 0 && (
              <CardDescription className="text-sm">
                Serve de comprovante: o mês, o valor, a situação e o identificador de cada cobrança.
                {proxima && ` ${proxima}`}
              </CardDescription>
            )}
          </CardHeader>
          {c.cobrancas.length === 0 ? (
            // Lista vazia no desenho comum do portal (A140), com quando sai a próxima.
            <CardContent>
              <EstadoVazio
                compacto
                icone={QrCodeIcone}
                titulo="Nenhuma cobrança gerada para você até agora."
                descricao={proxima ?? undefined}
              />
            </CardContent>
          ) : (
            <CardContent>
              <Table className="tabela-cards">
                <TableCaption className="sr-only">Cobranças por Pix</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês de referência</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Pago em</TableHead>
                    <TableHead>Identificador</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.cobrancas.map((x) => {
                    const s = situacaoDaCobranca(x)
                    return (
                      <TableRow key={x.id}>
                        <TableCell data-rotulo="Mês de referência" className="tabular-nums">
                          {rotuloCompetencia(x.competencia)}
                        </TableCell>
                        <TableCell data-rotulo="Valor" className="text-right tabular-nums">
                          {formatarMoeda(x.situacao === "paga" ? (x.valorPago ?? x.valor) : x.valor)}
                        </TableCell>
                        <TableCell data-rotulo="Vencimento" className="tabular-nums">
                          {formatarData(x.vencimento)}
                        </TableCell>
                        <TableCell data-rotulo="Situação">
                          <Badge variant={s.variante}>{s.rotulo}</Badge>
                          {/* As outras em aberto: o código para pagar fica aqui; o QR é só o da mais recente. */}
                          {x.situacao === "aberta" && x.id !== aberta?.id && x.brcode && (
                            <details className="mt-2">
                              <summary className="text-primary inline-flex min-h-11 cursor-pointer items-center text-sm underline-offset-4 hover:underline">
                                Pagar esta cobrança
                              </summary>
                              <div className="pt-2">
                                <CopiaECola codigo={x.brcode} />
                              </div>
                            </details>
                          )}
                        </TableCell>
                        <TableCell data-rotulo="Pago em" className="tabular-nums">
                          {x.pagoEm ? formatarData(x.pagoEm) : "—"}
                        </TableCell>
                        <TableCell data-rotulo="Identificador" className="font-mono break-all">
                          {x.txid}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle role="heading" aria-level={2}>
            Histórico
          </CardTitle>
          <CardDescription className="text-sm">
            {c.linhas.length === 0
              ? "Nenhuma contribuição registrada ainda."
              : `${doAno.length} ${doAno.length === 1 ? "lançamento" : "lançamentos"} ${ano === "sem-data" ? "sem mês informado" : `em ${ano}`}. O mês de referência é o mês a que a contribuição se refere — na folha, o do contracheque.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {c.linhas.length === 0 ? (
            <SemHistorico c={c} sit={sit} preview={preview} />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                {filtros.length > 1 ? (
                  <nav aria-label="Ano do histórico" className="flex flex-wrap gap-2">
                    {filtros.map((f) => {
                      const atual = f.chave === String(ano)
                      return (
                        <Button key={f.chave} asChild variant={atual ? "default" : "outline"}>
                          <Link href={`/portal/contribuicao?ano=${f.chave}`} aria-current={atual ? "page" : undefined} scroll={false}>
                            {f.rotulo}
                          </Link>
                        </Button>
                      )
                    })}
                  </nav>
                ) : (
                  <span />
                )}
                {typeof ano === "number" && (
                  <AcaoVisualizacao preview={preview} nota="Só o próprio associado emite o extrato, pela conta dele.">
                    {preview ? (
                      <Button type="button" variant="outline" disabled className="disabled:opacity-100">
                        <FileText />
                        Extrato de {ano} (PDF)
                      </Button>
                    ) : (
                      <Button asChild variant="outline">
                        <a href={`/portal/contribuicao/extrato?ano=${ano}`} target="_blank" rel="noreferrer">
                          <FileText />
                          Extrato de {ano} (PDF)
                        </a>
                      </Button>
                    )}
                  </AcaoVisualizacao>
                )}
              </div>
              <Table className="tabela-cards">
                <TableCaption className="sr-only">
                  {ano === "sem-data" ? "Contribuições sem mês informado" : `Contribuições de ${ano}`}
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês de referência</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Fonte pagadora</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {doAno.map((l, i) => (
                    <TableRow key={`${l.ordem}-${l.tipo}-${i}`}>
                      <TableCell data-rotulo="Mês de referência" className="tabular-nums">
                        {l.competencia}
                      </TableCell>
                      <TableCell data-rotulo="Tipo">
                        <span title={l.tipo ?? undefined}>{rotuloTipoContribuicao(l.tipo)}</span>
                      </TableCell>
                      <TableCell data-rotulo="Fonte pagadora">{rotuloFonteDaLinha(l)}</TableCell>
                      <TableCell data-rotulo="Valor" className="text-right tabular-nums">
                        {formatarMoeda(l.valor)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </>
  )
}

/**
 * Sem nenhuma contribuição (A126). Recém-filiado: quando o primeiro desconto
 * deve aparecer — o mês seguinte ao início, quando a empresa mandar a relação
 * dele (sem prometer dia). Sem filiação recente: pode ser desconto que não
 * chega ao sindicato, então o caminho é avisar.
 */
function SemHistorico({ c, sit, preview }: { c: MinhaContribuicao; sit: SituacaoSemHistorico; preview: boolean }) {
  if (sit.chave === "aguardando" && c.inicio) {
    const { informadaEm, ativadaEm, primeiroMes } = c.inicio
    const fontes = c.comoContribui.fontes
    return (
      <div className="grid gap-2 text-sm">
        <p>
          {informadaEm
            ? `Sua filiação foi comunicada à sua fonte pagadora${fontes.length ? ` (${juntar(fontes)})` : ""} em ${formatarData(informadaEm)}.`
            : `Sua filiação foi ativada em ${formatarData(ativadaEm)}.`}
        </p>
        <p>
          {!c.porPix
            ? `O primeiro desconto deve ser o de ${primeiroMes}: ele aparece aqui quando a empresa enviar ao sindicato a relação de descontos desse mês.`
            : c.cobrancas.length > 0
              ? "Sua primeira cobrança por Pix já está nesta página; depois de paga e reconhecida, ela entra no histórico."
              : "Como você paga por Pix, a primeira cobrança aparece nesta página quando for gerada, e você recebe um aviso no portal."}
        </p>
      </div>
    )
  }
  if (sit.chave === "sem_registros") {
    return (
      <div className="grid gap-3 text-sm">
        <p>
          {c.porPix
            ? "Ainda não há contribuições registradas para você. Se você já pagou por Pix, avise o sindicato e anexe o comprovante."
            : "Ainda não há contribuições registradas para você. Se o desconto já aparece no seu contracheque, avise o sindicato e anexe o contracheque."}
        </p>
        <div>
          <BotaoAvisar preview={preview} titulo="Contribuição não aparece no portal" />
        </div>
      </div>
    )
  }
  return null
}
