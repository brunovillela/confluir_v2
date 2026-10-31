import { expect, test, type Page } from "playwright/test"

import { DEMO, entrarPorLink, servico } from "./_helpers"

/**
 * Cessão de espaços — faixas de horário livre não se sobrepõem (31/10/2026).
 * O espaço é do próprio teste; as faixas antigas que se cruzam (o caso do
 * Teatro) são semeadas direto no banco, como os dados de produção.
 */

const MARCA = `E2E janelas ${Date.now()}`
const svc = servico()
let espacoId = ""

async function contar(dia: number): Promise<number> {
  const { count } = await svc
    .from("cessao_espaco_janelas")
    .select("id", { count: "exact", head: true })
    .eq("espaco_id", espacoId)
    .eq("dia_semana", dia)
  return count ?? 0
}

async function esperarContagem(dia: number, n: number): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if ((await contar(dia)) === n) return
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`dia ${dia}: esperava ${n} faixas`)
}

async function adicionarFaixa(
  page: Page,
  dia: string,
  das: string,
  ate: string,
  modo: "livre" | "slots" = "livre"
) {
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Adicionar faixa" }) })
  await form.locator("label").filter({ hasText: new RegExp(`^${dia}$`) }).locator("input").check()
  await form.locator("#hora_inicio").fill(das)
  await form.locator("#hora_termino").fill(ate)
  await form.locator("#modo").selectOption(modo)
  if (modo === "slots") await form.locator("#slot_minutos").fill("60")
  await form.getByRole("button", { name: "Adicionar faixa" }).click()
}

test.describe.serial("cessão: faixas de horário livre sem sobreposição", () => {
  test.beforeAll(async () => {
    const { data, error } = await svc
      .from("cessao_espacos")
      .insert({
        nome: MARCA,
        slug: `e2e-janelas-${Date.now()}`,
        emp_proprietaria_id: DEMO.tenant,
        capacidade_pessoas: 100,
        publico_alvo: "qualquer",
        visita_tecnica: "facultativa",
        ativo: true,
      })
      .select("id")
      .single()
    if (error) throw new Error(error.message)
    espacoId = String(data.id)
    // O legado: segunda com o dia inteiro e um turno por cima.
    await svc.from("cessao_espaco_janelas").insert([
      { espaco_id: espacoId, dia_semana: 1, hora_inicio: "08:00", hora_termino: "21:30", modo: "livre", rotulo: "Dia inteiro", emp_proprietaria_id: DEMO.tenant },
      { espaco_id: espacoId, dia_semana: 1, hora_inicio: "08:00", hora_termino: "12:59", modo: "livre", emp_proprietaria_id: DEMO.tenant },
    ])
  })

  test.afterAll(async () => {
    await svc.from("cessao_espaco_janelas").delete().eq("espaco_id", espacoId)
    await svc.from("cessao_espacos").delete().eq("id", espacoId)
  })

  test("as faixas antigas que se cruzam aparecem com aviso e nada é apagado", async ({ page }) => {
    await entrarPorLink(page, DEMO.operador.email, `/painel/espacos/${espacoId}`)
    const aviso = page.locator('[data-teste="aviso-sobreposicao"]')
    await expect(aviso).toContainText("Há faixas de horário livre que se sobrepõem (Seg)")
    await expect(aviso).toContainText("Segunda-feira, 08:00 às 21:30 (Dia inteiro) × 08:00 às 12:59")
    expect(await contar(1)).toBe(2)
  })

  test("faixa livre nova que cruza outra é recusada, dizendo qual", async ({ page }) => {
    await entrarPorLink(page, DEMO.operador.email, `/painel/espacos/${espacoId}`)
    await adicionarFaixa(page, "Seg", "12:00", "14:00")
    await expect(
      page.getByRole("alert").filter({ hasText: "se sobrepõe a Segunda-feira, 08:00 às 21:30 (Dia inteiro)" })
    ).toBeVisible()
    expect(await contar(1)).toBe(2)
  })

  test("faixas que só encostam entram; a seguinte que cruza é recusada", async ({ page }) => {
    await entrarPorLink(page, DEMO.operador.email, `/painel/espacos/${espacoId}`)
    await adicionarFaixa(page, "Ter", "08:00", "13:00")
    await esperarContagem(2, 1)

    await page.reload()
    await adicionarFaixa(page, "Ter", "13:00", "18:00")
    await esperarContagem(2, 2)

    await page.reload()
    await adicionarFaixa(page, "Ter", "17:00", "20:00", "slots")
    await expect(
      page.getByRole("alert").filter({ hasText: "se sobrepõe a Terça-feira, 13:00 às 18:00, de horário livre" })
    ).toBeVisible()
    expect(await contar(2)).toBe(2)
    // Terça não entrou no aviso: encostar não é cruzar.
    await expect(page.locator('[data-teste="aviso-sobreposicao"]')).not.toContainText("Ter,")
  })

  test("entre faixas por slots continua permitido", async ({ page }) => {
    await entrarPorLink(page, DEMO.operador.email, `/painel/espacos/${espacoId}`)
    await adicionarFaixa(page, "Qua", "08:00", "18:00", "slots")
    await esperarContagem(3, 1)
    await page.reload()
    await adicionarFaixa(page, "Qua", "13:00", "18:00", "slots")
    await esperarContagem(3, 2)
  })

  test("manual: o artigo diz que horário livre não se sobrepõe", async ({ page }) => {
    await entrarPorLink(page, DEMO.operador.email, "/painel/ajuda/espacos")
    await expect(page.getByText("Horário livre não se sobrepõe")).toBeVisible()
  })
})
