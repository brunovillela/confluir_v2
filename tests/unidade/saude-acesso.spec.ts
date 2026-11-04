import { expect, test } from "playwright/test"

import { motivoDeAcesso, type PerfilClinico } from "@/lib/saude-acesso"

const USUARIO = "usuario-1"
const PROF = "profissional-1"
const TIPO = "tipo-1"

const perfil = (profissional: Partial<NonNullable<PerfilClinico["profissional"]>> | null): PerfilClinico => ({
  usuarioId: USUARIO,
  profissional: profissional && {
    id: PROF,
    tipoId: null,
    acessoTodosTipos: false,
    inativo: false,
    ...profissional,
  },
})

const atendimento = (a: Partial<{ tipoId: string; profissionalId: string; atendenteId: string }> = {}) => ({
  tipoId: null,
  profissionalId: null,
  atendenteId: null,
  ...a,
})

test.describe("motivoDeAcesso", () => {
  test("quem registrou, sem cadastro de profissional, não lê", () => {
    expect(motivoDeAcesso(perfil(null), atendimento({ atendenteId: USUARIO }))).toBeNull()
  })

  test("quem registrou, com cadastro inativo, não lê", () => {
    expect(motivoDeAcesso(perfil({ inativo: true }), atendimento({ atendenteId: USUARIO }))).toBeNull()
  })

  test("quem registrou, com cadastro ativo, é autor", () => {
    expect(motivoDeAcesso(perfil({}), atendimento({ atendenteId: USUARIO }))).toBe("autor")
  })

  test("profissional indicado e ativo é autor", () => {
    expect(motivoDeAcesso(perfil({}), atendimento({ profissionalId: PROF }))).toBe("autor")
  })

  test("profissional indicado e inativo não lê", () => {
    expect(motivoDeAcesso(perfil({ inativo: true }), atendimento({ profissionalId: PROF }))).toBeNull()
  })

  test("mesmo tipo: lê se ativo, não lê se inativo", () => {
    expect(motivoDeAcesso(perfil({ tipoId: TIPO }), atendimento({ tipoId: TIPO }))).toBe("profissional_mesmo_tipo")
    expect(motivoDeAcesso(perfil({ tipoId: TIPO, inativo: true }), atendimento({ tipoId: TIPO }))).toBeNull()
  })

  test("outro tipo não lê; atendimento sem tipo não abre por tipo", () => {
    expect(motivoDeAcesso(perfil({ tipoId: TIPO }), atendimento({ tipoId: "tipo-2" }))).toBeNull()
    expect(motivoDeAcesso(perfil({ tipoId: TIPO }), atendimento())).toBeNull()
  })

  test("coordenação: atravessa tipos se ativa, não se inativa", () => {
    expect(motivoDeAcesso(perfil({ acessoTodosTipos: true }), atendimento({ tipoId: TIPO }))).toBe("coordenacao")
    expect(motivoDeAcesso(perfil({ acessoTodosTipos: true, inativo: true }), atendimento({ tipoId: TIPO }))).toBeNull()
  })
})
