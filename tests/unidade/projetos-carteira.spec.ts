import { expect, test } from "playwright/test"

import { situacaoDoProjeto } from "../../src/lib/projetos-constantes"

const hoje = "2026-11-19"
const base = { finalizado: false, terminoPrevisao: null, marcos: [], tarefasAtrasadas: 0, saldo: null }

test("sem pendência: no prazo", () => {
  expect(situacaoDoProjeto(base, hoje)).toEqual({ nivel: "no_prazo", motivos: [] })
})

test("finalizado ignora o resto", () => {
  expect(situacaoDoProjeto({ ...base, finalizado: true, tarefasAtrasadas: 3 }, hoje).nivel).toBe("finalizado")
})

test("marco vencido aberto: atrasado", () => {
  const r = situacaoDoProjeto({ ...base, marcos: [{ titulo: "Contratar", dataPrevista: "2026-11-18", concluido: false }] }, hoje)
  expect(r.nivel).toBe("atrasado")
  expect(r.motivos).toEqual(['Marco "Contratar" venceu em 18/11'])
})

test("marco vencido mas concluído não atrasa", () => {
  expect(situacaoDoProjeto({ ...base, marcos: [{ titulo: "X", dataPrevista: "2026-11-01", concluido: true }] }, hoje).nivel).toBe("no_prazo")
})

test("término previsto passado: atrasado", () => {
  expect(situacaoDoProjeto({ ...base, terminoPrevisao: "2026-11-10" }, hoje).motivos).toEqual(["Término previsto em 10/11 passou"])
})

test("atenção: tarefas atrasadas, marco em até 7 dias, orçamento estourado", () => {
  const r = situacaoDoProjeto(
    { ...base, tarefasAtrasadas: 2, saldo: -10, marcos: [{ titulo: "Divulgar", dataPrevista: "2026-11-26", concluido: false }, { titulo: "Longe", dataPrevista: "2026-11-27", concluido: false }] },
    hoje
  )
  expect(r.nivel).toBe("atencao")
  expect(r.motivos).toEqual(["2 tarefas atrasadas", 'Marco "Divulgar" vence em 26/11', "Solicitado em Aquisição passou do orçamento"])
})

test("marco hoje é atenção, não atraso", () => {
  expect(situacaoDoProjeto({ ...base, marcos: [{ titulo: "Hoje", dataPrevista: hoje, concluido: false }] }, hoje).nivel).toBe("atencao")
})
