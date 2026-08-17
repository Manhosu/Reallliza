# Auditoria da Arquitetura Funcional — Ecossistema Reallliza

> Levantamento pedido por **José (proprietário)** antes de reorganizar a árvore
> de menus. O objetivo declarado por ele: *"não quero reorganizar menus apenas
> olhando os nomes das opções, porque muitas funcionalidades podem depender
> umas das outras ou fazer parte de um mesmo fluxo operacional."*
>
> **Versão 2 — 17/08/2026.** A versão 1 (15/08) cobria as seis partes pedidas,
> mas com profundidade desigual: os dez atributos por item apareciam em cerca
> de um terço dos casos, e o módulo Feed estava descrito como um mural sem uso
> — no dia seguinte ele virou o maior módulo do sistema. Esta versão refaz o
> inventário com os dez atributos em **cada** item e recontou tudo no código.

---

## Como ler este documento

O José pediu, para cada módulo, menu, submenu ou página, **dez informações**.
Elas aparecem sempre na mesma ordem, em ficha:

| Campo | O que responde |
|---|---|
| **Finalidade** | para que a funcionalidade existe |
| **Na prática** | o que ela faz quando alguém a usa |
| **Cadastra / consulta / altera** | que informação ela produz e consome |
| **Depende de** | o que precisa existir antes dela |
| **Dependem dela** | o que quebra se ela sumir |
| **Fluxo** | a que processo maior pertence |
| **Tipo** | módulo principal · cadastro auxiliar · configuração · relatório · etapa de processo |
| **Semelhante a** | onde há redundância ou sobreposição |
| **Automação e integração** | regra de negócio ou serviço externo ligado |
| **Impacto se mexer** | o que considerar antes de mover, agrupar ou remover |

O campo **Impacto se mexer** é o que serve diretamente à reorganização de
menus, e por isso está preenchido em todos os itens — inclusive nos que não
têm impacto nenhum, onde dizer "nenhum" é a informação útil.

### Método

Tudo conferido no código e na produção, não de memória. As contagens de uso
vêm de consulta ao banco em 17/08/2026; as de estrutura, de varredura dos dois
repositórios. O anexo no fim traz os comandos para reproduzir cada número.

---

## Sumário executivo

**A plataforma são dois sistemas** com bancos separados e uma integração de
mão única: o **Garantias** (entrada por WhatsApp, tickets, triagem, perícia,
laudo, decisão da fábrica) e o **Reallliza** (execução: ordens de serviço,
equipes, agenda, ferramentas, financeiro). O aplicativo do profissional fala
só com o Reallliza.

| | Reallliza | Garantias |
|---|---|---|
| Itens de menu | **40** | **28**, sendo **5 atalhos externos** |
| Páginas | **59** no painel | **48** |
| Rotas de API | **228** em 48 pastas | **111** |
| Telas do aplicativo | **22** · 9 abas | — |
| Migrations | **70** (005–075) | — |
| Tabelas com dado | **52 de 103** | **25 de 60** |

**Cinco conclusões que importam para a reorganização:**

1. **`service_orders` é o eixo absoluto.** Mais de vinte tabelas apontam para
   ela. Qualquer agrupamento de menu que separe o que gira em torno dela
   espalha um fluxo único por vários lugares.

2. **`service_categories` é o eixo escondido.** Quatro automações leem dela —
   checklist, template de etapas, especialidade dominante e curso obrigatório.
   No menu ela aparece como cadastro auxiliar dentro de "Serviços", e é o
   segundo ponto mais crítico do sistema. **Este é o achado que mais afeta a
   reorganização.**

3. **Metade do sistema não tem dado.** 51 das 103 tabelas do Reallliza e 35 das
   60 do Garantias estão vazias. Isso é evidência de **adoção**, não de
   inutilidade — e a distinção precisa estar clara antes de alguém usar este
   documento para justificar remoções.

4. **A redundância entre os dois sistemas é estrutural, não pontual.** O
   Garantias tem cópias vazias de OS, orçamentos, serviços, cursos, ferramentas
   e pagamentos. Cinco módulos já foram resolvidos virando atalho; os demais
   continuam duplicados no código.

5. **A permissão é toda de aplicação.** Todas as rotas usam credencial de
   serviço e verificam o papel no código; a RLS só protege o acesso direto do
   aplicativo. **Reorganizar menu não muda permissão nenhuma** — quem souber a
   URL da API continua alcançando. Sem isso escrito, a reorganização passa uma
   falsa sensação de controle de acesso.

---

## 1. Auditoria Funcional — por domínio de negócio

Organizada por domínio, e não pela ordem do menu, porque a ordem atual é
justamente o que está em questão.

### 1.1 Comercial — da loja ao pedido pago

O parceiro pede um serviço, o sistema precifica, o cliente paga, e o pagamento
cria a ordem de serviço. É o único ponto onde dinheiro vira trabalho.

**Orçamentos** · **Propostas** · **Clientes** · **Serviços** · **Preços por
estado** · **Taxas de estadia**

### 1.2 Operacional — a execução

O núcleo. Ordem de serviço, designação, agenda, etapas, checklist, fotos,
assinatura e conclusão.

**Ordens de Serviço** · **Aguardando Designação** · **OSs Homologados** ·
**Agenda** · **Equipes** · **Mapa** · **Checklists** · **Templates de
Execução**

### 1.3 Rede de profissionais

Quem executa: cadastro, homologação, especialidade, nota, nível e o que cada
um pode receber.

**Usuários** · **Parceiros** · **Homologação** · **Especialidades** ·
**Qualidade** · **Níveis e Avaliação** · **Avaliações**

### 1.4 Almoxarifado

Ferramenta como ativo com custódia: catálogo, inventário por unidade, pedido,
aprovação, entrega, devolução, manutenção e baixa.

**Ferramentas** e suas nove abas internas

### 1.5 Conteúdo e capacitação

Comunicação com a rede e formação.

**Feed** · **Painel do Feed** · **Campanhas** · **Pedidos e moderação** ·
**Cursos** · **Aprendizado** · **Notificações**

### 1.6 Financeiro e gestão

**Financeiro** · **Financeiro (loja)** · **Fechamento Mensal** ·
**Relatórios** · **Relatórios (loja)** · **BI / Dashboards** · **Dashboard**

### 1.7 Configuração e governança

**Config. Globais** · **Regiões** · **Auditoria** · **Configurações** ·
**Chats** · **Garantias**

---

## 2. Inventário — ficha de cada item

### Reallliza — os 40 itens de menu

---

#### 1. Dashboard · `/dashboard` · admin, técnico, parceiro

| | |
|---|---|
| **Finalidade** | Primeira tela depois do login; dá a situação do dia sem obrigar a abrir módulo nenhum |
| **Na prática** | Conta OS por situação, mostra a evolução do mês, os próximos agendamentos e pendências |
| **Cadastra / consulta / altera** | Só consulta. Não grava nada |
| **Depende de** | `service_orders`, `schedules`, `quotes`, `profiles` |
| **Dependem dela** | Nada. É folha |
| **Fluxo** | Nenhum — é leitura sobre todos |
| **Tipo** | Painel (relatório de leitura) |
| **Semelhante a** | **BI / Dashboards** e **Relatórios** cobrem o mesmo terreno com outro recorte. Três entradas para "ver como estamos" |
| **Automação e integração** | Nenhuma |
| **Impacto se mexer** | Baixo. Mover não quebra nada; remover tira a porta de entrada e obriga a navegar até o módulo |

