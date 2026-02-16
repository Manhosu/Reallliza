# PLANEJAMENTO COMPLETO - Reallliza Revestimentos

## O QUE EU ENTENDI DO SISTEMA

A **Reallliza Revestimento Vinílico** é uma empresa que instala revestimentos vinílicos. O sistema é um **ecossistema corporativo completo** que conecta 3 perfis de usuários:

1. **Administrador** - Visão 360° da operação: gerencia funcionários, parceiros, finanças, ordens de serviço, ferramentas e relatórios.
2. **Funcionário/Técnico** - Trabalha em campo: recebe ordens de serviço, executa checklists técnicos, registra fotos (antes/durante/depois), usa GPS para rotas, e precisa de modo offline.
3. **Parceiro** - Interface limpa para abrir chamados, aprovar/recusar orçamentos e acompanhar seus serviços.

O fluxo principal é: **Parceiro abre chamado → Admin cria OS → Técnico executa em campo → Fotos/checklist comprovam → Relatório gerado**.

O sistema é composto por:
- **Painel Web Administrativo** (Next.js) - Para Admin e Parceiros
- **App Mobile** (React Native/Expo) - Para Técnicos em campo
- **Backend API** (NestJS) - Servidor central
- **Banco de Dados** (Supabase/PostgreSQL)

---

## ESTADO ATUAL DO PROJETO

**FASE ZERO** - Nenhum código implementado. Existem apenas:
- `.env` com credenciais do Supabase
- `.mcp.json` com configuração MCP
- `README.md` com especificações
- `Logo sem fundo.png` - Logo da empresa
- Nenhum `package.json`, nenhuma pasta de código, nenhuma migration

---

## CHECKLIST GLOBAL DE IMPLEMENTAÇÃO

### FASE 1: FUNDAÇÃO E INFRAESTRUTURA
> Objetivo: Criar a base do projeto - estrutura de pastas, configurações, banco de dados

#### 1.1 Inicialização do Monorepo
- [ ] Criar estrutura de monorepo (pasta raiz com workspaces)
- [ ] Configurar `package.json` raiz com workspaces (backend, web, mobile)
- [ ] Configurar `.gitignore` global
- [ ] Configurar ESLint + Prettier compartilhados
- [ ] Configurar TypeScript base config (`tsconfig.base.json`)

#### 1.2 Backend - NestJS
- [ ] Inicializar projeto NestJS em `/backend`
- [ ] Configurar Prisma ORM com Supabase PostgreSQL
- [ ] Configurar variáveis de ambiente (`.env`)
- [ ] Configurar CORS, Helmet, Rate Limiting
- [ ] Configurar módulo de logging (Winston/Pino)
- [ ] Configurar Swagger/OpenAPI para documentação de API
- [ ] Configurar Docker (Dockerfile + docker-compose.yml)

#### 1.3 Frontend Web - Next.js
- [ ] Inicializar projeto Next.js (App Router) em `/web`
- [ ] Instalar e configurar Tailwind CSS
- [ ] Instalar e configurar Shadcn/UI
- [ ] Instalar Lucide Icons
- [ ] Instalar e configurar Framer Motion
- [ ] Configurar Supabase Client
- [ ] Configurar tema (cores da marca: amarelo + preto)
- [ ] Configurar Dark Mode
- [ ] Configurar fontes (Inter/Geist)

#### 1.4 Mobile - React Native
- [ ] Inicializar projeto Expo em `/mobile`
- [ ] Configurar React Native Paper ou Tamagui
- [ ] Configurar navegação (React Navigation)
- [ ] Configurar Supabase Client para mobile
- [ ] Configurar WatermelonDB/SQLite para offline
- [ ] Configurar push notifications (Expo Notifications)

