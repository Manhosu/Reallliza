# Reallliza Revestimentos - Design System Guide

> **INSTRUCAO OBRIGATORIA:** Este sistema faz parte da familia de produtos da empresa Reallliza Revestimentos. Todos os componentes visuais, cores, tipografia, espacamentos, animacoes e padroes de UI DEVEM seguir EXATAMENTE esta especificacao para manter consistencia visual entre os sistemas da empresa.

---

## 1. STACK OBRIGATORIA (Frontend)

- **Framework:** Next.js (App Router, RSC)
- **Styling:** Tailwind CSS v4 (CSS-first config, sem tailwind.config.js)
- **UI Components:** shadcn/ui (estilo `new-york`, baseColor `neutral`)
- **Animacoes:** Framer Motion + tw-animate-css
- **Icones:** Lucide React (EXCLUSIVAMENTE)
- **Fontes:** Geist Sans + Geist Mono (via `next/font/google`)
- **Toast:** Sonner
- **Utilitarios:** class-variance-authority (CVA), clsx, tailwind-merge
- **Idioma:** pt-BR (todas as labels, mensagens e textos em portugues)

### shadcn/ui - components.json
```json
{
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

---

## 2. PALETA DE CORES (oklch)

A identidade visual da Reallliza e **Amarelo Premium (#EAB308) + Preto/Zinc**. Todas as cores usam oklch.

### Light Mode (`:root`)
```css
:root {
  --background: oklch(1 0 0);                        /* #FFFFFF */
  --foreground: oklch(0.145 0 0);                    /* #0A0A0A */
  --card: oklch(1 0 0);                              /* #FFFFFF */
  --card-foreground: oklch(0.145 0 0);               /* #0A0A0A */
  --popover: oklch(1 0 0);                           /* #FFFFFF */
  --popover-foreground: oklch(0.145 0 0);            /* #0A0A0A */
  --primary: oklch(0.795 0.184 86.047);              /* #EAB308 - AMARELO MARCA */
  --primary-foreground: oklch(0.145 0 0);            /* #0A0A0A - texto escuro sobre amarelo */
  --secondary: oklch(0.97 0 0);                      /* #F5F5F5 */
  --secondary-foreground: oklch(0.205 0 0);          /* #1A1A1A */
  --muted: oklch(0.97 0 0);                          /* #F5F5F5 */
  --muted-foreground: oklch(0.556 0 0);              /* #737373 */
  --accent: oklch(0.97 0 0);                         /* #F5F5F5 */
  --accent-foreground: oklch(0.205 0 0);             /* #1A1A1A */
  --destructive: oklch(0.577 0.245 27.325);          /* ~#DC2626 */
  --success: oklch(0.627 0.194 149.214);             /* ~#22C55E */
  --success-foreground: oklch(1 0 0);                /* #FFFFFF */
  --warning: oklch(0.795 0.184 86.047);              /* = primary */
  --warning-foreground: oklch(0.145 0 0);            /* #0A0A0A */
  --info: oklch(0.623 0.214 259.815);                /* ~#3B82F6 */
  --info-foreground: oklch(1 0 0);                   /* #FFFFFF */
  --border: oklch(0.922 0 0);                        /* #E5E5E5 */
  --input: oklch(0.922 0 0);                         /* #E5E5E5 */
  --ring: oklch(0.795 0.184 86.047);                 /* #EAB308 - focus ring amarelo */
  --radius: 0.75rem;                                 /* 12px - BASE */

  /* Sidebar */
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.795 0.184 86.047);
  --sidebar-primary-foreground: oklch(0.145 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.795 0.184 86.047);

  /* Charts */
  --chart-1: oklch(0.795 0.184 86.047);             /* Amarelo */
  --chart-2: oklch(0.623 0.214 259.815);             /* Azul */
  --chart-3: oklch(0.627 0.194 149.214);             /* Verde */
  --chart-4: oklch(0.577 0.245 27.325);              /* Vermelho */
  --chart-5: oklch(0.627 0.265 303.9);               /* Roxo */
}
```

### Dark Mode (`.dark`)
```css
.dark {
  --background: oklch(0.141 0.005 285.823);          /* #09090B (zinc-950) */
  --foreground: oklch(0.985 0 0);                    /* #FAFAFA */
  --card: oklch(0.185 0.005 285.823);                /* #18181B (zinc-900) */
  --card-foreground: oklch(0.985 0 0);               /* #FAFAFA */
  --popover: oklch(0.185 0.005 285.823);             /* #18181B */
  --popover-foreground: oklch(0.985 0 0);            /* #FAFAFA */
  --primary: oklch(0.795 0.184 86.047);              /* AMARELO INALTERADO */
  --primary-foreground: oklch(0.145 0 0);            /* #0A0A0A */
  --secondary: oklch(0.236 0.005 285.823);           /* #27272A (zinc-800) */
  --secondary-foreground: oklch(0.985 0 0);          /* #FAFAFA */
  --muted: oklch(0.236 0.005 285.823);               /* #27272A */
  --muted-foreground: oklch(0.708 0 0);              /* #A3A3A3 */
  --accent: oklch(0.236 0.005 285.823);              /* #27272A */
  --accent-foreground: oklch(0.985 0 0);             /* #FAFAFA */
  --destructive: oklch(0.704 0.191 22.216);          /* ~#EF4444 (mais claro) */
  --border: oklch(1 0 0 / 10%);                     /* branco 10% */
  --input: oklch(1 0 0 / 15%);                      /* branco 15% */
  --ring: oklch(0.795 0.184 86.047);                 /* amarelo */

  /* Sidebar dark */
  --sidebar: oklch(0.161 0.005 285.823);
  --sidebar-accent: oklch(0.236 0.005 285.823);
}
```

### Cores de Status (usadas em badges e indicadores)
| Status     | Cor          | Hex       |
|------------|--------------|-----------|
| Disponivel | green-500    | #22C55E   |
| Em uso     | blue-500     | #3B82F6   |
| Pendente   | amber/yellow | #F59E0B   |
| Em progresso | violet-500 | #8B5CF6   |
| Pausado    | orange-500   | #F97316   |
| Concluido  | green-500    | #22C55E   |
| Cancelado  | red-500      | #EF4444   |
| Manutencao | yellow-500   | #EAB308   |
| Inativo    | zinc-400     | #A1A1AA   |

### Prioridades
| Prioridade | Cor        |
|------------|------------|
| Baixa      | green-500  |
| Media      | amber-500  |
| Alta       | orange-500 |
| Urgente    | red-500    |

---

## 3. TIPOGRAFIA

### Fontes
- **Sans:** Geist Sans (variavel CSS `--font-geist-sans`)
- **Mono:** Geist Mono (variavel CSS `--font-geist-mono`)
- Body com `antialiased`

### Escala Tipografica
| Contexto          | Classes Tailwind                                    |
|-------------------|-----------------------------------------------------|
| Titulo de pagina  | `text-2xl font-bold tracking-tight lg:text-3xl`     |
| Subtitulo pagina  | `text-muted-foreground`                             |
| Titulo de card    | `text-lg font-semibold leading-none tracking-tight`  |
| Descricao card    | `text-sm text-muted-foreground`                      |
| Titulo dialog     | `text-lg font-semibold leading-none tracking-tight`  |
| Body/texto geral  | `text-sm`                                            |
| Labels            | `text-sm font-medium leading-none text-foreground/80`|
| Texto secundario  | `text-xs text-muted-foreground`                      |
| Texto minusculo   | `text-[10px]`                                        |
| Erro              | `text-[13px] font-medium text-destructive`           |
| Login heading     | `text-2xl font-bold tracking-tight`                  |
| Login hero        | `text-4xl font-bold xl:text-5xl`                     |
| Badge default     | `text-xs`                                            |
| Badge small       | `text-[10px]`                                        |
| Botao default     | `text-sm font-medium`                                |
| Botao small       | `text-xs`                                            |
| Botao large       | `text-base`                                          |

---

## 4. BORDER RADIUS

Base: `--radius: 0.75rem` (12px)

| Uso                              | Classe          | Valor  |
|----------------------------------|-----------------|--------|
| Cards, inputs, modais, botoes    | `rounded-xl`    | 12px   |
| Botoes sm, pills, tooltips       | `rounded-lg`    | 8px    |
| Badges                           | `rounded-full`  | pill   |
| Logo icon                        | `rounded-lg`    | 8px    |
| Avatar                           | `rounded-full`  | circle |

---

## 5. SOMBRAS

| Elemento           | Sombra       | Hover          |
|---------------------|-------------|----------------|
| Cards (padrao)      | `shadow-sm` | `shadow-lg`    |
| Botoes              | `shadow-sm` | `shadow-md`    |
| Dropdowns/popovers  | `shadow-lg` | -              |
| Tooltips            | `shadow-lg` | -              |
| Dialogs             | `shadow-lg` | -              |

---

## 6. COMPONENTES UI

### 6.1 Button
**Base:** `inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98] cursor-pointer`

| Variante      | Classes                                                                     |
|---------------|-----------------------------------------------------------------------------|
| `default`     | `bg-primary text-primary-foreground shadow-sm hover:brightness-110 hover:shadow-md` |
| `destructive` | `bg-destructive text-white shadow-sm hover:bg-destructive/90 hover:shadow-md` |
| `outline`     | `border border-input bg-background hover:bg-accent hover:text-accent-foreground shadow-sm` |
| `secondary`   | `bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm`    |
| `ghost`       | `hover:bg-accent hover:text-accent-foreground`                              |
| `link`        | `text-primary underline-offset-4 hover:underline`                           |

| Tamanho   | Classes                          |
|-----------|----------------------------------|
| `default` | `h-10 px-5 py-2 rounded-xl`     |
| `sm`      | `h-8 rounded-lg px-3 text-xs`   |
| `lg`      | `h-12 rounded-xl px-8 text-base`|
| `icon`    | `h-10 w-10 rounded-xl`          |

**Loading:** icone `Loader2` com `animate-spin` ao lado do texto. Desabilita o botao.

### 6.2 Card
**Root:** `rounded-xl border bg-card text-card-foreground shadow-sm`
- Prop `glass`: adiciona glassmorphism (`bg-card/70 backdrop-blur-xl border-white/6`)
- Prop `hover`: `transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg`

| Subcomponente  | Classes                                              |
|----------------|------------------------------------------------------|
| CardHeader     | `flex flex-col space-y-1.5 p-6`                      |
| CardTitle      | `text-lg font-semibold leading-none tracking-tight`  |
| CardDescription| `text-sm text-muted-foreground`                      |
| CardContent    | `p-6 pt-0`                                          |
| CardFooter     | `flex items-center p-6 pt-0`                        |

### 6.3 Input
```
h-11 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm
ring-offset-background placeholder:text-muted-foreground
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
focus-visible:ring-offset-0 focus-visible:border-primary
disabled:cursor-not-allowed disabled:opacity-50
transition-all duration-200
```
- **Label:** `text-sm font-medium leading-none text-foreground/80`
- **Erro:** borda `border-destructive focus-visible:ring-destructive`
- **Msg erro:** `text-[13px] font-medium text-destructive`
- **Wrapper:** `w-full space-y-2`

### 6.4 Select Nativo
Mesma estilizacao do Input + `appearance-none pr-10` com icone `ChevronDown` posicionado `absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground`

### 6.5 Textarea
```
w-full rounded-xl border border-input bg-background px-4 py-3 text-sm
placeholder:text-muted-foreground focus-visible:outline-none
focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0
focus-visible:border-primary transition-all duration-200 resize-none
```

### 6.6 Badge
**Base:** `inline-flex items-center rounded-full font-medium transition-colors`

| Variante      | Background          | Texto                                    |
|---------------|---------------------|------------------------------------------|
| `default`     | `bg-primary/15`     | `text-primary`                           |
| `secondary`   | `bg-secondary`      | `text-secondary-foreground`              |
| `destructive` | `bg-red-500/15`     | `text-red-500`                           |
| `outline`     | `border border-input`| `text-foreground`                       |
| `success`     | `bg-green-500/15`   | `text-green-500`                         |
| `warning`     | `bg-yellow-500/15`  | `text-yellow-600 dark:text-yellow-400`   |
| `info`        | `bg-blue-500/15`    | `text-blue-500`                          |
| `purple`      | `bg-purple-500/15`  | `text-purple-500`                        |
| `orange`      | `bg-orange-500/15`  | `text-orange-500`                        |
| `gray`        | `bg-zinc-500/15`    | `text-zinc-500`                          |

**PADRAO IMPORTANTE:** Todos os badges coloridos usam `{cor}-500/15` para background com `{cor}-500` para texto.

| Tamanho   | Classes                      |
|-----------|------------------------------|
| `sm`      | `px-2 py-0.5 text-[10px]`   |
| `default` | `px-2.5 py-0.5 text-xs`     |

### 6.7 Dialog/Modal
**Overlay:** `fixed inset-0 bg-black/50 backdrop-blur-sm`
**Painel:** `w-full rounded-xl border bg-card text-card-foreground shadow-lg`
**Tamanhos:** `sm: max-w-sm`, `md: max-w-lg`, `lg: max-w-2xl`
**Close:** `absolute right-4 top-4 rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground`

**Modal inline (padrao alternativo):**
```
Overlay: fixed inset-0 bg-black/60 backdrop-blur-sm
Painel:  w-full max-w-lg rounded-xl bg-card border p-6 shadow-xl mx-4 max-h-[90vh] overflow-y-auto
Titulo:  text-lg font-semibold mb-4
Acoes:   flex justify-end gap-3 mt-6
```

### 6.8 Skeleton
```
relative overflow-hidden rounded-lg bg-muted
after:absolute after:inset-0 after:translate-x-[-100%]
after:bg-gradient-to-r after:from-transparent after:via-white/10 after:to-transparent
after:animate-shimmer
```
Animacao shimmer: slide de background-position -200% -> 200%, 2s linear infinite.

### 6.9 Empty State
```
flex flex-col items-center justify-center py-16 text-center
```
- Icone: `h-14 w-14 rounded-xl bg-muted text-muted-foreground`
- Titulo: `mt-4 text-base font-semibold text-foreground`
- Descricao: `mt-1 max-w-sm text-sm text-muted-foreground`
- Acao: `mt-4`

### 6.10 Toast (Sonner)
```javascript
{
  position: "top-right",
  richColors: true,
  closeButton: true,
  style: {
    borderRadius: "12px",
    border: "1px solid var(--border)",
    background: "var(--card)",
    color: "var(--card-foreground)",
  }
}
```

---

## 7. LAYOUT

### 7.1 Dashboard Layout
```
flex h-screen overflow-hidden bg-background
```

### 7.2 Sidebar
- **Largura:** 280px expandida, 72px colapsada
- **Posicao:** `fixed inset-y-0 left-0 z-50 lg:relative`
- **Background:** `bg-sidebar/80 backdrop-blur-xl`
- **Borda:** `border-r border-sidebar-border`
- **Transicao:** `transition-all duration-300 ease-in-out`
- **Mobile:** `-translate-x-full` escondido, `translate-x-0` visivel
- **Overlay mobile:** `fixed inset-0 z-40 bg-black/50 backdrop-blur-sm`

#### Sidebar Header
- Altura: `h-16`, borda `border-b border-sidebar-border`, padding `px-4`
- Logo: `h-8 w-8 rounded-lg bg-primary` com letra `text-sm font-bold text-primary-foreground`
- Nome: `text-base font-semibold text-sidebar-foreground`

#### Sidebar Nav Items
- Container: `space-y-1 px-3 py-4`
- Links: `rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200`
- **Ativo:** `bg-primary/10 text-primary`
- **Inativo:** `text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground`
- **Indicador ativo:** barra amarela `w-[3px] h-6 rounded-r-full bg-primary` animada com `layoutId="activeNav"` (Framer Motion spring: stiffness 300, damping 30)
- Icones: `h-5 w-5 shrink-0`

#### Sidebar User
- Avatar: `h-8 w-8 rounded-full bg-primary/20 text-sm font-semibold text-primary`
- Dropdown: `rounded-xl border bg-popover p-1 shadow-lg`
- Items: `rounded-lg px-3 py-2 text-sm text-popover-foreground hover:bg-accent`
- Destrutivo: `text-destructive hover:bg-destructive/10`

### 7.3 Header Bar
```
h-16 border-b border-border bg-background/80 backdrop-blur-xl px-4 lg:px-6 z-50
```
- **Breadcrumb:** `text-sm text-muted-foreground hover:text-foreground`, ultimo `font-medium text-foreground`
- **Busca global:** `h-9 w-64 rounded-xl border border-input bg-secondary/50 pl-9 pr-4 text-sm`
- **Atalho teclado:** `rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground`

### 7.4 Area de Conteudo
- `flex-1 overflow-y-auto`
- Wrapper: `h-full p-4 lg:p-6`
- Transicao de pagina: Framer Motion `opacity: 0, y: 8` -> `opacity: 1, y: 0`

---

## 8. PADROES DE PAGINA

### 8.1 Page Header
```
flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between
```
- Titulo: `text-2xl font-bold tracking-tight lg:text-3xl`
- Contador: `inline-flex h-7 items-center rounded-lg bg-primary/10 px-2.5 text-sm font-semibold text-primary`
- Subtitulo: `text-muted-foreground`
- Botao acao: alinhado a direita
- Framer Motion: `initial={{ opacity: 0, y: -10 }}` -> `animate={{ opacity: 1, y: 0 }}`

### 8.2 Tabelas
- Container: `<Card>` envolvendo `<div className="overflow-x-auto">`
- Table: `w-full`
- Header: `border-b text-left`
- Celulas header: `whitespace-nowrap px-6 py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground`
- Body: `divide-y`
- Rows: animacao staggered `delay: index * 0.04`, `hover:bg-accent/50`
- Celulas: `whitespace-nowrap px-6 py-4`

### 8.3 Menu de Acoes (Context)
- Trigger: `h-8 w-8 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground`
- Dropdown: `w-44 rounded-xl border bg-popover p-1 shadow-lg`
- Items: `rounded-lg px-3 py-2 text-sm hover:bg-accent`
- Destrutivo: `text-destructive hover:bg-destructive/10`

### 8.4 Paginacao
- Container: `border-t px-6 py-4`
- Info: `text-sm text-muted-foreground`
- Botoes pagina: `h-8 w-8 rounded-lg text-sm font-medium`
- Ativo: `bg-primary text-primary-foreground`
- Inativo: `text-muted-foreground hover:bg-accent`

### 8.5 Tabs
```
flex gap-1 rounded-xl bg-secondary/50 p-1
```
- Cada tab: `rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200`
- Ativo: `text-foreground` com pill animada via `layoutId` (Framer Motion)
- Pill animada: `absolute inset-0 rounded-lg bg-background shadow-sm`
- Inativo: `text-muted-foreground hover:text-foreground`

### 8.6 Filter Pills
```
flex gap-1 rounded-lg bg-secondary/50 p-0.5
```
- Cada pill: `rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200`
- Ativo: `bg-background text-foreground shadow-sm`
- Inativo: `text-muted-foreground hover:text-foreground`

### 8.7 View Toggle (Tabela/Kanban)
```
flex items-center gap-1 rounded-xl border border-input p-1
```
- Botoes: `h-9 w-9 rounded-lg transition-all duration-200`
- Ativo: `bg-primary text-primary-foreground shadow-sm`
- Inativo: `text-muted-foreground hover:text-foreground`

### 8.8 Login/Auth
- Layout split: `flex min-h-screen`
- Painel esquerdo (branding): `hidden w-1/2 bg-zinc-950 p-12 lg:flex` com noise-bg, grid pattern, glow effects
- Painel direito (form): `flex w-full items-center justify-center bg-background px-6 lg:w-1/2`
- Form: `w-full max-w-[420px] space-y-8`
- Logo: `h-10 w-10 rounded-xl bg-yellow-500` com `text-lg font-bold text-black`
- Glow: `rounded-full bg-yellow-500/10 blur-[128px]`
- Grid: 64px grid `opacity-[0.03]`
- Botao submit: `Button size="lg" className="w-full text-base font-semibold"`

### 8.9 Cards Metricos (Dashboard)
- Linha de acento: `absolute inset-x-0 top-0 h-[2px]` com cor customizada
- Container icone: `h-10 w-10 rounded-xl` com background `{cor}/15`
- Valor: `text-3xl font-bold tracking-tight`
- Label: `text-sm font-medium text-muted-foreground`
- Variacao: `text-xs font-medium` com green-500/red-500/muted-foreground

---

## 9. ANIMACOES E TRANSICOES

### Transicoes Globais
Todos os elementos interativos (`button`, `a`, `input`, `select`, `textarea`, `[role="button"]`):
```css
transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
```

### Keyframes CSS
```css
@keyframes shimmer    { from { background-position: -200% 0 } to { background-position: 200% 0 } } /* 2s linear infinite */
@keyframes fadeIn     { from { opacity: 0 } to { opacity: 1 } }                                     /* 0.5s ease-out */
@keyframes slideUp    { from { opacity: 0; transform: translateY(10px) } to { visible } }           /* 0.5s ease-out */
@keyframes slideDown  { from { opacity: 0; transform: translateY(-10px) } to { visible } }          /* 0.3s ease-out */
@keyframes scaleIn    { from { opacity: 0; transform: scale(0.95) } to { visible; scale(1) } }     /* 0.2s ease-out */
```

### Framer Motion Patterns
| Contexto               | Initial                       | Animate                    | Duracao   |
|------------------------|-------------------------------|----------------------------|-----------|
| Transicao de pagina    | `opacity: 0, y: 8`           | `opacity: 1, y: 0`        | 0.25s     |
| Header de pagina       | `opacity: 0, y: -10`         | `opacity: 1, y: 0`        | 0.4s      |
| Cards/blocos           | `opacity: 0, y: 20`          | `opacity: 1, y: 0`        | 0.3s + stagger 0.05s |
| Linhas de tabela       | `opacity: 0, y: 8`           | `opacity: 1, y: 0`        | 0.3s + stagger 0.04s |
| Sidebar ativo          | Spring `stiffness: 300, damping: 30` | via `layoutId`    | spring    |
| Dropdowns              | `opacity: 0, y: 5, scale: 0.97` | `opacity: 1, y: 0, scale: 1` | 0.2s |
| Tab switching          | `opacity: 0, x: -20` ou `x: 20` | `opacity: 1, x: 0`     | 0.3s      |
| Login stagger          | delays: 0.3, 0.4, 0.5, 0.6, 0.7, 0.9, 1.0 | -             | 0.5-0.7s  |

### Interacoes
- **Hover elevacao (cards):** `hover:-translate-y-0.5 hover:shadow-lg` com `duration-300`
- **Press (botoes):** `active:scale-[0.98]`
- **Hover botoes:** `hover:brightness-110 hover:shadow-md`
- **Sidebar transicao:** `transition-all duration-300 ease-in-out`

---

## 10. CLASSES UTILITARIAS CUSTOMIZADAS

### Glassmorphism (`.glass`)
```css
/* Light */
background: oklch(1 0 0 / 0.7);
backdrop-filter: blur(16px);
border: 1px solid oklch(0 0 0 / 0.06);