---

#### 2. Feed · `/feed` · admin, técnico, parceiro

| | |
|---|---|
| **Finalidade** | Canal oficial de conteúdo e campanhas para a rede de profissionais |
| **Na prática** | Administrador cria publicação com mídia, botão de ação, enquete, categoria e público; técnico e parceiro leem, reagem, comentam, salvam, compartilham, votam e pedem amostra |
| **Cadastra / consulta / altera** | Cadastra publicação, mídia, botão, enquete, comentário, reação, salvamento, voto, pedido (lead) e evento de métrica. Consulta perfil para resolver público |
| **Depende de** | `profiles` (segmentação), `feed_categories`, `feed_audience_rules`, `feed_sponsors`, `feed_campaigns`, armazenamento de mídia |
| **Dependem dela** | **Painel do Feed**, **Campanhas** e **Pedidos e moderação** — as três leem o que este módulo produz |
| **Fluxo** | Conteúdo → segmentação → publicação → interação → métrica → lead → conversão |
| **Tipo** | Módulo principal |
| **Semelhante a** | **Notificações** (aviso pontual) e o **Feed Corporativo do Garantias**, que virou atalho para cá em 17/08 |
| **Automação e integração** | Publicação agendada, encerramento automático, fixação com prazo, resolução e recálculo de audiência, notificação em lote via Expo Push, agregação de métricas — todas em rotina periódica |
| **Impacto se mexer** | **Alto.** É a maior superfície de API do sistema (30 rotas, contra 24 de ordens de serviço). As três telas de gestão são filhas dela: separá-las no menu sem indicar o parentesco esconde a relação |

---

#### 3. Painel do Feed · `/feed/painel` · admin

| | |
|---|---|
| **Finalidade** | Desempenho de conteúdo e campanhas, no formato que o mercado de mídia usa |
| **Na prática** | Dezoito indicadores, evolução diária/semanal/mensal, horários e dias de maior acesso, mapa das 27 UFs, rankings e desempenho por campanha |
| **Cadastra / consulta / altera** | Só consulta: `feed_post_daily_metrics`, `feed_post_reach`, `feed_events` |
| **Depende de** | **Feed** (sem publicação não há o que medir) e da rotina de agregação |
| **Dependem dela** | Nada. É folha |
| **Fluxo** | Conteúdo → métrica |
| **Tipo** | Relatório |
| **Semelhante a** | **BI / Dashboards**, com recorte diferente |
| **Automação e integração** | Lê o que a agregação periódica produz; não calcula na hora |
| **Impacto se mexer** | Baixo para mover. Se a rotina periódica parar, os números congelam sem aviso na tela |

---

#### 4. Campanhas · `/feed/campanhas` · admin

| | |
|---|---|
| **Finalidade** | Guarda-chuva comercial das publicações patrocinadas: quem paga, quanto, por quanto tempo e com que meta |
| **Na prática** | Cadastra patrocinador e campanha, com período, investimento, referência de contrato e metas; mostra entregue contra contratado |
| **Cadastra / consulta / altera** | `feed_sponsors`, `feed_campaigns`. Altera situação da campanha |
| **Depende de** | **Feed** (a peça) e da agregação (o entregue) |
| **Dependem dela** | **Feed** (a publicação aponta para a campanha) e **Pedidos** (o lead herda o patrocinador) |
| **Fluxo** | Comercial de mídia: patrocinador → campanha → peça → entrega → relatório |
| **Tipo** | Módulo principal |
| **Semelhante a** | Nada no sistema. É o único lugar com noção de contrato de mídia |
| **Automação e integração** | Encerrar campanha tira as peças do ar junto — peça patrocinada rodando depois do fim do contrato é entrega não cobrada |
| **Impacto se mexer** | Médio. Remover deixa a publicação patrocinada sem a quem prestar contas |

---

#### 5. Pedidos e moderação · `/feed/leads` · admin

| | |
|---|---|
| **Finalidade** | Duas filas de trabalho: o que chegou de pedido pelos botões e o que foi denunciado no feed |
| **Na prática** | Lista os pedidos com contato e origem, permite mudar a situação até "convertido"; e a fila de comentários denunciados, agrupada por comentário |
| **Cadastra / consulta / altera** | Altera `feed_leads.status` e o estado do comentário; consulta `feed_comment_reports` |
| **Depende de** | **Feed** (o botão que gera o pedido) e **Campanhas** (a quem o lead pertence) |
| **Dependem dela** | **Painel do Feed** — "Conversões" sai daqui |
| **Fluxo** | Conteúdo → clique → pedido → contato → conversão |
| **Tipo** | Etapa de processo (fila de trabalho) |
| **Semelhante a** | **Chats** e **Notificações** também são caixas de entrada, com naturezas diferentes |
| **Automação e integração** | A data da conversão é carimbada pelo banco, não digitada; contadores da publicação acompanham por gatilho |
| **Impacto se mexer** | Médio. Sem esta tela o lead entra e ninguém trabalha — e é o único número que o patrocinador compra |

---

#### 6. Ordens de Serviço · `/os` · admin, técnico

| | |
|---|---|
| **Finalidade** | O eixo da plataforma. Todo trabalho executado é uma OS |
| **Na prática** | Cria, lista, filtra, designa, acompanha etapas, fotos, checklist, assinatura e conclusão |
| **Cadastra / consulta / altera** | `service_orders`, `service_order_items`, `os_status_history`, `os_step_executions`, `photos`, `schedules` |
| **Depende de** | `profiles`, `teams`, `services`, `service_categories`, `partners`, `quotes` |
| **Dependem dela** | **Mais de vinte tabelas.** Agenda, Ferramentas (custódia), Financeiro, Qualidade, Avaliações, Garantias, Relatórios, Fechamento Mensal e o aplicativo inteiro |
| **Fluxo** | É o centro de todos os fluxos operacionais |
| **Tipo** | Módulo principal |
| **Semelhante a** | `ordens_servico` no Garantias — tabela vazia, cópia não usada |
| **Automação e integração** | Conversão de orçamento em OS por três caminhos, designação automática de equipe, agendamento em dias contíguos, automação por categoria, bloqueio por curso obrigatório, distribuição para homologados, recálculo de nota e nível, custódia de ferramenta, roteamento de garantia |
| **Impacto se mexer** | **Máximo.** Nada aqui pode ser movido sem revisar tudo que aponta para ela. É o item que deve ancorar a nova árvore |

---

#### 7. Aguardando Designação · `/os/designacao` · admin

| | |
|---|---|
| **Finalidade** | Fila das OS que existem e ainda não têm quem execute |
| **Na prática** | Lista as OS na situação `awaiting_assignment` e permite designar equipe ou profissional |
| **Cadastra / consulta / altera** | Altera `service_orders.assigned_*` e a situação |
| **Depende de** | **Ordens de Serviço**, **Equipes** |
| **Dependem dela** | **Agenda** — a designação é o que cria o agendamento |
| **Fluxo** | OS criada → designação → agenda → execução |
| **Tipo** | Etapa de processo |
| **Semelhante a** | É um filtro de **Ordens de Serviço** promovido a item de menu |
| **Automação e integração** | A designação dispara a automação por categoria — provisiona etapas e checklist. Esta rota escapa do gatilho de mudança de situação, então a automação é chamada aqui explicitamente |
| **Impacto se mexer** | Médio. Agrupar sob Ordens de Serviço é natural; **remover a tela esconde a fila**, e 12 das 41 OS estão nesse estado |

