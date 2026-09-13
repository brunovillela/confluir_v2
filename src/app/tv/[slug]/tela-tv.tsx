import {
  duracaoDoSlide,
  duracaoEstimadaDaFaixa,
  palcoDa,
  VELOCIDADE_FAIXA,
  type Giro,
  type Orientacao,
} from "@/lib/comunicacao-slides-constantes"
import type { ExibicaoTv } from "@/lib/db/comunicacao-slides"

import { estiloDaTela } from "./estilo-tv"
import { SCRIPT_TV } from "./script-tv"

/**
 * A tela da TV, sem acesso a banco: recebe o que exibir e devolve a página
 * inteira (CSS das animações, palco, faixa e o script ES5 embutido).
 */

/** JSON seguro dentro de <script>. */
function jsonEmScript(v: unknown): string {
  return JSON.stringify(v).replace(/</g, "\\u003c")
}

export function TelaTv({
  exibicao,
  slug,
  previa,
  agora,
}: {
  exibicao: ExibicaoTv
  slug: string
  previa: boolean
  agora: Date
}) {
  const orientacao: Orientacao = exibicao.estado === "ok" ? exibicao.conjunto.orientacao : "horizontal"
  const girar: Giro = exibicao.estado === "ok" ? exibicao.conjunto.girar : "nao"
  const slides = exibicao.estado === "ok" ? exibicao.slides : []
  const faixa = exibicao.estado === "ok" ? exibicao.faixa : []
  const conjunto = exibicao.estado === "ok" ? exibicao.conjunto : null
  const comFaixa = faixa.length > 0
  const duracoes = conjunto ? slides.map((s) => duracaoDoSlide(s, conjunto.duracaoSegundos)) : []
  const { largura, altura } = palcoDa(orientacao)

  const css = estiloDaTela({
    orientacao,
    girar,
    duracoes,
    comFaixa,
    duracaoFaixa: duracaoEstimadaDaFaixa(faixa),
    opacidadeLogo: conjunto?.opacidadeLogo ?? 70,
  })
  const config = {
    largura,
    altura,
    girado: girar !== "nao",
    velocidade: VELOCIDADE_FAIXA,
    versao: exibicao.versao,
    versaoUrl: `/tv/${encodeURIComponent(slug)}/versao${previa ? "?previa=1" : ""}`,
  }

  const logo = exibicao.logoUrl
  const relogio = conjunto?.mostrarRelogio ?? false
  const horaAgora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(agora)

  let conteudo: React.ReactNode
  if (exibicao.estado !== "ok" || slides.length === 0) {
    const titulo =
      exibicao.estado === "inexistente"
        ? "Este link de TV não existe mais"
        : exibicao.estado === "despublicado"
          ? exibicao.nomeEntidade
          : conjunto?.nome ?? exibicao.nomeEntidade
    const texto =
      exibicao.estado === "inexistente"
        ? `Peça o link atualizado à comunicação de ${exibicao.nomeEntidade}.`
        : exibicao.estado === "despublicado"
          ? "Programação fora do ar no momento."
          : "Nenhum slide em exibição agora."
    conteudo = (
      <div className="tv-fundo-marca">
        <div className="tv-aviso">
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="tv-aviso-logo" src={logo} alt="" />
          )}
          <p className="tv-aviso-titulo">{titulo}</p>
          <p className="tv-aviso-texto">{texto}</p>
        </div>
      </div>
    )
  } else {
    conteudo = (
      <>
        {slides.map((s, i) => {
          const soTexto = !s.imagemUrl
          return (
            <div
              key={s.id}
              className={`tv-slide tv-slide-${i}${soTexto ? " tv-so-texto" : ""}`}
              style={{ zIndex: i }}
            >
              {soTexto ? (
                <div className="tv-fundo-marca" />
              ) : s.ajuste === "conter" ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="tv-img-borrada" src={s.imagemUrl!} alt="" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="tv-img tv-img-conter" src={s.imagemUrl!} alt={s.titulo ?? ""} />
                </>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="tv-img" src={s.imagemUrl!} alt={s.titulo ?? ""} />
              )}
              {(s.titulo || s.descricao) && (
                <>
                  {!soTexto && <div className="tv-sombra" />}
                  <div className="tv-texto">
                    <div className="tv-barra" />
                    {s.titulo && <h1 className="tv-titulo">{s.titulo}</h1>}
                    {s.descricao && <p className="tv-descricao">{s.descricao}</p>}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </>
    )
  }

  return (
    <main className="tv-tela">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="tv-palco">
        {conteudo}

        {logo && conjunto?.mostrarLogo && slides.length > 0 && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="tv-logo" src={logo} alt={exibicao.nomeEntidade} />
        )}

        {relogio && !comFaixa && (
          <div className="tv-relogio-solto">
            <span id="tv-relogio" suppressHydrationWarning>
                  {horaAgora}
                </span>
          </div>
        )}

        {comFaixa && (
          <div className="tv-faixa">
            <div className="tv-faixa-rotulo">
              {!conjunto?.faixaNoticias
                ? "Avisos"
                : orientacao === "vertical"
                  ? "Notícias"
                  : "Últimas notícias"}
            </div>
            <div className="tv-faixa-janela">
              <div id="tv-faixa-trilho" className="tv-faixa-trilho">
                {[0, 1].map((volta) => (
                  <div key={volta} style={{ display: "flex" }} aria-hidden={volta === 1}>
                    {faixa.map((item, i) => (
                      <span key={i} className="tv-faixa-item">
                        {item}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            {relogio && (
              <div className="tv-faixa-relogio">
                <span id="tv-relogio" suppressHydrationWarning>
                  {horaAgora}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
      <script
        id="tv-config"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: jsonEmScript(config) }}
      />
      <script dangerouslySetInnerHTML={{ __html: SCRIPT_TV }} />
    </main>
  )
}
