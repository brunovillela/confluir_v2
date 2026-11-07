import "server-only"

import { type DadosOficio } from "@/lib/db/oficios"
import {
  FECHO_PADRAO,
  MAX_ASSINANTES_OFICIO,
  SAUDACAO_PADRAO,
  TIPOS_OFICIO,
  normalizarAosCuidados,
  type TipoOficio,
} from "@/lib/oficios-constantes"

/**
 * Leitura do formulário do ofício (oficio-form.tsx), comum ao salvar
 * (actions.ts) e à prévia em PDF (app/oficio/previa), que mostra o que está
 * na tela sem gravar.
 */

export function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function umaLinha(valor: string): string {
  return valor.split(/\s+/).filter(Boolean).join(" ")
}

function dataISO(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

export function tipo(valor: string): TipoOficio {
  return (TIPOS_OFICIO as readonly string[]).includes(valor)
    ? (valor as TipoOficio)
    : "manual"
}

export function lerDados(formData: FormData): DadosOficio {
  return {
    tipo: tipo(texto(formData, "tipo")),
    data: dataISO(texto(formData, "data")),
    sede_id: texto(formData, "sede_id") || null,
    destinatario_empresa_id: texto(formData, "destinatario_empresa_id") || null,
    destinatario_texto: texto(formData, "destinatario_texto") || null,
    aos_cuidados: normalizarAosCuidados(texto(formData, "aos_cuidados")),
    saudacao: umaLinha(texto(formData, "saudacao")).slice(0, 120) || SAUDACAO_PADRAO,
    fecho: umaLinha(texto(formData, "fecho")).slice(0, 120) || FECHO_PADRAO,
    assunto: texto(formData, "assunto") || null,
    corpo: texto(formData, "corpo") || null,
    ...lerAssinantes(formData),
    departamento_id: texto(formData, "departamento_id") || null,
  }
}

/**
 * Principal + demais assinantes, sem repetição e sem vazios. Quem tira o
 * principal e deixa os outros: o primeiro dos outros vira o principal.
 */
function lerAssinantes(formData: FormData): Pick<DadosOficio, "assinante_integrante_id" | "coassinantes"> {
  const ids = [
    texto(formData, "assinante_integrante_id"),
    ...formData.getAll("coassinante_integrante_id").map((v) => String(v).trim()),
  ].filter(Boolean)
  const unicos = [...new Set(ids)].slice(0, MAX_ASSINANTES_OFICIO)
  return {
    assinante_integrante_id: unicos[0] ?? null,
    coassinantes: unicos.slice(1).map((integrante_id) => ({ integrante_id })),
  }
}