---

#### 8. OSs Homologados · `/os/homologados` · admin

| | |
|---|---|
| **Finalidade** | Consulta separada das OS executadas pela rede homologada |
| **Na prática** | Mesma lista de OS, com filtro fixo de rede externa |
| **Cadastra / consulta / altera** | Só consulta |
| **Depende de** | **Ordens de Serviço**, **Homologação** |
| **Dependem dela** | Nada |
| **Fluxo** | Distribuição a homologados → aceite → execução → custódia → repasse |
| **Tipo** | Relatório (consulta filtrada) |
| **Semelhante a** | **Ordens de Serviço** com filtro. Terceira entrada para a mesma tabela, junto com Designação |
| **Automação e integração** | Nenhuma própria |
| **Impacto se mexer** | Baixo. Candidata natural a virar filtro salvo dentro de Ordens de Serviço |

---

#### 9. Orçamentos · `/orcamentos` · admin, parceiro

| | |
|---|---|
| **Finalidade** | Onde o trabalho é precificado e vendido |
| **Na prática** | Monta itens, calcula deslocamento, estadia, hora especial e taxa da plataforma; envia para pagamento |
| **Cadastra / consulta / altera** | `quotes`, `quote_items`, `payments` |
| **Depende de** | **Serviços**, **Preços por estado**, **Taxas de estadia**, **Parceiros**, geocodificação |
| **Dependem dela** | **Ordens de Serviço** — `quotes.service_order_id` é o **único elo** entre o comercial e o operacional |
| **Fluxo** | Loja → orçamento → pagamento → OS |
| **Tipo** | Módulo principal |
| **Semelhante a** | **Propostas** (proposta a homologados) e `orcamentos` no Garantias, vazia |
| **Automação e integração** | Precificação com geocodificação em cascata; cobrança e webhook Asaas; **três caminhos convergem na conversão em OS** — webhook, pagamento sem gateway e confirmação manual |
| **Impacto se mexer** | **Alto.** É a fronteira entre vender e executar |

---

#### 10. Clientes · `/clientes` · parceiro

| | |
|---|---|
| **Finalidade** | Lista de clientes da loja parceira |
| **Na prática** | Só leitura — a lista é derivada dos orçamentos, não há cadastro próprio |
| **Cadastra / consulta / altera** | Nada. Consulta `quotes` agrupado por cliente |
| **Depende de** | **Orçamentos** |
| **Dependem dela** | Nada |
| **Fluxo** | Comercial |
| **Tipo** | Relatório |
| **Semelhante a** | É uma visão de **Orçamentos** |
| **Automação e integração** | Nenhuma |
| **Impacto se mexer** | Nenhum. Remover não perde dado — a origem continua em Orçamentos |

---

#### 11. Propostas · `/propostas` · admin

| | |
|---|---|
| **Finalidade** | Distribuir trabalho à rede homologada e deixar o primeiro aceite levar |
| **Na prática** | Cria a proposta, dispara para os homologados do estado, registra o aceite |
| **Cadastra / consulta / altera** | `service_proposals` |
| **Depende de** | **Homologação**, **Ordens de Serviço**, `profiles.uf` |
| **Dependem dela** | **OSs Homologados** |
| **Fluxo** | Proposta → distribuição por UF → primeiro aceite → execução → custódia → repasse |
| **Tipo** | Etapa de processo |
| **Semelhante a** | **Orçamentos** — os dois vendem trabalho, para públicos diferentes |
| **Automação e integração** | Distribuição por UF; o primeiro aceite fecha para os demais |
| **Impacto se mexer** | Médio. Depende de UF preenchida no perfil — hoje só 5 dos 22 têm |

---

#### 12. Garantias · `/garantias` · admin, técnico, parceiro

| | |
|---|---|
| **Finalidade** | Acompanhar, do lado do Reallliza, o que nasce como reclamação no sistema Garantias |
| **Na prática** | Lista as garantias e o que virou OS |
| **Cadastra / consulta / altera** | `warranties` — **tabela vazia em produção** |
| **Depende de** | Integração com o Garantias |
| **Dependem dela** | Nada |
| **Fluxo** | Ticket → triagem → perícia → laudo → decisão da fábrica → OS |
| **Tipo** | Módulo principal (sem uso) |
| **Semelhante a** | O sistema Garantias inteiro |
| **Automação e integração** | Roteamento de garantia; recebe do Garantias por chave de API |
| **Impacto se mexer** | Baixo hoje, por falta de uso — mas é a ponta de um fluxo entre sistemas. Remover fecharia a porta de entrada da integração |

---

#### 13. Relatórios (loja) · `/relatorios-loja` · parceiro

| | |
|---|---|
| **Finalidade** | O que a loja parceira precisa prestar de contas |
| **Na prática** | Relatório por OS, com fotos e assinatura, exportável |
| **Cadastra / consulta / altera** | Só consulta |
| **Depende de** | **Ordens de Serviço**, **Fotos** |
| **Dependem dela** | Nada |
| **Fluxo** | Execução → prestação de contas |
| **Tipo** | Relatório |
| **Semelhante a** | **Relatórios** (admin) — mesmo conteúdo, público diferente |
| **Automação e integração** | Geração de PDF |
| **Impacto se mexer** | Baixo. Consolidar com Relatórios exige separar por papel |

---

#### 14. Financeiro (loja) · `/financeiro-loja` · parceiro

| | |
|---|---|
| **Finalidade** | O que a loja pagou e o que deve |
| **Na prática** | Lista pagamentos e faturas da loja |
| **Cadastra / consulta / altera** | Consulta `payments`, `invoices` |
| **Depende de** | **Orçamentos**, **Ordens de Serviço** |
| **Dependem dela** | Nada |
| **Fluxo** | Comercial → financeiro |
| **Tipo** | Relatório |
| **Semelhante a** | **Financeiro** (admin) |
| **Automação e integração** | Asaas |
| **Impacto se mexer** | Baixo |

---

#### 15. Chats · `/chats` · admin

| | |
|---|---|
| **Finalidade** | Conversas entre administração e profissional, por OS |
| **Na prática** | Lista as conversas e abre o histórico |
| **Cadastra / consulta / altera** | `os_messages` — **tabela vazia** |
| **Depende de** | **Ordens de Serviço** |
| **Dependem dela** | Nada |
| **Fluxo** | Execução |
| **Tipo** | Módulo principal (sem uso) |
| **Semelhante a** | **Notificações**; e o Chat do aplicativo, que é a mesma conversa pelo outro lado |
| **Automação e integração** | Tempo real por assinatura do banco |
| **Impacto se mexer** | Baixo hoje. A rota que a tela consumia não existia e foi criada em 16/08 — antes disso a lista quebrava ao abrir |

---

#### 16. Agenda · `/agenda` · admin, técnico

| | |
|---|---|
| **Finalidade** | Quando cada trabalho acontece e quem está ocupado |
| **Na prática** | Calendário por equipe e por profissional, com disponibilidade |
| **Cadastra / consulta / altera** | `schedules` |
| **Depende de** | **Ordens de Serviço**, **Equipes**, **Feriados** |
| **Dependem dela** | O aplicativo (aba Agenda) |
| **Fluxo** | Designação → agenda → execução |
| **Tipo** | Módulo principal |
| **Semelhante a** | O calendário de equipe em `/equipes/[id]/calendario` |
| **Automação e integração** | Agendamento em dias contíguos; bloqueio de dia já ocupado; feriados |
| **Impacto se mexer** | **Alto.** É onde a operação se organiza no tempo |

