import "server-only"

import { cache } from "react"

import type { Filiado } from "@/lib/contas"
import { eventosParaFiliado } from "@/lib/db/eventos-portal"
import { listarHoteis } from "@/lib/db/hospedagem"
import { seguro } from "@/lib/db/portal-inicio"
import { assembleiasDoFiliado, type AssembleiaDoFiliado } from "@/lib/db/votacao-portal"
import { tenantAtual } from "@/lib/tenant"

/**
 * Leituras que mais de um bloco do Início usa (onda 5): uma por abertura da
 * página, dividida entre quem pede — "Inscrições abertas" e "Seus próximos
 * compromissos" leem os mesmos eventos; "Para você resolver" e os
 * compromissos, as mesmas assembleias.
 */
export const eventosDaPessoa = cache(async (cpf: string) => eventosParaFiliado(cpf, await tenantAtual()))
export const assembleiasDaPessoa = cache((cpf: string) => assembleiasDoFiliado(cpf))
export const hoteisDaEntidade = cache(() => listarHoteis())

/**
 * Como `seguro`, mas o bloco fica sabendo que falhou (A187): null = não
 * carregou, e o bloco mostra o aviso discreto em vez de fingir que está vazio.
 * A falha vai para o log e o Sentry do mesmo jeito.
 */
export function tentar<T>(bloco: string, carregar: () => Promise<T>): Promise<{ valor: T } | null> {
  return seguro<{ valor: T } | null>(bloco, async () => ({ valor: await carregar() }), null)
}

/** As assembleias, só de quem tem filiação ativa (a votação exige). */
export function assembleiasSeAtivo(
  filiado: Filiado,
  bloco: string
): Promise<{ valor: AssembleiaDoFiliado[] } | null> {
  return filiado.ativo ? tentar(bloco, () => assembleiasDaPessoa(filiado.cpf)) : Promise.resolve({ valor: [] })
}
