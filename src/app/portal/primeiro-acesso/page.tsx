import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { CheckCircle2, Settings2 } from "lucide-react"

import { ContatosEmergencia } from "@/components/contatos-emergencia"
import { AvisoDaUrl } from "@/components/portal/aviso-da-url"
import { CabecalhoPagina } from "@/components/portal/cabecalho-pagina"
import { EstadoVazio } from "@/components/portal/estado-vazio"
import { HREF_AREA_DO_ASSOCIADO } from "@/components/portal/guarda-parte"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getSessaoPortal } from "@/lib/auth"
import { listarContatosEmergencia } from "@/lib/db/filiacao-contatos-emergencia"
import { listarTermos, type TermoVersao } from "@/lib/db/filiacao-termos"
import { cadastroDoFiliado } from "@/lib/db/filiado-portal"
import { nomeEntidade } from "@/lib/db/organizacao"
import { opcoesDaParte } from "@/lib/db/portal-partes"
import { pendenciasDoPrimeiroAcesso } from "@/lib/db/portal-primeiro-acesso"
import { opcoesPadrao } from "@/lib/portal-partes-constantes"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { excluirMeuContatoEmergencia, salvarMeuContatoEmergencia } from "../cadastro/actions"
import { CadastroForm } from "../cadastro/cadastro-form"
import { AceiteLgpdForm } from "../lgpd/aceite-form"
import { rotuloVersao } from "../lgpd/consentimentos"
import {
  destinoAoConcluir,
  hrefPrimeiroAcesso,
  oQueFalta,
  PASSOS_FEITOS,
  resumoDoPrimeiroAcesso,
  ROTA_PRIMEIRO_ACESSO,
  type ItemDoFormulario,
  type PassoFeito,
} from "./regras"

export const metadata: Metadata = { title: "Primeiro acesso" }

const FEITO: Record<PassoFeito, string> = {
  termo: "Aceite registrado. Obrigado!",
  dados: "Dados salvos.",
  contato: "Contato de emergência salvo.",
}

