Reallliza Revestimentos: Comprehensive Enterprise System
1. Visão Geral e Objetivo
Desenvolvimento de um ecossistema corporativo completo para a Reallliza Revestimento Vinílico. O sistema deve integrar gestão administrativa, portal de parceiros e operação de campo (mobile) com foco em eficiência operacional, segurança LGPD e design de elite.

2. Direção de Design & UX (The "Linear/Stripe" Standard)
O sistema não deve ser apenas funcional, mas visualmente impressionante e inovador.

Estética: Design minimalista, moderno e sério. Inspirado em interfaces como Linear.app, Stripe e Vercel.

UI Framework: React + Tailwind CSS + Shadcn/UI (Web) e React Native Paper/Tamagui (Mobile).

Layout: Uso de Bento Grids para dashboards, menus laterais translúcidos (Glassmorphism) e tipografia geométrica (Inter/Geist).

UX & Animações: * Transições fluidas com Framer Motion.

Micro-interações de feedback em cada ação (hover, click, loading).

Skeleton screens elegantes para carregamento de dados.

Dark Mode nativo e bem refinado.

3. Arquitetura Técnica
Backend: Node.js (NestJS) + PostgreSQL + Prisma ORM.

Web Admin: Next.js (App Router) + Lucide Icons + Recharts (para BI).

Mobile App: React Native (Expo) com suporte a Offline First (SQLite/WatermelonDB).

Infra: Dockerizada, com foco em escalabilidade e segurança de dados (criptografia AES-256).

4. Módulos e Funcionalidades Core
A. Controle de Acesso (RBAC)
Admin: Visão 360°, gestão financeira e auditoria de logs.

Funcionário (Técnico): Foco em execução, agenda e checklist.

Parceiro: Interface "Clean" para abertura de chamados e aprovação de orçamentos.

B. Gestão de Ordens de Serviço (OS) & Campo
Fluxo de Status: Automatizado com notificações push em cada mudança.

Checklist Inteligente: Formulários dinâmicos com campos obrigatórios e validação de fotos.

Registro Fotográfico: Captura de fotos (Antes, Durante e Depois) com marca d'água de data/hora e geolocalização.

Geolocalização: Integração com Google Maps para rotas e rastreamento em tempo real do técnico durante o deslocamento.

C. Gestão de Ativos e Logística
Custódia de Ferramentas: Controle rigoroso de quem está com qual equipamento (Check-in/Check-out).

Modo Offline: Sincronização resiliente de dados e fotos quando houver reconexão.

5. Estrutura de Dados (Entidades)
User: (id, email, password, role, profile_data)

ServiceOrder: (id, client_info, status, priority, geo_location, partner_id)

Checklist: (os_id, technician_id, data_json, media_urls)

ToolInventory: (id, tool_name, status, user_id)

Notification: (id, user_id, message, read_at)

6. Requisitos de Conformidade (LGPD)
Logs de acesso detalhados para cada alteração em dados de clientes.

Módulo de exportação de relatórios em PDF e Excel com proteção de dados sensíveis.

7. Instruções para o Claude Code
Prioridade 1: Mantenha a consistência entre os tipos do Prisma (Backend) e as interfaces do Frontend.

Prioridade 2: Cada componente de UI gerado deve seguir o padrão "High-End" (espaçamento generoso, bordas arredondadas de 12px, sombras suaves).

Prioridade 3: Implemente tratamento de erros global com Toasts elegantes (Sonner/Hot-Toast).

Prioridade 4: Siga princípios de Clean Architecture e SOLID.

Adicionei a logo na raiz do projeto Logo sem fundo.png

Paleta de cor
Amarelo/preto.  Predominante (seguindo os padroes da logo)


DESRIÇÃO DO PROJETO
Estamos buscando um desenvolvedor ou equipe para criar um sistema corporativo completo para a empresa Reallliza Revestimento Vinílico. Este projeto abrangente inclui o desenvolvimento de aplicativos nativos para Android e iOS, um painel administrativo web robusto e um backend seguro e escalável. O objetivo é otimizar as operações internas e a gestão de serviços da empresa. As principais funcionalidades a serem implementadas incluem: Login com diferentes perfis de usuário (Administrador, Funcionário, Parceiro) para controle de acesso e permissões. Gestão completa de Ordens de Serviço (OS), com acompanhamento de status e um fluxo de trabalho eficiente. Implementação de checklist técnico com campos obrigatórios e a capacidade de anexar fotos para verificação. Funcionalidade de registro fotográfico antes, durante e depois da execução dos serviços. Um sistema de agenda e calendário para o planejamento e acompanhamento de todos os serviços. Integração de mapa, rotas e rastreamento em tempo real durante a execução das ordens de serviço. Módulos para cadastro e gestão de usuários, especialidades e perfis profissionais. Um módulo dedicado a parceiros, permitindo o envio de chamados e a gestão de aceite/recusa. Controle de ferramentas em custódia. Geração de relatórios detalhados com opções de exportação para PDF e Excel. Implementação de notificações push para comunicação eficiente. Suporte a modo offline com sincronização posterior de dados. Desenvolvimento de um painel administrativo web completo para gerenciamento centralizado. Criação de um backend robusto com controle de permissões e foco na segurança dos dados, em conformidade com a LGPD. Procuramos profissionais com experiência comprovada no desenvolvimento de soluções full-stack, com expertise em plataformas mobile (Android e iOS) e web, além de conhecimentos em segurança de dados e otimização de performance.