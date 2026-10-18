# Contrato de operação de dados pessoais (DPA): modelo

> **Onda B6** (`docs/plano-documentacao.md`), 18/10/2026. **Modelo** de aditivo ao contrato de uso do Confluir, entre o Confluir (operador) e cada entidade (controladora), conforme LGPD arts. 37 a 40, 42, 46 a 49. **Revisar com o jurídico antes de assinar.** Os anexos citam documentos vivos do repositório, que devem ser congelados (PDF com data) a cada assinatura.

---

## ADITIVO DE TRATAMENTO DE DADOS PESSOAIS

**CONTROLADORA:** [razão social da entidade], CNPJ [ ], com sede em [ ], neste ato representada por [ ]. Encarregado: [nome], [e-mail].

**OPERADOR:** [razão social do Confluir], CNPJ [ ], com sede em [ ]. Contato de privacidade: [e-mail].

### Cláusula 1ª. Objeto
1.1. Este aditivo regula o tratamento de dados pessoais que o OPERADOR realiza em nome da CONTROLADORA ao fornecer o sistema Confluir: hospedagem, processamento, armazenamento, envio de comunicações e suporte.
1.2. As operações, finalidades, categorias de dados e de titulares estão no **Anexo I** (Registro das operações, ROPA).

### Cláusula 2ª. Instruções da CONTROLADORA
2.1. O OPERADOR trata os dados **somente** conforme as instruções documentadas da CONTROLADORA, que são o contrato principal, este aditivo e a configuração do sistema feita pela CONTROLADORA (art. 39).
2.2. Se uma instrução contrariar a lei, o OPERADOR avisa a CONTROLADORA por escrito e pode suspender a execução daquela instrução.
2.3. O OPERADOR não usa os dados para finalidade própria, não os vende, não os cruza com dados de outras entidades e não os usa para treinar modelos de IA.

### Cláusula 3ª. Segregação entre entidades
3.1. Os dados da CONTROLADORA ficam logicamente separados dos de outras entidades: identificador próprio em todas as tabelas, políticas de acesso por linha (RLS) em 100% das tabelas e chaves de acesso por entidade (Anexo III).
3.2. O OPERADOR não dá acesso aos dados da CONTROLADORA a outra entidade em nenhuma hipótese.

### Cláusula 4ª. Confidencialidade e pessoal
4.1. Só acessam os dados as pessoas do OPERADOR que precisam fazê-lo para prestar o serviço, sujeitas a dever de sigilo.
4.2. O acesso técnico aos dados (fora das telas da CONTROLADORA) é registrado: quem, quando e por qual motivo. A CONTROLADORA pode pedir esse registro.

### Cláusula 5ª. Segurança
5.1. O OPERADOR mantém as medidas técnicas e administrativas do **Anexo III** (art. 46): cifragem em trânsito e, para dados de saúde, em repouso; autenticação com segundo fator para funções sensíveis; trilha de auditoria; sigilo do voto garantido no banco; cópias de segurança; detecção de mudanças não autorizadas no banco; e restauração testada.
5.2. Mudança que reduza o nível de segurança depende de aviso prévio à CONTROLADORA.

### Cláusula 6ª. Suboperadores
6.1. A CONTROLADORA autoriza os suboperadores do **Anexo II**.
6.2. O OPERADOR avisa a CONTROLADORA com **30 dias** de antecedência sobre a inclusão ou substituição de suboperador. A CONTROLADORA pode se opor de forma fundamentada; se não houver solução, pode rescindir sem multa.
6.3. O OPERADOR impõe aos suboperadores obrigações de proteção equivalentes às deste aditivo e responde por eles perante a CONTROLADORA.

### Cláusula 7ª. Transferência internacional
7.1. Parte dos suboperadores trata dados fora do Brasil (Anexo II). A transferência se apoia nas **cláusulas-padrão contratuais da ANPD** (Resolução CD/ANPD nº 19/2024), incorporadas aos contratos com esses suboperadores (art. 33, II, "b").
7.2. Para **dado de saúde** enviado a recursos de inteligência artificial, o OPERADOR adota retenção zero no fornecedor e retira identificadores diretos antes do envio, quando tecnicamente possível. A CONTROLADORA pode desligar esses recursos.