function um(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

/**
 * Primeiro acesso (Filiados › Área do associado › Primeiro acesso): antes de
 * usar o portal, o associado aceita o termo de privacidade em vigor e
 * completa os dados obrigatórios. A página mostra só o que falta, em passos
 * numerados (termo → dados), com o texto e o formulário de aceite da página
 * Privacidade e dados e o formulário de Meu cadastro — as mesmas actions e
 * validações, com o campo `voltar` trazendo a pessoa de volta para cá.
 *
 * Cada passo concluído revalida a casca (o portão some na hora) e volta para
 * cá; sem nada pendente, a página segue para o destino (`next`, o que a
 * pessoa tinha pedido ao entrar) ou para o Início. No "Ver como filiado", a
 * gestão vê a mesma página, só para leitura, com a nota da gestão — e, sem
 * pendência, o motivo, em vez de seguir adiante.
 */
export default async function PrimeiroAcessoPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; feito?: string | string[] }>
}) {
  const { filiado, preview } = await requireVisualizacaoPortal()
  const busca = await searchParams
  const destino = destinoAoConcluir(um(busca.next))
  const feito = um(busca.feito)
  const pend = await pendenciasDoPrimeiroAcesso(filiado.cpf, filiado.filiacaoId)

  if (!pend.pendente) {
    if (!preview) redirect(destino)
    return <SemPendencias exigido={pend.exigido} destino={destino} />
  }

  const doFormulario = pend.dados.filter((i): i is ItemDoFormulario => i !== "contato_emergencia")
  const comEmergencia = pend.dados.includes("contato_emergencia")
  const [entidade, versoes, cadastro, sessao, opcoesCadastro, emergencia] = await Promise.all([
    nomeEntidade(),
    pend.termo ? listarTermos("lgpd").catch(() => [] as TermoVersao[]) : Promise.resolve([] as TermoVersao[]),
    doFormulario.length > 0 ? cadastroDoFiliado(filiado.cpf).catch(() => null) : Promise.resolve(null),
    // E-mail da conta de acesso (regra da troca do e-mail de acesso) — só na
    // sessão do próprio associado; na visualização, a sessão é a da gestão.
    doFormulario.length > 0 && !preview ? getSessaoPortal().catch(() => null) : Promise.resolve(null),
    opcoesDaParte("cadastro").catch(() => opcoesPadrao("cadastro")),
    comEmergencia
      ? listarContatosEmergencia({ cpf: filiado.cpf, filiadoId: filiado.filiacaoId }).catch(() => null)
      : Promise.resolve(null),
  ])
  const termo = pend.termo ? (versoes.find((v) => v.id === pend.termo?.id) ?? null) : null
  const total = (pend.termo ? 1 : 0) + (pend.dados.length > 0 ? 1 : 0)

  return (
    <>
      <CabecalhoPagina
        secao={ROTA_PRIMEIRO_ACESSO}
        titulo="Antes de começar"
        subtitulo={`Falta pouco para você usar o portal de ${entidade}: ${resumoDoPrimeiroAcesso(pend)}. Depois, você segue direto para o que veio fazer.`}
      />

      {feito && (PASSOS_FEITOS as readonly string[]).includes(feito) && (
        <AvisoDaUrl parametros={["feito"]}>
          <Alert variant="success">
            <CheckCircle2 aria-hidden />
            <AlertDescription>{FEITO[feito as PassoFeito]}</AlertDescription>
          </Alert>
        </AvisoDaUrl>
      )}

      {preview && <NotaDaGestao />}

      <ol className="grid gap-8">
        {pend.termo && (
          <Passo
            numero={1}
            total={total}
            titulo={pend.termo.renovacao ? "Aceite a nova versão do termo de privacidade" : "Aceite o termo de privacidade"}
            descricao={
              pend.termo.renovacao
                ? `${entidade} atualizou o termo que explica como trata os seus dados pessoais. Leia e confirme para continuar.`
                : `Como ${entidade} trata os seus dados pessoais. Leia e confirme para continuar.`
            }
          >
            <Card>
              <CardContent className="grid gap-4">
                {termo?.texto ? (
                  <>
                    <p className="text-muted-foreground text-xs">Termo em vigor — {rotuloVersao(termo)}.</p>
                    {/* Rolagem própria para o termo não empurrar o aceite para longe;
                        focável, para rolar também pelo teclado. */}
                    <div
                      role="region"
                      aria-label="Texto do termo de privacidade"
                      tabIndex={0}
                      className="bg-muted/30 focus-visible:ring-ring/50 max-h-80 overflow-y-auto rounded-lg border p-3 text-sm whitespace-pre-line outline-none focus-visible:ring-3"
                    >
                      {termo.texto}
                    </div>
                    <AceiteLgpdForm
                      preview={preview}
                      entidade={entidade}
                      termoId={termo.id}
                      versao={rotuloVersao(termo)}
                      voltar={hrefPrimeiroAcesso(destino, "termo")}
                    />
                  </>
                ) : (
                  <Alert variant="warning">
                    <AlertDescription>
                      Não foi possível carregar o termo agora. Recarregue a página daqui a pouco.
                    </AlertDescription>
                  </Alert>
                )}
                <p className="text-muted-foreground text-xs">
                  Seus aceites e seus direitos sobre os dados ficam sempre em{" "}
                  <Link href="/portal/lgpd" className="text-foreground font-medium underline underline-offset-4">
                    Privacidade e dados
                  </Link>
                  .
                </p>
              </CardContent>
            </Card>
          </Passo>
        )}

        {pend.dados.length > 0 && (
          <Passo
            numero={pend.termo ? 2 : 1}
            total={total}
            titulo="Complete seus dados"
            descricao={
              <>
                Falta {oQueFalta(pend.dados)}. {doFormulario.length > 0 && "Os campos com * são obrigatórios. "}
                Depois, você atualiza tudo quando quiser em{" "}
                <Link href="/portal/cadastro" className="text-foreground font-medium underline underline-offset-4">
                  Meu cadastro
                </Link>
                .
              </>
            }
          >
            {doFormulario.length > 0 &&
              (cadastro ? (
                <CadastroForm
                  somenteLeitura={preview}
                  gruposEditaveis={opcoesCadastro.campos_editaveis}
                  emailAcesso={filiado.email}
                  emailConta={sessao?.user.email ?? null}
                  // O Atendimento espera o primeiro acesso: os pedidos à
                  // secretaria ficam em texto, sem link.
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
                  obrigatorios={doFormulario}
                  voltar={hrefPrimeiroAcesso(destino, "dados")}
                  rotuloSalvar="Salvar e continuar"
                  // Os blocos ficam abaixo do título do passo (h2), como o contato de emergência.
                  nivelTitulo={3}
                />
              ) : (
                <Alert variant="destructive">
                  <AlertDescription>
                    Não foi possível carregar seu cadastro agora. Recarregue a página daqui a pouco.
                  </AlertDescription>
                </Alert>
              ))}

            {comEmergencia &&
              (emergencia ? (
                <Card>
                  <CardHeader>
                    <CardTitle role="heading" aria-level={3}>
                      Contato de emergência
                    </CardTitle>
                    <CardDescription>
                      Quem o sindicato deve avisar se você sofrer um acidente ou precisar de ajuda durante uma
                      atividade. Cadastre ao menos uma pessoa.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ContatosEmergencia
                      contatos={emergencia.contatos}
                      salvar={salvarMeuContatoEmergencia}
                      excluir={excluirMeuContatoEmergencia}
                      podeEditar
                      preview={preview}
                      campos={{ voltar: hrefPrimeiroAcesso(destino, "contato") }}
                    />
                  </CardContent>
                </Card>
              ) : (
                <Alert variant="destructive">
                  <AlertDescription>
                    Não foi possível carregar seus contatos de emergência agora. Recarregue a página daqui a pouco.
                  </AlertDescription>
                </Alert>
              ))}
          </Passo>
        )}
      </ol>

      <p className="text-muted-foreground text-xs">
        Dúvidas?{" "}
        <Link href="/portal/ajuda" className="text-foreground font-medium underline underline-offset-4">
          Veja a Ajuda
        </Link>{" "}
        ou fale com a secretaria da entidade.
      </p>
    </>
  )
}

