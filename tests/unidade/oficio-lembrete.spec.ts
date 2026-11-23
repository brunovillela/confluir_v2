import { expect, test } from "playwright/test"

import { marcoDoLembreteAssinatura } from "../../src/lib/oficios-constantes"

test("marco do lembrete do ofício parado em assinatura", () => {
  expect(marcoDoLembreteAssinatura(0)).toBeNull()
  expect(marcoDoLembreteAssinatura(2)).toBeNull()
  expect(marcoDoLembreteAssinatura(3)).toBe(3)
  expect(marcoDoLembreteAssinatura(6)).toBe(3)
  expect(marcoDoLembreteAssinatura(7)).toBe(7)
  expect(marcoDoLembreteAssinatura(13)).toBe(7)
  expect(marcoDoLembreteAssinatura(14)).toBe(14)
  expect(marcoDoLembreteAssinatura(27)).toBe(14)
  expect(marcoDoLembreteAssinatura(28)).toBe(28)
  expect(marcoDoLembreteAssinatura(60)).toBe(56)
})
