import type { Metadata } from "next"
import Link from "next/link"

import { AcaoVisualizacao } from "@/components/acao-visualizacao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"
import { cpfConfiavel } from "@/lib/cpf"
import { situacaoComunicados } from "@/lib/db/comunicacao-descadastro"
import { cadastroDoFiliado } from "@/lib/db/filiado-portal"
import { tenantAtual } from "@/lib/tenant"
import { historicoAceites } from "@/lib/db/lgpd"
import { nomeEntidade, obterOrganizacao } from "@/lib/db/organizacao"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { Download, Eye, MessageSquarePlus } from "lucide-react"
import { Button } from "@/components/ui/button"


import { AceiteLgpdForm } from "./aceite-form"
import { ComunicadosForm } from "./comunicados-form"
import {
  consentimentosDoCadastro,
  rotuloVersao,
  termoVigente,
  versoesDosTermos,
} from "./consentimentos"

export const metadata: Metadata = { title: "LGPD — Portal do Associado" }

/** Conferir/regularizar o registro da autorização de desconto pelo Atendimento (A35). */
const ATENDIMENTO_DESCONTO = `/portal/atendimento?${new URLSearchParams({
  assunto: "cadastro",
  titulo: "Autorização de desconto em folha",
})}`

/**
 * Texto padrão do Confluir, só para quando a entidade ainda não cadastrou o
 * termo dela (Filiados › Termos legais). Sem exemplo de serviço específico:
 * nem toda entidade tem hotel parceiro.
 */
const TERMO_PADRAO =
  "trata seus dados cadastrais (identificação, contato, endereço e vínculos de filiação) para as finalidades da atividade sindical: gestão da filiação e das contribuições, comunicação com o associado, prestação de serviços e benefícios e cumprimento de obrigações legais. Os dados não são vendidos e só são compartilhados com terceiros quando necessário à prestação de um serviço que você pediu ou por obrigação legal."

const DIREITOS = [
  "Confirmar a existência de tratamento dos seus dados e acessá-los.",
  "Corrigir dados incompletos, inexatos ou desatualizados (use a página Meu cadastro para contato e endereço).",
  "Solicitar anonimização, bloqueio ou eliminação de dados desnecessários.",
  "Solicitar a portabilidade dos dados a outro fornecedor de serviço.",
  "Revogar o consentimento, quando o tratamento se basear nele.",
]

