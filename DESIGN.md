# Design

<!-- impeccable:design-schema 1 -->

Sistema visual da Telinha, registrado a partir do que está construído (não da intenção).
Mundo: **fliperama** — o app é um gabinete de arcade da turma. Cada transmissão é um
gabinete ligado. Néon e risco de CRT vivem no chrome e nas molduras; **o vídeo nunca é
tocado** (sem scanline, sem brilho, sem filtro por cima).

Seed da direção: `ba494f63` (reroll 1, escopo direction, modo operate).

## Cores

Superfícies (gabinete):

| Token | Valor | Uso |
|---|---|---|
| `--ground` | `#07070c` | fundo da página |
| `--panel` | `#0e0e17` | painéis, topbar (gradiente com panel-2) |
| `--panel-2` | `#16162a` | topo dos gradientes de painel |
| `--panel-3` | `#1f1f38` | aba ativa do seletor |
| `--line` | `#2c2c4d` | bordas |
| `--line-hi` | `#3d3d68` | bordas em destaque, scrollbar |
| inset | `#08080f` | fundo de campo/chip (com sombra interna) |

Tinta:

| Token | Valor | Contraste mín. nos fundos |
|---|---|---|
| `--ink` | `#eceafc` | 15:1 |
| `--ink-2` | `#b9b7e0` | 9.2:1 |
| `--ink-3` | `#918fbd` | 5.8:1 |
| placeholder | `#7e7caa` | 4.5:1 |

Néon e ação:

| Token | Valor | Papel |
|---|---|---|
| `--neon` | `#ff2e7e` | luz do letreiro (marquee, brand), hover de barra |
| `--neon-2` | `#23e0ff` | acento de UI: foco, links, códigos, dados |
| `--coin` | `#ffc23d` | **ação primária** (botão-ficha) e PRESS START |
| `--coin-deep` | `#d99514` | borda inferior 3D do botão-ficha |

Players (cores de LED, atribuídas por ordem de entrada): `--p1 #ff5252`,
`--p2 #5aa9ff`, `--p3 #ffc23d`, `--p4 #43dd8b`, `--p5 #ff2e7e`.
Estado: `--erro #ff5252`, `--alerta #ffc23d`, ok = `--p4`.

Estratégia de cor: **restrained** — preto de gabinete + acentos de luz. A cor só ocupa
região grande onde é literalmente uma luz (marquee) ou a ação principal (ficha).

## Tipografia

- **Display:** `Press Start 2P` (self-hospedada, `/fonts/PressStart2P-Regular.woff2`,
  `font-display: block`). Usada com parcimônia e só onde o gabinete "fala":
  marquee da home, brand da topbar, `PRESS START`, títulos de `/uso`, `.notice h2`,
  `.pulse`. Nunca em texto corrido.
- **UI:** `Chakra Petch` 400/500/600/700 (self-hospedada, subset latin+latin-ext).
- Rótulos de campo e chips: 11–12px, `letter-spacing: .08–.12em`, uppercase.
- Números (GB, dias, código da sala): `font-variant-numeric: tabular-nums`.
- Código da sala: `letter-spacing: .34em` (home) / `.22em` (chip), em `--neon-2`.

## Componentes

- **Marquee** (`.marquee`): letreiro que transborda o topo do painel (`margin: -54px -14px`),
  fundo roxo escuro, borda `#4a2360`, texto com 4 camadas de `text-shadow` (branco →
  magenta → magenta difuso → ciano). Anima uma vez ao carregar (`acende`).
- **Botão-ficha** (`.btn-primary`): amarelo `--coin`, `box-shadow: 0 4px 0 --coin-deep`
  + brilho difuso; no `:active` desce 3px e a base encurta (afundar de botão de arcade).
  `.btn-danger` segue a mesma mecânica em vermelho. `.btn-ghost` é contorno.
- **Campo** (`input`): fundo quase preto com `inset 0 2px 6px` (recesso), foco = borda
  ciano + anel de 3px a 16% de opacidade. `caret-color: --neon-2`.
- **Tile** (`.tile`): bezel de 7px de padding com gradiente de painel, vídeo com
  `border-radius: 9px` dentro. Selo `AO VIVO` (ponto vermelho pulsando) no topo-esquerdo
  e `.tile-bar` no rodapé aparecem no hover — **sempre visíveis em `@media (hover: none)`**.
  Foco = borda ciano.
- **Chip de player** (`.peer`): `1UP · nick`, LED colorido na frente, pílula com fundo
  inset. Em ≤760px a barra vira uma linha só com scroll horizontal.
- **Medidor** (`.uso-barra`/`.uso-fill`): barra de energia segmentada
  (`repeating-linear-gradient` 9px cheio / 3px vazio) revelada por
  `clip-path: inset(0 calc(100% - var(--pct)) 0 0)` — nunca por `width` (jank).
- **Toast** (`.toast`): painel com ícone SVG, entra deslizando 26px em
  `cubic-bezier(.16,1,.3,1)`; no mobile vem de baixo.
- **Ícones**: `src/icons.jsx`, SVG autorais, stroke 2, `linecap/linejoin: round`,
  24×24. Nenhum emoji na interface.

## Textura e profundidade

- Risco de CRT: `repeating-linear-gradient(180deg, rgba(255,255,255,.04) 0 1px, transparent 1px 3px)`
  aplicado **só** em `.topbar::after` e `.marquee::after`.
- Sombras sempre com deslocamento + desfoque (`--sombra-painel`); brilho sem
  deslocamento existe apenas em elementos que emitem luz (marquee, LED, `AO VIVO`).

## Movimento

Uma gramática: **o que emite luz pisca; o resto não se move.**

- `acende` — marquee ligando, uma vez, `steps(1, end)` (flicker de néon).
- `pisca` — `PRESS START`, ponto do `AO VIVO`, `.pulse` de carregando.
- `toast-in` / `toast-in-mobile` — entrada de aviso.
- Transições de estado: 0.09–0.16s. `clip-path` do medidor: 0.55s.
- `@media (prefers-reduced-motion: reduce)` zera durações e deixa tudo no estado final.

## Superfícies do navegador (tematizadas)

`::selection` magenta com texto `#12000a`; `caret-color` ciano; `::placeholder` `#7e7caa`;
`:focus-visible` = contorno ciano 2px com `offset: 3px`; scrollbar fina com polegar
`--line-hi` que fica magenta no hover; `text-underline-offset: 3px` nos links.

## Responsivo

- ≤760px: grade de vídeos em coluna única; topbar em duas linhas com botões esticados;
  placar em linha única com scroll; toasts embaixo; leitura do medidor ganha linha própria;
  gráfico 170px.
- ≤420px: painel da home com padding menor, marquee mais justo, chips menores.

## Acessibilidade

- Texto de corpo ≥4.5:1 e display ≥3:1 em todos os fundos (verificado por cálculo).
- Nome do estado nunca só por cor: chips trazem `1UP/2UP` + nick; status de `/uso`
  traz LED **e** palavra; overlays de conexão trazem texto.
- `/uso` tem tabela alternativa (`<details>`) para o gráfico de barras.
- Foco visível em tudo que é focável; controles do tile alcançáveis em toque.