#### 1.5 Banco de Dados - Schema Supabase
- [ ] Criar tabela `users` (id, email, password_hash, role, full_name, phone, avatar_url, created_at, updated_at)
- [ ] Criar tabela `profiles` (user_id, cpf, rg, address, specialties, documents_url)
- [ ] Criar tabela `partners` (id, company_name, cnpj, contact_info, user_id)
- [ ] Criar tabela `service_orders` (id, title, description, status, priority, client_info, address, geo_lat, geo_lng, partner_id, technician_id, scheduled_date, completed_date, created_at, updated_at)
- [ ] Criar tabela `checklists` (id, os_id, technician_id, template_id, data_json, status, created_at, completed_at)
- [ ] Criar tabela `checklist_templates` (id, name, fields_json, is_active)
- [ ] Criar tabela `photos` (id, os_id, checklist_id, type [before/during/after], url, thumbnail_url, geo_lat, geo_lng, watermark_data, captured_at)
- [ ] Criar tabela `tool_inventory` (id, tool_name, description, serial_number, status, condition, photo_url)
- [ ] Criar tabela `tool_custody` (id, tool_id, user_id, checked_out_at, checked_in_at, condition_out, condition_in, notes)
- [ ] Criar tabela `notifications` (id, user_id, title, message, type, read_at, data_json, created_at)
- [ ] Criar tabela `audit_logs` (id, user_id, action, entity_type, entity_id, old_data, new_data, ip_address, created_at)
- [ ] Criar tabela `schedules` (id, os_id, technician_id, date, start_time, end_time, status)
- [ ] Configurar Row Level Security (RLS) em todas as tabelas
- [ ] Criar policies de acesso por role (admin, technician, partner)
- [ ] Criar índices para performance
- [ ] Configurar Supabase Storage buckets (photos, documents, avatars)

---

### FASE 2: AUTENTICAÇÃO E CONTROLE DE ACESSO (RBAC)
> Objetivo: Sistema de login seguro com papéis diferenciados

#### 2.1 Backend - Auth
- [ ] Integrar Supabase Auth no backend
- [ ] Criar módulo de autenticação NestJS
- [ ] Implementar Guard de autenticação JWT
- [ ] Implementar Guard de roles (RBAC)
- [ ] Criar decorator `@Roles('admin', 'technician', 'partner')`
- [ ] Implementar endpoint `POST /auth/login`
- [ ] Implementar endpoint `POST /auth/register` (admin only)
- [ ] Implementar endpoint `POST /auth/forgot-password`
- [ ] Implementar endpoint `POST /auth/reset-password`
- [ ] Implementar endpoint `GET /auth/me` (perfil do usuário logado)
- [ ] Implementar endpoint `PUT /auth/profile` (atualizar perfil)
- [ ] Configurar refresh token rotation

#### 2.2 Frontend Web - Auth
- [ ] Criar página de Login (design premium: glassmorphism, animações)
- [ ] Criar página "Esqueci minha senha"
- [ ] Criar página "Redefinir senha"
- [ ] Implementar middleware de proteção de rotas (Next.js middleware)
- [ ] Implementar contexto de autenticação (AuthProvider)
- [ ] Implementar redirecionamento por role após login
- [ ] Criar componente de Loading/Skeleton para autenticação

#### 2.3 Mobile - Auth
- [ ] Criar tela de Login (design premium)
- [ ] Criar tela "Esqueci minha senha"
- [ ] Implementar armazenamento seguro do token (SecureStore)
- [ ] Implementar contexto de autenticação
- [ ] Implementar navegação protegida por role
- [ ] Implementar biometria (fingerprint/face) para login rápido

---

### FASE 3: LAYOUT E NAVEGAÇÃO BASE
> Objetivo: Estrutura visual completa com sidebar, header, navegação

#### 3.1 Frontend Web - Layout Admin
- [ ] Criar Sidebar translúcida (Glassmorphism) com menu colapsável
- [ ] Criar Header com busca global, notificações e avatar do usuário
- [ ] Criar Breadcrumb dinâmico
- [ ] Criar sistema de tabs/páginas
- [ ] Implementar layout responsivo (desktop + tablet)
- [ ] Criar componente de Skeleton Screen global
- [ ] Criar componente de Toast/Notificação (Sonner)
- [ ] Criar componente de Modal/Dialog padrão
- [ ] Criar componente de Tabela padrão (sortable, filterable, paginable)
- [ ] Criar componente de Card/Bento Grid padrão
- [ ] Criar componente de Empty State
- [ ] Criar componente de Error Boundary

