/**
 * Rótulo de um centro de custo nos selects: "[Código] - [Conta]" (16/10/2026).
 * O código é a coluna `acesso` (a mesma "Código" da lista de centros); sem
 * código, só o nome da conta. Seguro para o client.
 */
export function rotuloCentroCusto(c: { acesso?: unknown; nome_da_conta?: unknown }): string {
  const codigo = String(c.acesso ?? "").trim()
  const conta = String(c.nome_da_conta ?? "").trim()
  return [codigo, conta].filter(Boolean).join(" - ") || "(sem nome)"
}
