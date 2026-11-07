import { expect, test } from "playwright/test"

import { numerarAtas, type AtaParaNumerar } from "../../src/lib/atas-constantes"

function ata(id: string, data: string | null, extra: Partial<AtaParaNumerar> = {}): AtaParaNumerar {
  return { id, tipo: "diretoria", orgao: null, data, hora: null, criadaEm: `2026-11-07T10:00:0${id.length}Z`, ...extra }
}

test.describe("numeração anual das atas", () => {
  test("numera pela data, recomeçando a cada ano", () => {
    const n = numerarAtas([ata("b", "2026-03-10"), ata("a", "2026-01-15"), ata("c", "2025-12-01")])
    expect(n.get("a")).toBe("01/2026")
    expect(n.get("b")).toBe("02/2026")
    expect(n.get("c")).toBe("01/2025")
  })

  test("ata antiga lançada depois entra no lugar e renumera as seguintes", () => {
    const antes = numerarAtas([
      ata("jan", "2026-01-10", { criadaEm: "2026-01-10T12:00:00Z" }),
      ata("mar", "2026-03-10", { criadaEm: "2026-03-10T12:00:00Z" }),
    ])
    expect(antes.get("mar")).toBe("02/2026")
    const depois = numerarAtas([
      ata("jan", "2026-01-10", { criadaEm: "2026-01-10T12:00:00Z" }),
      ata("mar", "2026-03-10", { criadaEm: "2026-03-10T12:00:00Z" }),
      ata("fev", "2026-02-05", { criadaEm: "2026-11-07T12:00:00Z" }),
    ])
    expect(depois.get("jan")).toBe("01/2026")
    expect(depois.get("fev")).toBe("02/2026")
    expect(depois.get("mar")).toBe("03/2026")
  })

  test("cada tipo de reunião (e cada órgão em 'outra') tem a própria série", () => {
    const n = numerarAtas([
      ata("d1", "2026-02-01"),
      ata("cf1", "2026-01-20", { tipo: "conselho_fiscal" }),
      ata("d2", "2026-04-01"),
      ata("o1", "2026-03-01", { tipo: "outra", orgao: "Comissão de Ética" }),
      ata("o2", "2026-03-02", { tipo: "outra", orgao: "comissão de ética " }),
      ata("o3", "2026-03-03", { tipo: "outra", orgao: "Comissão Eleitoral" }),
    ])
    expect(n.get("d1")).toBe("01/2026")
    expect(n.get("d2")).toBe("02/2026")
    expect(n.get("cf1")).toBe("01/2026")
    expect(n.get("o1")).toBe("01/2026")
    expect(n.get("o2")).toBe("02/2026")
    expect(n.get("o3")).toBe("01/2026")
  })

  test("no mesmo dia vale a hora; sem hora vem antes; empate pela ordem de lançamento", () => {
    const n = numerarAtas([
      ata("tarde", "2026-05-05", { hora: "14h30" }),
      ata("manha", "2026-05-05", { hora: "9:00" }),
      ata("semhora", "2026-05-05"),
      ata("x2", "2026-05-06", { criadaEm: "2026-05-06T15:00:00Z" }),
      ata("x1", "2026-05-06", { criadaEm: "2026-05-06T10:00:00Z" }),
    ])
    expect(n.get("semhora")).toBe("01/2026")
    expect(n.get("manha")).toBe("02/2026")
    expect(n.get("tarde")).toBe("03/2026")
    expect(n.get("x1")).toBe("04/2026")
    expect(n.get("x2")).toBe("05/2026")
  })

  test("ata sem data fica sem número e não ocupa posição", () => {
    const n = numerarAtas([ata("semdata", null), ata("a", "2026-06-01")])
    expect(n.has("semdata")).toBe(false)
    expect(n.get("a")).toBe("01/2026")
  })
})