#### 3.2 Frontend Web - Layout Parceiro
- [ ] Criar layout simplificado para parceiros
- [ ] Sidebar com menos opções (chamados, orçamentos, histórico)
- [ ] Dashboard específico do parceiro

#### 3.3 Mobile - Navegação
- [ ] Criar Bottom Tab Navigator (OS, Agenda, Ferramentas, Perfil)
- [ ] Criar Stack Navigator para fluxos internos
- [ ] Criar Header customizado
- [ ] Criar componente de Pull-to-Refresh
- [ ] Criar indicador de status online/offline

---

### FASE 4: GESTÃO DE USUÁRIOS
> Objetivo: CRUD completo de usuários por perfil

#### 4.1 Backend - Users
- [ ] Criar módulo `users` no NestJS
- [ ] Implementar `GET /users` (listagem com filtros e paginação)
- [ ] Implementar `GET /users/:id` (detalhes)
- [ ] Implementar `POST /users` (criar usuário - admin only)
- [ ] Implementar `PUT /users/:id` (editar usuário)
- [ ] Implementar `DELETE /users/:id` (soft delete)
- [ ] Implementar `PUT /users/:id/status` (ativar/desativar)
- [ ] Implementar validações (email único, campos obrigatórios)
- [ ] Registrar ações no audit_log

#### 4.2 Frontend Web - Users
- [ ] Criar página de listagem de usuários (tabela com filtros)
- [ ] Criar formulário de criação de usuário (modal ou página)
- [ ] Criar página de detalhes/edição de usuário
- [ ] Implementar upload de avatar
- [ ] Implementar filtros por role, status, busca por nome/email
- [ ] Criar visualização de especialidades por técnico

---

### FASE 5: GESTÃO DE PARCEIROS
> Objetivo: Cadastro e gestão de empresas parceiras

#### 5.1 Backend - Partners
- [ ] Criar módulo `partners` no NestJS
- [ ] Implementar CRUD completo de parceiros
- [ ] Implementar vínculo parceiro ↔ usuário
- [ ] Implementar listagem de OS por parceiro
- [ ] Implementar estatísticas por parceiro

#### 5.2 Frontend Web - Partners
- [ ] Criar página de listagem de parceiros
- [ ] Criar formulário de cadastro de parceiro
- [ ] Criar página de detalhes do parceiro (com histórico de OS)
- [ ] Criar dashboard resumido do parceiro

---

### FASE 6: GESTÃO DE ORDENS DE SERVIÇO (OS) - CORE
> Objetivo: Fluxo completo de OS, do chamado à conclusão

#### 6.1 Backend - Service Orders
- [ ] Criar módulo `service-orders` no NestJS
- [ ] Implementar `GET /service-orders` (listagem com filtros avançados)
- [ ] Implementar `GET /service-orders/:id` (detalhes completos)
- [ ] Implementar `POST /service-orders` (criar OS)
- [ ] Implementar `PUT /service-orders/:id` (editar OS)
- [ ] Implementar `PATCH /service-orders/:id/status` (mudar status)
- [ ] Implementar máquina de estados de status:
  - `aberta` → `em_analise` → `aprovada` → `agendada` → `em_deslocamento` → `em_execucao` → `checklist_pendente` → `concluida` → `faturada`
  - Status paralelo: `cancelada`, `pausada`
- [ ] Implementar atribuição de técnico à OS
- [ ] Implementar prioridades (baixa, média, alta, urgente)
- [ ] Disparar notificação a cada mudança de status
- [ ] Registrar todas as mudanças no audit_log
- [ ] Implementar endpoint de timeline/histórico da OS

#### 6.2 Frontend Web - Service Orders
- [ ] Criar página de listagem de OS (Kanban board + tabela)
- [ ] Criar visualização Kanban (arrastar entre status)
- [ ] Criar visualização em tabela (com filtros avançados)
- [ ] Criar formulário de criação de OS
- [ ] Criar página de detalhes da OS:
  - Informações gerais
  - Timeline de status
  - Checklist associado
  - Galeria de fotos
  - Mapa com localização
  - Histórico de alterações
