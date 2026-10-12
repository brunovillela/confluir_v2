import type { Metadata } from "next"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { AcaoVisualizacao } from "@/components/acao-visualizacao"
import { CondicaoBadge } from "@/app/painel/filiados/condicao-badge"
import { TrilhaEtapas } from "@/components/trilha-etapas"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getSessaoPortal } from "@/lib/auth"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"
import { formatarCpf } from "@/lib/cpf"
import { vinculosDoFiliado, type VinculoDoPortal } from "@/lib/db/cadastro-portal"
import { cadastroDoFiliado } from "@/lib/db/filiado-portal"
import { marcosDaTrilha, ROTULOS_FORMA_RECEBIMENTO } from "@/lib/filiacao"
import { formatarData } from "@/lib/formato"

import { ContatosEmergencia } from "@/components/contatos-emergencia"
import { listarContatosEmergencia } from "@/lib/db/filiacao-contatos-emergencia"

import { excluirMeuContatoEmergencia, salvarMeuContatoEmergencia } from "./actions"
import { CadastroForm } from "./cadastro-form"

export const metadata: Metadata = { title: "Meu cadastro — Confluir" }

/** Pedidos de correção vão ao Atendimento com o assunto já escolhido (A34). */
function linkAtendimento(titulo: string): string {
  return `/portal/atendimento?${new URLSearchParams({ assunto: "cadastro", titulo })}`
}
const LINK_CORRECAO = linkAtendimento("Correção no meu cadastro")
const LINK_VINCULO = linkAtendimento("Mudança no vínculo com a fonte pagadora")

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5 text-sm">{children ?? "—"}</dd>
    </div>
  )
}

/** Cargo/lotação: o valor, "não se aplica" em fundo de pensão, ou "não informado". */
function doPosto(valor: string | null, v: VinculoDoPortal): string {
  return valor ?? (v.fundoPensao ? "Não se aplica (fundo de pensão)" : "Não informado")
}