### Cláusula 8ª. Direitos dos titulares
8.1. O OPERADOR mantém no sistema as ferramentas de atendimento descritas em `direitos-titular.md` (confirmação, acesso, portabilidade, correção, anonimização e livro de solicitações).
8.2. Pedido de titular que chegue ao OPERADOR é repassado à CONTROLADORA em até **2 dias úteis**, sem resposta direta ao titular.
8.3. Quando a CONTROLADORA pedir apoio técnico (extração, eliminação), o OPERADOR atende em até **5 dias úteis**.

### Cláusula 9ª. Incidentes de segurança
9.1. O OPERADOR comunica à CONTROLADORA incidente que possa afetar os dados dela em até **24 horas** depois de tomar conhecimento, com o que se sabe até o momento, e complementa as informações conforme a apuração avança (art. 48).
9.2. A comunicação à ANPD e aos titulares cabe à CONTROLADORA. O OPERADOR fornece as informações e o apoio necessários dentro do prazo regulamentar (Resolução CD/ANPD nº 15/2024: 3 dias úteis).
9.3. O procedimento detalhado está em `incidentes.md` (B7).

### Cláusula 10ª. Retenção, devolução e eliminação
10.1. Durante o contrato, os prazos de retenção seguem a política aprovada pela CONTROLADORA (`retencao.md`), que ela pode ajustar no sistema.
10.2. No fim do contrato, o OPERADOR:
- (a) disponibiliza, por **30 dias**, a exportação completa dos dados em formato aberto;
- (b) depois disso, **elimina** os dados da CONTROLADORA do ambiente de produção;
- (c) entrega declaração de eliminação.

As cópias de segurança são eliminadas no ciclo normal de expiração, informado no Anexo III, e não podem ser restauradas para uso.
10.3. Fica ressalvada a guarda exigida por lei ao próprio OPERADOR (registros de acesso, Marco Civil, art. 15).

### Cláusula 11ª. Auditoria e prestação de contas
11.1. A CONTROLADORA pode, uma vez por ano ou após incidente, pedir evidências do cumprimento deste aditivo: relatórios, trilhas de auditoria, livro de exportações e registro de acessos técnicos. O OPERADOR as fornece em até 15 dias.
11.2. Os relatórios de impacto (RIPD) do **Anexo IV** ficam à disposição da CONTROLADORA e são revisados quando houver mudança relevante.

### Cláusula 12ª. Responsabilidade
12.1. Cada parte responde pelos danos que causar ao violar a LGPD, nos termos dos arts. 42 a 45. O OPERADOR responde solidariamente quando descumprir a lei ou as instruções lícitas da CONTROLADORA (art. 42, §1º, I).

### Cláusula 13ª. Vigência
13.1. Este aditivo vigora enquanto durar o contrato principal e, depois dele, enquanto houver dado da CONTROLADORA com o OPERADOR.

---

## Anexos (congelar em PDF na data da assinatura)

| Anexo | Conteúdo | Fonte viva |
|---|---|---|
| I | Registro das operações (finalidades, dados, titulares, bases legais) | `docs/lgpd/ropa.md` |
| II | Suboperadores, localização e transferência internacional | `docs/lgpd/suboperadores.md` |
| III | Medidas de segurança e cópias de segurança | `docs/lgpd/ripd-base-multitenant.md` (seções 3 e 5) + Onda E (`docs/operacao/`) |
| IV | Relatórios de impacto | `docs/lgpd/ripd-*.md` |
| V | Política de retenção | `docs/lgpd/retencao.md` |

## Pendências antes de usar este modelo

- Dados societários do Confluir (razão social, CNPJ, sede, contato de privacidade).
- Revisão jurídica, em especial das cláusulas 7 (transferência), 9 (prazos de incidente), 10 (backups) e 12 (responsabilidade).
- Concluir B7 (`incidentes.md`) e a documentação de backup da Onda E, que os anexos citam.
- Implementar o registro de acesso técnico do operador (cláusula 4.2), hoje uma lacuna (risco M3 da RIPD multi-entidade).
