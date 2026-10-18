import type { Metadata } from "next"
import Link from "next/link"
import QRCode from "qrcode"
import { Eye, FileText, ShieldCheck, WifiOff } from "lucide-react"

import { AcaoVisualizacao } from "@/components/acao-visualizacao"
import { AvisoDaUrl } from "@/components/portal/aviso-da-url"
import { CabecalhoPagina } from "@/components/portal/cabecalho-pagina"
import { paginaIndisponivel } from "@/components/portal/guarda-parte"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { dadosCarteirinha } from "@/lib/db/carteirinha"
import { bloqueioDaParte, opcoesDaParte, rotasDesabilitadas } from "@/lib/db/portal-partes"
import { formatarData } from "@/lib/formato"
import { opcoesPadrao } from "@/lib/portal-partes-constantes"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { ApresentarCarteirinha } from "./apresentar-carteirinha"

export const metadata: Metadata = { title: "Carteirinha" }

function cpfMascarado(cpf: string | null): string {
  if (!cpf || cpf.length !== 11) return "—"
  return `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`
}

/**
 * Carteirinha digital do filiado (onda 4, F1): identificação + QR verificável.
 *
 * No celular (A36), o QR ocupa a largura do cartão, com o texto embaixo; o
 * botão "Apresentar carteirinha" abre a tela cheia de fundo claro para a
 * portaria. Sem internet na portaria (A73), o caminho é a declaração em PDF
 * guardada no celular — tem o mesmo QR. A página NÃO vai para o cache do
 * service worker (public/sw.js): ela mostra sempre a condição de agora.
 *
 * Área do associado: título do cartão, vínculo (fontes) e a declaração em
 * PDF seguem as opções da parte; em pausa, o botão da declaração fica
 * desligado (a rota recusa de qualquer jeito).
 */
