/**
 * Script da tela da TV — ES5 puro, embutido na página (sem depender do
 * JavaScript da aplicação, que navegadores de TV antigos podem não rodar).
 *
 * 1. Escala (e gira, se configurado) o palco para caber na tela.
 * 2. Mede a faixa de notícias para rolar numa velocidade constante.
 * 3. Atualiza o relógio.
 * 4. Confere a versão a cada minuto e recarrega quando o conteúdo mudou.
 * 5. Clique/tecla OK: tela cheia. Pede para a tela não apagar, quando dá.
 *
 * Lê a configuração do <script id="tv-config" type="application/json">.
 */
export const SCRIPT_TV = `(function () {
  var no = document.getElementById("tv-config");
  if (!no) return;
  var cfg;
  try { cfg = JSON.parse(no.textContent || "{}"); } catch (e) { return; }
  var raiz = document.documentElement;

  function ajustar() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var s = cfg.girado ? Math.min(vw / cfg.altura, vh / cfg.largura) : Math.min(vw / cfg.largura, vh / cfg.altura);
    raiz.style.setProperty("--tv-escala", String(s));
  }
  ajustar();
  window.addEventListener("resize", ajustar);

  function medirFaixa() {
    var trilho = document.getElementById("tv-faixa-trilho");
    if (!trilho) return;
    var metade = trilho.scrollWidth / 2;
    if (metade > 0) raiz.style.setProperty("--tv-faixa-duracao", Math.max(20, Math.round(metade / cfg.velocidade)) + "s");
  }
  medirFaixa();
  window.addEventListener("load", medirFaixa);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(medirFaixa);

  var relogio = document.getElementById("tv-relogio");
  function hora() {
    try {
      return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
    } catch (e) {
      var d = new Date();
      return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
    }
  }
  if (relogio) {
    relogio.textContent = hora();
    setInterval(function () { relogio.textContent = hora(); }, 5000);
  }

  function conferir() {
    var x = new XMLHttpRequest();
    x.open("GET", cfg.versaoUrl + (cfg.versaoUrl.indexOf("?") < 0 ? "?" : "&") + "t=" + new Date().getTime());
    x.timeout = 20000;
    x.onload = function () {
      if (x.status !== 200) return;
      try {
        var r = JSON.parse(x.responseText);
        if (r && r.versao && r.versao !== cfg.versao) window.location.reload();
      } catch (e) {}
    };
    x.send();
  }
  setInterval(conferir, 60000);

  function telaCheia() {
    var el = document.documentElement;
    var cheia = document.fullscreenElement || document.webkitFullscreenElement;
    var pedir = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!cheia && pedir) { try { pedir.call(el); } catch (e) {} }
  }
  document.addEventListener("click", telaCheia);
  document.addEventListener("keydown", function (e) { if (e.keyCode === 13) telaCheia(); });

  function manterAcesa() {
    try {
      if (navigator.wakeLock && document.visibilityState === "visible") navigator.wakeLock.request("screen").catch(function () {});
    } catch (e) {}
  }
  manterAcesa();
  document.addEventListener("visibilitychange", manterAcesa);
})();`
