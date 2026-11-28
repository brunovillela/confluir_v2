import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Service role só onde não há UM tenant: plataforma, proxy, auth pré-tenant,
// os ticks do agendador e o webhook do Telegram. Em código de tenant o certo
// é createAdminClient() (lê sob o JWT do tenant, com RLS) — onda 1, S10.
const PODEM_USAR_SERVICE_ROLE = [
  "src/proxy.ts",
  "src/lib/supabase/admin.ts",
  "src/lib/plataforma.ts",
  "src/lib/db/plataforma.ts",
  "src/lib/auth-diagnostico.ts",
  "src/lib/db/comunicacao.ts",
  "src/lib/db/comunicacao-mensagens.ts",
  // Registro dos e-mails (Gestão › E-mail): grava com a entidade explícita,
  // também no agendador, onde o cliente do tenant não serve.
  "src/lib/db/email-envios.ts",
  // Controles do e-mail (teto, cotas, bloqueios): lidos a cada envio, também no agendador.
  "src/lib/db/email-controles.ts",
  // Conta própria de e-mail da entidade: lida a cada envio (também no agendador) e pelo webhook.
  "src/lib/db/email-conta.ts",
  // Avisos do e-mail à Gestão: disparados no envio, no webhook e no agendador.
  "src/lib/db/email-avisos.ts",
  "src/lib/db/filiacao-coletiva.ts",
  "src/lib/db/veiculos-avisos.ts",
  // Checklist do carro dedicado: pedido ao condutor no tick diário de veículos.
  "src/lib/db/veiculos-dedicados.ts",
  "src/lib/db/pendencias-lembrete.ts",
  "src/lib/db/vencimentos.ts",
  "src/lib/db/analitica.ts",
  "src/lib/db/resumo-semanal.ts",
  "src/lib/db/hospedagem-avaliacoes.ts",
  "src/lib/db/telegram.ts",
  // Confirmação do link único pelo bot: o webhook atende todas as entidades
  // e a tabela não tem política (o token carrega a entidade).
  "src/lib/db/votacao-telegram.ts",
  "src/lib/api-publica.ts",
  // Rotas do agente do controle de acesso: quem chama não tem sessão (token ca_…).
  "src/lib/acesso-agente.ts",
  "src/lib/db/webhooks.ts",
  "src/app/api/**",
  "src/app/admin/**",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase/admin",
              importNames: ["createServiceClient"],
              message:
                "createServiceClient ignora o RLS: use createAdminClient() em código de tenant. Só plataforma, proxy, ticks e webhook podem usá-lo (lista em eslint.config.mjs).",
            },
          ],
        },
      ],
    },
  },
  {
    files: PODEM_USAR_SERVICE_ROLE,
    rules: { "no-restricted-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
