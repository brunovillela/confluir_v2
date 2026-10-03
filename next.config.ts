import createMDX from "@next/mdx";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // .mdx passa a ser extensão de página/import — usado pela seção de Ajuda
  // (conteúdo do manual em src/conteudo/ajuda/**/*.mdx). Arquivos de conteúdo
  // NÃO se chamam page.mdx, então não viram rota por acidente.
  pageExtensions: ["ts", "tsx", "js", "jsx", "md", "mdx"],
  experimental: {
    serverActions: {
      // Importação de filiados em massa via CSV (~4mb ≈ 40 mil linhas).
      bodySizeLimit: "4mb",
    },
  },
  // Cabeçalhos de segurança (achado S5 da avaliação de 03/10). Valem para
  // todas as rotas, inclusive as públicas por token.
  //  - HSTS: o navegador só fala HTTPS com confluir.online e subdomínios.
  //  - nosniff: um upload servido com tipo errado não vira script.
  //  - Referrer-Policy: a URL com token (/assinar/<token>, /ficha/<token>…)
  //    não vaza no Referer para sites de terceiros.
  //  - X-Frame-Options DENY: nenhuma página do Confluir pode ser embutida por
  //    outro site (clickjacking). Os iframes que o Confluir ABRE (PDF do
  //    Storage, vídeo) não são afetados — a regra é sobre quem nos embute.
  //  - Permissions-Policy: câmera só para o próprio app (leitura de QR na
  //    recepção); microfone, geolocalização e pagamento desligados.
  //
  // CSP em MODO RELATÓRIO (só em produção; em dev o Next precisa de eval e
  // o relatório seria só ruído): nada é bloqueado, mas cada recurso que a
  // política barraria chega em /api/csp-relatorio. Depois de uma semana sem
  // relatórios relevantes, trocar Report-Only pela política de verdade.
  //  - script 'unsafe-inline': o Next injeta scripts inline e /tv/[slug]
  //    também; a versão com nonce fica para a onda 1.
  //  - img: Storage do Supabase e as imagens migradas do Bubble.
  //  - connect: Supabase (auth e PostgREST do navegador), ViaCEP e Sentry.
  //  - frame: PDFs do Storage (assinatura, oposição), vídeo dos slides e o
  //    desafio do Turnstile.
  async headers() {
    const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://*.supabase.co"
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: ${supabase} https://*.supabase.co https://cdn.bubble.io https://*.bubble.io https://s3.amazonaws.com`,
      "font-src 'self' data:",
      `connect-src 'self' ${supabase} https://*.supabase.co https://viacep.com.br https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io https://challenges.cloudflare.com`,
      `frame-src 'self' ${supabase} https://*.supabase.co https://www.youtube.com https://www.youtube-nocookie.com https://challenges.cloudflare.com`,
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "report-uri /api/csp-relatorio",
    ].join("; ")
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Content-Security-Policy-Report-Only", value: csp }]
            : []),
        ],
      },
    ]
  },
  // Autoatendimento do funcionário migrado para dentro de /painel/perfil.
  // Redireciona os caminhos antigos (inclusive links já enviados por e-mail).
  async redirects() {
    return [
      { source: "/painel/meus-contracheques", destination: "/painel/perfil/contracheques", permanent: true },
      { source: "/painel/minhas-diarias", destination: "/painel/perfil/diarias", permanent: true },
      { source: "/painel/meus-reembolsos", destination: "/painel/perfil/reembolsos", permanent: true },
      { source: "/painel/meu-caixa", destination: "/painel/perfil/caixa", permanent: true },
      // Módulo Representação Sindical: Assembleias e Oposição saíram de /painel/assembleias
      // e /painel/filiados/oposicao (esta era área de Filiados).
      { source: "/painel/assembleias", destination: "/painel/representacao/assembleias", permanent: true },
      { source: "/painel/assembleias/:path*", destination: "/painel/representacao/assembleias/:path*", permanent: true },
      { source: "/painel/filiados/oposicao", destination: "/painel/representacao/oposicao", permanent: true },
      { source: "/painel/filiados/oposicao/:path*", destination: "/painel/representacao/oposicao/:path*", permanent: true },
      // Empregadores (antigas "Fontes pagadoras") saíram de Filiados para Representação.
      { source: "/painel/filiados/fontes", destination: "/painel/representacao/empregadores", permanent: true },
      { source: "/painel/filiados/fontes/:path*", destination: "/painel/representacao/empregadores/:path*", permanent: true },
      // "Assembleias" virou "Votações": a assembleia é UMA das modalidades de
      // votação (tem online, urna, reunião), então o nome da área era menor que
      // a área. Links antigos (e-mails de aviso aos aptos, favoritos) seguem valendo.
      { source: "/painel/representacao/assembleias", destination: "/painel/representacao/votacoes", permanent: true },
      { source: "/painel/representacao/assembleias/:path*", destination: "/painel/representacao/votacoes/:path*", permanent: true },
      { source: "/painel/ajuda/representacao/assembleias", destination: "/painel/ajuda/representacao/votacoes", permanent: true },
      // `/campanhas` e `/rodadas` sozinhos nunca foram página (o detalhe é que
      // é rota: `/campanhas/<id>`). Quem chegar lá vai para a lista.
      { source: "/painel/representacao/votacoes/campanhas", destination: "/painel/representacao/votacoes", permanent: false },
      { source: "/painel/representacao/votacoes/rodadas", destination: "/painel/representacao/votacoes", permanent: false },
      // "Configurações" virou "Institucional"; Registro sindical (MTE) saiu de Representação p/ lá.
      { source: "/painel/representacao/registro-mte", destination: "/painel/institucional/registro-mte", permanent: true },
      { source: "/painel/representacao/registro-mte/:path*", destination: "/painel/institucional/registro-mte/:path*", permanent: true },
      { source: "/painel/configuracoes", destination: "/painel/institucional", permanent: true },
      { source: "/painel/configuracoes/:path*", destination: "/painel/institucional/:path*", permanent: true },
      // E-mails institucionais (cadastro de recurso da entidade) saiu de Ferramentas p/ Institucional.
      { source: "/painel/ferramentas/emails", destination: "/painel/institucional/emails", permanent: true },
      { source: "/painel/ferramentas/emails/:path*", destination: "/painel/institucional/emails/:path*", permanent: true },
      // SST: "Tarefas" virou "Atividades" para não competir com as Tarefas de
      // Ferramentas (demandas/projetos/anomalias) — são coisas diferentes e o
      // nome igual confundia. O banco já usava `pessoal_atividades`.
      { source: "/painel/pessoal/atribuicoes/tarefas", destination: "/painel/pessoal/atribuicoes/atividades", permanent: true },
      { source: "/painel/pessoal/atribuicoes/tarefas/:path*", destination: "/painel/pessoal/atribuicoes/atividades/:path*", permanent: true },
    ]
  },
};

// remark-gfm habilita TABELAS (e strikethrough/listas de tarefas) nos artigos
// do manual — sem ele o markdown de tabela sai como texto cru. Com Turbopack,
// o plugin precisa vir como STRING (serializável), não como função importada.
const withMDX = createMDX({
  options: { remarkPlugins: [["remark-gfm", {}]] },
});

export default withMDX(nextConfig);