export default async function CarteirinhaPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>
}) {
  // Desabilitada: o "indisponível" antes de qualquer leitura — o layout
  // renderiza junto com esta página e não a impede de rodar.
  const indisponivel = await paginaIndisponivel("carteirinha")
  if (indisponivel) return indisponivel
  const { filiado, preview } = await requireVisualizacaoPortal()
  const { aviso } = await searchParams
  const [dados, opcoes, pausa, desligadas] = await Promise.all([
    dadosCarteirinha(filiado.cpf),
    // Na dúvida, vale o de sempre (título padrão, com vínculo e declaração).
    opcoesDaParte("carteirinha").catch(() => opcoesPadrao("carteirinha")),
    bloqueioDaParte("carteirinha").catch(() => null),
    rotasDesabilitadas().catch(() => [] as string[]),
  ])
  const comDeclaracao = opcoes.declaracao_pdf
  const comSindicato = !desligadas.includes("/portal/sindicato")
  // 640 px: nítido na tela cheia do modo Apresentar (o cartão mostra menor).
  const qr = dados?.urlVerificacao ? await QRCode.toDataURL(dados.urlVerificacao, { errorCorrectionLevel: "M", margin: 1, width: 640 }) : null

  return (
    <>
      <CabecalhoPagina
        secao="/portal/carteirinha"
        titulo="Carteirinha"
        subtitulo="Mostre na portaria ou no convênio. O QR leva à verificação pública, que confirma só a condição da filiação."
      />

      {/* A rota da declaração devolve para cá quando é aberta na visualização. */}
      {preview && aviso === "visualizacao" && (
        <AvisoDaUrl parametros={["aviso"]}>
          <Alert>
            <Eye />
            <AlertDescription>
              Na visualização pela gestão, a declaração não é emitida: só o
              próprio associado a emite, pela conta dele.
            </AlertDescription>
          </Alert>
        </AvisoDaUrl>
      )}
      {/* ... e quando a declaração não pode sair (Área do associado): o motivo de agora. */}
      {aviso === "declaracao" && (
        <AvisoDaUrl parametros={["aviso"]}>
          <Alert variant="warning">
            <AlertDescription>
              {!comDeclaracao
                ? "A declaração de filiação não é emitida pelo portal. Se precisar de uma, peça à secretaria."
                : pausa
                  ? `A declaração de filiação não pode ser emitida agora. ${pausa}`
                  : "Não foi possível emitir a declaração agora. Tente de novo."}
            </AlertDescription>
          </Alert>
        </AvisoDaUrl>
      )}

      {!dados ? (
        <Alert variant="destructive">
          <AlertDescription>
            <p>
              Não foi possível carregar seu cadastro agora. Tente de novo daqui a pouco; se continuar,{" "}
              {comSindicato ? (
                <Link href="/portal/sindicato" className="font-medium underline underline-offset-4">
                  fale com o sindicato
                </Link>
              ) : (
                "fale com o sindicato"
              )}
              .
            </p>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Card className="mx-auto w-full max-w-md overflow-hidden">
            <div className="bg-primary text-primary-foreground px-5 py-3">
              <p className="text-xs opacity-90">{dados.entidade}</p>
              <p className="text-sm font-semibold">{opcoes.titulo || "Carteira de filiado(a)"}</p>
            </div>
            <CardContent className="grid gap-4 py-5">
              <div className="grid gap-0.5">
                <p className="text-lg leading-tight font-semibold">{dados.nome}</p>
                <p className="text-muted-foreground text-xs">CPF {cpfMascarado(dados.cpf)}</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt className="text-muted-foreground text-xs">Matrícula</dt>
                  <dd className="font-medium tabular-nums">{dados.matricula ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Filiado(a) desde</dt>
                  <dd className="font-medium">{dados.desde ? formatarData(dados.desde) : "—"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground text-xs">Condição</dt>
                  <dd>
                    <Badge variant="outline" className={dados.ativo ? "border-success/40 text-success-fg" : "border-destructive/40 text-destructive"}>
                      {dados.condicao ?? "—"}
                    </Badge>
                  </dd>
                </div>
                {opcoes.mostrar_fontes && dados.fontes.length > 0 && (
                  <div className="col-span-2">
                    <dt className="text-muted-foreground text-xs">Vínculo</dt>
                    <dd className="font-medium">{dados.fontes.join(", ")}</dd>
                  </div>
                )}
              </dl>
              {qr ? (
                <>
                  {/* Celular: o QR na largura do cartão e o texto embaixo; de
                      640 px em diante, lado a lado. */}
                  <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qr}
                      alt="QR de verificação da carteirinha"
                      className="aspect-square w-full max-w-72 rounded-md bg-white p-1 sm:size-40 sm:max-w-none sm:shrink-0"
                    />
                    <p className="text-muted-foreground text-xs">
                      <ShieldCheck className="text-success-fg mb-1 size-4" />
                      Quem ler o QR vê nome, matrícula e a condição atual da filiação. Nada mais.
                    </p>
                  </div>
                  <ApresentarCarteirinha
                    entidade={dados.entidade}
                    nome={dados.nome}
                    matricula={dados.matricula}
                    condicao={dados.condicao}
                    ativo={dados.ativo}
                    qr={qr}
                  />
                </>
              ) : (
                <p className="text-muted-foreground text-xs">QR de verificação indisponível neste ambiente.</p>
              )}
            </CardContent>
          </Card>

          <div className="mx-auto flex w-full max-w-md flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start">
            {/* Declaração desligada pela entidade: o botão sai. Em pausa,
                fica na tela, desligado, com o porquê embaixo. */}
            {comDeclaracao &&
              (pausa ? (
                <div className="grid gap-1.5">
                  <Button type="button" disabled variant={qr ? "outline" : "default"} className="w-full sm:w-auto">
                    <FileText />
                    Declaração de filiação (PDF)
                  </Button>
                  <p className="text-muted-foreground text-xs">A declaração está em pausa — veja o aviso no topo da página.</p>
                </div>
              ) : (
                <AcaoVisualizacao preview={preview} nota="Só o próprio associado emite a declaração, pela conta dele.">
                  {preview ? (
                    // Na visualização, botão sem link: nada para clicar nem para
                    // abrir em outra aba. O envelope já esmaece — sem o
                    // disabled:opacity-100 o cinza dobraria.
                    <Button type="button" disabled variant={qr ? "outline" : "default"} className="w-full disabled:opacity-100 sm:w-auto">
                      <FileText />
                      Declaração de filiação (PDF)
                    </Button>
                  ) : (
                    <Button asChild className="w-full sm:w-auto" variant={qr ? "outline" : "default"}>
                      <a href="/portal/carteirinha/declaracao" target="_blank" rel="noreferrer">
                        <FileText />
                        Declaração de filiação (PDF)
                      </a>
                    </Button>
                  )}
                </AcaoVisualizacao>
              ))}
            {dados.urlVerificacao && (
              <Button variant="outline" asChild className="w-full sm:w-auto">
                <Link href={dados.urlVerificacao} target="_blank" rel="noreferrer">
                  Ver a página de verificação
                </Link>
              </Button>
            )}
          </div>

          {/* A73: a página só abre com internet (não vai para o cache — a
              condição mostrada é sempre a de agora). O PDF guardado abre sem
              rede e o QR dele leva à mesma verificação. Sem a declaração no
              portal, a dica não tem o que oferecer. */}
          {comDeclaracao && (
            <>
              <Alert role="note" className="mx-auto w-full max-w-md">
                <WifiOff />
                <AlertTitle>Sem internet na portaria?</AlertTitle>
                <AlertDescription>
                  {/* Sem QR na carteirinha, a declaração também sai sem ele: não prometer o que não vem. */}
                  {qr
                    ? "Antes de sair, baixe a declaração em PDF e guarde no celular: ela tem o mesmo QR e abre sem internet."
                    : "Antes de sair, baixe a declaração em PDF e guarde no celular: ela comprova a filiação e abre sem internet."}
                </AlertDescription>
              </Alert>
              <p className="text-muted-foreground mx-auto w-full max-w-md text-xs">
                A declaração sai com a data de hoje e o mesmo QR. Se a filiação deixar de estar ativa, a verificação passa a dizer isso: documentos antigos não valem sozinhos.
              </p>
            </>
          )}
        </>
      )}
    </>
  )
}
