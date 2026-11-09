/**
 * Senha nova recusada pelo Supabase (updateUser): a mensagem diz o porquê.
 * Antes, tudo virava "Não foi possível salvar a senha. Tente novamente." — e
 * a pessoa não sabia o que mudar (09/11/2026, caso do link "já usado").
 */

type RecusaSenha = { code?: string; message?: string; reasons?: string[] }

export function mensagemSenhaRecusada(erro: RecusaSenha): string {
  const codigo = erro.code ?? ""
  const texto = erro.message ?? ""
  if (codigo === "same_password" || /different from the old|same/i.test(texto)) {
    return "A nova senha precisa ser diferente da anterior."
  }
  if (codigo === "weak_password" || /weak|pwned|leaked|characters|at least/i.test(texto)) {
    const motivos = erro.reasons ?? []
    if (motivos.includes("pwned") || /pwned|leaked|known to be/i.test(texto)) {
      return "Essa senha aparece em vazamentos conhecidos na internet e não é aceita. Escolha outra."
    }
    if (motivos.includes("characters") || /characters/i.test(texto)) {
      return "A senha precisa misturar letras maiúsculas e minúsculas, números e símbolos. Escolha outra."
    }
    if (motivos.includes("length") || /at least/i.test(texto)) {
      return "A senha é curta demais. Escolha uma mais longa."
    }
    return "Essa senha é fraca demais e não foi aceita. Escolha outra."
  }
  return "Não foi possível salvar a senha. Tente novamente."
}