export default async function LgpdPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string; aviso?: string }>
}) {
  const { filiado, preview } = await requireVisualizacaoPortal()
  const { salvo, aviso } = await searchParams
  const cpf = cpfConfiavel(filiado.cpf)
  const [cadastro, org, entidade, comunicados, aceites, consentimentos, versoes] = await Promise.all([
    cadastroDoFiliado(filiado.cpf),
    obterOrganizacao(),
    nomeEntidade(),
    cpf ? situacaoComunicados({ emp: await tenantAtual(), cpf }) : null,
    cpf ? historicoAceites(cpf) : Promise.resolve([]),
    consentimentosDoCadastro(filiado.cpf),
    versoesDosTermos(),
  ])
  const emailContato = org?.emailContato ?? null

  const aceiteLgpd = cadastro?.tl_lgpd_data ?? null
  const aceiteDesconto = cadastro?.tl_desconto_data ?? null

  // Versões (A71): a aceita vem do livro de aceites (portal) ou do cadastro
  // (ficha pública, migração); a vigente é a que um aceite novo registra.
  const lgpdVigente = termoVigente(versoes.lgpd)
  const idLgpdAceito = aceiteLgpd
    ? (aceites.find((a) => a.tipo === "lgpd" && a.termoId)?.termoId ?? consentimentos.lgpdId)
    : null
  const lgpdAceito = idLgpdAceito ? (versoes.lgpd.find((v) => v.id === idLgpdAceito) ?? null) : null
  const idDescontoAceito = aceiteDesconto
    ? (aceites.find((a) => a.tipo === "desconto" && a.termoId)?.termoId ?? consentimentos.descontoId)
    : null
  const descontoAceito = idDescontoAceito
    ? (versoes.desconto.find((v) => v.id === idDescontoAceito) ?? null)
    : null
  const codigoDoTermo = new Map(
    [...versoes.lgpd, ...versoes.desconto].map((v) => [v.id, v.codigo] as const)
  )

  // Desconto em folha (A35): sem data registrada, explica conforme a forma de
  // contribuição. Forma não informada (cadastro migrado) conta como desconto
  // em folha, para não esconder a explicação de quem é descontado.
  const contribuiSemFolha =
    consentimentos.forma === "pix" || consentimentos.forma === "boleto"
      ? consentimentos.forma
      : null

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          LGPD — dados pessoais
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Seus aceites e seus direitos sobre o tratamento de dados pessoais
          (Lei nº 13.709/2018).
        </p>
      </div>

      {salvo === "comunicados" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Preferência de comunicados salva.</AlertDescription>
        </Alert>
      )}
      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Aceite registrado. Obrigado!</AlertDescription>
        </Alert>
      )}
      {/* A rota "meus dados" devolve para cá quando é aberta na visualização. */}
      {preview && aviso === "visualizacao" && (
        <Alert>
          <Eye />
          <AlertDescription>
            Na visualização pela gestão, os dados não são baixados: a
            exportação é um ato do próprio associado, pela conta dele.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Termo LGPD</CardDescription>
            <CardTitle className="text-base">
              {aceiteLgpd ? (
                <Badge
                  variant="outline"
                  className="border-success/40 text-success-fg"
                >
                  Aceito em {formatarData(aceiteLgpd)}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-warning/40 text-warning-fg">
                  Aceite não registrado
                </Badge>
              )}
            </CardTitle>
            {aceiteLgpd && (
              <p className="text-muted-foreground text-xs">
                Termo aceito: {rotuloVersao(lgpdAceito)}
              </p>
            )}
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Autorização de desconto em folha</CardDescription>
            <CardTitle className="text-base">
              {aceiteDesconto ? (
                <Badge
                  variant="outline"
                  className="border-success/40 text-success-fg"
                >
                  Autorizado em {formatarData(aceiteDesconto)}
                </Badge>
              ) : contribuiSemFolha ? (
                <Badge variant="outline" className="text-muted-foreground">
                  Não se aplica
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Não registrada no sistema
                </Badge>
              )}
            </CardTitle>
            {aceiteDesconto && (
              <p className="text-muted-foreground text-xs">
                Termo autorizado: {rotuloVersao(descontoAceito)}
              </p>
            )}
          </CardHeader>
          {!aceiteDesconto && (
            <CardContent className="text-muted-foreground grid gap-2 text-sm">
              {contribuiSemFolha ? (
                <p>
                  {`Você contribui ${contribuiSemFolha === "pix" ? "por Pix" : "por boleto"}, então não há desconto em folha para autorizar.`}
                </p>
              ) : (
                <>
                  <p>
                    É a autorização para a sua empresa descontar a mensalidade
                    no contracheque e repassá-la à entidade.
                  </p>
                  <p>
                    Ela costuma não aparecer aqui quando a filiação é antiga ou
                    veio do sistema anterior, ou quando foi dada em papel, na
                    ficha de filiação assinada. É comum e não muda nada no seu
                    desconto.
                  </p>
                  <div className="pt-1">
                    <Button asChild variant="outline">
                      <Link href={ATENDIMENTO_DESCONTO}>
                        <MessageSquarePlus />
                        Conferir ou registrar a autorização
                      </Link>
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Seus dados</CardTitle>
          <CardDescription>
            Acesso e portabilidade: baixe tudo o que {entidade} guarda sobre você.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-muted-foreground text-sm">
            O arquivo (JSON) traz cadastro, vínculos, contatos, endereços, dados bancários,
            hospedagens, inscrições em eventos, reembolsos e os seus aceites. Votos em assembleia
            não entram: são secretos e não ficam ligados a você.
          </p>
          <div>
            <AcaoVisualizacao
              preview={preview}
              nota="A exportação é um ato do titular: só o próprio associado baixa os dados dele."
            >
              {preview ? (
                // `disabled` num <a> não desliga nada: na visualização o
                // botão nem tem link. O envelope já esmaece — sem o
                // disabled:opacity-100 o cinza dobraria.
                <Button type="button" variant="outline" size="sm" disabled className="disabled:opacity-100">
                  <Download />
                  Baixar meus dados
                </Button>
              ) : (
                // Sem o atributo `download`: o cabeçalho "attachment" da rota
                // já baixa o arquivo, e uma sessão vencida vira navegação
                // normal até o login, em vez de salvar a tela de login.
                <Button asChild variant="outline" size="sm">
                  <a href="/portal/lgpd/meus-dados">
                    <Download />
                    Baixar meus dados
                  </a>
                </Button>
              )}
            </AcaoVisualizacao>
          </div>
          {aceites.length > 0 && (
            <div>
              <p className="text-sm font-medium">Aceites registrados</p>
              <ul className="text-muted-foreground text-xs">
                {aceites.map((a, i) => {
                  const codigo = a.termoId ? codigoDoTermo.get(a.termoId) : null
                  return (
                    <li key={i}>
                      {a.tipo === "lgpd" ? "Termo LGPD" : "Desconto em folha"}
                      {codigo ? ` (versão ${codigo})` : ""} · {formatarDataHora(a.aceitoEm)} ·{" "}
                      {a.origem === "portal" ? "pelo portal" : a.origem === "ficha_publica" ? "pela ficha de filiação" : "pela secretaria"}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Termo de tratamento de dados</CardTitle>
          <CardDescription>
            Como {entidade} usa seus dados pessoais
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {/* O texto mostrado é sempre um termo versionado da entidade (A71):
              com aceite, o que a pessoa aceitou; sem aceite, o em vigor — o
              mesmo que o aceite vai registrar. */}
          {aceiteLgpd && lgpdAceito ? (
            <>
              <p className="text-sm">
                Você aceitou este termo em <strong>{formatarData(aceiteLgpd)}</strong>{" "}
                ({rotuloVersao(lgpdAceito)}).
              </p>
              {lgpdAceito.texto && (
                <TextoDoTermo texto={lgpdAceito.texto} resumo="Ler o termo que você aceitou" />
              )}
              {lgpdVigente && lgpdVigente.id !== lgpdAceito.id && (
                <div className="grid gap-2">
                  <p className="text-muted-foreground text-sm">
                    {`${entidade} publicou depois uma versão mais nova do termo (${rotuloVersao(lgpdVigente)}). O seu aceite continua registrado na versão acima.`}
                  </p>
                  <TextoDoTermo texto={lgpdVigente.texto ?? ""} resumo="Ler a versão em vigor" />
                </div>
              )}
            </>
          ) : aceiteLgpd ? (
            <>
              <p className="text-muted-foreground text-sm">
                O seu aceite, de {formatarData(aceiteLgpd)}, foi registrado sem
                a indicação da versão do termo (cadastro anterior ao controle de
                versões).
                {lgpdVigente ? ` Este é o termo em vigor hoje (${rotuloVersao(lgpdVigente)}):` : ""}
              </p>
              {lgpdVigente?.texto ? (
                <TextoDoTermo texto={lgpdVigente.texto} resumo="Ler o termo em vigor" />
              ) : (
                <TermoPadrao entidade={entidade} />
              )}
            </>
          ) : lgpdVigente?.texto ? (
            <>
              <p className="text-muted-foreground text-xs">
                Termo em vigor — {rotuloVersao(lgpdVigente)}.
              </p>
              <div className="text-sm whitespace-pre-line">{lgpdVigente.texto}</div>
              <AceiteLgpdForm
                preview={preview}
                entidade={entidade}
                termoId={lgpdVigente.id}
                versao={rotuloVersao(lgpdVigente)}
              />
            </>
          ) : (
            <>
              <TermoPadrao entidade={entidade} />
              <p className="text-muted-foreground text-sm">
                Para registrar o seu aceite ou tirar dúvidas, fale com a
                secretaria.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {comunicados?.disponivel && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Comunicados por e-mail</CardTitle>
            <CardDescription>
              {comunicados.descadastradoEm
                ? `Você pediu para não receber os comunicados em ${formatarData(comunicados.descadastradoEm)}.`
                : `Você recebe as mensagens que ${entidade} envia por e-mail aos filiados.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-muted-foreground text-sm">
              Avisos ligados ao que você usa — votações, reservas, recuperação de senha — e o
              parabéns de aniversário continuam chegando.
            </p>
            <ComunicadosForm preview={preview} recebe={!comunicados.descadastradoEm} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Seus direitos como titular</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <ul className="text-muted-foreground grid list-disc gap-1 pl-5 text-sm">
            {DIREITOS.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          <p className="text-sm">
            Para exercer qualquer direito, fale com a secretaria do sindicato
            {emailContato ? (
              <>
                {" "}
                ou escreva para{" "}
                <a
                  href={`mailto:${emailContato}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {emailContato}
                </a>
              </>
            ) : null}
            .
          </p>
        </CardContent>
      </Card>
    </>
  )
}

/** Texto de um termo já aceito (ou da versão nova), recolhido para não alongar a página. */
function TextoDoTermo({ texto, resumo }: { texto: string; resumo: string }) {
  return (
    <details className="rounded-lg border px-3 py-1">
      <summary className="cursor-pointer py-3 text-sm font-medium">{resumo}</summary>
      <div className="text-muted-foreground pb-2 text-sm whitespace-pre-line">{texto}</div>
    </details>
  )
}

/** Sem termo cadastrado pela entidade: o texto padrão, dito como tal. */
function TermoPadrao({ entidade }: { entidade: string }) {
  return (
    <div className="grid gap-2">
      <p className="text-muted-foreground text-xs">
        Texto padrão do Confluir: a entidade ainda não cadastrou o próprio
        termo de tratamento de dados.
      </p>
      <p className="text-muted-foreground text-sm">
        {entidade} {TERMO_PADRAO}
      </p>
    </div>
  )
}
