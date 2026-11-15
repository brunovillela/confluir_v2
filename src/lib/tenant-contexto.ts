import "server-only"

import { AsyncLocalStorage } from "node:async_hooks"

/**
 * Entidade FIXADA para um trecho de código que roda fora de uma requisição
 * dela (15/11/2026): as tarefas agendadas (/api/**\/tick) passam por todas as
 * entidades na mesma requisição, sem o cabeçalho `x-tenant-id` que o proxy
 * põe. Dentro de `comTenant(...)`, `tenantAtual()` e `origemAtual()` devolvem
 * a entidade e o endereço dela, e todo o código que já usa os dois (o
 * createAdminClient, o enviarEmail, o controle de envio...) funciona igual a
 * uma tela aberta naquela entidade.
 *
 * Fora de `comTenant`, nada muda: vale o tenant da requisição.
 */

type ContextoFixado = { tenantId: string; origem: string }

const armazenamento = new AsyncLocalStorage<ContextoFixado>()

export function contextoFixado(): ContextoFixado | null {
  return armazenamento.getStore() ?? null
}

export function comTenant<T>(contexto: ContextoFixado, fn: () => Promise<T>): Promise<T> {
  return armazenamento.run(contexto, fn)
}
