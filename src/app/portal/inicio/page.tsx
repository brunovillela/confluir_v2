import type { Metadata } from "next"
import { Suspense } from "react"

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
import { nomeEntidade } from "@/lib/db/organizacao"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

export const metadata: Metadata = { title: "Início" }

/**
 * Início do portal do associado. A ordem é a do que pede atenção (A146),
 * cada faixa com o seu título:
 *
 *  1. saudação;
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
 */
export default async function PortalInicioPage() {
  const { filiado, preview } = await requireVisualizacaoPortal()
  const nome = filiado.nome_completo ?? "Associado(a)"
  // A saudação nunca depende de consulta que possa falhar.
  const entidade = await nomeEntidade().catch(() => null)

  return (
    <>
      <CabecalhoPagina
        secao="/portal/inicio"
        titulo={`Olá, ${nome.split(" ")[0]}`}
        subtitulo={entidade ? `Bem-vindo(a) ao portal do associado — ${entidade}.` : "Bem-vindo(a) ao portal do associado."}
      />

      {/* Sem pendência é o caso comum: nada a reservar enquanto carrega. */}
      <Suspense fallback={null}>
        <PendenciasInicio filiado={filiado} preview={preview} />
      </Suspense>

      <Suspense fallback={<EsqueletoMinhaSituacao />}>
        <MinhaSituacao filiado={filiado} />
      </Suspense>

      <Suspense fallback={<EsqueletoNovidades />}>
        <Novidades filiado={filiado} />
      </Suspense>

      {/* Some quando não há compromisso: nada a reservar enquanto carrega. */}
      <Suspense fallback={null}>
        <Compromissos filiado={filiado} preview={preview} />
      </Suspense>

      {/* Enquanto confere se a entidade tem hotel e convênio, a grade aparece
          inteira — na dúvida, o item aparece, como no menu. */}
      <Suspense fallback={<ServicosInicio />}>
        <ServicosDaEntidade />
      </Suspense>

      <section aria-labelledby="inicio-noticias" className="grid gap-3">
        <h2 id="inicio-noticias" className="text-lg font-semibold">
          Notícias e atividades
        </h2>
        <div className="grid items-start gap-4 md:grid-cols-2">
          <Suspense fallback={<EsqueletoCartao />}>
            <CartaoNoticias />
          </Suspense>
          <Suspense fallback={null}>
            <CartaoInscricoesAbertas cpf={filiado.cpf} />
          </Suspense>
          <Suspense fallback={null}>
            <CartaoVotacoes cpf={filiado.cpf} />
          </Suspense>
          <Suspense fallback={<EsqueletoCartao />}>
            <CartaoAgenda />
          </Suspense>
        </div>
      </section>
    </>
  )
}
