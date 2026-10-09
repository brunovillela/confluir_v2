/**
 * Configuração da SAÚDE DOS CADASTROS (pedido de 09/10/2026): para cada
 * categoria de fonte pagadora, a gestão diz se a falta de cada informação é
 *  - pendência  → conta contra a saúde e põe o cadastro na lista de pendentes;
 *  - apontamento → aparece na lista como aviso, mas NÃO derruba a saúde;
 *  - normal      → ignorada.
 *
 * A categoria vem da fonte do vínculo CORRENTE do filiado. Sem vínculo em
 * aberto (ou vínculo sem fonte) vale a categoria padrão, "empregador".
 *
 * O padrão reproduz a regra anterior: tudo é pendência, exceto cargo e
 * lotação em fundo de pensão (regra do Bruno, 12/09/2026). Gravado em
 * `empresa.filiacao_saude_config` (supabase/empresa-filiacao-saude-config.sql).
 */

export const NIVEIS_SAUDE = ["pendencia", "apontamento", "normal"] as const
export type NivelSaude = (typeof NIVEIS_SAUDE)[number]

export const ROTULO_NIVEL: Record<NivelSaude, string> = {
  pendencia: "Pendência",
  apontamento: "Apontamento",
  normal: "Normal",
}

export const EXPLICACAO_NIVEL: Record<NivelSaude, string> = {
  pendencia: "Conta contra a saúde e põe o cadastro na lista de pendentes.",
  apontamento: "Aparece na lista como aviso, sem derrubar a saúde.",
  normal: "Não é verificada.",
}

export type CampoSaude = {
  chave: string
  rotulo: string
  grupo: "cadastro" | "vinculo"
  /** Texto curto sobre quando a falta é apurada. */
  ajuda?: string
}

export const CAMPOS_SAUDE = [
  { chave: "cpf", rotulo: "CPF ausente ou inválido", grupo: "cadastro" },
  { chave: "cpf_duplicado", rotulo: "CPF em outro cadastro", grupo: "cadastro" },
  { chave: "matricula", rotulo: "Matrícula sindical ausente ou repetida", grupo: "cadastro" },
  { chave: "nome", rotulo: "Nome incompleto", grupo: "cadastro" },
  {
    chave: "lgpd",
    rotulo: "Termo LGPD não aceito",
    grupo: "cadastro",
    ajuda: "Só para quem tem conta na área do associado.",
  },
  { chave: "desconto", rotulo: "Termo de desconto não aceito", grupo: "cadastro" },
  { chave: "historico", rotulo: "Sem vínculo em aberto", grupo: "cadastro" },
  { chave: "v_fonte", rotulo: "Fonte pagadora", grupo: "vinculo" },
  { chave: "v_matricula", rotulo: "Matrícula na fonte", grupo: "vinculo" },
  { chave: "v_cargo", rotulo: "Cargo", grupo: "vinculo" },
  { chave: "v_lotacao", rotulo: "Lotação", grupo: "vinculo" },
  { chave: "v_admissao", rotulo: "Admissão na fonte", grupo: "vinculo" },
  { chave: "v_data_filiacao", rotulo: "Data de filiação", grupo: "vinculo" },
  { chave: "v_condicao", rotulo: "Condição na fonte pagadora", grupo: "vinculo" },
  {
    chave: "v_regime",
    rotulo: "Regime de trabalho",
    grupo: "vinculo",
    ajuda: "Só para trabalhador(a) da ativa.",
  },
  { chave: "v_ficha", rotulo: "Ficha de filiação", grupo: "vinculo" },
] as const satisfies readonly CampoSaude[]

export type ChaveCampoSaude = (typeof CAMPOS_SAUDE)[number]["chave"]
export type ChaveCampoVinculo = Extract<ChaveCampoSaude, `v_${string}`>

export const ROTULO_CAMPO_SAUDE = Object.fromEntries(
  CAMPOS_SAUDE.map((c) => [c.chave, c.rotulo])
) as Record<ChaveCampoSaude, string>

/** Categorias de fonte pagadora. Hoje a fonte só distingue fundo de pensão. */
export const CATEGORIAS_FONTE = ["empregador", "fundo_pensao"] as const
export type CategoriaFonte = (typeof CATEGORIAS_FONTE)[number]

export const ROTULO_CATEGORIA: Record<CategoriaFonte, string> = {
  empregador: "Empregador",
  fundo_pensao: "Fundo de pensão",
}

export function categoriaDaFonte(fundoPensao: boolean | null | undefined): CategoriaFonte {
  return fundoPensao === true ? "fundo_pensao" : "empregador"
}

export type ConfigSaude = Record<CategoriaFonte, Record<ChaveCampoSaude, NivelSaude>>

export function configSaudePadrao(): ConfigSaude {
  const tudo = () =>
    Object.fromEntries(CAMPOS_SAUDE.map((c) => [c.chave, "pendencia"])) as Record<
      ChaveCampoSaude,
      NivelSaude
    >
  return {
    empregador: tudo(),
    fundo_pensao: { ...tudo(), v_cargo: "normal", v_lotacao: "normal" },
  }
}

/** Mescla o que veio do banco (ou do formulário) sobre o padrão, descartando lixo. */
export function normalizarConfigSaude(bruto: unknown): ConfigSaude {
  const config = configSaudePadrao()
  if (!bruto || typeof bruto !== "object") return config
  for (const cat of CATEGORIAS_FONTE) {
    const daCategoria = (bruto as Record<string, unknown>)[cat]
    if (!daCategoria || typeof daCategoria !== "object") continue
    for (const campo of CAMPOS_SAUDE) {
      const nivel = (daCategoria as Record<string, unknown>)[campo.chave]
      if ((NIVEIS_SAUDE as readonly unknown[]).includes(nivel)) {
        config[cat][campo.chave] = nivel as NivelSaude
      }
    }
  }
  return config
}