- [ ] Criar componente de mudança de status (com confirmação)
- [ ] Criar componente de atribuição de técnico
- [ ] Implementar filtros: status, prioridade, parceiro, técnico, data

#### 6.3 Mobile - Service Orders
- [ ] Criar tela de listagem de OS (do técnico logado)
- [ ] Criar tela de detalhes da OS
- [ ] Criar botão de aceitar/recusar OS
- [ ] Criar fluxo de mudança de status (step-by-step)
- [ ] Criar integração com mapa (ver localização do serviço)
- [ ] Implementar pull-to-refresh e paginação infinita

---

### FASE 7: CHECKLIST INTELIGENTE
> Objetivo: Formulários dinâmicos para checklist técnico

#### 7.1 Backend - Checklists
- [ ] Criar módulo `checklists` no NestJS
- [ ] Implementar CRUD de templates de checklist
- [ ] Implementar criação de checklist a partir de template
- [ ] Implementar preenchimento parcial (salvar rascunho)
- [ ] Implementar validação de campos obrigatórios
- [ ] Implementar validação de fotos obrigatórias
- [ ] Implementar finalização do checklist

#### 7.2 Frontend Web - Checklists
- [ ] Criar editor de templates de checklist (drag & drop de campos)
- [ ] Criar visualização do checklist preenchido
- [ ] Criar tipos de campo: texto, número, sim/não, seleção, foto, assinatura
- [ ] Criar indicador de completude (% preenchido)

#### 7.3 Mobile - Checklists
- [ ] Criar tela de preenchimento de checklist (step-by-step ou scroll)
- [ ] Implementar campos dinâmicos renderizados a partir do template
- [ ] Implementar validação em tempo real
- [ ] Implementar salvamento automático (rascunho)
- [ ] Implementar captura de foto inline no checklist
- [ ] Implementar campo de assinatura digital
- [ ] Suporte offline (salvar localmente e sincronizar depois)

---

### FASE 8: REGISTRO FOTOGRÁFICO
> Objetivo: Captura e gestão de fotos com metadados

#### 8.1 Backend - Photos
- [ ] Criar módulo `photos` no NestJS
- [ ] Implementar upload de foto para Supabase Storage
- [ ] Implementar compressão/resize de imagem no servidor
- [ ] Implementar geração de thumbnail
- [ ] Implementar adição de marca d'água (data/hora + geolocalização)
- [ ] Implementar categorização (antes/durante/depois)
- [ ] Implementar endpoint de galeria por OS

#### 8.2 Frontend Web - Photos
- [ ] Criar componente de galeria de fotos (grid com lightbox)
- [ ] Criar visualização por categoria (antes/durante/depois)
- [ ] Criar visualização de metadados (data, localização, técnico)
- [ ] Implementar download de fotos

#### 8.3 Mobile - Photos
- [ ] Criar tela de captura de foto (câmera nativa)
- [ ] Implementar seleção de categoria (antes/durante/depois)
- [ ] Implementar captura de geolocalização automática
- [ ] Implementar marca d'água na foto (overlay de data/hora/local)
- [ ] Implementar fila de upload (para quando estiver offline)
- [ ] Implementar compressão local antes de upload
- [ ] Criar galeria local (fotos tiradas naquela OS)

---

### FASE 9: GEOLOCALIZAÇÃO E MAPAS
> Objetivo: Rastreamento em tempo real e rotas

#### 9.1 Backend - Geolocation
- [ ] Criar módulo `geolocation` no NestJS
- [ ] Implementar endpoint para receber coordenadas do técnico
- [ ] Implementar armazenamento de histórico de localização
- [ ] Implementar cálculo de rota (Google Maps Directions API)
- [ ] Implementar WebSocket/Realtime para posição ao vivo

#### 9.2 Frontend Web - Maps
- [ ] Integrar Google Maps no painel admin
- [ ] Criar mapa com posições dos técnicos em tempo real
- [ ] Criar visualização de rota do técnico até o serviço
- [ ] Criar mapa na página de detalhes da OS

