# Suboperadores e transferência internacional

> **Onda B2** (`docs/plano-documentacao.md`). Atualizado em 18/10/2026. Os fatos sobre o Confluir (o que é enviado, configuração) foram conferidos no código. A situação contratual de cada conta (DPA aceito ou assinado) **precisa ser confirmada pelo titular das contas**: veja a lista de ações no fim.

O Confluir é **operador** dos dados de cada entidade (controladora). Os serviços abaixo tratam dados pessoais em nome do Confluir e são, portanto, **suboperadores**. A entidade precisa conhecê-los (art. 39) e o contrato de operação com ela deve listá-los (B6).

## Resumo

| Suboperador | O que recebe | Onde | Transferência internacional | Situação |
|---|---|---|---|---|
| **Supabase** | Todo o banco, autenticação e arquivos | Dados em São Paulo (AWS sa-east-1); empresa nos EUA | Sim (suporte e operação pela empresa nos EUA) | Confirmar DPA |
| **Vercel** | Requisições à aplicação (inclusive URLs com token), logs de execução | Funções em São Paulo (`gru1`); empresa e rede de borda nos EUA | Sim | Confirmar DPA |
| **OpenAI** | Conteúdo enviado aos recursos de IA, inclusive CAT (saúde), relações de desconto, contracheques e ponto nominal | EUA | **Sim, com dado sensível** | **Prioritário:** DPA + retenção zero |
| **Brevo** (padrão) / **Resend** (opcional) | E-mail do destinatário e conteúdo da mensagem | Brevo: UE (França); Resend: EUA | Sim | Confirmar DPA |
| **Sentry** | Erros da aplicação, já filtrados | UE (Alemanha) | Sim (UE) | Confirmar DPA |
| **Telegram** | Mensagens do bot: avisos, aprovações, links de votação, buscas | Exterior | Sim | **Sem DPA disponível**: minimizar conteúdo |
| **Cloudflare Turnstile** | IP e sinais do navegador nos formulários de acesso | EUA (rede global) | Sim | Confirmar DPA |
| **Serviços de push** (Google, Apple, Mozilla) | Endereço da assinatura e mensagem **cifrada** | EUA | Só metadados | Não exige ação |
| **Bubble** (legado) | Histórico anterior à migração; ainda grava hospedagem, portal e anuênio | EUA | Sim | **Desligar e eliminar** |
| **gov.br / ITI** | O próprio titular assina o PDF no assinador do governo | Brasil | Não | Não exige ação |

## Detalhes por suboperador

### Supabase
- **Recebe:** tudo. Banco Postgres com as 347 tabelas, contas de acesso (Auth) e os 21 buckets de arquivos.
- **Onde:** projeto na região `sa-east-1` (São Paulo) desde 02/09/2026. A empresa (Supabase Inc.) fica nos EUA e pode acessar a infraestrutura para suporte e operação.
- **Contrato:** DPA em <https://supabase.com/legal/dpa>. Confirmar se foi aceito ou assinado para a organização do Confluir.
- **No Confluir:** RLS em 100% das tabelas; a `service_role` fica só no servidor; colunas de saúde cifradas; trilha de auditoria.

### Vercel
- **Recebe:** cada requisição, com IP, URL e cabeçalhos. Isso inclui rotas com token na URL: `/meus-dados/[token]`, `/assinar/[token]`, `/ficha/[token]`, `/inscricao/[token]`, `/hospedagem/*/[token]`, `/desistir/[token]`, `/comunicados/sair/[token]`. Também os logs de execução.
- **Onde:** funções em `gru1` (São Paulo), conferido pelo cabeçalho `x-vercel-id`. Empresa, painel e rede de borda nos EUA.
- **Contrato:** DPA em <https://vercel.com/legal/dpa>.
- **No Confluir:** os links com token expiram (os de e-mail valem 2 h). Não usamos Vercel Analytics nem Speed Insights.

### OpenAI — prioridade
- **Recebe:** todo o conteúdo dos recursos de IA, sempre por `src/lib/ia.ts` (duas chamadas, ambas `store: false`, PDF embutido e sem upload de arquivos). Os fluxos:
  - Saúde: leitura de CAT (diagnóstico, CID, lesão), **dado sensível**.
  - Filiação: relações de desconto das fontes pagadoras (CPF, nome, valor).
  - Pessoal: marcações e resenha do ponto, com até 30 funcionários por nome; SST.
  - Financeiro: notas de compra, verificação de ordens, minutas de contrato, dados de fornecedor.
  - Redação: ofícios, atas, comunicados, aniversariantes, resumos, termos.
  - Frota: cupons de abastecimento.
  - Mensagens ao bot do Telegram.
- **Onde:** EUA.
- **Contrato:** DPA em <https://openai.com/policies/data-processing-addendum>. Pela política da API, os dados não treinam modelos por padrão. `store: false` impede guardar a resposta, mas a OpenAI pode reter entradas e saídas **por até 30 dias para monitorar abuso**, salvo com **retenção zero** (*Zero Data Retention*), que é aprovada por solicitação.
- **Ações:** aceitar ou assinar o DPA na organização da OpenAI e **pedir retenção zero**, por causa da CAT. A RIPD de saúde (B3) decide se a CAT deve ser pseudonimizada antes do envio, por exemplo sem nome e CPF.