/** Um passo: o número, o que fazer e, embaixo, o formulário que o cumpre. */
function Passo({
  numero,
  total,
  titulo,
  descricao,
  children,
}: {
  numero: number
  total: number
  titulo: string
  descricao: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <li className="grid gap-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums"
        >
          {numero}
        </span>
        <div className="grid min-w-0 gap-1 pt-0.5">
          <h2 className="text-lg leading-7 font-semibold tracking-tight">
            {total > 1 && (
              <span className="sr-only">
                Passo {numero} de {total}:{" "}
              </span>
            )}
            {titulo}
          </h2>
          <p className="text-muted-foreground text-sm">{descricao}</p>
        </div>
      </div>
      {children}
    </li>
  )
}

/** Só no "Ver como filiado": por que a página aparece e onde se configura. */
function NotaDaGestao() {
  return (
    <p className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
      <Settings2 aria-hidden className="size-3.5" />
      Visível só para a gestão: o associado vê esta página até concluir o primeiro acesso. Configure em{" "}
      <Link href={`${HREF_AREA_DO_ASSOCIADO}#parte-primeiro_acesso`} className="underline underline-offset-2">
        Filiados › Área do associado
      </Link>
      .
    </p>
  )
}

/** Só no "Ver como filiado": o associado não tem nada pendente (ele seguiria direto). */
function SemPendencias({ exigido, destino }: { exigido: boolean; destino: string }) {
  return (
    <>
      <CabecalhoPagina secao={ROTA_PRIMEIRO_ACESSO} titulo="Primeiro acesso" />
      <EstadoVazio
        cartao
        icone={CheckCircle2}
        titulo={exigido ? "Nada pendente" : "O primeiro acesso não está sendo exigido"}
        descricao={
          exigido
            ? "Este associado já aceitou o termo de privacidade em vigor e tem os dados obrigatórios preenchidos: ele entra direto no portal."
            : "Com o primeiro acesso desligado (ou o portal suspenso ou fora do ar), o associado entra direto no portal."
        }
        acao={
          <Button asChild variant="outline">
            <Link href={destino}>Continuar</Link>
          </Button>
        }
      />
      <NotaDaGestao />
    </>
  )
}