/* Dark */
background: oklch(0.185 0.005 285.823 / 0.5);
border: 1px solid oklch(1 0 0 / 0.08);
```

### Gradient Brand (`.gradient-brand`)
```css
background: linear-gradient(135deg, var(--primary), oklch(0.85 0.15 86));
```

### Text Gradient (`.text-gradient`)
```css
background: linear-gradient(135deg, var(--primary), oklch(0.85 0.15 86));
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
```

### Noise Background (`.noise-bg`)
SVG noise fractal overlay com `opacity: 0.03`

---

## 11. SCROLLBAR CUSTOMIZADO
```css
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: oklch(0.556 0 0 / 0.3); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: oklch(0.556 0 0 / 0.5); }

/* Dark */
.dark ::-webkit-scrollbar-thumb { background: oklch(0.708 0 0 / 0.2); }
.dark ::-webkit-scrollbar-thumb:hover { background: oklch(0.708 0 0 / 0.4); }
```

---

## 12. PADROES DE OPACIDADE

| Uso                          | Padrao               |
|------------------------------|----------------------|
| Background nav ativo         | `{cor}/10`           |
| Background badges            | `{cor}/15`           |
| Background avatar            | `primary/20`         |
| Hover texto link             | `primary/80`         |
| Overlay modal                | `black/50`           |
| Overlay modal inline         | `black/60`           |
| Overlay lightbox             | `black/90`           |
| Botoes escuros               | `white/10`, hover `white/20` |
| Borders dark mode            | `white/10`           |
| Input borders dark           | `white/15`           |
| Disabled                     | `opacity-50`         |

---

## 13. ICONES

- **Biblioteca:** Lucide React EXCLUSIVAMENTE
- **Tamanho padrao (nav/header):** `h-5 w-5`
- **Tamanho botoes/inline:** `h-4 w-4`
- **Tamanho meta/secundario:** `h-3 w-3` a `h-3.5 w-3.5`
- **Tamanho empty state:** `h-6 w-6` a `h-8 w-8`
- **Container de icone:** `rounded-xl` ou `rounded-lg` com `{cor}-500/10` ou `{cor}-500/15` background

---

## 14. BREAKPOINTS RESPONSIVOS

| Prefixo | Min Width | Uso                                          |
|---------|-----------|----------------------------------------------|
| `sm`    | 640px     | Forms 2 colunas                              |
| `md`    | 768px     | Search bar visivel, grids 2 colunas          |
| `lg`    | 1024px    | Sidebar visivel, tabelas desktop, 3 colunas  |
| `xl`    | 1280px    | 4 colunas metricas, kanban 4 colunas         |

- Mobile menu abaixo de `lg`
- Content padding: `p-4` mobile, `p-6` em `lg`
- Tabelas desktop em `lg:block`, cards mobile em `lg:hidden`

---

## 15. DARK MODE

- Ativado via classe `.dark` no `<html>` (class-based strategy)
- Custom variant: `@custom-variant dark (&:is(.dark *));`
- Persistido em `localStorage` key `"theme"` ("dark" / "light")
- Fallback: `prefers-color-scheme: dark`
- Toggle no header bar

---

## 16. REGRAS GERAIS

1. **NUNCA** usar icones de outra biblioteca que nao Lucide React
2. **SEMPRE** usar `rounded-xl` para cards, inputs, botoes default, modais
3. **SEMPRE** usar `rounded-lg` para botoes sm e elementos secundarios
4. **SEMPRE** usar `rounded-full` para badges e avatares
5. **SEMPRE** usar Framer Motion para animacoes de entrada de elementos
6. **SEMPRE** usar `transition-all duration-200` para hover states
7. **SEMPRE** usar `active:scale-[0.98]` em botoes
8. **SEMPRE** usar o padrao `{cor}-500/15` para background de badges coloridos
9. **SEMPRE** usar `shadow-sm` como sombra base e `shadow-lg` em hover/elevacao
10. **SEMPRE** usar `space-y-6` entre secoes de pagina
11. **SEMPRE** usar `backdrop-blur-xl` na sidebar e header
12. **SEMPRE** usar `backdrop-blur-sm` em overlays de modal
13. **SEMPRE** manter o amarelo `#EAB308` como cor primaria e de destaque
14. **NUNCA** usar bordas arredondadas menores que `rounded-lg` (exceto scrollbar)
15. **SEMPRE** usar os tokens CSS (--background, --foreground, etc.) ao inves de cores hardcoded
16. **SEMPRE** implementar versao mobile e desktop das tabelas (tabela em lg:block, cards em lg:hidden)
17. **SEMPRE** usar `text-foreground/80` para labels de formulario
18. **SEMPRE** usar animacao staggered com Framer Motion para listas de cards/rows
