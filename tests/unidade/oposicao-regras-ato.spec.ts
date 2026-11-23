import { expect, test } from "playwright/test"

import {
  avisoMudancaDoAto,
  exigeDocumentoComRegras,
  REGRAS_VAZIAS,
  regrasComAto,
  regrasDoAtoParaGravar,
  type RegrasOposicao,
} from "../../src/lib/oposicao-constantes"

// Decisões do ato (23/11/2026): mudar a campanha vale só para quem registrar depois.
const campanhaAgora: RegrasOposicao = {
  ...REGRAS_VAZIAS,
  video_minimo: "exigir",
  assinaturas_aceitas: "govbr",
  prova_nao_filiado: "matricula",
  carta_fora_prazo: "recusar",
}

test("oposição antiga (sem regras do ato) segue a campanha", () => {
  expect(regrasComAto(campanhaAgora, null)).toEqual(campanhaAgora)
})

test("as regras do ato valem por cima das da campanha", () => {
  const r = regrasComAto(campanhaAgora, { video_minimo: "dispensar", assinaturas_aceitas: "confluir_ou_carta", prova_nao_filiado: "nenhuma" })
  expect(r.prova_nao_filiado).toBe("nenhuma")
  expect(r.assinaturas_aceitas).toBe("confluir_ou_carta")
  expect(r.video_minimo).toBe("dispensar")
  // Decisão fora do ato continua a da campanha.
  expect(r.carta_fora_prazo).toBe("recusar")
})

test("endurecer para carta não cobra carta de quem já registrou", () => {
  const depois = { ...campanhaAgora, prova_nao_filiado: "carta_govbr" }
  const antigo = regrasComAto(depois, { prova_nao_filiado: "nenhuma" })
  expect(exigeDocumentoComRegras("tela", false, antigo)).toBe(false)
  const novo = regrasComAto(depois, regrasDoAtoParaGravar(depois))
  expect(exigeDocumentoComRegras("tela", false, novo)).toBe(true)
})

test("valor vazio no ato não apaga a decisão da campanha", () => {
  expect(regrasComAto(campanhaAgora, { prova_nao_filiado: "" }).prova_nao_filiado).toBe("matricula")
})

test("gravar só as decisões do ato", () => {
  expect(regrasDoAtoParaGravar(campanhaAgora)).toEqual({
    video_minimo: "exigir",
    assinaturas_aceitas: "govbr",
    prova_nao_filiado: "matricula",
  })
})

test("o aviso diz o que passa a valer e que as registradas não mudam", () => {
  const aviso = avisoMudancaDoAto([{ chave: "prova_nao_filiado", antes: "nenhuma", depois: "matricula" }], 113)
  expect(aviso).toContain("A partir desta mudança")
  expect(aviso).toContain("Prova exigida do não filiado")
  expect(aviso).toContain("“Nenhuma além do e-mail confirmado” para “Matrícula na fonte pagadora”")
  expect(aviso).toContain("O campo da matrícula passa a ser obrigatório para o não filiado.")
  expect(aviso).toContain("As 113 oposições já registradas continuam com as regras de quando foram feitas")
  expect(avisoMudancaDoAto([{ chave: "video_minimo", antes: "exigir", depois: "dispensar" }], 1)).toContain(
    "A oposição já registrada continua com as regras de quando foi feita."
  )
  expect(aviso).toContain("Deseja prosseguir?")
})
