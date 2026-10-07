"use server"

import { requirePermissao } from "@/lib/auth"
import { origemAtual } from "@/lib/tenant-url"

/** Endereço do link único de votação (/votar) desta entidade, para divulgar. */
export async function linkUnicoVotacao(): Promise<{ link?: string; erro?: string }> {
  await requirePermissao("assembleias")
  return { link: `${await origemAtual()}/votar` }
}
