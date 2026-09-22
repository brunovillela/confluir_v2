import type { Metadata } from "next"
import { Eye } from "lucide-react"

import { AuthShell } from "@/components/auth/auth-shell"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { encerrarVisualizacaoEleitor } from "@/lib/actions/visualizacao-eleitor"
import {
  elegibilidadeEleitorEmail,
  elegibilidadeParaVotar,
  elegibilidadePorLink,
  perguntasDaAssembleia,
  type AssembleiaDoFiliado,
} from "@/lib/db/votacao-portal"
import { precisaConfirmarCpf, precisaInformarDados } from "@/lib/db/votacao-primeiro-acesso"
import { formatarDataHora } from "@/lib/formato"
import { createClient } from "@/lib/supabase/server"
import { eleitorPorLink } from "@/lib/acesso-eleitor"
import { getVisualizacaoEleitor } from "@/lib/visualizacao-eleitor"

import { CedulaForm } from "@/app/portal/votacao/[id]/cedula-form"

import { votarPublico } from "./actions"
import { ConfirmarCpfForm } from "./confirmar-cpf-form"
import { DadosEleitorForm } from "./dados-eleitor-form"
import { VotarForm } from "./votar-form"

export const metadata: Metadata = { title: "Votação — Confluir" }

export default async function VotarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ erro?: string; aviso?: string }>
}) {
  const { id } = await params
  const busca = await searchParams
  const linkRecusado = busca.erro === "link"
  const avisouNaoSouEu = busca.aviso === "nao-sou-eu"

  // Gestão vendo a área de um apto (somente leitura): mesma tela, identidade
  // do apto para EXIBIR, sessão real da gestão para qualquer gravação.
  const visualizado = await getVisualizacaoEleitor()
  if (visualizado) {
    const eleg =
      (visualizado.cpf ? await elegibilidadeParaVotar(visualizado.cpf, id) : null) ??
      (visualizado.email ? await elegibilidadeEleitorEmail(visualizado.email, id) : null)
    const precisaDados =
      !visualizado.cpf && visualizado.email
        ? await precisaInformarDados(visualizado.email, id)
        : false
    const precisaCpf = visualizado.email
      ? await precisaConfirmarCpf(visualizado.email, id)
      : false
    const perguntas = eleg?.online ? await perguntasDaAssembleia(id) : []
    return (
      <>
        <div className="border-warning/40 bg-warning/10 text-warning-fg border-b">
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
            <span className="flex items-center gap-2">
              <Eye className="size-4 shrink-0" />
              <span>
                Visualizando a área de <strong>{visualizado.nome ?? "eleitor"}</strong> —
                somente leitura
                {visualizado.gestorNome ? ` · ${visualizado.gestorNome}` : ""}
              </span>
            </span>
            <form action={encerrarVisualizacaoEleitor}>
              <Button variant="outline" size="sm" type="submit">
                Sair da visualização
              </Button>
            </form>
          </div>
        </div>
        <AuthShell rodape="O acesso é temporário e expira ao final da votação.">
          <Cedula
            id={id}
            eleg={eleg}
            perguntas={perguntas}
            precisaDados={precisaDados}
            precisaCpf={precisaCpf}
            preview
          />
        </AuthShell>
      </>
    )
  }

  // Eleitor que entrou pelo LINK PESSOAL do e-mail (sem código): a identidade
  // está no cookie assinado, conferido a cada request.
  const porLink = await eleitorPorLink(id)
  if (porLink) {
    const eleg = await elegibilidadePorLink(porLink.aptoId, id)
    const precisaDados =
      !porLink.cpf && porLink.email ? await precisaInformarDados(porLink.email, id) : false
    const precisaCpf = porLink.email ? await precisaConfirmarCpf(porLink.email, id) : false
    const perguntas = eleg?.online ? await perguntasDaAssembleia(id) : []
    return (
      <AuthShell rodape="O acesso é temporário e expira ao final da votação.">
        <Cedula
          id={id}
          eleg={eleg}
          perguntas={perguntas}
          precisaDados={precisaDados}
          precisaCpf={precisaCpf}
        />
      </AuthShell>
    )
  }

  // Sessão do eleitor (criada pelo OTP) — a identidade é o CPF do metadata.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const cpf =
    typeof user?.user_metadata?.cpf === "string" &&
    user.user_metadata.cpf.length === 11
      ? user.user_metadata.cpf
      : null

  // Sem sessão → identificação (CPF de filiado ou e-mail de não-filiado).
  if (!user) {
    return (
      <AuthShell rodape="O acesso é temporário e expira ao final da votação.">
        {avisouNaoSouEu && (
          <Alert variant="success" className="mb-4">
            <AlertDescription>
              Obrigado. Avisamos o sindicato de que este e-mail não é seu, e o link foi
              desativado.
            </AlertDescription>
          </Alert>
        )}
        {linkRecusado && (
          <Alert variant="warning" className="mb-4">
            <AlertDescription>
              Este link de votação não é mais válido. Identifique-se abaixo para receber um
              código, ou peça um novo link ao sindicato.
            </AlertDescription>
          </Alert>
        )}
        <VotarForm assembleiaId={id} />
      </AuthShell>
    )
  }

  // Identidade da sessão: filiado (CPF no metadata) ou não-filiado (e-mail).
  const eleg = cpf
    ? await elegibilidadeParaVotar(cpf, id)
    : user.email
      ? await elegibilidadeEleitorEmail(user.email, id)
      : null
  // Quem entrou pelo e-mail informa CPF, nome e nascimento no primeiro acesso.
  const precisaDados = !cpf && user.email ? await precisaInformarDados(user.email, id) : false
  const precisaCpf = !cpf && user.email ? await precisaConfirmarCpf(user.email, id) : false
  const perguntas = eleg?.online ? await perguntasDaAssembleia(id) : []

  return (
    <AuthShell rodape="O acesso é temporário e expira ao final da votação.">
      <Cedula
        id={id}
        eleg={eleg}
        perguntas={perguntas}
        precisaDados={precisaDados}
        precisaCpf={precisaCpf}
      />
    </AuthShell>
  )
}

