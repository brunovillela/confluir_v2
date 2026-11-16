/**
 * Data de nascimento do cadastro de usuário (15/11/2026). `usuarios` tem
 * quatro colunas que podem estar preenchidas ou não: `nascimento_dia` e
 * `nascimento_mes` (o que os aniversariantes do dia consultam), e
 * `data_nascimento`/`nascimento_data` (a data inteira). Sem trigger no banco,
 * quem grava a data precisa gravar o dia e o mês junto — `colunasDoNascimento`.
 */

export type NascimentoUsuario = {
  nascimento_dia?: number | null
  nascimento_mes?: number | null
  data_nascimento?: string | null
  nascimento_data?: string | null
}

/** Dia, mês e (se houver) ano; null quando não há data nenhuma. */
export function nascimentoDe(u: NascimentoUsuario): { dia: number; mes: number; ano: number | null } | null {
  const data = [u.data_nascimento, u.nascimento_data].find((d) => d && /^\d{4}-\d{2}-\d{2}/.test(d)) ?? null
  const ano = data ? Number(data.slice(0, 4)) : null
  if (u.nascimento_dia && u.nascimento_mes) return { dia: Number(u.nascimento_dia), mes: Number(u.nascimento_mes), ano }
  if (!data) return null
  return { dia: Number(data.slice(8, 10)), mes: Number(data.slice(5, 7)), ano }
}

/** O que gravar em `usuarios` para uma data (aaaa-mm-dd) ou para limpar. */
export function colunasDoNascimento(data: string | null): {
  data_nascimento: string | null
  nascimento_dia: number | null
  nascimento_mes: number | null
} {
  if (!data) return { data_nascimento: null, nascimento_dia: null, nascimento_mes: null }
  return { data_nascimento: data, nascimento_dia: Number(data.slice(8, 10)), nascimento_mes: Number(data.slice(5, 7)) }
}
