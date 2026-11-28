/**
 * Configuração da SAÚDE DOS CADASTROS (pedido de 09/10/2026): para cada
 * categoria de fonte pagadora, a gestão diz se a falta de cada informação é
 *  - pendência  → conta contra a saúde e põe o cadastro na lista de pendentes;
 *  - apontamento → aparece na lista como aviso, mas NÃO derruba a saúde;
 *  - normal      → ignorada.
 *
 * A categoria vem da fonte do vínculo CORRENTE do filiado. Sem vínculo em
 * aberto (ou vínculo sem fonte) vale a categoria padrão, "empregador".
 * Além das duas do sistema, a entidade cria as suas (supabase/fonte-categorias.sql).
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
  {
    chave: "nascimento",
    rotulo: "Data de nascimento suspeita",
    grupo: "cadastro",
    ajuda:
      "No futuro (século trocado: 1949 gravado como 2049), menos de 14 ou mais de 110 anos, igual à data de filiação ou admissão, ou depois da filiação. A votação confere o nascimento: com a data errada, a pessoa é barrada.",
  },
  {
    chave: "email",
    rotulo: "E-mail inválido",
    grupo: "cadastro",
    ajuda:
      "E-mail pessoal ou da empresa que não é um endereço (telefone no campo, \"re\", dois e-mails juntos, \"gmail.com.br\" sem o @). O código de acesso da oposição, da votação e do portal não chega a ele. Erros óbvios de digitação (\"hotmail..com\", espaço no meio) já são corrigidos sozinhos.",
  },
  {
    chave: "motivo_saida",
    rotulo: "Vínculo encerrado sem motivo",
    grupo: "cadastro",
    ajuda: "Vínculo com data de desfiliação e sem o motivo, que alimenta o churn.",
  },
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

// ── Categorias de fonte pagadora ────────────────────────────────────────────

/**
 * As duas categorias do SISTEMA, que vêm da marca `empresa.fundo_pensao`.
 * Toda categoria criada pela entidade (tabela `fonte_categorias`) segue as
 * regras de uma delas — a `base`.
 */
export const CATEGORIAS_SISTEMA = ["empregador", "fundo_pensao"] as const
export type BaseCategoria = (typeof CATEGORIAS_SISTEMA)[number]

export const ROTULO_CATEGORIA_SISTEMA: Record<BaseCategoria, string> = {
  empregador: "Empregador",
  fundo_pensao: "Fundo de pensão",
}

export function ehBaseCategoria(v: unknown): v is BaseCategoria {
  return (CATEGORIAS_SISTEMA as readonly unknown[]).includes(v)
}

/** Categoria para telas e configuração: `chave` é a base (sistema) ou o uuid. */
export type CategoriaFonte = {
  chave: string
  nome: string
  base: BaseCategoria
  sistema: boolean
}

export function categoriasSistema(): CategoriaFonte[] {
  return CATEGORIAS_SISTEMA.map((base) => ({
    chave: base,
    nome: ROTULO_CATEGORIA_SISTEMA[base],
    base,
    sistema: true,
  }))
}

/**
 * Chave da categoria de uma fonte: a categoria criada, se a fonte aponta para
 * uma que ainda existe; senão a do sistema pela marca de fundo de pensão.
 */
export function chaveCategoriaDaFonte(
  fonte: { fundo_pensao?: boolean | null; fonte_categoria_id?: string | null } | null | undefined,
  categorias: CategoriaFonte[]
): string {
  const id = fonte?.fonte_categoria_id
  if (id && categorias.some((c) => c.chave === id)) return id
  return fonte?.fundo_pensao === true ? "fundo_pensao" : "empregador"
}

/** Nome da categoria de uma fonte, para listas e fichas. */
export function nomeCategoriaDaFonte(
  fonte: { fundo_pensao?: boolean | null; fonte_categoria_id?: string | null },
  categorias: CategoriaFonte[]
): string {
  const chave = chaveCategoriaDaFonte(fonte, categorias)
  return (
    categorias.find((c) => c.chave === chave)?.nome ??
    ROTULO_CATEGORIA_SISTEMA[chave as BaseCategoria] ??
    "Empregador"
  )
}

// ── Configuração ────────────────────────────────────────────────────────────

export type NiveisCategoria = Record<ChaveCampoSaude, NivelSaude>
/** Chave da categoria → nível de cada campo. */
export type ConfigSaude = Record<string, NiveisCategoria>

