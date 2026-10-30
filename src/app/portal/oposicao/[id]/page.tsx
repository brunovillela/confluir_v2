import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, CheckCircle2, CircleHelp } from "lucide-react"

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
import type { ItemDoFormulario } from "@/app/portal/primeiro-acesso/regras"
import { getSessaoPortal, requireSessaoTrabalhador } from "@/lib/auth"
import { hojeSP } from "@/lib/db/comum"
import { listarTermos, type TermoVersao } from "@/lib/db/filiacao-termos"
import { cadastroDoFiliado } from "@/lib/db/filiado-portal"
import { cienciaRegistrada, dadosConferidos, orientacoesDaCampanha } from "@/lib/db/oposicao-ciencia"
import { opcoesDaParte } from "@/lib/db/portal-partes"
import { pendenciasDaOposicao, type PendenciasDaOposicao } from "@/lib/db/portal-primeiro-acesso"
import { nomesDasEtapas } from "@/lib/oposicao-orientacoes"
import { opcoesPadrao } from "@/lib/portal-partes-constantes"
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

import { CadastroForm } from "../../cadastro/cadastro-form"
import { AceiteLgpdForm } from "../../lgpd/aceite-form"
import { rotuloVersao } from "../../lgpd/consentimentos"
import { CienciaForm, ConfirmarDadosForm, PerguntasFrequentes } from "../orientacoes"
import { PrazoOposicao } from "../prazo-oposicao"
import { Etapas, OposicaoFlow } from "./oposicao-flow"

export const metadata: Metadata = { title: "Registrar oposição" }

/** "12345678901" → "***.456.789-**": o bastante para a pessoa se reconhecer. */
function cpfParcial(cpf: string): string {
  const d = cpf.replace(/\D/g, "")
  if (d.length !== 11) return "—"
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
}

