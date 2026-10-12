/**
 * ENDEREÇO: busca pelo CEP e lista das UFs (client-safe).
 *
 * A consulta ao ViaCEP (base pública dos Correios) nasceu na ficha de
 * filiação pública (/filiar) e foi trazida para cá para servir também ao
 * Meu cadastro do portal (achado A130 da avaliação de 11/10/2026). Quem chama
 * decide o que fazer com o resultado — sobrescrever, preencher só o vazio,
 * focar o número; esta função só consulta e devolve.
 */

export type EnderecoDoCep = {
  logradouro: string
  bairro: string
  cidade: string
  uf: string
}

export type ResultadoCep =
  | { ok: true; endereco: EnderecoDoCep }
  /** `nao_encontrado`: o CEP não existe; `falha`: sem rede ou ViaCEP fora do ar. */
  | { ok: false; motivo: "nao_encontrado" | "falha" }

/** Só os dígitos do CEP. */
export function digitosDoCep(valor: string): string {
  return valor.replace(/\D/g, "")
}

/**
 * Consulta o CEP no ViaCEP. Devolve null quando o valor não tem 8 dígitos
 * (não há o que consultar); campo que o ViaCEP não traz volta como "".
 */
export async function consultarCep(
  valor: string,
  opcoes: { signal?: AbortSignal } = {}
): Promise<ResultadoCep | null> {
  const cep = digitosDoCep(valor)
  if (cep.length !== 8) return null
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: opcoes.signal })
    const d = (await r.json()) as {
      erro?: boolean | string
      logradouro?: string
      bairro?: string
      localidade?: string
      uf?: string
    }
    if (d?.erro) return { ok: false, motivo: "nao_encontrado" }
    return {
      ok: true,
      endereco: {
        logradouro: d.logradouro ?? "",
        bairro: d.bairro ?? "",
        cidade: d.localidade ?? "",
        uf: d.uf ?? "",
      },
    }
  } catch {
    return { ok: false, motivo: "falha" }
  }
}

/** As 27 unidades da federação, em ordem de sigla. */
export const UFS = [
  { sigla: "AC", nome: "Acre" },
  { sigla: "AL", nome: "Alagoas" },
  { sigla: "AM", nome: "Amazonas" },
  { sigla: "AP", nome: "Amapá" },
  { sigla: "BA", nome: "Bahia" },
  { sigla: "CE", nome: "Ceará" },
  { sigla: "DF", nome: "Distrito Federal" },
  { sigla: "ES", nome: "Espírito Santo" },
  { sigla: "GO", nome: "Goiás" },
  { sigla: "MA", nome: "Maranhão" },
  { sigla: "MG", nome: "Minas Gerais" },
  { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MT", nome: "Mato Grosso" },
  { sigla: "PA", nome: "Pará" },
  { sigla: "PB", nome: "Paraíba" },
  { sigla: "PE", nome: "Pernambuco" },
  { sigla: "PI", nome: "Piauí" },
  { sigla: "PR", nome: "Paraná" },
  { sigla: "RJ", nome: "Rio de Janeiro" },
  { sigla: "RN", nome: "Rio Grande do Norte" },
  { sigla: "RO", nome: "Rondônia" },
  { sigla: "RR", nome: "Roraima" },
  { sigla: "RS", nome: "Rio Grande do Sul" },
  { sigla: "SC", nome: "Santa Catarina" },
  { sigla: "SE", nome: "Sergipe" },
  { sigla: "SP", nome: "São Paulo" },
  { sigla: "TO", nome: "Tocantins" },
] as const

export type SiglaUf = (typeof UFS)[number]["sigla"]

const semAcento = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()

/**
 * Sigla da UF a partir do que está gravado: "RJ", "rj " ou "Rio de Janeiro"
 * viram "RJ". Texto que não é UF nenhuma devolve null — quem chama decide se
 * mostra o valor antigo para a pessoa corrigir.
 */
export function siglaDaUf(valor: string | null | undefined): SiglaUf | null {
  const v = (valor ?? "").trim()
  if (!v) return null
  const sigla = UFS.find((u) => u.sigla === v.toUpperCase())
  if (sigla) return sigla.sigla
  const nome = semAcento(v)
  return UFS.find((u) => semAcento(u.nome) === nome)?.sigla ?? null
}
