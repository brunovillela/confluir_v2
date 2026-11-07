// Cadastros unificados (mesclados) nos scripts de migração do Bubble.
//
// POR QUÊ: a unificação de usuários (função unificar_usuarios) move as
// referências do cadastro que sai para o que fica, mas o que sai continua com
// o bubble_id — e o Bubble continua apontando para ele. Um script que traduz o
// usuário do Bubble pelo bubble_id caía no cadastro excluído e, ao "corrigir"
// o registro, desfazia a unificação (07/10 → 08/10: contratos do Sergio
// voltaram ao cadastro morto).
//
// COMO: com as linhas de `usuarios` lidas com `unificado_em_id`, devolve a
// função que segue a cadeia de unificações até o cadastro que ficou. Para
// linhas sem a coluna (outras tabelas), devolve o próprio id.

export function seguirUnificacao(linhas) {
  const destino = new Map(
    linhas.filter((l) => l.unificado_em_id).map((l) => [l.id, l.unificado_em_id])
  )
  return (id) => {
    let atual = id
    // A cadeia é curta (A → B → C); o limite só protege de um ciclo no dado.
    for (let passo = 0; atual && destino.has(atual) && passo < 10; passo++) {
      atual = destino.get(atual)
    }
    return atual ?? null
  }
}

/** Colunas a ler de uma tabela para resolver referências do Bubble. */
export const colunasDoResolvedor = (tabela) =>
  tabela === "usuarios" ? "id, bubble_id, unificado_em_id" : "id, bubble_id"