#### 9.3 Mobile - Maps
- [ ] Integrar React Native Maps
- [ ] Implementar navegação até o local do serviço (abrir Waze/Google Maps)
- [ ] Implementar tracking em background (enviar posição periodicamente)
- [ ] Implementar visualização de rota no app
- [ ] Criar indicador de distância/tempo até o destino

---

### FASE 10: AGENDA E CALENDÁRIO
> Objetivo: Planejamento e visualização de serviços agendados

#### 10.1 Backend - Schedules
- [ ] Criar módulo `schedules` no NestJS
- [ ] Implementar CRUD de agendamentos
- [ ] Implementar verificação de conflitos de agenda
- [ ] Implementar endpoint de agenda por técnico
- [ ] Implementar endpoint de agenda por data

#### 10.2 Frontend Web - Calendar
- [ ] Criar página de calendário (visão mensal, semanal, diária)
- [ ] Implementar arrastar para reagendar
- [ ] Implementar filtro por técnico
- [ ] Implementar cores por status/prioridade
- [ ] Criar mini-calendário no dashboard

#### 10.3 Mobile - Calendar
- [ ] Criar tela de agenda do técnico (visão semanal/diária)
- [ ] Criar card de próximo serviço na home
- [ ] Implementar notificação de lembrete de serviço

---

### FASE 11: CONTROLE DE FERRAMENTAS
> Objetivo: Check-in/Check-out de ferramentas por custódia

#### 11.1 Backend - Tools
- [ ] Criar módulo `tools` no NestJS
- [ ] Implementar CRUD de ferramentas (inventário)
- [ ] Implementar endpoint de check-out (retirada)
- [ ] Implementar endpoint de check-in (devolução)
- [ ] Implementar histórico de custódia por ferramenta
- [ ] Implementar alerta de ferramenta não devolvida

#### 11.2 Frontend Web - Tools
- [ ] Criar página de inventário de ferramentas
- [ ] Criar formulário de cadastro de ferramenta
- [ ] Criar página de custódia (quem está com o quê)
- [ ] Criar histórico de movimentações
- [ ] Criar alertas visuais (ferramentas atrasadas)

#### 11.3 Mobile - Tools
- [ ] Criar tela de "minhas ferramentas" (o que tenho em custódia)
- [ ] Implementar QR Code/barcode scan para check-in/check-out
- [ ] Criar fluxo de devolução com registro de condição

---

### FASE 12: NOTIFICAÇÕES
> Objetivo: Push notifications e notificações in-app

#### 12.1 Backend - Notifications
- [ ] Criar módulo `notifications` no NestJS
- [ ] Implementar serviço de notificação (criação + envio)
- [ ] Integrar Supabase Realtime para notificações in-app
- [ ] Integrar Expo Push Notifications para mobile
- [ ] Integrar Web Push Notifications (opcional)
- [ ] Implementar endpoints: listar, marcar como lida, marcar todas como lidas
- [ ] Criar triggers automáticos:
  - Nova OS atribuída ao técnico
  - Mudança de status da OS
  - Novo chamado do parceiro
  - Ferramenta com devolução atrasada
  - Lembrete de serviço agendado

#### 12.2 Frontend Web - Notifications
- [ ] Criar dropdown de notificações no header (sino com badge)
- [ ] Criar página de todas as notificações
- [ ] Implementar notificação em tempo real (Supabase Realtime)
- [ ] Implementar som/vibração de notificação

#### 12.3 Mobile - Notifications
- [ ] Configurar Expo Push Notifications
- [ ] Criar tela de notificações
- [ ] Implementar badge no ícone do app
- [ ] Implementar deep linking (tocar na notificação → abrir a OS)

---

### FASE 13: DASHBOARDS E BI
> Objetivo: Painéis analíticos com gráficos e métricas

#### 13.1 Backend - Analytics
- [ ] Criar módulo `analytics` no NestJS
- [ ] Implementar endpoint de métricas gerais (total OS, técnicos ativos, etc.)
- [ ] Implementar endpoint de OS por status (para gráfico)
- [ ] Implementar endpoint de OS por período (para gráfico temporal)
- [ ] Implementar endpoint de performance por técnico
- [ ] Implementar endpoint de métricas por parceiro
- [ ] Implementar endpoint de ferramentas em custódia

