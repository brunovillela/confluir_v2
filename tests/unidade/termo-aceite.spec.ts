import { expect, test } from "playwright/test"

import { filtrosDeAceite, termoFoiAceito, type FiltroAceite } from "@/lib/filiacao-termos-aceite"

test.describe("filtrosDeAceite", () => {
  test("LGPD procura nos três lugares, sempre na entidade", () => {
    expect(filtrosDeAceite("lgpd", "t1", "e1")).toEqual([
      { tabela: "filiacoes", iguais: { emp_proprietaria_id: "e1", tl_lgpd_id: "t1" } },
      { tabela: "filiacao_solicitacoes", iguais: { emp_proprietaria_id: "e1", tl_lgpd_id: "t1" } },
      { tabela: "filiacao_tl_aceites", iguais: { emp_proprietaria_id: "e1", tipo: "lgpd", termo_id: "t1" } },
    ])
  })

  test("desconto usa a própria coluna", () => {
    const [cadastro, , aceites] = filtrosDeAceite("desconto", "t1", "e1")
    expect(cadastro.iguais.tl_desconto_id).toBe("t1")
    expect(aceites.iguais.tipo).toBe("desconto")
  })
})

test.describe("termoFoiAceito", () => {
  const filtros = filtrosDeAceite("lgpd", "t1", "e1")
  const so = (tabela: FiltroAceite["tabela"]) => async (f: FiltroAceite) => f.tabela === tabela

  test("sem nenhum aceite, é editável", async () => {
    expect(await termoFoiAceito(filtros, async () => false)).toBe(false)
  })

  for (const tabela of ["filiacoes", "filiacao_solicitacoes", "filiacao_tl_aceites"] as const) {
    test(`aceite só em ${tabela} já trava`, async () => {
      expect(await termoFoiAceito(filtros, so(tabela))).toBe(true)
    })
  }

  test("erro na consulta trava", async () => {
    const existe = async (f: FiltroAceite) => {
      if (f.tabela === "filiacoes") throw new Error("fora do ar")
      return false
    }
    expect(await termoFoiAceito(filtros, existe)).toBe(true)
  })
})
