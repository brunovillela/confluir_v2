import { expect, test } from "playwright/test"

import { recorrentes, trimestreDe } from "../../src/lib/anomalias-sugestoes-constantes"

test("trimestre da data", () => {
  expect(trimestreDe("2026-01-05")).toBe("2026-T1")
  expect(trimestreDe("2026-03-31")).toBe("2026-T1")
  expect(trimestreDe("2026-04-01")).toBe("2026-T2")
  expect(trimestreDe("2026-11-19")).toBe("2026-T4")
})

test("recorrentes: só quem atinge o mínimo, com a última data", () => {
  const r = recorrentes(
    [
      { quem: "a", data: "2026-10-01" },
      { quem: "b", data: "2026-10-02" },
      { quem: "a", data: "2026-11-15" },
      { quem: "a", data: "2026-09-20" },
      { quem: "b", data: "2026-10-03" },
    ],
    3
  )
  expect(r.map(({ quem, quantidade, ultima }) => ({ quem, quantidade, ultima }))).toEqual([
    { quem: "a", quantidade: 3, ultima: "2026-11-15" },
  ])
})
