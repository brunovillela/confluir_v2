import {
  animacaoDosSlides,
  palcoDa,
  type Giro,
  type Orientacao,
} from "@/lib/comunicacao-slides-constantes"

/**
 * CSS da tela da TV. Tudo é medido no palco (1920 × 1080 ou 1080 × 1920) e o
 * script só aplica a escala — o layout é o mesmo em qualquer TV.
 */

const NAVY = "#091747"
const LARANJA = "#FF5722"

/** Medidas que mudam com a orientação. */
function medidas(orientacao: Orientacao) {
  return orientacao === "vertical"
    ? {
        margem: 72,
        faixa: 112,
        faixaFonte: 42,
        rotuloFonte: 28,
        titulo: 84,
        descricao: 46,
        linhasDescricao: 6,
        tituloSoTexto: 110,
        logoAltura: 170,
        logoLargura: 320,
      }
    : {
        margem: 96,
        faixa: 96,
        faixaFonte: 40,
        rotuloFonte: 28,
        titulo: 88,
        descricao: 44,
        linhasDescricao: 3,
        tituloSoTexto: 120,
        logoAltura: 150,
        logoLargura: 380,
      }
}

export function giroEmGraus(girar: Giro): number {
  return girar === "horario" ? 90 : girar === "anti_horario" ? -90 : 0
}

export function estiloDaTela({
  orientacao,
  girar,
  duracoes,
  comFaixa,
  duracaoFaixa,
  opacidadeLogo,
}: {
  orientacao: Orientacao
  girar: Giro
  duracoes: number[]
  comFaixa: boolean
  duracaoFaixa: number
  opacidadeLogo: number
}): string {
  const { largura, altura } = palcoDa(orientacao)
  const m = medidas(orientacao)
  const graus = giroEmGraus(girar)
  const base = comFaixa ? m.faixa : 0
  const { ciclo, keyframes } = animacaoDosSlides(duracoes)

  const animacoes = keyframes
    .map((k, i) =>
      k
        ? `@keyframes tv-slide-${i}{${k}}.tv-slide-${i}{opacity:0;animation:tv-slide-${i} ${ciclo}s linear infinite}`
        : `.tv-slide-${i}{opacity:1}`
    )
    .join("\n")

  return `
html,body{margin:0;overflow:hidden;background:#000!important}
.tv-tela{position:fixed;left:0;top:0;right:0;bottom:0;background:#000;overflow:hidden;cursor:none;font-family:var(--font-sans,Poppins,Arial,sans-serif);color:#fff;z-index:2147483000}
.tv-palco{position:absolute;left:50%;top:50%;width:${largura}px;height:${altura}px;overflow:hidden;background:${NAVY};transform:translate(-50%,-50%) rotate(${graus}deg) scale(var(--tv-escala,1));-webkit-transform:translate(-50%,-50%) rotate(${graus}deg) scale(var(--tv-escala,1))}
.tv-slide{position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden}
.tv-fundo-marca{position:absolute;left:0;top:0;width:100%;height:100%;background:linear-gradient(160deg,${NAVY} 0%,#0d1f5c 55%,#122a73 100%)}
.tv-fundo-marca:after{content:"";position:absolute;right:-12%;bottom:-18%;width:60%;height:60%;border-radius:50%;background:${LARANJA};opacity:.12}
.tv-img{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover}
.tv-img-conter{object-fit:contain}
.tv-img-borrada{position:absolute;left:-5%;top:-5%;width:110%;height:110%;object-fit:cover;filter:blur(40px) brightness(.5);-webkit-filter:blur(40px) brightness(.5)}
.tv-sombra{position:absolute;left:0;right:0;bottom:0;height:70%;background:linear-gradient(to top,rgba(0,0,0,.88) 0%,rgba(0,0,0,.55) 45%,rgba(0,0,0,0) 100%)}
.tv-texto{position:absolute;left:${m.margem}px;right:${m.margem}px;bottom:${base + m.margem * 0.75}px}
.tv-barra{width:120px;height:10px;border-radius:5px;background:${LARANJA};margin-bottom:28px}
.tv-titulo{margin:0;font-size:${m.titulo}px;line-height:1.08;font-weight:700;letter-spacing:-.01em;text-shadow:0 2px 16px rgba(0,0,0,.35);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
.tv-descricao{margin:24px 0 0;font-size:${m.descricao}px;line-height:1.3;font-weight:400;color:rgba(255,255,255,.9);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:${m.linhasDescricao};overflow:hidden}
.tv-so-texto .tv-texto{top:${m.margem * 2}px;bottom:${base + m.margem}px;display:flex;flex-direction:column;justify-content:center}
.tv-so-texto .tv-titulo{font-size:${m.tituloSoTexto}px;-webkit-line-clamp:5}
.tv-so-texto .tv-descricao{-webkit-line-clamp:8}
.tv-logo{position:absolute;top:${m.margem * 0.5}px;right:${m.margem * 0.55}px;max-height:${m.logoAltura}px;max-width:${m.logoLargura}px;opacity:${Math.max(0, Math.min(100, opacidadeLogo)) / 100};z-index:900;filter:drop-shadow(0 2px 12px rgba(0,0,0,.35))}
.tv-relogio-solto{position:absolute;top:${m.margem * 0.5}px;left:${m.margem * 0.55}px;z-index:900;padding:10px 26px;border-radius:999px;background:rgba(9,23,71,.72);font-size:40px;font-weight:600;font-variant-numeric:tabular-nums}
.tv-faixa{position:absolute;left:0;right:0;bottom:0;height:${m.faixa}px;display:flex;align-items:stretch;background:${NAVY};z-index:950;box-shadow:0 -4px 24px rgba(0,0,0,.35)}
.tv-faixa-rotulo{flex:none;display:flex;align-items:center;padding:0 36px;background:${LARANJA};font-size:${m.rotuloFonte}px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}
.tv-faixa-janela{position:relative;flex:1;overflow:hidden;display:flex;align-items:center}
.tv-faixa-trilho{display:flex;white-space:nowrap;will-change:transform;animation:tv-faixa var(--tv-faixa-duracao,${duracaoFaixa}s) linear infinite}
.tv-faixa-item{font-size:${m.faixaFonte}px;font-weight:500;padding-right:28px}
.tv-faixa-item:after{content:"•";color:${LARANJA};padding-left:28px}
.tv-faixa-relogio{flex:none;display:flex;align-items:center;padding:0 32px;background:#050e2e;font-size:${m.faixaFonte + 4}px;font-weight:600;font-variant-numeric:tabular-nums}
@keyframes tv-faixa{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.tv-aviso{position:absolute;left:0;top:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 ${m.margem}px;box-sizing:border-box}
.tv-aviso-logo{max-width:${m.logoLargura + 120}px;max-height:${m.logoAltura + 120}px;padding:36px;border-radius:40px;background:#fff}
.tv-aviso-titulo{margin:56px 0 0;font-size:56px;font-weight:600}
.tv-aviso-texto{margin:20px 0 0;font-size:36px;color:rgba(255,255,255,.7)}
${animacoes}
`
}
