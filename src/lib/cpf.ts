/** Remove tudo que não for dígito. CPF é armazenado sem máscara (11 dígitos). */
export function limparCpf(valor: string): string {
  return valor.replace(/\D/g, "")
}

/** 12345678901 → 123.456.789-01 */
export function formatarCpf(cpf: string): string {
  const limpo = limparCpf(cpf)
  if (limpo.length !== 11) return cpf
  return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
}

/** Aplica a máscara progressivamente enquanto o usuário digita. */
export function mascararCpfParcial(valor: string): string {
  const limpo = limparCpf(valor).slice(0, 11)
  return limpo
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2")
}

/** Validação completa com dígitos verificadores. */
export function validarCpf(cpf: string): boolean {
  const limpo = limparCpf(cpf)
  if (limpo.length !== 11) return false
  if (/^(\d)\1{10}$/.test(limpo)) return false

  const calcularDigito = (base: string, pesoInicial: number) => {
    const soma = base
      .split("")
      .reduce((acc, d, i) => acc + Number(d) * (pesoInicial - i), 0)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }

  const digito1 = calcularDigito(limpo.slice(0, 9), 10)
  const digito2 = calcularDigito(limpo.slice(0, 10), 11)

  return digito1 === Number(limpo[9]) && digito2 === Number(limpo[10])
}