---

#### 17. Mapa · `/mapa` · admin

| | |
|---|---|
| **Finalidade** | Onde estão as OS e os profissionais |
| **Na prática** | Mapa com marcadores de OS e última posição conhecida |
| **Cadastra / consulta / altera** | Consulta `service_orders`, `technician_locations` |
| **Depende de** | **Ordens de Serviço**, rastreamento do aplicativo |
| **Dependem dela** | Nada |
| **Fluxo** | Execução |
| **Tipo** | Relatório |
| **Semelhante a** | O mapa do Brasil no **Painel do Feed**, com finalidade diferente |
| **Automação e integração** | Google Maps; posição enviada pelo aplicativo |
| **Impacto se mexer** | Baixo |

---

#### 18. Usuários · `/usuarios` · admin

| | |
|---|---|
| **Finalidade** | Quem tem acesso e com que papel |
| **Na prática** | Cadastra, edita, ativa e desativa; define papel |
| **Cadastra / consulta / altera** | `profiles` |
| **Depende de** | Autenticação |
| **Dependem dela** | **Tudo.** `profiles` é referenciada por praticamente todo o sistema |
| **Fluxo** | Nenhum — é base |
| **Tipo** | Cadastro auxiliar (na prática, base) |
| **Semelhante a** | **Parceiros** e **Homologação** também mexem em pessoas |
| **Automação e integração** | Criação no serviço de autenticação; consentimentos |
| **Impacto se mexer** | **Máximo.** Nada funciona sem `profiles` |

---

#### 19. Parceiros · `/parceiros` · admin

| | |
|---|---|
| **Finalidade** | As lojas que trazem trabalho |
| **Na prática** | Cadastra a empresa e vincula o usuário que a representa |
| **Cadastra / consulta / altera** | `partners` |
| **Depende de** | **Usuários** |
| **Dependem dela** | **Orçamentos**, **Ordens de Serviço**, segmentação do **Feed** |
| **Fluxo** | Comercial |
| **Tipo** | Cadastro auxiliar |
| **Semelhante a** | `feed_sponsors` — patrocinador e loja podem ser a mesma empresa em papéis diferentes |
| **Automação e integração** | Nenhuma |
| **Impacto se mexer** | Médio |

---

#### 20. Equipes · `/equipes` · admin

| | |
|---|---|
| **Finalidade** | Agrupar profissionais que trabalham juntos |
| **Na prática** | Monta a equipe, define líder, consulta o calendário dela |
| **Cadastra / consulta / altera** | `teams`, `team_members` |
| **Depende de** | **Usuários** |
| **Dependem dela** | **Agenda**, **Designação**, segmentação do **Feed** |
| **Fluxo** | Designação → agenda |
| **Tipo** | Cadastro auxiliar |
| **Semelhante a** | Nada |
| **Automação e integração** | Designação automática de equipe; disponibilidade |
| **Impacto se mexer** | Médio |

---

#### 21. Homologação · `/homologacao` · admin

| | |
|---|---|
| **Finalidade** | Aprovar o profissional externo antes de ele receber trabalho |
| **Na prática** | Analisa a solicitação, aprova ou recusa |
| **Cadastra / consulta / altera** | `homologation_requests` — **tabela vazia** |
| **Depende de** | **Usuários** |
| **Dependem dela** | **Propostas**, **OSs Homologados**, segmentação do **Feed** |
| **Fluxo** | Cadastro público → homologação → especialidade → nível → elegibilidade |
| **Tipo** | Etapa de processo |
| **Semelhante a** | **Usuários** e **Qualidade** |
| **Automação e integração** | Aprovar libera a distribuição de propostas |
| **Impacto se mexer** | Médio. Sem uso hoje, mas é o portão da rede externa |

---

#### 22. Ferramentas · `/ferramentas` · admin, técnico

| | |
|---|---|
| **Finalidade** | Ferramenta como ativo com dono e responsável |
| **Na prática** | Nove abas: catálogo, inventário, pedidos, custódias, devoluções, manutenção, baixas, busca e unidades |
| **Cadastra / consulta / altera** | `tool_inventory`, `tool_units`, `tool_requests`, `tool_custody`, `tool_events` |
| **Depende de** | **Usuários**, **Ordens de Serviço** (a custódia é por OS) |
| **Dependem dela** | **Financeiro** (repasse desconta ferramenta não devolvida) |
| **Fluxo** | Pedido → aprovação → separação → entrega → custódia → devolução |
| **Tipo** | Módulo principal |
| **Semelhante a** | `ferramentas` no Garantias, vazia |
| **Automação e integração** | Custódia amarrada à OS; eventos de ferramenta; tipo de aviso de atraso existe e **nenhuma rotina o dispara** |
| **Impacto se mexer** | Médio. As abas `unidades` e `unidades/[id]` **estão fora da barra de abas** do próprio módulo — alcançáveis só por link interno |

---

#### 23. Checklists · `/checklists` · admin, técnico

| | |
|---|---|
| **Finalidade** | O que precisa ser conferido em cada tipo de serviço |
| **Na prática** | Monta o modelo de checklist e seus itens |
| **Cadastra / consulta / altera** | `checklist_templates`, `checklists`, `specialty_checklist_items` |
| **Depende de** | **Especialidades**, **Serviços** |
| **Dependem dela** | **Ordens de Serviço** — a automação por categoria provisiona o checklist |
| **Fluxo** | Execução |
| **Tipo** | Cadastro auxiliar |
| **Semelhante a** | **Templates de Execução** — os dois definem "o que fazer" |
| **Automação e integração** | Provisionado automaticamente pela categoria de serviço |
| **Impacto se mexer** | Médio. É lido por `service_categories.checklist_template_id` |

---

#### 24. Templates de Execução · `/templates-execucao` · admin

| | |
|---|---|
| **Finalidade** | O roteiro de etapas que o profissional segue no aplicativo |
| **Na prática** | Monta grupos e etapas, com foto obrigatória e ordem |
| **Cadastra / consulta / altera** | `step_template_groups`, `step_template_items` |
| **Depende de** | **Serviços**, **Especialidades** |
| **Dependem dela** | **Ordens de Serviço**, aplicativo (telas de etapa) |
| **Fluxo** | Execução |
| **Tipo** | Cadastro auxiliar |
| **Semelhante a** | **Checklists** |
| **Automação e integração** | Provisionado por `service_categories.step_template_group_id`; **duas rotas provisionam etapas**; rascunho não pode ser vinculado a OS (trava no banco) |
| **Impacto se mexer** | Médio-alto. Mudar o template não altera OS já provisionada |

---

#### 25. Serviços · `/servicos` · admin

