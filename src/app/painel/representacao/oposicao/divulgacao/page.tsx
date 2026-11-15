import type { Metadata } from "next"
import Link from "next/link"
import QRCode from "qrcode"
import { ArrowLeft, Download } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { hojeSP } from "@/lib/db/comum"
import { campanhasAbertas } from "@/lib/db/oposicao"
import { requireOposicao } from "@/lib/db/oposicao-regras"
import { nomeEntidade } from "@/lib/db/organizacao"
import { formatarData } from "@/lib/formato"
import { estadoPrazo } from "@/lib/oposicao-constantes"
import { textosDivulgacaoGeral } from "@/lib/oposicao-orientacoes"
import { origemAtual } from "@/lib/tenant-url"

import { CopiarTexto } from "../[id]/divulgacao/copiar-texto"

export const metadata: Metadata = { title: "Divulgação geral — Oposição — Confluir" }

/**
 * Divulgação GERAL da oposição (14/11/2026): o link do hub (/portal/oposicao),
 * que não muda de uma campanha para outra. Depois do código por e-mail, o
 * trabalhador vê só o que é dele: as oposições que registrou (resultado,
 * comprovante, carta) e as campanhas em curso ou futuras. Cada campanha tem
 * ainda o seu kit, com o link que abre direto nela.
 */
export default async function DivulgacaoGeralOposicaoPage() {
  await requireOposicao("consultar")
  const [abertas, entidade, origem] = await Promise.all([
    campanhasAbertas(),
    nomeEntidade(),
    origemAtual().catch(() => ""),
  ])
  const hoje = hojeSP()
  const vigentes = abertas.filter((c) => {
    const e = estadoPrazo(c.prazo_inicio, c.prazo_fim, hoje)
    return e === "aberto" || e === "antes"
  })
  const link = `${origem}/portal/oposicao`
  const qr = await QRCode.toDataURL(link, { errorCorrectionLevel: "M", margin: 2, width: 768 })
  const textos = textosDivulgacaoGeral({ entidade, link, vigentes })

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/representacao/oposicao">
            <ArrowLeft />
            Oposição
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Divulgação geral</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          O link que leva cada trabalhador às oposições dele. Depois do código por e-mail, ele vê só as oposições que
          registrou (com o resultado e o comprovante) e as campanhas em que ainda pode se opor, em curso ou com prazo
          futuro. Campanhas passadas em que ele não se opôs não aparecem.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Link e QR code</CardTitle>
          <CardDescription>
            Serve para sempre: site, rodapé do boletim, cartaz fixo no quadro de avisos. Para chamar para uma
            campanha, use o link dela, na página da campanha › Divulgação.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-[12rem_1fr] sm:items-start">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI gerado no servidor */}
          <img src={qr} alt={`QR code para ${link}`} className="w-48 rounded-lg border bg-white p-1" />
          <div className="grid gap-3">
            <CopiarTexto id="link" rotulo="Link" texto={link} linhas={1} />
            <div>
              <Button variant="outline" size="sm" asChild>
                <a href={qr} download="oposicao-geral-qr-code.png">
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
          <CardDescription>
            {vigentes.length > 0
              ? "Os textos citam os prazos das campanhas em curso ou futuras. "
              : "Não há campanha em curso nem prevista: os textos falam só de acompanhar as oposições. "}
            Edite à vontade antes de copiar; nada aqui é salvo.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <CopiarTexto id="whatsapp" rotulo="WhatsApp" texto={textos.whatsapp} linhas={12} />
          <CopiarTexto id="boletim" rotulo="Boletim e site" texto={textos.boletim} linhas={12} />
        </CardContent>
      </Card>

      {vigentes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Divulgação de cada campanha</CardTitle>
            <CardDescription>O link que abre direto a campanha, com os textos do prazo e do que ela pede.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {vigentes.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <strong>{c.nome ?? "Campanha"}</strong>{" "}
                  <span className="text-muted-foreground">
                    · {formatarData(c.prazo_inicio)} a {formatarData(c.prazo_fim)}
                  </span>
                </span>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/painel/representacao/oposicao/${c.id}/divulgacao`}>Divulgação da campanha</Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  )
}