export default async function RegistrarOposicaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ feito?: string | string[] }>
}) {
  const feitoBruto = (await searchParams).feito
  const feito = Array.isArray(feitoBruto) ? feitoBruto[0] : feitoBruto
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
  // Antes do fluxo (30/10/2026): instruções + aviso de privacidade ("Li e
  // quero prosseguir") e, do filiado, o termo da entidade e os dados.
  const entidade = await nomeEntidade()
  const orientacoes = orientacoesDaCampanha(campanha, ehFiliado, entidade)
  const comVideo =
    Boolean(videoUrl) || (campanha.regras.video_minimo === "exigir" && Boolean(videoTempo && videoTempo > 0))
  let passo: "ciencia" | "dados" | "fluxo" = "fluxo"
  let pend: PendenciasDaOposicao | null = null
  if (prazo === "aberto") {
    if (!(await cienciaRegistrada(id, sessao.cpf, orientacoes.hash))) passo = "ciencia"
    else if (ehFiliado) {
      pend = await pendenciasDaOposicao(sessao.cpf).catch((e) => {
        console.error("oposição: pendências do filiado", e)
        return null
      })
      if (!pend || pend.termo || pend.faltam.length > 0 || !(await dadosConferidos(id, sessao.cpf))) passo = "dados"
    }
  }
  // Fonte e matrícula do cadastro (A103): só o filiado tem; o não filiado
  // continua digitando. Se a leitura falhar, o formulário vem em branco.
  let vinculos: VinculoAtivo[] = []
  if (ehFiliado && prazo === "aberto" && passo === "fluxo") {
    vinculos = await vinculosAtivos(sessao.cpf).catch((e) => {
      console.error("oposição: vínculos do filiado", e)
      return []
    })
  }
  // Campanha sem fonte marcada e quem não é filiado (M5): escolhe entre as
  // fontes pagadoras da entidade — antes nem via o campo e a oposição saía
  // sem empregador, fora da relação que vai ao RH.
  const fontesGerais =
    passo === "fluxo" && !ehFiliado && prazo === "aberto" && campanha.fontes.length === 0
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
            {passo === "ciencia" && (
              <PassoCiencia campanhaId={id} orientacoes={orientacoes} etapas={nomesDasEtapas(ehFiliado, comVideo)} />
            )}
            {passo === "dados" && (
              <PassoDados
                campanhaId={id}
                pend={pend}
                feito={feito}
                entidade={entidade}
                etapas={nomesDasEtapas(ehFiliado, comVideo)}
                cpf={sessao.cpf}
                emailAcesso={vis?.filiado.email ?? null}
              />
            )}
            {passo === "fluxo" && (
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
            )}
            {passo === "fluxo" && (
              <details className="rounded-lg border p-3 text-sm">
                <summary className="min-h-11 cursor-pointer content-center font-medium">
                  Rever as instruções e as perguntas frequentes
                </summary>
                <ol className="mt-2 grid list-decimal gap-1.5 pl-5">
                  {orientacoes.instrucoes.map((texto, i) => (
                    <li key={i}>{texto}</li>
                  ))}
                </ol>
                <h3 className="mt-4 mb-1 font-semibold">Perguntas frequentes</h3>
                <PerguntasFrequentes itens={orientacoes.perguntas} />
              </details>
            )}
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

const CLASSE_TEXTO_LONGO =
  "bg-muted/30 focus-visible:ring-ring/50 max-h-64 overflow-y-auto rounded-lg border p-3 text-sm whitespace-pre-line outline-none focus-visible:ring-3"

/** Passo 1: instruções, aviso de privacidade, perguntas frequentes e o "Li e quero prosseguir". */
function PassoCiencia({
  campanhaId,
  orientacoes,
  etapas,
}: {
  campanhaId: string
  orientacoes: ReturnType<typeof orientacoesDaCampanha>
  etapas: string[]
}) {
  return (
    <div className="grid gap-5">
      <Etapas atual={0} etapas={etapas} />
      <div className="grid gap-1">
        <h2 className="text-base font-semibold">Leia antes de começar</h2>
        <p className="text-muted-foreground text-sm">
          Como funciona esta campanha, o que você precisa fazer e até quando. Nada é registrado nesta etapa.
        </p>
      </div>
      <ol className="grid list-decimal gap-2 pl-5 text-sm">
        {orientacoes.instrucoes.map((texto, i) => (
          <li key={i}>{texto}</li>
        ))}
      </ol>
      <div className="grid gap-2">
        <h3 className="text-sm font-semibold">Aviso de privacidade</h3>
        {/* Rolagem própria, focável pelo teclado, como o termo do primeiro acesso. */}
        <div role="region" aria-label="Texto do aviso de privacidade" tabIndex={0} className={CLASSE_TEXTO_LONGO}>
          {orientacoes.aviso}
        </div>
      </div>
      <div className="grid gap-1">
        <h3 className="text-sm font-semibold">Perguntas frequentes</h3>
        <PerguntasFrequentes itens={orientacoes.perguntas} />
      </div>
      <CienciaForm campanhaId={campanhaId} hash={orientacoes.hash} />
    </div>
  )
}

/**
 * Passo 2 do filiado: o termo de privacidade da entidade (se faltar o aceite
 * da versão em vigor) e os dados — e-mail, telefone e endereço obrigatórios,
 * o endereço pelo CEP. Os formulários são os do primeiro acesso, voltando
 * para cá; o "Meus dados estão corretos" libera com nada faltando.
 */
async function PassoDados({
  campanhaId,
  pend,
  feito,
  entidade,
  etapas,
  cpf,
  emailAcesso,
}: {
  campanhaId: string
  pend: PendenciasDaOposicao | null
  feito: string | undefined
  entidade: string
  etapas: string[]
  cpf: string
  emailAcesso: string | null
}) {
  const voltar = (f: "termo" | "dados") => `/portal/oposicao/${campanhaId}?feito=${f}`
  const [versoes, cadastro, sessaoPortal, opcoesCadastro] = await Promise.all([
    pend?.termo ? listarTermos("lgpd").catch(() => [] as TermoVersao[]) : Promise.resolve([] as TermoVersao[]),
    pend && pend.exigidos.length > 0 ? cadastroDoFiliado(cpf).catch(() => null) : Promise.resolve(null),
    getSessaoPortal().catch(() => null),
    opcoesDaParte("cadastro").catch(() => opcoesPadrao("cadastro")),
  ])
  const termo = pend?.termo ? (versoes.find((v) => v.id === pend.termo?.id) ?? null) : null
  const obrigatorios = (pend?.exigidos ?? []).filter((i): i is ItemDoFormulario => i !== "contato_emergencia")
  const liberado = pend !== null && !pend.termo && pend.faltam.length === 0

  return (
    <div className="grid gap-5">
      <Etapas atual={1} etapas={etapas} />
      <div className="grid gap-1">
        <h2 className="text-base font-semibold">Confira os seus dados</h2>
        <p className="text-muted-foreground text-sm">
          Antes de se opor, o seu cadastro no sindicato precisa estar completo. Os campos com * são obrigatórios; os
          outros você atualiza se quiser. No endereço, comece pelo CEP.
        </p>
      </div>
      {(feito === "dados" || feito === "termo") && (
        <Alert variant="success">
          <CheckCircle2 aria-hidden />
          <AlertDescription>{feito === "dados" ? "Dados salvos." : "Aceite registrado."}</AlertDescription>
        </Alert>
      )}
      {(!pend || (obrigatorios.length > 0 && !cadastro)) && (
        <Alert variant="destructive">
          <AlertDescription>
            Não foi possível carregar o seu cadastro agora. Recarregue a página daqui a pouco.
          </AlertDescription>
        </Alert>
      )}
      {pend?.termo && (
        <div className="grid gap-3">
          <h3 className="text-sm font-semibold">
            {pend.termo.renovacao ? "Aceite a nova versão do termo de privacidade" : "Aceite o termo de privacidade"}
          </h3>
          {termo?.texto ? (
            <>
              <p className="text-muted-foreground text-xs">
                Como {entidade} trata os seus dados pessoais — termo em vigor, {rotuloVersao(termo)}.
              </p>
              <div role="region" aria-label="Texto do termo de privacidade" tabIndex={0} className={CLASSE_TEXTO_LONGO}>
                {termo.texto}
              </div>
              <AceiteLgpdForm
                entidade={entidade}
                termoId={termo.id}
                versao={rotuloVersao(termo)}
                voltar={voltar("termo")}
              />
            </>
          ) : (
            <Alert variant="warning">
              <AlertDescription>Não foi possível carregar o termo agora. Recarregue a página daqui a pouco.</AlertDescription>
            </Alert>
          )}
        </div>
      )}
      {cadastro && (
        <CadastroForm
          gruposEditaveis={opcoesCadastro.campos_editaveis}
          emailAcesso={emailAcesso}
          emailConta={sessaoPortal?.user.email ?? null}
          linkTrocaEmail={null}
          linkCorrecao={null}
          contato={{
            email_pessoal: cadastro.email_pessoal,
            email_corporativo: cadastro.email_corporativo,
            telefone_1: cadastro.telefone_1,
            telefone_1_whatsapp: cadastro.telefone_1_whatsapp,
            telefone_2: cadastro.telefone_2,
            telefone_2_whatsapp: cadastro.telefone_2_whatsapp,
            endereco_cep: cadastro.endereco_cep,
            endereco_logradouro: cadastro.endereco_logradouro,
            endereco_numero: cadastro.endereco_numero,
            endereco_complemento: cadastro.endereco_complemento,
            endereco_bairro: cadastro.endereco_bairro,
            endereco_cidade: cadastro.endereco_cidade,
            endereco_estado: cadastro.endereco_estado,
          }}
          obrigatorios={obrigatorios}
          voltar={voltar("dados")}
          rotuloSalvar="Salvar dados"
          nivelTitulo={3}
          cepPrimeiro
        />
      )}
      <ConfirmarDadosForm campanhaId={campanhaId} liberado={liberado} />
    </div>
  )
}