| | |
|---|---|
| **Finalidade** | O catálogo do que a plataforma executa e por quanto |
| **Na prática** | Cadastra serviço, preço por estado e — dentro dele — a **categoria de serviço** |
| **Cadastra / consulta / altera** | `services`, `service_categories`, `servico_precos` |
| **Depende de** | **Especialidades**, **Checklists**, **Templates**, **Cursos** |
| **Dependem dela** | **Orçamentos**, **Ordens de Serviço** e, por meio de `service_categories`, **quatro automações** |
| **Fluxo** | Comercial e operacional |
| **Tipo** | Cadastro auxiliar — **e é aqui que está o problema de arquitetura** |
| **Semelhante a** | `servicos` no Garantias, vazia |
| **Automação e integração** | `service_categories` carrega `checklist_template_id`, `step_template_group_id`, `specialty_id` e `required_course_ids[]`. Alimenta conversão de orçamento, mudança de situação, designação e bloqueio por curso |
| **Impacto se mexer** | **Alto e subestimado.** No menu parece cadastro auxiliar; é o segundo eixo do sistema. **Deve ganhar lugar próprio na nova árvore** |

---

#### 26. Regiões · `/regioes` · admin

| | |
|---|---|
| **Finalidade** | Áreas de atuação, por nome e UF |
| **Na prática** | Cadastro simples |
| **Cadastra / consulta / altera** | `regions` — **tabela vazia** |
| **Depende de** | Nada |
| **Dependem dela** | Nada hoje |
| **Fluxo** | Nenhum |
| **Tipo** | Cadastro auxiliar |
| **Semelhante a** | `profiles.operating_region` (texto livre) e `br_ufs.region` (macro-região do IBGE, usada pelo Feed). **Três noções de região convivendo** |
| **Automação e integração** | Nenhuma |
| **Impacto se mexer** | Nenhum hoje. **Mas é o caso mais claro de redundância a resolver antes de reorganizar** |

---

#### 27. Especialidades · `/especialidades` · admin

| | |
|---|---|
| **Finalidade** | O que cada profissional sabe fazer |
| **Na prática** | Cadastra a especialidade e a associa a serviços e checklists |
| **Cadastra / consulta / altera** | `specialties`, `technician_specialty_scores` |
| **Depende de** | Nada |
| **Dependem dela** | **Designação**, **Níveis**, segmentação do **Feed**, `service_categories.specialty_id` |
| **Fluxo** | Rede de profissionais |
| **Tipo** | Cadastro auxiliar |
| **Semelhante a** | `especialidades` no Garantias (7 linhas — as duas em uso, separadas) |
| **Automação e integração** | Nota por especialidade; especialidade dominante alimenta o recorte de métrica do Feed |
| **Impacto se mexer** | Médio-alto |

---

#### 28. Qualidade · `/qualidade` · admin

| | |
|---|---|
| **Finalidade** | Avaliar tecnicamente o trabalho entregue |
| **Na prática** | Formulário de avaliação por OS |
| **Cadastra / consulta / altera** | `quality_evaluations`, `quality_evaluation_scores` — **vazias** |
| **Depende de** | **Ordens de Serviço** |
| **Dependem dela** | **Níveis e Avaliação** |
| **Fluxo** | Execução → qualidade → nível |
| **Tipo** | Etapa de processo |
| **Semelhante a** | **Avaliações** e **Níveis** — **três entradas para o mesmo eixo** |
| **Automação e integração** | Alimenta o recálculo de nota |
| **Impacto se mexer** | Baixo hoje. Consolidar as três é a maior oportunidade de simplificação do menu |

---

#### 29. Níveis e Avaliação · `/niveis` · admin

| | |
|---|---|
| **Finalidade** | Regras que transformam desempenho em nível |
| **Na prática** | Configura pesos e faixas de bronze a diamante |
| **Cadastra / consulta / altera** | `level_config`, `evaluation_weights` |
| **Depende de** | **Qualidade**, **Avaliações**, **Ordens de Serviço** |
| **Dependem dela** | Elegibilidade a proposta; segmentação do **Feed** por ranking |
| **Fluxo** | Rede de profissionais |
| **Tipo** | Configuração |
| **Semelhante a** | **Qualidade**, **Avaliações** |
| **Automação e integração** | Recálculo de nota e nível. **Certificações entram no cálculo fixadas em zero** — o critério existe e nunca pontua |
| **Impacto se mexer** | Médio |

---

#### 30. Avaliações · `/avaliacoes` · admin

| | |
|---|---|
| **Finalidade** | A nota que o cliente dá |
| **Na prática** | Lista as avaliações recebidas por link público |
| **Cadastra / consulta / altera** | `professional_ratings`, `customer_ratings` |
| **Depende de** | **Ordens de Serviço** |
| **Dependem dela** | **Níveis** |
| **Fluxo** | Execução → avaliação → nível |
| **Tipo** | Relatório |
| **Semelhante a** | **Qualidade**, **Níveis** |
| **Automação e integração** | Link público por token, sem login |
| **Impacto se mexer** | Baixo |

---

#### 31. Relatórios · `/relatorios` · admin

| | |
|---|---|
| **Finalidade** | Prestação de contas e exportação |
| **Na prática** | Relatórios operacionais em PDF e planilha |
| **Cadastra / consulta / altera** | Só consulta |
| **Depende de** | **Ordens de Serviço**, **Financeiro** |
| **Dependem dela** | Nada |
| **Fluxo** | Todos |
| **Tipo** | Relatório |
| **Semelhante a** | **BI / Dashboards**, **Dashboard**, **Relatórios (loja)** |
| **Automação e integração** | Geração de PDF |
| **Impacto se mexer** | Baixo |

---

#### 32. Financeiro · `/financeiro` · admin

| | |
|---|---|
| **Finalidade** | Dinheiro que entra e sai |
| **Na prática** | Pagamentos, faturas, repasses e custódia financeira |
| **Cadastra / consulta / altera** | `payments`, `invoices`, `accounts_payable`, `accounts_receivable` (as duas últimas **vazias**) |
| **Depende de** | **Orçamentos**, **Ordens de Serviço** |
| **Dependem dela** | **Fechamento Mensal** |
| **Fluxo** | Comercial → execução → financeiro |
| **Tipo** | Módulo principal |
| **Semelhante a** | **Financeiro (loja)** |
| **Automação e integração** | Asaas: cobrança, webhook e transferência; repasse desconta ferramenta não devolvida; emissão de NFe |
| **Impacto se mexer** | **Alto** |

---

#### 33. BI / Dashboards · `/bi` · admin

| | |
|---|---|
| **Finalidade** | Visão analítica além do dia a dia |
| **Na prática** | Painéis agregados |
| **Cadastra / consulta / altera** | Só consulta |
| **Depende de** | Praticamente tudo |
| **Dependem dela** | Nada |
| **Fluxo** | Nenhum |
| **Tipo** | Relatório |
| **Semelhante a** | **Dashboard**, **Relatórios**, **Painel do Feed** |
| **Automação e integração** | Nenhuma |
| **Impacto se mexer** | Baixo. Candidato a consolidação |

---

#### 34. Fechamento Mensal · `/fechamento-mensal` · admin

| | |
|---|---|
| **Finalidade** | Fechar o mês e travar o que já foi apurado |
| **Na prática** | Consolida o mês e impede alteração retroativa |
| **Cadastra / consulta / altera** | `monthly_closing` |
| **Depende de** | **Financeiro** |
| **Dependem dela** | Nada |
| **Fluxo** | Financeiro |
| **Tipo** | Etapa de processo |
| **Semelhante a** | Nada |
| **Automação e integração** | Trava o período |
| **Impacto se mexer** | Médio — mexe em dado consolidado |

---

#### 35. Config. Globais · `/configuracoes-globais` · admin

