import { createHash } from "node:crypto"

import { expect, test, type Page } from "playwright/test"

import { DEMO, entrarPorLink, servico } from "./_helpers"

/**
 * Cessão de espaços — pedido registrado pela equipe no painel (31/10/2026).
 * Roda no confluir-demo-sandbox (EMAIL_SANDBOX=1): o recibo ao solicitante
 * não sai de verdade.
 */

const MARCA = `E2E registro ${Date.now()}`
const svc = servico()

async function esperarNoBanco<T>(ler: () => Promise<T>, ok: (v: T) => boolean): Promise<T> {
  for (let i = 0; i < 40; i++) {
    const v = await ler()
    if (ok(v)) return v
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error("o banco não chegou ao estado esperado")
}

/** "2026-12-10T14:00" — o formato do datetime-local, daqui a N dias. */
function daquiA(dias: number, hora: number): string {
  const d = new Date(Date.now() + dias * 86400000)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(hora)}:00`
}

let espaco: { id: string; nome: string; slug: string; publico_alvo: string; capacidade_pessoas: number | null }

async function pedido(id: string) {
  const { data } = await svc.from("cessao_solicitacoes").select("*").eq("id", id).single()
  return data as Record<string, unknown>
}

async function preencherBase(page: Page, inicio: string, termino: string) {
  await page.locator("#espaco_id").selectOption(espaco.id)
  await page.locator("#canal").selectOption("telefone")
  await page.locator("#inicio").fill(inicio)
  await page.locator("#termino").fill(termino)
  await page.locator("#finalidade").fill(MARCA)
}

test.describe.serial("cessão: registro pela equipe", () => {
  // Espaço próprio do teste: o do seed tem bloqueio sem término deixado por
  // testes antigos, e mexer nele mudaria o demo.
  test.beforeAll(async () => {
    const { data, error } = await svc
      .from("cessao_espacos")
      .insert({
        nome: MARCA,
        slug: `e2e-registro-${Date.now()}`,
        emp_proprietaria_id: DEMO.tenant,
        capacidade_pessoas: 100,
        publico_alvo: "qualquer",
        visita_tecnica: "facultativa",
        exige_autorizacao: true,
        ativo: true,
      })
      .select("id, nome, slug, publico_alvo, capacidade_pessoas")
      .single()
    if (error) throw new Error(error.message)
    espaco = data as typeof espaco
    await svc.from("cessao_espaco_exigencias").insert([
      { espaco_id: espaco.id, gatilho: "publico", de: 30, ate: null, bombeiros: 1, segurancas: 1, emp_proprietaria_id: DEMO.tenant },
      { espaco_id: espaco.id, gatilho: "infantil", bombeiros: 0, segurancas: 1, emp_proprietaria_id: DEMO.tenant },
    ])
    // Sem janela o link público não mostra o formulário.
    await svc.from("cessao_espaco_janelas").insert(
      [0, 1, 2, 3, 4, 5, 6].map((d) => ({
        espaco_id: espaco.id,
        dia_semana: d,
        hora_inicio: "08:00",
        hora_termino: "22:00",
        modo: "livre",
        emp_proprietaria_id: DEMO.tenant,
      }))
    )
  })

  test.afterAll(async () => {
    const { data } = await svc
      .from("cessao_solicitacoes")
      .select("id")
      .eq("emp_proprietaria_id", DEMO.tenant)
      .eq("espaco_id", espaco.id)
    const ids = (data ?? []).map((d) => d.id)
    if (ids.length) {
      await svc.from("cessao_solicitacao_eventos").delete().in("solicitacao_id", ids)
      await svc.from("cessao_solicitacao_exigencias").delete().in("solicitacao_id", ids)
      await svc.from("cessao_custeio_itens").delete().in("solicitacao_id", ids)
      await svc.from("cessao_solicitacoes").delete().in("id", ids)
    }
    await svc.from("cessao_espaco_exigencias").delete().eq("espaco_id", espaco.id)
    await svc.from("cessao_espaco_janelas").delete().eq("espaco_id", espaco.id)
    await svc.from("cessao_espacos").delete().eq("id", espaco.id)
  })

  let idAvulso = ""

  test("o botão está na fila e o pedido avulso entra na fila, numerado, com exigências e trilha", async ({ page }) => {
    await entrarPorLink(page, DEMO.operador.email, "/painel/espacos/pedidos")
    await page.getByRole("link", { name: "Registrar pedido" }).click()
    await page.waitForURL(/\/painel\/espacos\/pedidos\/novo/)

    await preencherBase(page, daquiA(40, 14), daquiA(40, 18))
    await page.getByRole("button", { name: "Outra pessoa" }).click()
    await page.locator("#nome").fill("Fulano Teste Registro")
    await page.locator("#email").fill("registro.e2e@exemplo.com")
    await page.locator("#telefone").fill("22999990000")
    const publico = Math.min(50, espaco.capacidade_pessoas ?? 50)
    await page.locator("#publico_estimado").fill(String(publico))
    await page.locator('input[name="tem_infantil"]').check()
    await page.getByRole("button", { name: "Registrar pedido" }).click()

    await page.waitForURL(/\/painel\/espacos\/pedidos\/[0-9a-f-]{36}\?registrado=\d+/)
    idAvulso = page.url().match(/pedidos\/([0-9a-f-]{36})/)![1]
    await expect(page.getByText(/Pedido nº \d+ registrado\./)).toBeVisible()
    await expect(page.getByText(/Registrado pela equipe \(Telefone\)/)).toBeVisible()

    const p = await pedido(idAvulso)
    expect(p.situacao).toBe("solicitada")
    expect(p.numero).toBeTruthy()
    expect(p.identificacao).toBe("interno")
    expect(p.solicitante_email).toBe("registro.e2e@exemplo.com")
    expect(p.codigo_hash).toBeNull()
    expect(p.tem_infantil).toBe(true)

    // Exigências congeladas = as que as regras do espaço dão para essas respostas.
    const { data: regras } = await svc
      .from("cessao_espaco_exigencias")
      .select("gatilho, de, ate, bombeiros, segurancas, observacao")
      .eq("espaco_id", espaco.id)
    const { calcularExigencias } = await import("../../src/lib/espacos-constantes")
    const esperadas = calcularExigencias(
      (regras ?? []).map((r) => ({ ...r, bombeiros: Number(r.bombeiros), segurancas: Number(r.segurancas) })) as never,
      { publicoEstimado: publico, infantil: true, idoso: false, mobilidade: false, bebida: false, estresse: false }
    )
    const { data: congeladas } = await svc
      .from("cessao_solicitacao_exigencias")
      .select("gatilho")
      .eq("solicitacao_id", idAvulso)
    expect(esperadas.length).toBe(2)
    expect((congeladas ?? []).length).toBe(esperadas.length)

    const { data: eventos } = await svc
      .from("cessao_solicitacao_eventos")
      .select("tipo, detalhe, usuario_id")
      .eq("solicitacao_id", idAvulso)
    expect(eventos).toEqual([
      { tipo: "registrado", detalhe: "Telefone", usuario_id: DEMO.operador.usuarioId },
    ])

    // Aparece na fila.
    await page.goto("/painel/espacos/pedidos?situacao=solicitada")
    await expect(page.getByRole("cell", { name: /Fulano Teste Registro/ }).first()).toBeVisible()
  })

  test("choque de agenda: o mesmo período não entra de novo", async ({ page }) => {
    await entrarPorLink(page, DEMO.operador.email, "/painel/espacos/pedidos/novo")
    await preencherBase(page, daquiA(40, 15), daquiA(40, 17))
    await page.getByRole("button", { name: "Outra pessoa" }).click()
    await page.locator("#nome").fill("Outra Pessoa Choque")
    await page.getByRole("button", { name: "Registrar pedido" }).click()
    await expect(page.getByRole("alert").filter({ hasText: "Já há um pedido para o espaço nesse período." })).toBeVisible()
    expect(page.url()).toMatch(/\/novo/)
  })

  test("filiado escolhido no seletor: nome e CPF saem do cadastro, sem e-mail digitado", async ({ page }) => {
    await entrarPorLink(page, DEMO.operador.email, "/painel/espacos/pedidos/novo")
    await preencherBase(page, daquiA(45, 9), daquiA(45, 11))
    await page.locator("#canal").selectOption("whatsapp")
    await page.getByRole("button", { name: "Filiado", exact: true }).click()
    await page.getByPlaceholder("Busque por nome, CPF ou matrícula").fill(DEMO.camila.cpf)
    await page.getByRole("button", { name: /Camila Rodrigues Pinto/ }).click()
    await page.getByRole("button", { name: "Registrar pedido" }).click()
    await page.waitForURL(/registrado=\d+/)
    const id = page.url().match(/pedidos\/([0-9a-f-]{36})/)![1]
    const p = await pedido(id)
    expect(String(p.solicitante_cpf).replace(/\D/g, "")).toBe(DEMO.camila.cpf)
    expect(String(p.solicitante_nome)).toMatch(/Camila/i)
    const { data: ev } = await svc.from("cessao_solicitacao_eventos").select("detalhe").eq("solicitacao_id", id)
    expect(ev?.[0]?.detalhe).toBe("WhatsApp")
  })

  test("o pedido registrado segue a esteira: assumir → visita → autorização → confirmar", async ({ page }) => {
    await entrarPorLink(page, DEMO.operador.email, `/painel/espacos/pedidos/${idAvulso}`)

    await page.getByRole("button", { name: "Assumir o pedido" }).click()
    await esperarNoBanco(() => pedido(idAvulso), (p) => p.situacao === "em_analise")

    await page.reload()
    const dispensar = page.getByRole("button", { name: "Dispensar a visita" })
    if (await dispensar.count()) {
      await dispensar.click()
      await esperarNoBanco(() => pedido(idAvulso), (p) => p.visita_dispensada === true)
      await page.reload()
    }

    const autorizar = page.getByRole("button", { name: "Autorizar", exact: true })
    if (await autorizar.count()) {
      await autorizar.click()
      await esperarNoBanco(() => pedido(idAvulso), (p) => p.autorizacao_situacao === "autorizada")
      await page.reload()
    }

    await page.getByRole("button", { name: "Confirmar a cessão" }).click()
    await esperarNoBanco(() => pedido(idAvulso), (p) => p.situacao === "confirmada")

    // O evento é gravado logo depois da situação — esperar por ele também.
    const tipos = await esperarNoBanco(
      async () => {
        const { data } = await svc
          .from("cessao_solicitacao_eventos")
          .select("tipo")
          .eq("solicitacao_id", idAvulso)
        return (data ?? []).map((e) => e.tipo as string)
      },
      (t) => t.includes("confirmada")
    )
    expect(tipos).toContain("registrado")
    expect(tipos).toContain("analise")
  })

  test("regressão: o link público continua pedindo o código e só então entra na fila", async ({ page }) => {
    await page.goto(`/espaco/${espaco.slug}`)
    await page.locator("#nome").fill("Pessoa do Link Público")
    await page.locator("#email").fill("link.publico.e2e@exemplo.com")
    await page.locator("#inicio").fill(daquiA(50, 9))
    await page.locator("#termino").fill(daquiA(50, 12))
    await page.locator("#finalidade").fill(MARCA)
    await page.getByRole("button", { name: "Enviar pedido" }).click()
    await expect(page.getByText("Confirme seu e-mail")).toBeVisible()

    const rascunho = await esperarNoBanco(
      async () => {
        const { data } = await svc
          .from("cessao_solicitacoes")
          .select("id, token, situacao, numero, codigo_hash")
          .eq("espaco_id", espaco.id)
          .eq("solicitante_email", "link.publico.e2e@exemplo.com")
          .maybeSingle()
        return data
      },
      (d) => Boolean(d?.codigo_hash)
    )
    expect(rascunho!.situacao).toBe("rascunho")
    expect(rascunho!.numero).toBeNull()

    // O código real só existe no e-mail (sandbox): grava um conhecido.
    const hash = createHash("sha256").update(`123456:${rascunho!.token}`).digest("hex")
    await svc.from("cessao_solicitacoes").update({ codigo_hash: hash }).eq("id", rascunho!.id)
    await page.locator("#codigo").fill("123456")
    await page.getByRole("button", { name: "Confirmar" }).click()
    await expect(page.getByText(/Pedido nº \d+ registrado\./)).toBeVisible()
    const p = await pedido(String(rascunho!.id))
    expect(p.situacao).toBe("solicitada")
    expect(p.numero).toBeTruthy()
  })

  test("manual: o artigo da esteira explica o registro pela equipe", async ({ page }) => {
    await entrarPorLink(page, DEMO.operador.email, "/painel/ajuda/espacos/pedidos")
    await expect(
      page.getByRole("heading", { name: "Registrar um pedido que chegou por outro caminho" })
    ).toBeVisible()
    await expect(page.getByRole("heading", { name: "A esteira" })).toBeVisible()
  })
})