#### 13.2 Frontend Web - Dashboard Admin
- [ ] Criar Dashboard com Bento Grid layout
- [ ] Cards de métricas principais:
  - Total de OS abertas / em andamento / concluídas
  - Técnicos em campo hoje
  - Receita do mês
  - OS atrasadas
- [ ] Gráfico de OS por status (pie/donut - Recharts)
- [ ] Gráfico de OS ao longo do tempo (line chart)
- [ ] Gráfico de performance por técnico (bar chart)
- [ ] Mapa com técnicos em campo (mini-mapa)
- [ ] Lista de últimas atividades (activity feed)
- [ ] Lista de próximos serviços

#### 13.3 Frontend Web - Dashboard Parceiro
- [ ] Cards de métricas do parceiro (OS abertas, concluídas, pendentes)
- [ ] Lista de chamados recentes
- [ ] Status dos orçamentos

---

### FASE 14: RELATÓRIOS E EXPORTAÇÃO
> Objetivo: Geração de relatórios em PDF e Excel

#### 14.1 Backend - Reports
- [ ] Criar módulo `reports` no NestJS
- [ ] Implementar geração de PDF (pdfkit ou puppeteer)
- [ ] Implementar geração de Excel (exceljs)
- [ ] Relatório de OS por período
- [ ] Relatório de OS por técnico
- [ ] Relatório de OS por parceiro
- [ ] Relatório de ferramentas em custódia
- [ ] Relatório financeiro
- [ ] Implementar proteção de dados sensíveis nos relatórios (LGPD)

#### 14.2 Frontend Web - Reports
- [ ] Criar página de relatórios com filtros
- [ ] Implementar seleção de tipo de relatório
- [ ] Implementar filtros de data, técnico, parceiro, status
- [ ] Implementar botões de download (PDF / Excel)
- [ ] Implementar preview do relatório antes de baixar

---

### FASE 15: MODO OFFLINE (MOBILE)
> Objetivo: Funcionamento sem internet com sincronização posterior

- [ ] Configurar WatermelonDB como banco local
- [ ] Implementar schema local espelhando as tabelas principais
- [ ] Implementar sincronização bidirecional com Supabase
- [ ] Implementar fila de operações pendentes
- [ ] Implementar fila de upload de fotos pendentes
- [ ] Implementar indicador visual de status de sincronização
- [ ] Implementar resolução de conflitos (last-write-wins ou merge)
- [ ] Implementar retry automático com backoff exponencial
- [ ] Testar cenários: sem internet → trabalha → reconecta → sincroniza

---

### FASE 16: CONFORMIDADE LGPD E AUDITORIA
> Objetivo: Logs de acesso, proteção de dados, compliance

- [ ] Implementar middleware de audit log (registrar toda alteração em dados de clientes)
- [ ] Implementar endpoint de exportação de dados do usuário (direito de acesso)
- [ ] Implementar endpoint de exclusão de dados (direito ao esquecimento)
- [ ] Implementar criptografia AES-256 para dados sensíveis
- [ ] Implementar mascaramento de dados em logs
- [ ] Criar página de audit log no painel admin (visualizar quem fez o quê)
- [ ] Implementar consentimento de termos de uso
- [ ] Implementar política de retenção de dados

---

### FASE 17: PORTAL DO PARCEIRO
> Objetivo: Interface dedicada e simplificada para parceiros

- [ ] Criar dashboard do parceiro (métricas próprias)
- [ ] Criar fluxo de abertura de chamado/solicitação de serviço
- [ ] Criar tela de acompanhamento de chamados
- [ ] Criar fluxo de aprovação/recusa de orçamento
- [ ] Criar histórico de serviços realizados
- [ ] Criar visualização de faturas/financeiro do parceiro

---

### FASE 18: POLIMENTO E UX PREMIUM
> Objetivo: Garantir o padrão "Linear/Stripe" em toda a aplicação