| | |
|---|---|
| **Finalidade** | Parâmetros da empresa e da plataforma |
| **Na prática** | Dados da empresa, taxa da plataforma, estados atendidos, feriados |
| **Cadastra / consulta / altera** | `company_settings`, `platform_states`, `state_stay_rates`, `public_holidays` |
| **Depende de** | Nada |
| **Dependem dela** | **Orçamentos** (precificação), **Agenda** (feriados) |
| **Fluxo** | Base |
| **Tipo** | Configuração |
| **Semelhante a** | **Configurações** (do usuário) |
| **Automação e integração** | Alimenta o cálculo de preço |
| **Impacto se mexer** | **Alto e invisível.** Mudar taxa ou estado atendido altera todo orçamento novo |

---

#### 36. Cursos · `/cursos` · admin

| | |
|---|---|
| **Finalidade** | Formação da rede |
| **Na prática** | Monta curso, módulos, aulas e questionário |
| **Cadastra / consulta / altera** | `courses`, `course_modules`, `course_lessons` — **todas vazias** |
| **Depende de** | Nada |
| **Dependem dela** | **Serviços** (curso obrigatório por categoria), segmentação do **Feed**, **Certificações** |
| **Fluxo** | Rede de profissionais |
| **Tipo** | Módulo principal (sem uso) |
| **Semelhante a** | `cursos` no Garantias, vazia — **duplicação completa** |
| **Automação e integração** | `service_categories.required_course_ids[]` bloqueia designação de quem não concluiu |
| **Impacto se mexer** | Médio. Sem uso, mas amarrado à designação |

---

#### 37. Aprendizado · `/aprendizado` · técnico

| | |
|---|---|
| **Finalidade** | O lado do aluno |
| **Na prática** | Assiste aula, responde questionário, acompanha progresso |
| **Cadastra / consulta / altera** | `course_enrollments`, `lesson_progress` — **vazias** |
| **Depende de** | **Cursos** |
| **Dependem dela** | Elegibilidade por curso |
| **Fluxo** | Rede de profissionais |
| **Tipo** | Módulo principal (sem uso) |
| **Semelhante a** | Aba "Cursos" do aplicativo — mesma função |
| **Automação e integração** | Conclusão libera designação |
| **Impacto se mexer** | Baixo hoje |

---

#### 38. Auditoria · `/auditoria` · admin

| | |
|---|---|
| **Finalidade** | Quem fez o quê |
| **Na prática** | Registro de ações, com filtro |
| **Cadastra / consulta / altera** | `audit_logs` — **909 linhas, o segundo maior volume do sistema** |
| **Depende de** | Nada |
| **Dependem dela** | Nada |
| **Fluxo** | Governança |
| **Tipo** | Relatório |
| **Semelhante a** | Nada |
| **Automação e integração** | Gravado por praticamente toda rota de escrita |
| **Impacto se mexer** | Baixo para mover. **Não remover** — é a prova de quem alterou o quê |

---

#### 39. Notificações · `/notificacoes` · admin, técnico, parceiro

| | |
|---|---|
| **Finalidade** | Avisos ao usuário |
| **Na prática** | Lista as notificações e marca como lida |
| **Cadastra / consulta / altera** | `notifications` (300 linhas), `device_tokens` (**zero**) |
| **Depende de** | Todos os módulos que avisam |
| **Dependem dela** | **Feed** (notificação de campanha) |
| **Fluxo** | Todos |
| **Tipo** | Módulo principal |
| **Semelhante a** | **Chats**, **Feed** |
| **Automação e integração** | Expo Push em lote de 100. **Nenhum aparelho registrado** — 300 notificações criadas, zero entregues no celular |
| **Impacto se mexer** | Médio. O canal existe e **nunca chegou a ninguém no celular** |

---

#### 40. Configurações · `/configuracoes` · admin, técnico, parceiro

| | |
|---|---|
| **Finalidade** | Preferências e dados do próprio usuário |
| **Na prática** | Perfil, senha, tema, consentimentos |
| **Cadastra / consulta / altera** | `profiles`, `user_consents` |
| **Depende de** | **Usuários** |
| **Dependem dela** | Nada |
| **Fluxo** | Nenhum |
| **Tipo** | Configuração |
| **Semelhante a** | **Config. Globais** — nomes parecidos, escopos opostos (**um do usuário, outro da empresa**) |
| **Automação e integração** | LGPD |
| **Impacto se mexer** | Baixo. **Renomear resolveria a confusão com Config. Globais** |

---

### Páginas fora do menu — Reallliza

| Página | Situação |
|---|---|
| `/solicitacoes` | **Única órfã de verdade.** Zero links de entrada; o item de menu foi removido e o arquivo continua no build. Candidata a consolidação com Orçamentos ou remoção |
| `/ferramentas/unidades` e `/unidades/[id]` | Existem **fora das nove abas** do próprio módulo de Ferramentas; alcançáveis só por link interno do Inventário |
| 17 sub-rotas de detalhe | `/os/[id]`, `/os/nova`, `/orcamentos/[id]`, `/orcamentos/novo`, `/cursos/[id]`, `/aprendizado/[id]`, `/equipes/[id]/calendario`, `/relatorios-loja/[osId]` e as 8 abas de Ferramentas. Todas alcançáveis pelo módulo pai — **não são órfãs**, são o miolo dos módulos |

---

### Garantias — os 28 itens de menu

O modelo de papéis diverge: **9 papéis** aqui (admin, operador, gestor,
diretor, periciador, fábrica, supervisor da fábrica, qualidade da fábrica e a
área do aluno) contra **3** no Reallliza. Isso por si só é um ponto de decisão
para a nova arquitetura.

