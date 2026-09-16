/**
 * Vínculo da pessoa com a entidade (`usuarios.vinculo_instituicao`) — a
 * classificação do quadro, feita em Institucional › Usuários › Quadro da
 * entidade. Quem tem um destes entra no quadro: aniversários do painel,
 * onboarding em lote e (funcionários e diretores) o caixa. Sem vínculo, a
 * pessoa só tem o acesso que receber.
 */
export const VINCULOS_INSTITUICAO = [
  "Funcionário(a)",
  "Diretor(a)",
  "Prestador(a) de serviço",
  "Jovem aprendiz",
  "Estagiário(a)",
] as const

export type VinculoInstituicao = (typeof VINCULOS_INSTITUICAO)[number]

/** Valor do seletor que tira a pessoa do quadro (limpa a classificação). */
export const NAO_E_DA_ENTIDADE = "nao_e_da_entidade"

/** Classes que trabalham NA entidade — esperam vínculo trabalhista com ela (módulo Pessoal). */
export const VINCULOS_DE_TRABALHO: readonly string[] = [
  "Funcionário(a)",
  "Jovem aprendiz",
  "Estagiário(a)",
]

/** Quem aparece nos aniversários do painel inicial. */
export const VINCULOS_DO_QUADRO: readonly string[] = [
  "Funcionário(a)",
  "Diretor(a)",
  "Jovem aprendiz",
  "Estagiário(a)",
]
