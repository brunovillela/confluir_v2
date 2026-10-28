import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, CircleHelp } from "lucide-react"

import { Marca } from "@/components/marca"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requireSessaoTrabalhador } from "@/lib/auth"
import { hojeSP } from "@/lib/db/comum"
import {
  minhaOposicao,
  obterCampanhaPublica,
  opcoesFontes,
  vinculosAtivos,
  type VinculoAtivo,
} from "@/lib/db/oposicao"
import { nomeEntidade } from "@/lib/db/organizacao"
import { formatarData } from "@/lib/formato"
import { estadoPrazo } from "@/lib/oposicao-constantes"
import { getVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { PrazoOposicao } from "../prazo-oposicao"
import { OposicaoFlow } from "./oposicao-flow"

export const metadata: Metadata = { title: "Registrar oposição" }

/** "12345678901" → "***.456.789-**": o bastante para a pessoa se reconhecer. */
function cpfParcial(cpf: string): string {
  const d = cpf.replace(/\D/g, "")
  if (d.length !== 11) return "—"
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
}

export default async function RegistrarOposicaoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  // Na visualização da gestão, a sessão de trabalhador seria a de QUEM ATENDE:
  // a tela mostraria o fluxo dele sob a faixa "Visualizando a área de…". A
  // lista mostra a situação do filiado visualizado (e desliga o "Registrar").
  const vis = await getVisualizacaoPortal()
  if (vis?.preview) redirect("/portal/oposicao")

  const sessao = await requireSessaoTrabalhador(`/portal/oposicao/${(await params).id}`)
  const { id } = await params
  const campanha = await obterCampanhaPublica(id)
  // Sem as decisões jurídicas tomadas, a campanha não recebe oposição.
  if (!campanha || campanha.situacao !== "aberta" || !campanha.regrasCompletas) notFound()

  // Já se opôs → vai direto ao comprovante. Quem disse "não quero me opor"
  // continua podendo registrar enquanto o prazo estiver aberto (A14).
  const minha = await minhaOposicao(id, sessao.cpf)
  if (minha && minha.situacao !== "desistente") {
    redirect(`/portal/oposicao/comprovante/${minha.id}`)
  }

  const hoje = hojeSP()
  const prazo = estadoPrazo(campanha.prazo_inicio, campanha.prazo_fim, hoje)
  const ehFiliado = sessao.perfil === "filiado"
  const videoUrl = ehFiliado
    ? campanha.video_filiado_url
    : campanha.video_nao_filiado_url
  const videoTempo = ehFiliado
    ? campanha.video_filiado_tempo
    : campanha.video_nao_filiado_tempo
  // Fonte e matrícula do cadastro (A103): só o filiado tem; o não filiado
  // continua digitando. Se a leitura falhar, o formulário vem em branco.
  let vinculos: VinculoAtivo[] = []
  if (ehFiliado && prazo === "aberto") {
    vinculos = await vinculosAtivos(sessao.cpf).catch((e) => {
      console.error("oposição: vínculos do filiado", e)
      return []
    })
  }
  // Campanha sem fonte marcada e quem não é filiado (M5): escolhe entre as
  // fontes pagadoras da entidade — antes nem via o campo e a oposição saía
  // sem empregador, fora da relação que vai ao RH.
  const fontesGerais =
    !ehFiliado && prazo === "aberto" && campanha.fontes.length === 0
      ? await opcoesFontes().catch((e) => {
          console.error("oposição: fontes pagadoras", e)
          return []
        })
      : []

  const cartao = (
    <Card>
      <CardHeader>
        <CardTitle className="text-balance">
          <h1 className="text-lg font-semibold">
            {campanha.nome ?? "Contribuição assistencial"}
          </h1>
        </CardTitle>
        <CardDescription className="grid gap-2">
          {campanha.detalhe_desconto && <span>{campanha.detalhe_desconto}</span>}
          <span className="flex flex-wrap items-center gap-2">
            <span>
              Prazo: {formatarData(campanha.prazo_inicio)} a{" "}
              {formatarData(campanha.prazo_fim)}
            </span>
            <PrazoOposicao inicio={campanha.prazo_inicio} fim={campanha.prazo_fim} hoje={hoje} />
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {prazo !== "aberto" ? (
          <p className="text-muted-foreground text-sm">
            {prazo === "antes"
              ? `O prazo para se opor começa em ${formatarData(campanha.prazo_inicio)}.`
              : prazo === "depois"
                ? `O prazo para se opor terminou em ${formatarData(campanha.prazo_fim)}.`
                : "Esta campanha está sem prazo definido. Fale com a entidade."}
          </p>
        ) : (
          <div className="grid gap-4">
            {minha && (
              <Alert variant="info">
                <AlertDescription>
                  Você optou por não se opor
                  {minha.dia ? ` em ${formatarData(minha.dia)}` : ""}. Se mudou
                  de ideia, siga os passos abaixo para registrar a sua
                  oposição.
                </AlertDescription>
              </Alert>
            )}
            <OposicaoFlow
              campanha={campanha}
              videoUrl={videoUrl}
              videoTempo={videoTempo}
              identidade={{
                nome: sessao.nome,
                cpfParcial: cpfParcial(sessao.cpf),
                email: sessao.email,
              }}
              filiado={ehFiliado}
              vinculos={vinculos}
              fontesGerais={fontesGerais}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )

  // Na casca do portal (filiado logado — a regra do layout), menu e <main> são
  // do layout: a página é a coluna de leitura com o caminho de volta à lista,
  // como nas outras subpáginas do portal (A17).
  if (vis) {
    return (
      <div className="mx-auto grid w-full max-w-2xl gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
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
        {cartao}
      </div>
    )
  }

  // Trabalhador não filiado: tela enxuta, com o <main> como landmark (A181).
  const entidade = await nomeEntidade()
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <Marca tenant={entidade} />
        <Button variant="ghost" size="sm" asChild>
          <Link href="/portal/oposicao">
            <ArrowLeft />
            Voltar
          </Link>
        </Button>
      </header>
      <main id="conteudo" className="grid gap-6">
        {cartao}
      </main>
    </div>
  )
}