| # | Item | Finalidade / na prática | Tipo | Depende de | Dependem dela | Uso | Impacto se mexer |
|---|---|---|---|---|---|---|---|
| 1 | **Dashboard** | Situação dos tickets e SLA | Painel | tickets | — | ativo | baixo |
| 2 | **Tickets** | O eixo daqui: reclamação que entra vira ticket | Módulo principal | perfis, lojas | Triagem, Perícia, Fábrica, Chats | **14** | **máximo** |
| 3 | **Chats** | Conversa do ticket, inclusive por WhatsApp | Módulo principal | Tickets | IA | **271 mensagens** | alto |
| 4 | **Triagem** | Classificar e encaminhar o que chegou | Etapa de processo | Tickets | Perícia | ativo | alto |
| 5 | **Suporte Operacional** | Apoio ao atendimento | Etapa de processo | Tickets | — | ativo | médio |
| 6 | **IA & Integrações** | Atendimento automático de primeiro nível | Módulo principal | Chats | Chats | **10 diretrizes** | alto |
| 7 | **Perícia & Laudos** | Vistoria técnica e parecer | Módulo principal | Tickets | Fábrica | **8 laudos, 35 versões** | **alto** |
| 8 | **Fábrica** | Decisão do fabricante sobre a garantia | Etapa de processo | Laudos | Logística | **7 decisões** | alto |
| 9 | **Logística & OS** | Encaminhar o que virou serviço | Etapa de processo | Fábrica | Reallliza | ativo | alto |
| 10 | **Ordens de Serviço** ↗ | **Atalho** para o Reallliza | Atalho | — | — | — | nenhum |
| 11 | **Agenda** | Agendamento da perícia | Módulo principal | Perícia | — | **6** | médio |
| 12 | **Ferramentas** ↗ | **Atalho** para o Reallliza | Atalho | — | — | — | nenhum |
| 13 | **Serviços** ↗ | **Atalho** para o Reallliza | Atalho | — | — | — | nenhum |
| 14 | **Feed Corporativo** ↗ | **Atalho desde 17/08** — antes era feed próprio, com tabela própria e sincronização | Atalho | — | — | tabela **vazia** | nenhum agora |
| 15 | **Aprendizado** | Lado do aluno | Módulo | Cursos | — | **vazio** | baixo |
| 16 | **Cursos** | Gestão de curso | Módulo | — | Aprendizado | **vazio** | baixo — **duplica o Reallliza** |
| 17 | **Meus Cursos** | Matrículas do usuário | Consulta | Cursos | — | **vazio** | baixo |
| 18 | **Avaliações** | Avaliação técnica | Etapa de processo | Tickets | — | **vazio** | baixo |
| 19 | **Financeiro** | Custo e receita da garantia | Módulo | Tickets | — | **vazio** | baixo |
| 20 | **BI & Relatórios** | Análise | Relatório | tudo | — | ativo | baixo |
| 21 | **Segurança** | Políticas de acesso | Configuração | Permissões | tudo | **59 vínculos** | **alto** |
| 22 | **Configurações** | Parâmetros do sistema | Configuração | — | SLA | **4 SLAs** | médio |
| 23 | **Usuários** | Quem acessa | Cadastro auxiliar | autenticação | tudo | **7 perfis** | **alto** |
| 24 | **Permissões** | Papel × permissão | Configuração | Usuários | Segurança | **21** | **alto** |
| 25 | **Roteiros da IA** | O que a IA responde | Configuração | IA | Chats | **17** | alto |
| 26 | **Técnicos** | Rede que atende garantia | Cadastro auxiliar | Usuários | Perícia | ativo | médio |
| 27 | **Lojas Parceiras** | Lojas do lado da garantia | Cadastro auxiliar | Usuários | Tickets | ativo | médio — **duplica Parceiros** |
| 28 | **Homologação** ↗ | **Atalho** para o Reallliza | Atalho | — | — | — | nenhum |

Todos pertencem ao **fluxo de garantia**, exceto os cinco atalhos e o bloco de
capacitação.

---

### Aplicativo do profissional — 22 telas, 9 abas

O aplicativo fala **só com o Reallliza**. O técnico enxerga 7 abas; o parceiro,
5. Nenhuma tela é órfã: todas estão registradas em um dos seis navegadores.

| Aba / tela | Finalidade | Depende de | Fluxo | Impacto se mexer |
|---|---|---|---|---|
| **Início** (Feed) | Conteúdo e campanhas; é o ponto de contato diário | Feed | conteúdo | alto — a tela mais aberta |
| ↳ Comentários | Comentar publicação | Feed | conteúdo | baixo |
| **Serviços** (Home) | As OS do profissional | Ordens de Serviço | execução | **máximo** |
| ↳ Detalhe da OS | Tudo sobre a OS | OS | execução | máximo |
| ↳ Etapas · Detalhe da etapa | Roteiro de execução | Templates de Execução | execução | alto |
| ↳ Checklist | Conferência do serviço | Checklists | execução | alto |
| ↳ Câmera · Assinatura · Vistoria | Prova do trabalho feito | Fotos | execução | alto |
| ↳ Chat | Conversa da OS | Chats | execução | médio |
| **Perícias** | Vistorias atribuídas | OS do tipo perícia | garantia | médio |
| **Cursos** | Formação | Cursos | capacitação | baixo (sem uso) |
| **Propostas** (só parceiro) | Propostas da loja | Propostas | comercial | médio |
| **Agenda** | Compromissos do profissional | Agenda | execução | alto |
| **Custódia** (Ferramentas) | Ferramenta sob responsabilidade | Ferramentas | almoxarifado | médio |
| ↳ Pedido de ferramenta | Solicitar ferramenta | Ferramentas | almoxarifado | médio |
| **Notificações** (aba oculta) | Avisos | Notificações | todos | médio |
| **Perfil** | Dados e sair | Usuários | base | baixo |
| Login · Esqueci a senha · Termos | Entrada e consentimento | autenticação | base | **máximo** |

---

## 3. Árvore atual

### 3.1 Reallliza — 40 itens

```
Dashboard
Feed ──────────────── Painel do Feed · Campanhas · Pedidos e moderação
Ordens de Serviço ─── Aguardando Designação · OSs Homologados
Orçamentos · Clientes (loja) · Propostas
Garantias
Relatórios (loja) · Financeiro (loja)
Chats · Agenda · Mapa
Usuários · Parceiros · Equipes · Homologação
Ferramentas ───────── catálogo · inventário · pedidos · custódias ·
                      devoluções · manutenção · baixas · busca
                      (unidades fica FORA da barra de abas)
Checklists · Templates de Execução · Serviços · Regiões · Especialidades
Qualidade · Níveis e Avaliação · Avaliações
Relatórios · Financeiro · BI / Dashboards · Fechamento Mensal
Config. Globais · Cursos · Aprendizado
Auditoria · Notificações · Configurações
```

Por papel: **administrador 33** · **técnico 9** · **parceiro 8**.

### 3.2 Garantias — 28 itens, 5 deles externos

```
Dashboard · Tickets · Chats · Triagem · Suporte Operacional
IA & Integrações · Roteiros da IA
Perícia & Laudos · Fábrica · Logística & OS
Ordens de Serviço ↗ · Ferramentas ↗ · Serviços ↗ · Homologação ↗
Feed Corporativo ↗                       (↗ abre o Reallliza em outra aba)
Agenda
Aprendizado · Cursos · Meus Cursos
Avaliações · Financeiro · BI & Relatórios
Segurança · Permissões · Usuários · Técnicos · Lojas Parceiras
Configurações
```

### 3.3 Aplicativo

```
Início (Feed) → Comentários
Serviços → Detalhe da OS → Etapas → Detalhe da etapa → Checklist →
           Câmera → Assinatura → Vistoria → Chat
Perícias · Cursos · Propostas (parceiro) · Agenda
Custódia → Pedido de ferramenta
Perfil                              (Notificações: registrada, mas oculta)
```

---

## 4. Mapa de dependências

### 4.1 Os dois eixos

**`service_orders`** é o eixo visível: mais de vinte tabelas apontam para ela.
**`service_categories`** é o eixo escondido: quatro automações leem dela, e no
menu ela aparece como um cadastro dentro de Serviços.

```mermaid
flowchart TD
  P[Parceiro / Loja] --> Q[Orcamento]
  Q -->|pagamento| OS[(Ordem de Servico)]
  SC[[Categoria de Servico]] -.checklist.-> OS
  SC -.template de etapas.-> OS
  SC -.especialidade.-> DES[Designacao]
  SC -.curso obrigatorio.-> DES
  OS --> DES --> AG[Agenda] --> EX[Execucao no aplicativo]
  EX --> CK[Checklist] --> QA[Qualidade] --> NV[Nivel]
  EX --> FT[Custodia de ferramenta]
  OS --> FIN[Financeiro] --> FM[Fechamento mensal]
  OS --> REL[Relatorios]
  G[Ticket de garantia] --> PER[Pericia] --> LAU[Laudo] --> FAB[Fabrica] --> OS
  FEED[Feed] --> MET[Metricas] --> LEAD[Pedido] --> CONV[Conversao]
  PROF[(Perfis)] --> FEED
  PROF --> DES
```

### 4.2 As dez automações