/**
 * Padrão de uma base: tudo pendência; em fundo de pensão, cargo e lotação
 * normais. Vínculo encerrado sem motivo (29/10/2026) nasce apontamento: eram
 * 911 filiados ativos — como pendência, a saúde cairia 9 pontos de uma vez.
 */
export function niveisPadrao(base: BaseCategoria): NiveisCategoria {
  const tudo = Object.fromEntries(
    CAMPOS_SAUDE.map((c) => [c.chave, "pendencia"])
  ) as NiveisCategoria
  // Nascimento suspeito (19/11/2026) também nasce apontamento: eram 227 ativos.
  // E-mail inválido (27/11/2026) idem: não derruba a saúde, aparece para acertar.
  const comMotivo = { ...tudo, motivo_saida: "apontamento", nascimento: "apontamento", email: "apontamento" } as NiveisCategoria
  return base === "fundo_pensao" ? { ...comMotivo, v_cargo: "normal", v_lotacao: "normal" } : comMotivo
}

export function configSaudePadrao(categorias: CategoriaFonte[]): ConfigSaude {
  return Object.fromEntries(categorias.map((c) => [c.chave, niveisPadrao(c.base)]))
}

/**
 * Mescla o que veio do banco (ou do formulário) sobre o padrão de cada
 * categoria existente, descartando lixo e categorias que não existem mais.
 */
export function normalizarConfigSaude(
  bruto: unknown,
  categorias: CategoriaFonte[]
): ConfigSaude {
  const config = configSaudePadrao(categorias)
  if (!bruto || typeof bruto !== "object") return config
  for (const cat of categorias) {
    const daCategoria = (bruto as Record<string, unknown>)[cat.chave]
    if (!daCategoria || typeof daCategoria !== "object") continue
    for (const campo of CAMPOS_SAUDE) {
      const nivel = (daCategoria as Record<string, unknown>)[campo.chave]
      if ((NIVEIS_SAUDE as readonly unknown[]).includes(nivel)) {
        config[cat.chave][campo.chave] = nivel as NivelSaude
      }
    }
  }
  return config
}

// ── Data de nascimento suspeita (19/11/2026) ────────────────────────────────

/**
 * Por que a data de nascimento do cadastro parece errada — ou null. Nasceu do
 * caso de um eleitor barrado na votação: o CPF era de um filiado com o
 * nascimento igual à data de filiação (campo trocado na migração). A maior
 * parte, porém, é século trocado na importação: 1949 gravado como 2049.
 *
 * `hoje` e as datas em AAAA-MM-DD. `vinculos`: as datas de filiação, adesão e
 * admissão de TODOS os vínculos do filiado.
 */
export function motivoNascimentoSuspeito(
  nascimento: string | null,
  vinculos: { filiacao?: string | null; adesao?: string | null; admissao?: string | null }[],
  hoje: string
): { motivo: string; sugestao: string | null } | null {
  const n = (nascimento ?? "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(n)) return null
  const ano = Number(n.slice(0, 4))
  const anoHoje = Number(hoje.slice(0, 4))
  const idade = anoHoje - ano - (hoje.slice(5) < n.slice(5) ? 1 : 0)
  if (n > hoje) {
    // Século trocado: o mesmo dia, cem anos antes, dá uma idade plausível.
    const seculo = `${ano - 100}${n.slice(4)}`
    const idadeSeculo = idade + 100
    return {
      motivo: "Data no futuro",
      sugestao: idadeSeculo >= 14 && idadeSeculo <= 110 ? seculo : null,
    }
  }
  const datas = vinculos.flatMap((v) => [v.filiacao, v.adesao, v.admissao]).map((d) => (d ?? "").slice(0, 10))
  if (datas.includes(n)) return { motivo: "Igual à data de filiação ou admissão de um vínculo", sugestao: null }
  if (idade < 14) return { motivo: `Idade de ${idade} anos`, sugestao: null }
  if (idade > 110) return { motivo: `Idade de ${idade} anos`, sugestao: null }
  const filiacoes = vinculos
    .flatMap((v) => [v.filiacao, v.adesao])
    .map((d) => (d ?? "").slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  if (filiacoes.some((d) => d < n)) return { motivo: "Filiação anterior ao nascimento", sugestao: null }
  return null
}
