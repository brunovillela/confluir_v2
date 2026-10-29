/**
 * Roda `tarefa` em cada item com no máximo `limite` ao mesmo tempo (uma fila:
 * quem termina pega o próximo) e devolve os resultados na ordem dos itens.
 * Usado pelas leituras por IA em blocos e pelas gravações em lote.
 */
export async function emParalelo<T, R>(
  itens: T[],
  limite: number,
  tarefa: (item: T, i: number) => Promise<R>
): Promise<R[]> {
  const saida = new Array<R>(itens.length)
  let proximo = 0
  await Promise.all(
    Array.from({ length: Math.min(limite, itens.length) }, async () => {
      while (proximo < itens.length) {
        const i = proximo++
        saida[i] = await tarefa(itens[i], i)
      }
    })
  )
  return saida
}
