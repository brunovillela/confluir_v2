import type { Metadata } from "next"
import { Suspense } from "react"
import { Megaphone } from "lucide-react"

import {
  CartaoAgenda,
  CartaoInscricoesAbertas,
  CartaoNoticias,
  CartaoVotacoes,
  EsqueletoCartao,
} from "@/components/portal/inicio/blocos-agenda"
import { CabecalhoPagina } from "@/components/portal/cabecalho-pagina"
import { Compromissos } from "@/components/portal/inicio/compromissos"
import { EsqueletoMinhaSituacao, MinhaSituacao } from "@/components/portal/inicio/minha-situacao"
import { EsqueletoNovidades, Novidades } from "@/components/portal/inicio/novidades"
import { PendenciasInicio } from "@/components/portal/inicio/pendencias-inicio"
import { ServicosDaEntidade, ServicosInicio } from "@/components/portal/inicio/servicos-inicio"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { nomeEntidade } from "@/lib/db/organizacao"
import { aceitaAcao, aparece, desabilitadasNoInicio, partesDoInicio } from "@/lib/db/portal-inicio"
import { rotaDoMenu } from "@/lib/portal-partes-constantes"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

export const metadata: Metadata = { title: "Início" }

/**
 * Início do portal do associado. A ordem é a do que pede atenção (A146),
 * cada faixa com o seu título:
 *
 *  1. saudação (e o recado da entidade, quando há);
 *  2. "Para você resolver" — votação aberta, oposição, avaliação da
 *     hospedagem, filiação coletiva (só aparece quando há algo);
 *  3. Minha situação (A2), com a contribuição em atraso logo acima;
 *  4. Novidades para você (A33, A96);
 *  5. Seus próximos compromissos (A32) — o que a pessoa já assumiu;
 *  6. Serviços (A55) — a grade padrão de hub;
 *  7. Notícias e atividades (A145).
 *
 * Cada bloco carrega no seu próprio Suspense e trata a própria falha (A69):
 * a saudação e os serviços aparecem na hora, e uma consulta que cai ou demora
 * não leva a página para a tela de erro — o bloco diz que não carregou
 * (A187). No "Ver como filiado" nada grava — nem as avaliações pendentes, nem
 * a leitura dos avisos.
 *
 * Filiados › Área do associado: cada bloco segue a parte de onde vem. Parte
 * desabilitada some do Início (e nem é consultada); suspensa — ou o portal
 * inteiro em modo de consulta —, os botões que gravam saem ("Votar",
 * estrelas da avaliação, "Confirmar presença", inscrições abertas).
 */
export default async function PortalInicioPage() {
  const { filiado, preview } = await requireVisualizacaoPortal()
  const nome = filiado.nome_completo ?? "Associado(a)"
  // A saudação nunca depende de consulta que possa falhar: as duas têm saída
  // (a das partes já devolve "tudo habilitado" quando a leitura cai).
  const [entidade, partes] = await Promise.all([nomeEntidade().catch(() => null), partesDoInicio()])
  const desabilitadas = desabilitadasNoInicio(partes)
  // O que sai da grade de serviços já enquanto ela confere hotel e convênio:
  // a parte desabilitada não pisca na tela.
  const rotasFora = desabilitadas.map(rotaDoMenu).filter((r): r is string => r !== null)
  const agenda = aparece(partes, "agenda") && partes.agendaNoInicio

  return (
    <>
      <CabecalhoPagina
        secao="/portal/inicio"
        titulo={`Olá, ${nome.split(" ")[0]}`}
        subtitulo={entidade ? `Bem-vindo(a) ao portal do associado — ${entidade}.` : "Bem-vindo(a) ao portal do associado."}
      />

      {/* Recado fixo da entidade (Área do associado › Início): sem sino nem e-mail. */}
      {partes.recado && (
        <Alert variant="info">
          <Megaphone />
          <AlertTitle>Recado do sindicato</AlertTitle>
          <AlertDescription className="whitespace-pre-line">{partes.recado}</AlertDescription>
        </Alert>
      )}

      {/* Sem pendência é o caso comum: nada a reservar enquanto carrega. */}
      <Suspense fallback={null}>
        <PendenciasInicio filiado={filiado} preview={preview} partes={partes} />
      </Suspense>

      {/* Minha situação é a contribuição: com ela desabilitada, o bloco sai inteiro. */}
      {aparece(partes, "contribuicao") && (
        <Suspense fallback={<EsqueletoMinhaSituacao />}>
          <MinhaSituacao
            filiado={filiado}
            carteirinha={aparece(partes, "carteirinha")}
            textoAtraso={partes.textoAtraso}
          />
        </Suspense>
      )}

      <Suspense fallback={<EsqueletoNovidades />}>
        <Novidades filiado={filiado} atendimento={aparece(partes, "atendimento")} ocultar={desabilitadas} />
      </Suspense>

      {/* Some quando não há compromisso: nada a reservar enquanto carrega. */}
      <Suspense fallback={null}>
        <Compromissos filiado={filiado} preview={preview} partes={partes} />
      </Suspense>

      {/* Enquanto confere se a entidade tem hotel e convênio, a grade aparece
          sem as partes desabilitadas — na dúvida, o item aparece, como no menu. */}
      <Suspense fallback={<ServicosInicio ocultos={rotasFora} />}>
        <ServicosDaEntidade />
      </Suspense>

      {(aparece(partes, "noticias") || aceitaAcao(partes, "eventos") || aparece(partes, "votacao") || agenda) && (
        <section aria-labelledby="inicio-noticias" className="grid gap-3">
          <h2 id="inicio-noticias" className="text-lg font-semibold">
            Notícias e atividades
          </h2>
          <div className="grid items-start gap-4 md:grid-cols-2">
            {aparece(partes, "noticias") && (
              <Suspense fallback={<EsqueletoCartao />}>
                <CartaoNoticias />
              </Suspense>
            )}
            {/* Inscrições abertas é um convite a se inscrever: com Eventos
                suspensa (ou o portal em modo de consulta), não aparece. */}
            {aceitaAcao(partes, "eventos") && (
              <Suspense fallback={null}>
                <CartaoInscricoesAbertas cpf={filiado.cpf} />
              </Suspense>
            )}
            {aparece(partes, "votacao") && (
              <Suspense fallback={null}>
                <CartaoVotacoes cpf={filiado.cpf} />
              </Suspense>
            )}
            {agenda && (
              <Suspense fallback={<EsqueletoCartao />}>
                <CartaoAgenda />
              </Suspense>
            )}
          </div>
        </section>
      )}
    </>
  )
}