- [ ] Revisar todas as transições e adicionar Framer Motion onde necessário
- [ ] Implementar Skeleton Screens em todas as páginas de listagem
- [ ] Implementar micro-interações (hover, click, loading) em todos os botões/cards
- [ ] Testar e refinar Dark Mode em todas as páginas
- [ ] Implementar estados de erro elegantes (empty states, error boundaries)
- [ ] Revisar espaçamento, bordas (12px), sombras suaves
- [ ] Testar responsividade (desktop, tablet, mobile web)
- [ ] Implementar loading states com shimmer/pulse
- [ ] Revisar acessibilidade (ARIA labels, contraste, navegação por teclado)

---

### FASE 19: TESTES E QUALIDADE
> Objetivo: Cobertura de testes e qualidade do código

- [ ] Configurar Jest para testes unitários no backend
- [ ] Escrever testes para serviços core (auth, OS, checklists)
- [ ] Configurar Cypress/Playwright para testes E2E no web
- [ ] Escrever testes E2E para fluxos críticos (login, criar OS, preencher checklist)
- [ ] Configurar Detox para testes E2E no mobile
- [ ] Implementar CI/CD (GitHub Actions) para rodar testes automaticamente
- [ ] Implementar lint + type-check no CI

---

### FASE 20: DEPLOY E INFRAESTRUTURA
> Objetivo: Colocar em produção

- [ ] Configurar Docker para backend (Dockerfile + docker-compose)
- [ ] Configurar deploy do backend (Railway / Render / AWS)
- [ ] Configurar deploy do frontend (Vercel)
- [ ] Configurar build do app mobile (EAS Build - Expo)
- [ ] Publicar app na Google Play Store
- [ ] Publicar app na Apple App Store
- [ ] Configurar domínio customizado
- [ ] Configurar SSL/HTTPS
- [ ] Configurar monitoramento (Sentry para erros)
- [ ] Configurar backup automático do banco de dados

---

## RESUMO DE PRIORIDADES

| Prioridade | Fases | Descrição |
|------------|-------|-----------|
| **P0 - Crítico** | 1, 2, 3 | Fundação, Auth, Layout |
| **P1 - Core** | 4, 5, 6, 7, 8 | Usuários, Parceiros, OS, Checklist, Fotos |
| **P2 - Importante** | 9, 10, 11, 12 | Mapas, Agenda, Ferramentas, Notificações |
| **P3 - Valor** | 13, 14, 15, 17 | Dashboards, Relatórios, Offline, Portal Parceiro |
| **P4 - Qualidade** | 16, 18, 19, 20 | LGPD, UX Premium, Testes, Deploy |

## ESTIMATIVA DE COMPONENTES

| Área | Quantidade Estimada |
|------|-------------------|
| Tabelas no banco | ~13 tabelas |
| Endpoints de API | ~60-80 endpoints |
| Páginas Web | ~25-30 páginas |
| Componentes Web reutilizáveis | ~40-50 componentes |
| Telas Mobile | ~15-20 telas |
| Migrations de banco | ~15-20 migrations |

---

## DEPENDÊNCIAS ENTRE FASES

```
Fase 1 (Fundação) → Tudo depende desta
Fase 2 (Auth) → Necessária para qualquer tela protegida
Fase 3 (Layout) → Necessária para qualquer página
Fase 4 (Usuários) → Necessária para OS (atribuir técnico)
Fase 5 (Parceiros) → Necessária para OS (vincular parceiro)
Fase 6 (OS) → Core do sistema, necessária para Checklist, Fotos, Agenda
Fase 7 (Checklist) → Depende de OS
Fase 8 (Fotos) → Depende de OS e Checklist
Fase 9 (Mapas) → Depende de OS
Fase 10 (Agenda) → Depende de OS e Usuários
Fase 11 (Ferramentas) → Independente (pode ser paralela à OS)
Fase 12 (Notificações) → Depende de OS (para triggers)
Fase 13 (Dashboards) → Depende de ter dados (OS, Usuários)
Fase 14 (Relatórios) → Depende de ter dados
Fase 15 (Offline) → Depende do Mobile estar funcional
Fase 16 (LGPD) → Pode ser incremental durante todo o projeto
```