function um(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string | string[] }>
}) {
  const { filiado, preview } = await requireVisualizacaoPortal()
  const salvo = um((await searchParams).salvo)
  const [cadastro, emergencia, vinculos, sessao] = await Promise.all([
    cadastroDoFiliado(filiado.cpf),
    listarContatosEmergencia({ cpf: filiado.cpf, filiadoId: filiado.filiacaoId }),
    // Falha na leitura dos vínculos não derruba a página: o card avisa.
    vinculosDoFiliado(filiado.cpf, filiado.filiacaoId).catch(() => null),
    // E-mail da conta de acesso (A25) — só na sessão do próprio filiado; na
    // visualização a sessão é a da gestão.
    preview ? Promise.resolve(null) : getSessaoPortal(),
  ])

  // Trilha de etapas (só quando há filiação/desfiliação em andamento).
  const trilha = cadastro
    ? marcosDaTrilha(cadastro.filiacao_condicao, {
        created_at: cadastro.created_at,
        ficha_assinada_em: cadastro.ficha_assinada_em,
        filiacao_informada_fonte_em: cadastro.filiacao_informada_fonte_em,
        ativo_em: cadastro.ativo_em,
        desfiliacao_informada_fonte_em: cadastro.desfiliacao_informada_fonte_em,
        inativo_em: cadastro.inativo_em,
      })
    : null
  const filiadoDesde = vinculos?.filiadoDesde ?? cadastro?.ativo_em?.slice(0, 10) ?? null

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meu cadastro</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Você pode atualizar telefones, e-mails, endereço e contatos de
          emergência. Os demais dados são alterados pela secretaria da
          entidade —{" "}
          <Link href={LINK_CORRECAO} className="text-primary font-medium underline underline-offset-4">
            peça a correção pelo Atendimento
          </Link>
          .
        </p>
      </div>

      {salvo === "1" && (
        <Alert variant="success">
          <AlertDescription>Cadastro atualizado com sucesso.</AlertDescription>
        </Alert>
      )}

      {!cadastro ? (
        <Alert variant="destructive">
          <AlertDescription>
            Não foi possível carregar seu cadastro — fale com o sindicato.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {/* Retorno do pedido de desistência (contrato com a frente da
              desfiliação): a confirmação fica junto da trilha, e a trilha
              vem antes de tudo — é o que a pessoa veio acompanhar. */}
          {salvo === "desfiliacao" && (
            <Alert variant="success">
              <AlertDescription>
                {trilha?.processo === "desfiliacao"
                  ? "Pedido de desistência registrado — acompanhe as etapas abaixo."
                  : "Pedido de desistência registrado. A secretaria dá andamento e você acompanha por aqui."}
              </AlertDescription>
            </Alert>
          )}

          {trilha && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {trilha.processo === "desfiliacao"
                    ? "Andamento da sua desfiliação"
                    : "Andamento da sua filiação"}
                </CardTitle>
                <CardDescription>
                  Acompanhe em que etapa está o seu processo.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-1">
                <TrilhaEtapas marcos={trilha.marcos} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Identificação</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                <Campo rotulo="Nome completo">{cadastro.nome_completo}</Campo>
                <Campo rotulo="CPF">
                  {cadastro.cpf ? formatarCpf(cadastro.cpf) : "—"}
                </Campo>
                <Campo rotulo="Matrícula sindical">
                  {cadastro.matricula_sindical}
                </Campo>
                <Campo rotulo="Condição da filiação">
                  <CondicaoBadge condicao={cadastro.filiacao_condicao} />
                </Campo>
                <Campo rotulo="Filiação desde">{formatarData(filiadoDesde)}</Campo>
                <Campo rotulo="Nascimento">
                  {formatarData(cadastro.nascimento_data)}
                </Campo>
                <Campo rotulo="Sexo">{cadastro.sexo}</Campo>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Seu vínculo com a fonte pagadora</CardTitle>
              <CardDescription>
                Onde a sua contribuição é descontada e com qual matrícula. Quem
                altera estes dados é a secretaria.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {!vinculos ? (
                <Alert variant="warning">
                  <AlertDescription>
                    Não foi possível carregar os seus vínculos agora. Tente de
                    novo daqui a pouco.
                  </AlertDescription>
                </Alert>
              ) : vinculos.abertos.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Nenhum vínculo em aberto com fonte pagadora no seu cadastro.
                  Se você trabalha (ou é aposentado ou pensionista) em uma
                  empresa ou fundo de pensão que desconta a contribuição, avise
                  a secretaria.
                </p>
              ) : (
                vinculos.abertos.map((v) => (
                  <div key={v.id} className="grid gap-3 rounded-lg border p-3">
                    <p className="text-sm font-medium">
                      {v.fonte ?? "Fonte pagadora não informada"}
                    </p>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                      <Campo rotulo="Matrícula na fonte">{v.matricula ?? "Não informada"}</Campo>
                      <Campo rotulo="Condição na fonte">{v.condicaoNaFonte ?? "Não informada"}</Campo>
                      <Campo rotulo="Filiação por esta fonte desde">{formatarData(v.desde)}</Campo>
                      <Campo rotulo="Cargo">{doPosto(v.cargo, v)}</Campo>
                      <Campo rotulo="Lotação">{doPosto(v.lotacao, v)}</Campo>
                      {v.admissao && <Campo rotulo="Admissão">{formatarData(v.admissao)}</Campo>}
                    </dl>
                  </div>
                ))
              )}

              {vinculos?.forma && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Forma de contribuição: </span>
                  {ROTULOS_FORMA_RECEBIMENTO[vinculos.forma]}
                </p>
              )}

              {vinculos && vinculos.anteriores.length > 0 && (
                <details className="group">
                  {/* `flex` tira o triângulo nativo do <summary>: a seta
                      diz que abre e fecha. */}
                  <summary className="text-primary flex min-h-11 cursor-pointer items-center gap-1 text-sm font-medium">
                    <ChevronRight aria-hidden className="size-4 transition-transform group-open:rotate-90" />
                    Vínculos anteriores ({vinculos.anteriores.length})
                  </summary>
                  <ul className="grid gap-2 pt-1">
                    {vinculos.anteriores.map((v) => (
                      <li key={v.id} className="text-sm">
                        <span className="font-medium">{v.fonte ?? "Fonte pagadora não informada"}</span>
                        <span className="text-muted-foreground">
                          {v.matricula ? ` · matrícula ${v.matricula}` : ""} · de{" "}
                          {formatarData(v.desde)} a {formatarData(v.ate)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="grid gap-2">
                <p className="text-muted-foreground text-sm">
                  Mudou de lotação, se aposentou ou a matrícula está diferente?
                  Avise a secretaria: é isso que garante o desconto no
                  contracheque certo.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline">
                    <Link href={LINK_VINCULO}>Avisar que algo mudou</Link>
                  </Button>
                  <Button asChild variant="ghost">
                    <Link href="/portal/contribuicao">Ver minhas contribuições</Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <CadastroForm
            somenteLeitura={preview}
            emailAcesso={filiado.email}
            emailConta={sessao?.user.email ?? null}
            linkTrocaEmail={linkAtendimento("Trocar o e-mail de acesso")}
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
          />

          {emergencia.disponivel && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contatos de emergência</CardTitle>
                <CardDescription>
                  Quem o sindicato deve avisar se você sofrer um acidente ou
                  precisar de ajuda durante uma atividade. Até 5 pessoas.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ContatosEmergencia
                  contatos={emergencia.contatos}
                  salvar={salvarMeuContatoEmergencia}
                  excluir={excluirMeuContatoEmergencia}
                  podeEditar
                  preview={preview}
                />
              </CardContent>
            </Card>
          )}

          {/* Quem só entra pelo código do e-mail precisa de onde criar a
              senha dentro do portal (A66): a tela é a /definir-senha, que
              exige a sessão aberta — o destino traz de volta para cá. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Senha de acesso</CardTitle>
              <CardDescription>
                Com uma senha você entra pelo CPF, sem esperar o código por
                e-mail. Também serve para trocar a senha que você já tem.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AcaoVisualizacao preview={preview}>
                <Button asChild variant="outline">
                  <Link href="/definir-senha?destino=/portal/cadastro">Criar ou trocar a senha</Link>
                </Button>
              </AcaoVisualizacao>
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}