1. **Conversão de orçamento em OS** — três caminhos convergem: webhook do
   Asaas, pagamento sem gateway e confirmação manual. Mexer ali afeta os três.
2. **Designação automática de equipe**, por disponibilidade.
3. **Agendamento em dias contíguos**, com bloqueio de dia já ocupado.
4. **Automação por categoria de serviço** — provisiona checklist e etapas.
   Disparada por **três rotas**, porque a designação escapa do gatilho de
   mudança de situação.
5. **Bloqueio por curso obrigatório** na designação.
6. **Distribuição a homologados por UF**, com o primeiro aceite fechando.
7. **Recálculo de nota e nível** a partir de qualidade e avaliação.
8. **Custódia e repasse** — ferramenta não devolvida desconta do repasse.
9. **Roteamento de garantia** entre os dois sistemas.
10. **Feed** — publicação agendada, encerramento, fixação com prazo, recálculo
    de audiência, notificação em lote e agregação de métricas.

### 4.3 Integrações externas

Asaas (cobrança, webhook, transferência) · NFe · Google Maps · Expo Push ·
armazenamento de arquivos · tempo real do banco · API de municípios do IBGE ·
e a costura Garantias → Reallliza por chave de API.

### 4.4 Rotinas periódicas

| Rotina | Cadência | O que faz |
|---|---|---|
| Reenvio de webhook | 5 min | Repete webhook que falhou |
| Feed | 10 min | Publica agendado, encerra vencido, agrega métrica, reconcilia contador, recalcula audiência |
| Notificação do Feed | 1 min | Drena a fila e envia push |

Duas observações de operação: **três rotinas com cadência de minutos exigem
plano pago** na hospedagem; e todas dependem de a variável de segredo estar
configurada — sem ela, param.

### 4.5 O que quebra se mexer

| Se mexer em | O que quebra |
|---|---|
| `service_orders` | praticamente tudo |
| `service_categories` | checklist, etapas, designação e bloqueio por curso |
| `quotes.service_order_id` | o único elo entre comercial e operacional |
| `profiles` | tudo |
| Conversão de orçamento | os três caminhos de pagamento |
| Config. Globais | o preço de todo orçamento novo |
| Audiência do Feed | quem recebe cada campanha |

---

## 5. Fluxos operacionais

**1 · Comercial → execução**
Loja → orçamento → pagamento → **OS criada automaticamente** → designação →
agenda → execução no aplicativo → etapas e checklist → fotos e assinatura →
conclusão → financeiro → relatório

**2 · Garantia (atravessa os dois sistemas)**
WhatsApp/IA → ticket → triagem → perícia agendada → laudo → decisão da
fábrica → **OS no Reallliza** → execução

**3 · Rede homologada**
Cadastro público → homologação → especialidades → nota e nível → proposta
distribuída por UF → primeiro aceite → execução → custódia → repasse

**4 · Almoxarifado**
Pedido → aprovação → separação → entrega → **custódia amarrada à OS** →
devolução → (não devolvida desconta do repasse)

**5 · Conteúdo e campanha**
Patrocinador → campanha → publicação com botão e enquete → **segmentação por
16 recortes** → publicação ou agendamento → notificação → leitura no
aplicativo e no site → métrica → pedido → conversão → relatório

---

## 6. Diagrama geral da arquitetura

```mermaid
flowchart LR
  subgraph GAR[Sistema Garantias - banco proprio]
    WA[WhatsApp e IA] --> TK[Tickets] --> TR[Triagem]
    TR --> PE[Pericia] --> LA[Laudos] --> FB[Fabrica]
  end

  subgraph REA[Sistema Reallliza - banco proprio]
    QT[Orcamentos] --> OS[(Ordens de Servico)]
    OS --> AGD[Agenda]
    OS --> FER[Ferramentas]
    OS --> FIN[Financeiro]
    OS --> QUA[Qualidade e Niveis]
    FD[Feed e Campanhas] --> MTR[Metricas e Pedidos]
    CAD[(Perfis - Servicos - Categorias - Equipes)] --> OS
    CAD --> FD
  end

  subgraph APP[Aplicativo do profissional]
    AB1[Inicio: Feed]
    AB2[Servicos: OS]
    AB3[Agenda - Custodia - Cursos]
  end

  FB -->|chave de API| OS
  GAR -.cinco atalhos de menu.-> REA
  APP <-->|fala so com o Reallliza| REA
  REA --> EXT[Asaas - NFe - Maps - Expo Push - IBGE]
```

---

## 7. Achados que a reorganização precisa considerar

### 7.1 Redundância entre os dois sistemas

O Garantias tem **35 de 60 tabelas vazias**, incluindo cópias inteiras de
ordens de serviço, orçamentos, serviços, cursos, ferramentas e pagamentos.
Cinco itens de menu já viraram atalho; os módulos continuam no código dos dois
lados.

### 7.2 Redundância dentro do Reallliza

- Três entradas para o mesmo eixo de avaliação: **Qualidade**, **Níveis e
  Avaliação**, **Avaliações**
- Quatro entradas para análise: **Dashboard**, **BI / Dashboards**,
  **Relatórios**, **Painel do Feed**
- Três entradas para a mesma tabela de OS: **Ordens de Serviço**, **Aguardando
  Designação**, **OSs Homologados**
- Três noções de região convivendo: **Regiões** (vazia), `operating_region`
  (texto livre) e a macro-região do IBGE (usada pelo Feed)
- **Configurações** × **Config. Globais** — nomes quase iguais, escopos opostos

### 7.3 O que está sem uso, e por quê

Cursos, matrículas, qualidade, contas a pagar e receber, homologação,
garantias, regiões e chats estão sem nenhum registro. **Sem uso não é sem
utilidade** — é adoção que ainda não aconteceu, e a distinção precisa estar
clara antes de alguém usar este documento para justificar remoções.

A única página inalcançável de verdade é `/solicitacoes`.

### 7.4 Reorganizar menu não muda permissão

Toda rota usa credencial de serviço e confere o papel no código. **Esconder um
item de menu não protege a rota correspondente.** Quem souber a URL da API
continua alcançando.

### 7.5 O que a reorganização deveria resolver primeiro

1. Dar à **Categoria de Serviço** um lugar próprio — hoje ela é o segundo eixo
   do sistema, escondida dentro de um cadastro
2. Agrupar as três entradas de OS sob um módulo só
3. Consolidar avaliação numa entrada
4. Resolver as três noções de região
5. Renomear **Configurações** ou **Config. Globais**
6. Decidir o destino de `/solicitacoes`
7. Trazer `unidades` para dentro da barra de abas de Ferramentas

---

## Anexo — como reproduzir os números

```bash
grep -c "label:" web/src/app/\(dashboard\)/layout.tsx     # itens de menu
find web/src/app/\(dashboard\) -name page.tsx | wc -l     # páginas
find web/src/app/api -name route.ts | wc -l               # rotas
ls database/migrations/*.sql | wc -l                      # migrations
```

Uso em produção, por tabela:

```sql
SELECT c.relname, COALESCE(s.n_live_tup, 0) AS linhas
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_stat_user_tables s ON s.relname = c.relname
 WHERE n.nspname = 'public' AND c.relkind = 'r'
 ORDER BY 2 DESC;
```

`pg_stat_user_tables` devolve **estimativa** do planejador. Para número exato,
`SELECT count(*)` na tabela — foi o que se usou aqui sempre que o número
entrou numa conclusão.