### Brevo / Resend (e-mail)
- **Recebe:** e-mail do destinatário e corpo da mensagem: links de acesso, códigos, avisos de votação, comprovantes, ordens de compra com anexo, comunicados.
- **Onde:** Brevo (padrão, `EMAIL_PROVEDOR` vazio) na UE, França; Resend (`EMAIL_PROVEDOR=resend`) nos EUA.
- **Contrato:** DPA de cada provedor, nas páginas legais deles. A Resend publica o seu em <https://resend.com/legal/dpa>.
- **No Confluir:** códigos de acesso com cadência (1/min, 5/h); mensagens que não revelam se um CPF existe.
- **Volta da Brevo (webhook, 22/10/2026):** os e-mails de votação levam o cabeçalho `X-Mailin-custom` com a entidade, o tipo e o id do apto (sem nome, CPF ou e-mail). A Brevo devolve por `/api/webhooks/brevo` a entrega, o clique e a rejeição; o Confluir guarda só a data e o motivo curto no próprio apto (`email_entregue_em`, `email_clique_*`, `email_rejeicao`), com o prazo de guarda da rodada.

### Sentry
- **Recebe:** eventos de erro **filtrados** por `lib/sentry-filtro.ts`: sem cookies, sem corpo de requisição, tokens de URL removidos, CPF mascarado. Amostragem de 10% de *traces*. Sem gravação de sessão (*replay*).
- **Onde:** UE (ingestão em `ingest.de.sentry.io`).
- **Contrato:** DPA em <https://sentry.io/legal/dpa>.

### Telegram
- **Recebe:** as mensagens do bot.
  - Avisos e aprovações: ordens, diárias, férias, reembolsos, viagens, ofícios para assinar.
  - Links de votação e confirmações.
  - Frota.
  - Respostas de busca de filiado, com nome e **CPF mascarado**.
  - O que o usuário escreve ao bot (que pode ir à IA).
- **Onde:** servidores do Telegram, no exterior. Conversas com bots **não** têm criptografia de ponta a ponta.
- **Contrato:** o Telegram **não oferece DPA** para bots. A defesa é minimizar o conteúdo.
- **No Confluir:** o uso é opcional e vinculado pelo próprio usuário. Conferido: nenhum texto envia CPF completo, CID ou conteúdo de voto.
- **Regra a manter:** mensagem de Telegram nunca leva dado sensível nem identificador completo; para o detalhe, o usuário segue o link.

### Cloudflare Turnstile
- **Recebe:** IP e sinais do navegador de quem preenche formulários de acesso (login, portal, votação, oposição, recuperação).
- **Contrato:** <https://www.cloudflare.com/cloudflare-customer-dpa/>.

### Serviços de push dos navegadores
- **Recebem:** o endereço da assinatura e a mensagem **cifrada de ponta a ponta** (RFC 8291, biblioteca `web-push`). O serviço do navegador não lê o conteúdo.
- **Ação:** nenhuma.

### Bubble (sistema legado)
- **Recebe/guarda:** todo o histórico anterior à migração.
  - Inclui **os votos com o eleitor**, que no Confluir foram desligados em 18/10/2026.
  - Ainda grava hospedagem, portal e anuênio.
  - Os documentos do Pessoal (informes, aviso de férias, certificados) continuam no CDN do Bubble.
- **Ações:** definir a data de desligamento; migrar os arquivos restantes para o Storage; **eliminar os dados no Bubble**, a começar pelos votos.

### gov.br / ITI
- O titular assina o PDF por conta própria no assinador do governo (<https://assinador.iti.br>) e o envia de volta. O Confluir não manda dados ao ITI. A validação das assinaturas ICP-Brasil usa as cadeias públicas.

## Consultas a serviços públicos (não são suboperadores)

| Serviço | Uso | Dado enviado |
|---|---|---|
| BrasilAPI, minhareceita.org | Ficha pública de CNPJ (fornecedores, empregadores) | Só **CNPJ válido** (`validarCnpj` antes); CPF nunca é enviado |
| ViaCEP | Endereço pelo CEP | Só o CEP |
| Open-Meteo | Previsão do tempo no painel | Cidade das sedes da entidade |
| Google Calendar / Meet | Links "adicionar à agenda" e sala virtual | Nada é enviado pelo servidor; o usuário abre o link |

## Transferência internacional (art. 33)

A maior parte dos suboperadores está fora do Brasil. O mecanismo adequado é o das **cláusulas-padrão contratuais** da ANPD (Resolução CD/ANPD nº 19/2024), incorporadas ao contrato com cada fornecedor ou ao DPA dele. Para cada provedor estrangeiro, guardar:
1. o DPA aceito ou assinado (PDF ou print com data);
2. a verificação de que ele traz cláusulas equivalentes às da ANPD, ou um aditivo com elas;
3. a menção no contrato de operação com cada entidade (B6) e na política de privacidade (B6).

## Ações para o titular das contas

| # | Ação | Prioridade |
|---|---|---|
| 1 | OpenAI: aceitar ou assinar o DPA e **pedir retenção zero** (CAT é dado de saúde) | Alta |
| 2 | Bubble: definir a data de desligamento; eliminar os votos com eleitor e o restante do histórico depois da conferência; migrar os documentos do CDN | Alta |
| 3 | Supabase, Vercel, Sentry, Brevo, Resend, Cloudflare: baixar ou confirmar o DPA de cada conta e arquivar em `docs/lgpd/contratos/` (fora do git se tiver dados da conta) | Média |
| 4 | Se a Resend não for usada, deixar só a Brevo (um suboperador a menos e dados na UE) | Baixa |
| 5 | Revisar esta lista a cada fornecedor novo (o AGENTS.md pede que integração nova passe por aqui) | Contínua |
