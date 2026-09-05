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
