import type { Metadata } from "next"
import Link from "next/link"
import { BellRing, Mail, Smartphone } from "lucide-react"

import { AcaoVisualizacao } from "@/components/acao-visualizacao"
import { CabecalhoPagina } from "@/components/portal/cabecalho-pagina"
import { PushCelular, type RotasPush } from "@/components/pwa/push-celular"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ComunicadosForm } from "@/app/portal/lgpd/comunicados-form"
// O dia em São Paulo do pedido, o mesmo cálculo do cartão da LGPD (A182):
// `formatarData` lê o dia UTC de um timestamp.
import { diaSP } from "@/app/portal/lgpd/consentimentos"
import { cpfConfiavel } from "@/lib/cpf"
import { situacaoComunicados } from "@/lib/db/comunicacao-descadastro"
import { nomeEntidade } from "@/lib/db/organizacao"
import { preferenciasDoFiliado } from "@/lib/db/portal-avisos"
import { partesDesabilitadas } from "@/lib/db/portal-partes"
import { estadoPushPortal } from "@/lib/db/push"
import { EVENTOS_PORTAL, eventoDesabilitado } from "@/lib/portal-avisos-eventos"
import { tenantAtual } from "@/lib/tenant"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { PreferenciasForm } from "./preferencias-form"

export const metadata: Metadata = { title: "Preferências de avisos" }

/** Rotas do push do associado (A52) — as do painel exigem a sessão de funcionário. */
const ROTAS_PUSH_PORTAL: RotasPush = {
  assinar: "/api/portal/push/assinar",
  desassinar: "/api/portal/push/desassinar",
  estado: "/api/portal/push/estado",
}

/** Link no meio do texto. */
const LINK_TEXTO = "text-foreground font-medium underline underline-offset-4"

/**
 * Preferências de avisos: o que, além do sino, chega fora do portal. Um
 * interruptor por tipo vale para o e-mail e para o celular (A52) — uma decisão
 * só para o associado. O card "Receber no celular" aparece só com as chaves
 * VAPID configuradas e a tabela supabase/portal-push.sql criada; sem isso, a
 * página é a de antes, só com o e-mail.
 *
 * Os comunicados da entidade (mala direta) também se escolhem aqui (A176):
 * o mesmo formulário e a mesma gravação do cartão da LGPD, que continua lá
 * por ser onde mora o direito do titular.
 *
 * Área do associado (Filiados): o tipo de aviso de parte desabilitada some
 * (não chega aviso dele); a escolha que a pessoa tinha fica guardada para a
 * volta da parte. A página e o salvar nunca se bloqueiam: é o opt-out.
 */
export default async function PreferenciasAvisosPage() {
  const { filiado, preview } = await requireVisualizacaoPortal()
  const cpf = cpfConfiavel(filiado.cpf)
  const [prefs, celular, comunicados, entidade, desabilitadas] = await Promise.all([
    preferenciasDoFiliado(filiado.cpf),
    estadoPushPortal(filiado.cpf).catch(() => ({ disponivel: false, aparelhos: 0 })),
    cpf ? situacaoComunicados({ emp: await tenantAtual(), cpf }).catch(() => null) : null,
    nomeEntidade(),
    // Na dúvida (leitura falhou), todos os tipos aparecem.
    partesDesabilitadas().catch(() => []),
  ])
  const ocultos = EVENTOS_PORTAL.filter((e) => eventoDesabilitado(e.chave, desabilitadas)).map((e) => e.chave)

  return (
    <>
      <CabecalhoPagina
        secao="/portal/avisos"
        voltar={{ base: "/portal/avisos", rotulo: "Avisos" }}
        titulo="Preferências de avisos"
        subtitulo={
          <>
            O sino do portal recebe tudo. Aqui você escolhe o que também chega por e-mail
            {filiado.email ? ` (${filiado.email})` : ""}
            {celular.disponivel ? " e no celular" : ""}
            {comunicados?.disponivel ? ", e se quer receber os comunicados da entidade" : ""}.
          </>
        }
      />

      {celular.disponivel && (
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2} className="flex items-center gap-2">
              <Smartphone className="text-muted-foreground size-4" aria-hidden />
              Receber no celular
            </CardTitle>
            <CardDescription className="text-xs">
              Os tipos de aviso ligados abaixo chegam como notificação nos aparelhos em que você ligar, mesmo com o
              portal fechado. Ligue em cada celular ou computador que você usa.
              {celular.aparelhos > 0
                ? ` Ligado em ${celular.aparelhos} aparelho${celular.aparelhos === 1 ? "" : "s"}.`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {preview ? (
              // Na visualização o aparelho é o do atendente: nada é conferido
              // nem gravado — só o botão, desligado, para orientar o associado.
              <AcaoVisualizacao preview nota="Só o próprio associado liga o aviso no aparelho dele.">
                <Button type="button" className="min-h-11 w-full sm:w-auto">
                  <BellRing />
                  Ligar neste aparelho
                </Button>
              </AcaoVisualizacao>
            ) : (
              <PushCelular
                chavePublica={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string}
                rotas={ROTAS_PUSH_PORTAL}
                cancelarNoNavegador={false}
                nomeApp="o portal"
              />
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            {celular.disponivel ? "Por e-mail e no celular" : "Por e-mail"}
          </CardTitle>
          <CardDescription className="text-xs">
            {celular.disponivel
              ? "Desligue um tipo e ele continua aparecendo no sino, só não vai para o seu e-mail nem para o celular."
              : "Desligue um tipo e ele continua aparecendo no sino, só não vai para a sua caixa de entrada."}{" "}
            O QR Code da reserva de hospedagem e o link de voto que você mesmo pede chegam sempre por e-mail.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!filiado.email && (
            <p className="text-muted-foreground mb-4 text-sm">
              Seu cadastro não tem e-mail — inclua um em{" "}
              <Link href="/portal/cadastro" className={LINK_TEXTO}>
                Meu cadastro
              </Link>
              {celular.disponivel
                ? " para receber os avisos também por e-mail."
                : " para receber avisos fora do portal."}
            </p>
          )}
          <PreferenciasForm prefs={prefs} celular={celular.disponivel} preview={preview} ocultos={ocultos} />
        </CardContent>
      </Card>

      {comunicados?.disponivel && (
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2} className="flex items-center gap-2">
              <Mail className="text-muted-foreground size-4" aria-hidden />
              Comunicados da entidade
            </CardTitle>
            <CardDescription className="text-xs">
              {comunicados.descadastradoEm
                ? `Você pediu para não receber os comunicados em ${diaSP(comunicados.descadastradoEm)}.`
                : `Você recebe as mensagens que ${entidade} envia por e-mail aos filiados.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-muted-foreground text-sm">
              Vale só para os comunicados: os avisos acima e o parabéns de aniversário continuam como estão. A mesma
              escolha aparece em{" "}
              <Link href="/portal/lgpd" className={LINK_TEXTO}>
                Privacidade e dados
              </Link>
              .
            </p>
            <ComunicadosForm preview={preview} recebe={!comunicados.descadastradoEm} voltar="preferencias" />
          </CardContent>
        </Card>
      )}
    </>
  )
}