/** O cartão da cédula com os estados possíveis (igual para eleitor e gestão). */
function Cedula({
  id,
  eleg,
  perguntas,
  precisaDados,
  precisaCpf = false,
  preview = false,
}: {
  id: string
  eleg: AssembleiaDoFiliado | null
  perguntas: Awaited<ReturnType<typeof perguntasDaAssembleia>>
  precisaDados: boolean
  precisaCpf?: boolean
  preview?: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{eleg?.nome ?? "Cédula de votação"}</CardTitle>
        <CardDescription>
          {eleg?.empregador ?? "Escolha uma opção em cada pergunta."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!eleg ? (
          <Alert variant="warning">
            <AlertDescription>
              {preview
                ? "Este apto não está habilitado a votar nesta assembleia agora — confira a lista de aptos, o período da rodada e se a votação é online."
                : "Você não está apto a votar nesta assembleia, ou a votação não está aberta."}
            </AlertDescription>
          </Alert>
        ) : !eleg.online ? (
          <Alert variant="warning">
            <AlertDescription>
              Esta assembleia é presencial — não há cédula online.
            </AlertDescription>
          </Alert>
        ) : eleg.abreEm ? (
          <Alert variant="info">
            <AlertDescription>
              A votação ainda não começou. Ela abre em{" "}
              <strong>{formatarDataHora(eleg.abreEm)}</strong>.
            </AlertDescription>
          </Alert>
        ) : eleg.jaVotou ? (
          <Alert className="border-success/40 text-success-fg">
            <AlertDescription>
              {preview
                ? "Este eleitor já votou nesta assembleia."
                : "Você já votou nesta assembleia. Obrigado por participar."}
            </AlertDescription>
          </Alert>
        ) : precisaDados ? (
          <DadosEleitorForm assembleiaId={id} preview={preview} />
        ) : precisaCpf ? (
          <ConfirmarCpfForm assembleiaId={id} preview={preview} />
        ) : perguntas.length === 0 ? (
          <Alert variant="warning">
            <AlertDescription>
              A cédula desta assembleia ainda não tem perguntas.
            </AlertDescription>
          </Alert>
        ) : (
          <CedulaForm assembleiaId={id} perguntas={perguntas} acao={votarPublico} preview={preview} />
        )}
      </CardContent>
    </Card>
  )
}
