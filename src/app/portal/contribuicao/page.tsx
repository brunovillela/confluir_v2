import type { Metadata } from "next"
import { Coins, Info, QrCode as QrCodeIcone, TriangleAlert } from "lucide-react"
import QRCode from "qrcode"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { minhaContribuicao, type MinhaContribuicao, type RemessaPendente } from "@/lib/db/carteirinha"
import { cobrancasDoFiliado, obterConfigCobranca, rotuloCompetencia } from "@/lib/db/cobrancas"
import { registrosDoCpf } from "@/lib/db/filiado-portal"
import { cadastroDoFiliado } from "@/lib/db/filiado-portal"
import { formatarMoeda } from "@/lib/formato"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { CopiaECola } from "./cobranca-pix"

export const metadata: Metadata = { title: "Minha contribuição — Portal" }

/** "a, b e c" */
function juntar(itens: string[]): string {
  return itens.length <= 1 ? (itens[0] ?? "") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`
}

/** "A remessa de 09/2026 da fonte pagadora X ainda não chegou…", agrupando as competências pelas mesmas fontes. */
function frasesPendentes(pendentes: RemessaPendente[]): string[] {
  const porFontes = new Map<string, string[]>()
  for (const p of pendentes) {
    const chave =
      p.fontes.length === 0
        ? "da sua fonte pagadora"
        : `${p.fontes.length === 1 ? "da fonte pagadora" : "das fontes pagadoras"} ${juntar(p.fontes)}`
    porFontes.set(chave, [...(porFontes.get(chave) ?? []), p.competencia])
  }
  return [...porFontes].map(([fontes, comps]) =>
    comps.length === 1
      ? `A remessa de ${comps[0]} ${fontes} ainda não chegou ao sindicato — quando chegar, sua contribuição aparece aqui.`
      : `As remessas de ${juntar(comps)} ${fontes} ainda não chegaram ao sindicato — quando chegarem, sua contribuição aparece aqui.`
  )
}

/** Situação em uma palavra: atraso pela regra > faltas recentes > não apurada > em dia. */
function situacao(c: MinhaContribuicao): {
  rotulo: string
  variante: "error" | "warning" | "outline" | "success"
  apoio?: string
} {
  if (c.inadimplente === true) return { rotulo: "Em atraso", variante: "error" }
  if (c.emFalta.length > 0) return { rotulo: "Com faltas recentes", variante: "warning" }
  if (c.inadimplente === null) {
    return { rotulo: "Situação indisponível", variante: "outline", apoio: "Não foi possível conferir agora. Tente de novo mais tarde." }
  }
  return { rotulo: "Em dia", variante: "success" }
}

/** Minha contribuição (onda 4, F6): descontos por mês e fonte, última remessa e avisos. */
export default async function ContribuicaoPage() {
  const { filiado } = await requireVisualizacaoPortal()
  const cadastro = await cadastroDoFiliado(filiado.cpf)
  const c = cadastro ? await minhaContribuicao(filiado.cpf, cadastro.id) : null
  const sit = c ? situacao(c) : null
  const ultimas = c?.linhas.slice(0, 36) ?? []
  // Cobrança Pix (onda 5, A3): só para quem paga por Pix; a mais recente em aberto vem com o QR.
  const ids = await registrosDoCpf(filiado.cpf)
  const [{ cobrancas }, configCobranca] = await Promise.all([cobrancasDoFiliado(ids), obterConfigCobranca().catch(() => null)])
  const aberta = cobrancas.find((x) => x.situacao === "aberta") ?? null
  const qrCobranca = aberta?.brcode ? await QRCode.toDataURL(aberta.brcode, { errorCorrectionLevel: "M", margin: 1, width: 280 }) : null

  return (
    <>
      <div>
        <div className="flex items-center gap-2">
          <Coins className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Minha contribuição</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          O que foi descontado e repassado ao sindicato, mês a mês, conforme as remessas das fontes pagadoras.
        </p>
      </div>

      {!c ? (
        <Alert variant="destructive">
          <AlertDescription>Não foi possível carregar suas contribuições — fale com o sindicato.</AlertDescription>
        </Alert>
      ) : (
        <>
          {c.inadimplente ? (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertDescription>
                Pela regra da entidade, sua contribuição consta como <strong>em atraso</strong>. Isso pode suspender benefícios. Se o desconto está sendo feito, procure o sindicato com o contracheque para regularizar.
              </AlertDescription>
            </Alert>
          ) : c.emFalta.length > 0 ? (
            <Alert variant="warning">
              <TriangleAlert />
              <AlertDescription>
                {c.porPix
                  ? `Não encontramos o pagamento da sua contribuição de ${juntar(c.emFalta)}: a cobrança por Pix venceu sem pagamento registrado.`
                  : `Não encontramos sua contribuição em ${c.emFalta.length === 1 ? "uma remessa recente" : `${c.emFalta.length} remessas recentes`} (${c.emFalta.join(", ")}).`}
                {c.toleradas !== null && ` A regra da entidade tolera até ${c.toleradas} ${c.toleradas === 1 ? "falta" : "faltas"} antes de considerar inadimplência.`}{" "}
                {c.porPix ? "Se você já pagou, avise o sindicato com o comprovante." : "Se o desconto apareceu no seu contracheque, avise o sindicato."}
              </AlertDescription>
            </Alert>
          ) : null}

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
                  <CardTitle className="text-base">Contribuição de {rotuloCompetencia(aberta.competencia)} — pague por Pix</CardTitle>
                </div>
                <CardDescription className="text-xs">
                  {formatarMoeda(aberta.valor)} · vence em {aberta.vencimento.split("-").reverse().join("/")}
                  {aberta.vencida ? " · vencida" : ""}. Leia o QR Code no app do banco ou copie o código. O pagamento é reconhecido pelo extrato da entidade em até 2 dias úteis.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
                {qrCobranca && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrCobranca} alt="QR Code Pix da contribuição" width={200} height={200} className="mx-auto rounded-lg bg-white p-2 sm:mx-0" />
                )}
                <div className="grid gap-3">
                  {aberta.brcode && <CopiaECola codigo={aberta.brcode} />}
                  <p className="text-muted-foreground text-xs">
                    Identificador: <span className="font-mono">{aberta.txid}</span>
                    {configCobranca?.mensagem ? " · " + configCobranca.mensagem : ""}
                  </p>
                  {cobrancas.filter((x) => x.situacao === "aberta").length > 1 && (
                    <p className="text-muted-foreground text-xs">
                      Há {cobrancas.filter((x) => x.situacao === "aberta").length} cobranças em aberto; esta é a mais recente. As outras: {cobrancas.filter((x) => x.situacao === "aberta" && x.id !== aberta.id).map((x) => rotuloCompetencia(x.competencia) + " (" + formatarMoeda(x.valor) + ")").join(", ")}.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="py-4">
                <p className="text-muted-foreground text-xs">Últimos 12 meses</p>
                <p className="mt-1 text-2xl font-semibold">{formatarMoeda(c.total12m)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-muted-foreground text-xs">Última contribuição</p>
                <p className="mt-1 text-2xl font-semibold">{c.ultima ? formatarMoeda(c.ultima.valor) : "—"}</p>
                {c.ultima && <p className="text-muted-foreground text-xs">{c.ultima.competencia} · {c.ultima.fonte ?? "fonte não informada"}</p>}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-muted-foreground text-xs">Situação</p>
                <p className="mt-1">
                  {sit && <Badge variant={sit.variante}>{sit.rotulo}</Badge>}
                </p>
                {sit?.apoio && <p className="text-muted-foreground mt-1 text-xs">{sit.apoio}</p>}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Histórico</CardTitle>
              <CardDescription>{c.linhas.length === 0 ? "Nenhuma contribuição registrada ainda." : `${c.linhas.length} lançamentos; os ${ultimas.length} mais recentes abaixo.`}</CardDescription>
            </CardHeader>
            {ultimas.length > 0 && (
              <CardContent>
                <Table className="tabela-cards">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Competência</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Fonte pagadora</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ultimas.map((l, i) => (
                      <TableRow key={`${l.ordem}-${l.tipo}-${i}`}>
                        <TableCell data-rotulo="Competência" className="tabular-nums">{l.competencia}</TableCell>
                        <TableCell data-rotulo="Tipo">{l.tipo ?? "—"}</TableCell>
                        <TableCell data-rotulo="Fonte pagadora">{l.fonte ?? "—"}</TableCell>
                        <TableCell data-rotulo="Valor" className="text-right tabular-nums">{formatarMoeda(l.valor)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            )}
          </Card>
        </>
      )}
    </>
  )
}
