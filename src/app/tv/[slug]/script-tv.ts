/**
 * Script da tela da TV — ES5 puro, embutido na página (sem depender do
 * JavaScript da aplicação, que navegadores de TV antigos podem não rodar).
 *
 * 1. Escala (e gira, se configurado) o palco para caber na tela.
 * 2. Mede a faixa de notícias para rolar numa velocidade constante.
 * 3. Atualiza o relógio.
 * 4. Confere a versão a cada minuto e recarrega quando o conteúdo mudou.
 * 5. Clique/tecla OK: tela cheia. Pede para a tela não apagar, quando dá.
 * 6. Vídeos: a troca de slides é CSS puro desde o carregamento; o script
 *    segue a mesma linha do tempo (ciclo e janela de cada vídeo vêm prontos
 *    na config) e dá play do começo quando o slide entra, pause quando sai.
 *    Som: tenta com som e, se a TV bloquear o autoplay, toca mudo.
 *
 * Sem arrow, let/const, template string nem .catch (palavra reservada em
 * motores ES3 de TV) — o texto vai cru para a página.
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
      if (navigator.wakeLock && document.visibilityState === "visible") navigator.wakeLock.request("screen")["catch"](function () {});
    } catch (e) {}
  }
  manterAcesa();
  document.addEventListener("visibilitychange", manterAcesa);

  var videos = [];
  var somBloqueado = false;
  var inicioCiclo = new Date().getTime();

  function agora() { return new Date().getTime(); }

  function tocar(v) {
    try { v.el.currentTime = 0; } catch (e) {}
    v.el.muted = !(v.som && !somBloqueado);
    darPlay(v);
  }

  // play() com a queda para mudo quando a TV recusa o som.
  function darPlay(v) {
    var el = v.el;
    var p;
    try { p = el.play(); } catch (e) {}
    function mudo() {
      if (!v.ativo || el.muted) return;
      somBloqueado = true;
      el.muted = true;
      var q;
      try { q = el.play(); } catch (e) {}
      if (q && typeof q.then === "function") q.then(null, function () {});
    }
    if (p && typeof p.then === "function") {
      p.then(null, mudo);
    } else if (!el.muted) {
      // Navegador antigo: play() não devolve promessa — confere se andou.
      setTimeout(function () { if (el.paused) mudo(); }, 1500);
    }
  }

  function parar(v) {
    try { v.el.pause(); v.el.currentTime = 0; } catch (e) {}
  }

  function passo() {
    var t = ((agora() - inicioCiclo) / 1000) % cfg.ciclo;
    if (t < 0) t += cfg.ciclo;
    for (var i = 0; i < videos.length; i++) {
      var v = videos[i];
      var dentro = t >= v.de && t < v.ate;
      if (dentro && !v.ativo) { v.ativo = true; tocar(v); }
      else if (!dentro && v.ativo) { v.ativo = false; parar(v); }
    }
  }

  // O ciclo CSS começa quando a página pinta, um pouco antes deste script:
  // cada início/volta das animações dos slides acerta o relógio dos vídeos.
  function acertar(e) {
    var nome = e && e.animationName;
    if (nome && nome.indexOf("tv-slide-") === 0) { inicioCiclo = agora(); passo(); }
  }

  // Clique ou OK no controle conta como interação: a TV passa a aceitar som.
  function liberarSom() {
    somBloqueado = false;
    for (var i = 0; i < videos.length; i++) {
      var v = videos[i];
      if (v.ativo && v.som && v.el.muted) { v.el.muted = false; darPlay(v); }
    }
  }

  function iniciarVideos() {
    var lista = cfg.videos || [];
    for (var i = 0; i < lista.length; i++) {
      var el = document.getElementById(lista[i].id);
      if (el && el.play) videos.push({ el: el, de: lista[i].de, ate: lista[i].ate, som: !!lista[i].som, ativo: false });
    }
    if (!videos.length || !(cfg.ciclo > 0)) return;
    var eventos = ["animationstart", "animationiteration", "webkitAnimationStart", "webkitAnimationIteration"];
    for (var k = 0; k < eventos.length; k++) document.addEventListener(eventos[k], acertar, true);
    document.addEventListener("click", liberarSom);
    document.addEventListener("keydown", function (e) { if (e.keyCode === 13) liberarSom(); });
    passo();
    setInterval(passo, 250);
  }
  iniciarVideos();
})();`
