import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import QRCode from "qrcode"
import { ArrowLeft, Download, Megaphone, Send } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { obterCampanhaPublica } from "@/lib/db/oposicao"
import { requireOposicao } from "@/lib/db/oposicao-regras"
import { nomeEntidade } from "@/lib/db/organizacao"
import { textosDivulgacao } from "@/lib/oposicao-orientacoes"
import { linkComOrigem } from "@/lib/oposicao-origem"
import { podeAcessar } from "@/lib/permissoes"
import { origemAtual } from "@/lib/tenant-url"

import { prepararMensagemAction } from "../../actions"
import { CopiarTexto } from "./copiar-texto"

export const metadata: Metadata = { title: "Divulgação — Oposição — Confluir" }

/**
 * Kit de divulgação (onda 3 das melhorias, 07/11/2026): o link DESTA campanha
 * (14/11/2026: abre direto a campanha, depois do código por e-mail), o QR code para cartaz e os textos prontos (WhatsApp e boletim)
 * montados com o prazo e o que a campanha pede. A divulgação aos filiados
 * pelo sistema segue em Comunicação › Mensagens aos filiados. O link geral
 * (o hub com as oposições de cada um) fica em /painel/representacao/oposicao/divulgacao.
 */
export default async function DivulgacaoOposicaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sessao = await requireOposicao("consultar", id)
  const podeMensagem = podeAcessar(sessao.permissoes, "comunicacao_mensagens")
  const [campanha, entidade, origem] = await Promise.all([
    obterCampanhaPublica(id),
    nomeEntidade(),
    origemAtual().catch(() => ""),
  ])
  if (!campanha) notFound()
  const link = `${origem}/portal/oposicao/${id}`
  const qr = await QRCode.toDataURL(linkComOrigem(link, "qr"), { errorCorrectionLevel: "M", margin: 2, width: 768 })
  const textos = textosDivulgacao({
    entidade,
    campanhaNome: campanha.nome,
    detalheDesconto: campanha.detalhe_desconto,
    campanha,
    link,
  })
  const aqui = `/painel/representacao/oposicao/${id}`

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={aqui}>
            <ArrowLeft />
            Campanha
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Divulgação da campanha</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {campanha.nome ?? "Campanha"}: o link, o QR code e os textos prontos. Os textos saem do prazo e das decisões
          da campanha — revise antes de mandar.
        </p>
      </div>

      {(campanha.situacao !== "aberta" || !campanha.regrasCompletas) && (
        <Alert variant="warning">
          <AlertDescription>
            A campanha ainda não está recebendo oposições
            {campanha.situacao !== "aberta" ? " (não está aberta)" : " (faltam decisões jurídicas)"}: quem abrir o link
            agora não vai encontrá-la.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Link e QR code</CardTitle>
          <CardDescription>
            Abre direto esta campanha, para filiados e não filiados, depois do código por e-mail. Quem já se opôs cai
            no comprovante; com a campanha encerrada, o link leva às oposições da pessoa. O QR code serve para cartaz
            e boletim impresso.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[12rem_1fr] sm:items-start">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI gerado no servidor */}
          <img src={qr} alt={`QR code para ${link}`} className="w-48 rounded-lg border bg-white p-1" />
          <div className="grid gap-3">
            <CopiarTexto id="link" rotulo="Link" texto={linkComOrigem(link, "link")} linhas={1} />
            <p className="text-muted-foreground text-xs">
              O QR code, o link e os textos levam a marca do canal (?origem=…): o Funil mostra de onde veio quem leu e
              quem registrou.
            </p>
            <div>
              <Button variant="outline" size="sm" asChild>
                <a href={qr} download="oposicao-campanha-qr-code.png">
                  <Download />
                  Baixar o QR code (PNG)
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Textos prontos</CardTitle>
          <CardDescription>Edite à vontade antes de copiar; nada aqui é salvo.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <CopiarTexto id="whatsapp" rotulo="WhatsApp" texto={textos.whatsapp} linhas={12} />
          <CopiarTexto id="boletim" rotulo="Boletim e site" texto={textos.boletim} linhas={12} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Divulgação geral</CardTitle>
          <CardDescription>
            Para um link que não muda de uma campanha para outra (site, rodapé de boletim, cartaz fixo): o trabalhador
            entra e vê as oposições que fez e as campanhas em que ainda pode se opor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link href="/painel/representacao/oposicao/divulgacao">
              <Megaphone />
              Divulgação geral
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Avisar os filiados pelo sistema</CardTitle>
          <CardDescription>
            Os filiados alcançados pela campanha (das empresas marcadas, ou todos, se nenhuma foi marcada) já veem o
            aviso com contagem regressiva na área do associado. Para mandar também por e-mail, prepare a mensagem: abre
            na Mala direta um rascunho com o texto do boletim, o texto do WhatsApp e o recorte (filiados ativos
            {campanha.fontes.length > 0 ? ` de ${campanha.fontes.map((f) => f.nome).join(", ")}` : " de todas as fontes"}).
            Nada é enviado antes de você revisar e liberar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {podeMensagem ? (
            <form action={prepararMensagemAction}>
              <input type="hidden" name="campanha_id" value={id} />
              <Button type="submit" variant="outline">
                <Send />
                Preparar a mensagem aos filiados
              </Button>
            </form>
          ) : (
            <p className="text-muted-foreground text-sm">
              Preparar a mensagem pede a permissão de Mensagens aos filiados (Comunicação).
            </p>
          )}
        </CardContent>
      </Card>
    </>
  )
}
