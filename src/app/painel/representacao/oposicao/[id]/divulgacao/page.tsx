import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import QRCode from "qrcode"
import { ArrowLeft, Download, Send } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { obterCampanhaPublica } from "@/lib/db/oposicao"
import { requireOposicao } from "@/lib/db/oposicao-regras"
import { nomeEntidade } from "@/lib/db/organizacao"
import { textosDivulgacao } from "@/lib/oposicao-orientacoes"
import { origemAtual } from "@/lib/tenant-url"

import { CopiarTexto } from "./copiar-texto"

export const metadata: Metadata = { title: "Divulgação — Oposição — Confluir" }

/**
 * Kit de divulgação (onda 3 das melhorias, 07/11/2026): o link público da
 * oposição, o QR code para cartaz e os textos prontos (WhatsApp e boletim)
 * montados com o prazo e o que a campanha pede. A divulgação aos filiados
 * pelo sistema segue em Comunicação › Mensagens aos filiados.
 */
export default async function DivulgacaoOposicaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireOposicao("consultar", id)
  const [campanha, entidade, origem] = await Promise.all([
    obterCampanhaPublica(id),
    nomeEntidade(),
    origemAtual().catch(() => ""),
  ])
  if (!campanha) notFound()
  const link = `${origem}/portal/oposicao`
  const qr = await QRCode.toDataURL(link, { errorCorrectionLevel: "M", margin: 2, width: 768 })
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
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Divulgação</h1>
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
            A mesma página para filiados e não filiados. O QR code serve para cartaz e boletim impresso.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[12rem_1fr] sm:items-start">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI gerado no servidor */}
          <img src={qr} alt={`QR code para ${link}`} className="w-48 rounded-lg border bg-white p-1" />
          <div className="grid gap-3">
            <CopiarTexto id="link" rotulo="Link" texto={link} linhas={1} />
            <div>
              <Button variant="outline" size="sm" asChild>
                <a href={qr} download="oposicao-qr-code.png">
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
          <CardTitle className="text-base">Avisar os filiados pelo sistema</CardTitle>
          <CardDescription>
            Os filiados alcançados pela campanha (das empresas marcadas, ou todos, se nenhuma foi marcada) já veem o aviso com contagem regressiva na área do associado. Para
            mandar também por e-mail, use uma mala direta com o texto do boletim.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link href="/painel/comunicacao/mensagens">
              <Send />
              Mensagens aos filiados
            </Link>
          </Button>
        </CardContent>
      </Card>
    </>
  )
}
