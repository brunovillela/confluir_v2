"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { salvarParte } from "@/lib/db/portal-partes"
import {
  definicaoDaParte,
  ehChaveParte,
  ESTADOS_PARTE,
  type DefinicaoParte,
  type EstadoParte,
} from "@/lib/portal-partes-constantes"

const BASE = "/painel/filiados/area-do-associado"

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function txt(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}

/**
 * As opções da parte lidas do formulário (campos `opcao.<chave>`), conferidas
 * contra o catálogo. O normalizador da gravação troca valor inválido pelo
 * padrão em silêncio; aqui a pessoa fica sabendo o que corrigir.
 */
function lerOpcoes(
  def: DefinicaoParte,
  fd: FormData
): { opcoes: Record<string, unknown> } | { erro: string; campo: string } {
  const opcoes: Record<string, unknown> = {}
  for (const o of def.opcoes) {
    const campo = `opcao.${o.chave}`
    switch (o.tipo) {
      case "booleano":
        opcoes[o.chave] = fd.get(campo) === "on"
        break
      case "texto": {
        const valor = txt(fd, campo)
        if (valor.length > o.max) {
          return { erro: `“${o.rotulo}” passa de ${o.max} caracteres.`, campo }
        }
        // O contato do encarregado (LGPD, art. 41): o portal só faz link de
        // e-mail válido (a mesma expressão de src/app/portal/lgpd/page.tsx).
        if (o.chave === "encarregado_email" && valor && !EMAIL.test(valor)) {
          return { erro: "Informe um e-mail válido para o encarregado (ex.: dpo@entidade.org.br).", campo }
        }
        opcoes[o.chave] = valor
        break
      }
      case "numero": {
        const bruto = txt(fd, campo)
        const n = Number(bruto)
        if (bruto === "" || !Number.isInteger(n) || n < o.min || n > o.max) {
          const unidade = o.unidade ? ` ${o.unidade}` : ""
          return { erro: `“${o.rotulo}” deve ser um número inteiro de ${o.min} a ${o.max}${unidade}.`, campo }
        }
        opcoes[o.chave] = n
        break
      }
      case "lista": {
        const validos = new Set(o.itens.map((i) => i.valor))
        const marcados = [...new Set(fd.getAll(campo).map(String))].filter((v) => validos.has(v))
        if (o.min !== undefined && marcados.length < o.min) {
          return {
            erro:
              o.min === 1
                ? `Marque pelo menos uma opção em “${o.rotulo}”.`
                : `Marque pelo menos ${o.min} opções em “${o.rotulo}”.`,
            campo,
          }
        }
        if (o.max !== undefined && marcados.length > o.max) {
          return { erro: `Marque no máximo ${o.max} opções em “${o.rotulo}”.`, campo }
        }
        opcoes[o.chave] = marcados
        break
      }
    }
  }
  return { opcoes }
}

export async function salvarParteAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("filiacao_gestao")
  const parte = txt(fd, "parte")
  if (!ehChaveParte(parte)) return { erro: "Parte do portal inválida." }
  const def: DefinicaoParte = definicaoDaParte(parte)

  const estadoBruto = txt(fd, "estado") || "habilitada"
  if (!(ESTADOS_PARTE as readonly string[]).includes(estadoBruto)) {
    return { erro: "Escolha como a parte fica.", campo: "estado" }
  }
  const estado = estadoBruto as EstadoParte

  const lidas = lerOpcoes(def, fd)
  if ("erro" in lidas) return lidas

  // Regras (estado permitido, volta no futuro, Atendimento + O sindicato)
  // moram na gravação; aqui só a leitura do formulário.
  const { erro, campo } = await salvarParte({
    parte,
    estado,
    mensagem: txt(fd, "mensagem") || null,
    retornoPrevisto: txt(fd, "retorno_previsto") || null,
    opcoes: lidas.opcoes,
    usuarioId: sessao.usuario.id,
  })
  if (erro) return { erro, campo }

  revalidatePath(BASE)
  revalidatePath("/painel/filiados")
  // A casca do portal (menu, barra, faixa) e todas as páginas abaixo dela.
  revalidatePath("/portal", "layout")
  return { ok: `${def.titulo}: configuração salva.` }
}
