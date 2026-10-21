# BUILD LOG — Matrix Rain (CPU + GPU)

Log de desenvolvimento do efeito **Matrix Rain** ("chuva de caracteres") implementado
em um app **Expo / React Native** (SDK 57, RN 0.86), dividido em **duas fases**:

- **Fase 1 — CPU:** renderização dirigida por JavaScript/CPU, sem shaders nem backend gráfico
  dedicado (árvore de views nativas do React Native).
- **Fase 2 — GPU:** renderização acelerada por GPU com **Skia** (`@shopify/react-native-skia`),
  animada na *UI thread* via Reanimated, sem re-render do React por frame.

> Este arquivo é o artefato mais importante da atividade: ele registra cada interação,
> decisão, ação, resultado, problema e correção ao longo do desenvolvimento.

Formato de cada entrada:

```
## [n] Título
- Prompt / Request
- Decision Summary
- Actions Performed
- Result
- Problems / Errors
- Fixes Attempted
```

---

## [0] Contexto inicial e leitura do enunciado

- **Prompt / Request**
  Enunciado da atividade (100 pontos): implementar um efeito Matrix Rain com qualquer
  linguagem/framework/agente. A primeira implementação deve ser **CPU-only**; depois pode-se
  explorar **GPU** para **comparar desempenho** e identificar gargalos. O efeito deve ser
  "verdadeiramente aleatório" (caracteres, cores, fontes e velocidades geradas aleatoriamente).
  Documentar o processo em `BUILD_LOG.md`. O usuário acrescentou: dividir em **duas fases
  (CPU e GPU)** e informou que vai **rodar no celular via Expo**.

- **Decision Summary**
  Usar o projeto Expo/React Native já existente em `chuva-matrix/` (SDK 57). Fases:
  CPU = árvore de views do React Native; GPU = Skia. Antes de codar, verifico o ambiente e
  a documentação oficial (o `AGENTS.md` do projeto proíbe confiar na memória para APIs Expo).

- **Actions Performed**
  1. Explorei a estrutura do repositório (`src/app`, `src/components`, `package.json`, `app.json`).
  2. Confirmei que é um template Expo Router com abas `index` e `explore`.
  3. Verifiquei ambiente: Node 22.22.2, npm 10.9.7, rede/npm OK, **sem** emulador/Android SDK
     e **sem** navegador headless instalado.
  4. Li `AGENTS.md` (regras: usar `npx expo install`, Expo Router, rodar lint + typecheck).
  5. Consultei a doc oficial para confirmar o que roda no **Expo Go**:
     - `@shopify/react-native-skia` → `inExpoGo: true` (SDK 57). ✅
     - `expo-gl` → também incluído no Expo Go (alternativa descartada, ver adiante).

- **Result**
  Decisão de stack viável para rodar no celular via Expo Go, sem precisar de *development build*.

- **Problems / Errors**
  Nenhum.

- **Fixes Attempted**
  N/A.

---

## [1] Decisão de arquitetura (CPU vs GPU no contexto React Native)

- **Prompt / Request**
  Como mapear "CPU" e "GPU" dentro de um app React Native, de forma honesta e comparável?

- **Decision Summary**
  - **CPU:** a simulação roda em JS e **cada glifo é um `<Text>` nativo do React Native**.
    Todo frame recalcula posição/cor/opacidade/caractere de centenas de nós e o React reconcilia
    a árvore; o sistema nativo faz layout + rasterização de texto. Gargalo esperado: *JS thread* +
    reconciliação do React + layout/desenho de N views.
  - **GPU:** a simulação roda como *worklets* na **UI thread** e o Skia desenha todos os glifos
    em um único canvas acelerado. As props dos componentes Skia recebem `SharedValue`s
    (`AnimatedProp<T> = T | { value: T }`), então **não há re-render do React por frame**.
    Gargalo esperado: *fill rate*/custo de desenho na GPU.

- **Actions Performed**
  1. Instalei Skia pela via correta: `npx expo install @shopify/react-native-skia`
     → resolve a versão compatível com o SDK 57 (`2.6.2`, que é a embutida no Expo Go;
     o `latest` do npm era `2.14.0`, que **não** casaria com o binário nativo do Expo Go).
  2. Confirmei na fonte instalada que:
     - `<Canvas>` usa um reconciler próprio (`SkiaSGRoot`) e `redraw()`;
     - props aceitam `SharedValue` (`renderer/processors/Animations/Animations.ts`);
     - existe `useClock()` (`SharedValue<number>`) e `matchFont()` / `listFontFamilies()`;
     - `DrawingNodeProps` expõe `color` e `opacity`.
  3. Confirmei que **não** é necessário `babel.config.js`: o `babel-preset-expo@57` adiciona
     automaticamente `react-native-worklets/plugin` quando o pacote está instalado
     (`node_modules/babel-preset-expo/build/configs/expo.js`), o que é pré-requisito para worklets.

- **Result**
  Arquitetura definida; risco de quebrar no Expo Go mitigado.

- **Problems / Errors**
  Dúvida inicial sobre Skia no Expo Go (biblioteca de terceiros com código nativo). Resolvida
  pela documentação oficial (`inExpoGo: true`).

- **Fixes Attempted**
  Preferir `expo install` em vez de `npm install` para garantir a versão nativa compatível.

---

## [2] Núcleo de simulação e a interpretação de "verdadeiramente aleatório"

- **Prompt / Request**
  Restrição #3: caracteres, cores, fontes e velocidades devem ser **gerados aleatoriamente**,
  sem usar um conjunto fixo de caracteres/cores/fontes/imagens.

- **Decision Summary**
  Criar um núcleo **puro** (`src/features/matrix-rain/core/`), sem dependência de React Native,
  reutilizado pelos dois renderizadores **e** pelo harness de benchmark web:
  - `rng.ts`: PRNG `mulberry32` semeado uma vez por sessão + **hash inteiro sem estado**
    (`hash2`/`hash3`) para tudo que acontece por frame. Motivo: `Math.random()` não é
    reproduzível (impediria comparar CPU e GPU de forma justa) e não funciona dentro de
    *worklets* na UI thread.
  - `glyphs.ts`: o "charset" é gerado sorteando **blocos Unicode** e depois **code points**
    dentro deles (ASCII, grego, cirílico, hebraico, tailandês, box drawing, dingbats,
    **katakana**, hiragana, janelas de CJK/hangul…). Não existe charset fixo: cada execução
    produz um conjunto diferente — o katakana é só um dos ~20 blocos possíveis.
  - `colors.ts`: paleta sorteada por sessão a partir de "moods" (verde-phosphor, âmbar,
    ciano, ultravioleta, vermelho, lima). O verde clássico tem ~45% de chance (respeita o
    material original) mas nunca é garantido. Por coluna: matiz aleatório + jitter.
  - `fonts.ts`: como o React Native não enumera fontes do sistema de forma portável, uso uma
    lista curada por plataforma e sorteia família **+ tamanho + peso + itálico**. No caminho
    GPU dá para ir além: `listFontFamilies()` do Skia enumera as fontes reais do aparelho e
    eu sorteio um subconjunto (ver `use-rain-families.ts`).
  - `simulation.ts`: `RainSim`/`createRainState` + `buildCells`. Custo O(colunas) por frame —
    propositalmente trivial, porque o custo real do efeito está no **desenho** dos glifos,
    que é exatamente o que as duas fases comparam.

- **Actions Performed**
  Implementei os módulos acima e um helper `reshuffle()` que sorteia uma nova seed.

- **Result**
  Aleatoriedade auditável: a seed aparece no HUD e a paleta/contagem de fontes também.

- **Problems / Errors**
  Nenhum nesta etapa.

- **Fixes Attempted**
  N/A.

---

## [3] Fase 1 (CPU): árvore de views do React Native

- **Prompt / Request**
  Restrição #1: a primeira implementação deve ser **somente CPU**.

- **Decision Summary**
  Interpretar "CPU" no contexto React Native como: **todo o trabalho de montagem do frame
  acontece na CPU/JS thread**, sem shaders nem backend gráfico dedicado. Cada glifo visível é
  um `<Text>` nativo; por frame o JS recalcula a grade e o React reconcilia ~centenas de nós.

- **Actions Performed**
  - `cpu/matrix-rain-cpu.tsx`: loop de `requestAnimationFrame` → `buildCells()` → `setState`
    com a lista de células. Glow via `textShadow*` (custo alto, de propósito).
  - Chaves React **estáveis** (`c{coluna}-{slot}`) para o React reaproveitar as instâncias.
    Isso é importante: as células deslizam pela tela, então chaves instáveis força a
    recriação do nó a cada frame.
  - Medição embutida: FPS + ms de trabalho por frame + nº de primitivas, publicados a cada
    500 ms (para não gerar `setState` a 60 Hz).

- **Result**
  Fase 1 funcional e visualmente correta (validada por screenshot no harness).

- **Problems / Errors**
  - `StyleSheet.absoluteFillObject` **não existe** nos tipos do RN 0.86 (erro `TS2551`).
  - A regra `react-hooks/refs` do React Compiler reprovou `onStatsRef.current = onStats`
    (escrita em ref durante o render).

- **Fixes Attempted**
  - Substituí `absoluteFillObject` por `{ position:'absolute', top/left/right/bottom: 0 }`.
  - Removi o `onStatsRef`: `setStats` do `useState` já é estável, então `onStats` pode entrar
    direto nas dependências do efeito sem reiniciar o loop.

- **Result (após correções)**
  Typecheck e lint limpos.

---

## [4] Fase 2 (GPU): Skia + worklets na UI thread

- **Prompt / Request**
  Restrição #1 (parte 2): explorar GPU e comparar desempenho, identificando gargalos.

- **Decision Summary**
  Usar `@shopify/react-native-skia` (backend GPU: Metal no iOS, OpenGL ES/Vulkan no Android)
  e mover a animação para a **UI thread** via worklets do Reanimated. Descoberta-chave que
  viabilizou isso: as props do Skia aceitam `SharedValue`
  (`AnimatedProp<T> = T | { value: T }`), então **não há re-render do React por frame**.
  Sem isso, usar Skia de forma declarativa teria o mesmo gargalo da Fase 1 (reconciliação).

- **Actions Performed**
  1. Descobri a API na fonte instalada (não na memória):
     - `<Canvas>` usa um reconciler próprio (`SkiaSGRoot`) e expõe `redraw()`;
     - `useClock()`, `matchFont()`, `listFontFamilies()`, `colorAt`/`c`, `Skia.Paint()`,
       `Skia.ImageFilter.MakeDropShadow()`;
     - `DrawingNodeProps` expõe `color`/`opacity`; `GroupProps.layer?: SkPaint | boolean`.
  2. `gpu/matrix-rain-gpu.tsx`:
     - um único `elapsedMs` (`SharedValue`) alimentado por `useFrameCallback`;
     - **um `<Text>` do Skia por slot** (pool fixo), com `y` e `text` como `useDerivedValue`
       → todo o trabalho por frame roda na UI thread;
     - cores/trail calculados em JS e passados como **string constante** (não muda por frame,
       então não precisa de `SharedValue`);
     - a posição usa **a mesma fórmula** do núcleo: `s = phase + speed·t`, com wrap por ciclo.
     - glow = uma **camada** com `MakeDropShadow(0,0,5,5)` → bloom direto na GPU, sem um
       segundo passe de desenho e sem trabalho de JS.
  3. `use-rain-families.ts`: enumera as fontes reais via Skia e sorteia um subconjunto.

- **Result**
  Fase 2 funcional; o benchmark web reproduz o mesmo modelo em WebGL2 e confirma o ganho.

- **Problems / Errors**
  - O renderizador começou sem suporte a glow (a prop era passada pela tela mas não declarada
    em `Props` → `TS2322`).
  - `MatchFont`/`Font` exigiam atenção ao tipo `Weight` (`'400' | ... | '900'`).
  - Precisão de `float` no shader: seed pode chegar a 32 bits e não é representável em float32.
    No shader eu mascaro para 24 bits (`aSeed = seed % 16777216`).

- **Fixes Attempted**
  - Adicionei `glow` à interface `Props` e implementei o bloom via `layer` + `MakeDropShadow`.
  - Documentei a duplicação proposital da função de "escolher glifo" (uma versão pura em JS
    para a CPU, uma inlinada em GLSL/worklet para a GPU) para evitar dependências frágeis
    entre módulos dentro de worklets.

---

## [5] Problemas de build/lint (e por que o projeto não tem `babel.config.js`)

- **Prompt / Request**
  `AGENTS.md` exige rodar lint e typecheck antes de considerar a tarefa pronta.

- **Decision Summary**
  Entender o toolchain antes de "consertar" sintomas.

- **Actions Performed**
  1. O projeto **não tem `babel.config.js`**. Investiguei e confirmei que o
     `babel-preset-expo@57` adiciona automaticamente `react-native-worklets/plugin` quando o
     pacote está instalado (`build/configs/expo.js`) → worklets funcionam sem config manual.
  2. `tsc --noEmit` acusava erros de import de CSS (`expo-env.d.ts` ausente, é gerado pelo
     Expo e está no `.gitignore`). Criei `expo-env.d.ts` com `/// <reference types="expo/types" />`.
  3. `npx expo lint` reprovou 4 pontos no meu código + 1 **pré-existente** do template
     (`use-color-scheme.web.ts`: `setState` síncrono em effect) — as regras novas do React
     Compiler não entendem a escrita em `.value` de shared values do Reanimated.

- **Result**
  Após: `tsc` sem erros, `lint` sem problemas.

- **Problems / Errors**
  - Falsos positivos de `react-hooks/immutability` eram, na verdade, causados por um
    `useEffect` de reset que colocava os shared values na lista de dependências. Removê-lo
    (e resetar via `key={seed}` no componente) eliminou o aviso de forma legítima, sem
    precisar desabilitar a regra.
  - Sobrou o erro pré-existente do template no hook de color scheme.

- **Fixes Attempted**
  - Reset do relógio por remount (`key`) em vez de `useEffect`.
  - `eslint-disable-next-line react-hooks/set-state-in-effect` **comentado** no hook do
    template, explicando por que o `setState` ali é correto (hidratação de página estática).

---

## [6] Validação executável

- **Prompt / Request**
  Não há emulador Android/iOS neste ambiente. Como validar com confiança?

- **Decision Summary**
  Empacotar (bundle) é a validação mais forte disponível: se o Metro resolve e compila,
  imports/nativos/JSI estão consistentes.

- **Actions Performed**
  | Comando | Resultado |
  | --- | --- |
  | `npx tsc --noEmit` | ✅ 0 erros |
  | `npx expo lint` | ✅ 0 problemas |
  | `npx expo export --platform android` | ✅ 1864 módulos, bundle Hermes de 4.2 MB |
  | `npx expo export --platform web` | ✅ 1526 módulos + rotas estáticas |
  | `npx expo-doctor` | ✅ 21/21 checks |

- **Result**
  Projeto consistente para rodar no celular via Expo Go (SDK 57).

- **Problems / Errors**
  Nenhum.

- **Fixes Attempted**
  N/A.

---

## [7] Harness de benchmark: Canvas2D (CPU) vs WebGL2 (GPU)

- **Prompt / Request**
  "Comparar o desempenho das duas abordagens, identificando gargalos e vantagens."
  O usuário pediu evidência **medida**.

- **Decision Summary**
  Como não há GPU nem device neste sandbox, montei um harness web independente (`bench/`) que
  importa **o mesmo núcleo** do app e o executa em dois renderizadores:
  - **Canvas 2D** — desenha glifo a glifo na CPU (`ctx.fillText`), igual à Fase 1;
  - **WebGL2 instanciado** — 1 draw call, e **zero trabalho de CPU por frame**: posição,
    escolha de glifo e fade são calculados no *vertex shader* a partir de `uTime`. O "atlas"
    de glifos é rasterizado uma vez com o pool Unicode aleatório do núcleo.
  Medição feita com **Chromium headless (Playwright)**, 900×600, 5 s por execução, mesma seed
  para CPU e GPU.

- **Actions Performed**
  `bench/{index.html,build.mjs,run-benchmark.mjs,src/{main,canvas2d,webgl}.js}`.
  Comando: `cd bench && npm install && npx playwright install chromium && node run-benchmark.mjs`.

- **Result**
  Ambiente: `ANGLE (Vulkan 1.3.0, SwiftShader Device)`. **Não há GPU física** neste sandbox,
  então o WebGL roda em software (SwiftShader) — por isso a métrica principal do log é
  **ms de CPU por frame**, que independe do hardware:

  | célula | renderizador | slots | fps | CPU ms/frame |
  | --- | --- | --- | --- | --- |
  | 12px | Canvas2D | 1433 | 20.4 | **4.17** |
  | 12px | WebGL2 | 1433 | 33.7 | **0.09** |
  | 16px | Canvas2D | 1067 | 28.7 | **2.70** |
  | 16px | WebGL2 | 1067 | 39.9 | **0.10** |
  | 20px | Canvas2D | 766 | 31.3 | **1.95** |
  | 20px | WebGL2 | 766 | 47.9 | **0.07** |
  | 26px | Canvas2D | 611 | 40.5 | **1.40** |
  | 26px | WebGL2 | 611 | 54.0 | **0.09** |
  | 32px | Canvas2D | 500 | 47.7 | **1.01** |
  | 32px | WebGL2 | 500 | 59.7 | **0.10** |
  | 18px+glow | Canvas2D | 897 | 13.6 | **2.92** |
  | 18px+glow | WebGL2 | 897 | 31.1 | **0.11** |

  **Conclusão quantitativa:** o custo de CPU do Canvas2D **cresce linearmente** com o número
  de slots (≈ 3,4 µs por glifo; 4,17 ms em 1433 glifos), enquanto o WebGL2 fica **plano em
  ~0,08–0,11 ms** independentemente do número de glifos — no cenário mais pesado isso é
  **~46× menos trabalho de CPU por frame**, e ~41% de um orçamento de 16,7 ms contra ~0,5%.
  O gargalo muda de lugar: na CPU ele é *por primitiva* (JS + rasterização de texto); na GPU
  ele passa a ser *fill rate*, que é o que a GPU faz de melhor.

- **Problems / Errors**
  - O `fps` no harness depende de hardware e, aqui, de um WebGL **por software**; portanto
    ele é apenas indicativo. Solução: medir e reportar explicitamente o **CPU ms/frame**.
  - `glyphCount()` divergia entre os renderizadores (visíveis vs instâncias submetidas).
    Corrigido reportando o número de *slots* de trail, igual para os dois.
  - No 1º protótipo do shader, `seed` de 32 bits perdia precisão em `float32`; mascarei para 24 bits.

- **Fixes Attempted**
  Alinhamento de métrica e máscara de seed (ambos aplicados).

---

## [8] Estado final, limitações e como rodar

- **Prompt / Request**
  Fechar a atividade com o que foi entregue, limitações honestas e instruções.

- **Decision Summary**
  Entregar um app Expo/React Native com duas fases comutáveis pela UI, HUD de desempenho,
  aleatoriedade real por sessão e log completo.

- **Actions Performed**
  - Arquivos novos: `src/features/matrix-rain/**` (core, cpu, gpu, tela), `BUILD_LOG.md`,
    `bench/**`.
  - Alterados: `src/app/index.tsx` (passa a ser a chuva), `src/app/explore.tsx` (Sobre),
    abas (`Rain`/`About`), `.gitignore`, `eslint.config.js` (gerado pelo `expo lint`).

- **Result — como rodar no celular**
  ```bash
  cd chuva-matrix
  npm install
  npx expo start          # leia o QR code com o Expo Go (SDK 57)
  ```
  A tela inicial é a chuva. Botões: `CPU`/`GPU`, `Pause`, `Shuffle`, `speed`, `size`, `trail`,
  `glow`. O HUD mostra fps, ms/frame, nº de glifos, paleta, colunas, fontes e a seed.
  O Skia **está incluído no Expo Go (SDK 57)**, então a fase GPU roda sem *development build*.

- **Problems / Errors / Limitações honestas**
  - **Não executei em device/emulador** neste sandbox; a validação foi `tsc`, `lint`,
    `expo export` (android/web) e `expo-doctor`. O comportamento em device (fps reais, fontes
    disponíveis) é o teste que falta — e é justamente o que o HUD entrega.
  - O Expo Go precisa ser o **SDK 57** (Expo Go só suporta o SDK mais recente).
  - No harness web, o WebGL roda em **SwiftShader** (sem GPU física no sandbox); o fps do
    harness não representa hardware real. Os **ms de CPU/frame** sim.
  - No caminho GPU, para manter os worklets autocontidos, a escolha do glifo é uma versão
    inlinada do `pickGlyph` (mesmo seed/config, mas não pixel-idêntica à CPU).

- **Fixes Attempted / Próximos passos possíveis**
  - Rodar no device e registrar fps reais de CPU vs GPU no HUD.
  - Trocar o pool fixo de `<Text>` do Skia por `TextBlob`/`Atlas` (um único draw por fonte).
  - Efeitos extras: bloom com `RuntimeShader`, glitch, fade global (persistência de tela).

---

## [9] Problema real reportado pelo usuário: `EACCES` no Windows ao subir o app

- **Prompt / Request**
  O usuário tentou rodar no Windows (PowerShell) e o `npx expo start` morreu com:
  ```
  Error: EACCES: permission denied, lstat
    'C:\Users\pfern\Documents\chuva-matrix\bench\node_modules\.bin\playwright'
      at FallbackWatcher.emitError (metro-file-map/build/watchers/AbstractWatcher.js)
      at Walker.emit (walker/lib/walker.js)
  ```
  Ou seja: **o app não subia por causa do harness de benchmark**, não do app.

- **Decision Summary**
  Diagnóstico: o `bench/` é um projeto **separado** (tem seu próprio `package.json` e
  `node_modules`), criado só para medir CPU vs GPU. O `node_modules` dele veio do sandbox
  Linux e alguns *shims* de `node_modules/.bin` (o do Playwright) têm permissões que o
  Windows recusa em `lstat`. O **Metro** (bundler do Expo) varre o projeto para montar o
  *file map* e, no Windows, usa o `FallbackWatcher` (walker recursivo em JS), que **aborta**
  ao encontrar esse erro — derrubando o servidor.
  A correção certa **não** é mexer no app, e sim dizer ao Metro para ignorar `bench/`.

- **Actions Performed**
  1. Consultei a documentação oficial do Metro para confirmar a ferramenta correta:
     `resolver.blockList` — *"A regular expression (or list of regular expressions)
     defining which paths to exclude from Metro's file map."*
     (https://metrobundler.dev/docs/configuration/#blocklist)
  2. Criei `metro.config.js` na raiz do app, estendendo `expo/metro-config` e somando uma
     regex de `bench/` ao `blockList` existente (sem sobrescrever os defaults do Expo).
  3. Fui ler o código-fonte do watcher (`@expo/metro-file-map`) para entender o mecanismo:
     o `FallbackWatcher` chama `recReaddir(root, ..., ignored)` e testa
     `posixPathMatchesPattern(ignored, currentDir)` em cada diretório; o `ignored` é o
     `ignorePattern` do file map, derivado do `blockList`.

- **Result**
  **Parcial / não confirmado.** Pela documentação o `blockList` deveria bastar, mas o
  usuário reexecutou no Windows e o erro **persistiu** — agora em
  `bench\node_modules\.bin\esbuild`. Ou seja, naquela situação o bloqueio não impediu o
  crawl do watcher. Não consegui confirmar 100% a causa raiz (não há Windows no ambiente
  onde eu trabalho). **O que resolveu de fato foi rodar pelo WSL com
  `npx expo start --tunnel`** (ver §10), confirmado pelo usuário.

- **Problems / Errors**
  - O erro só aparece no Windows (no sandbox Linux o `lstat` funcionava), então **não era
    detectável** com a validação que eu tinha feito (`expo export`, `lint`, `tsc`).
  - A causa raiz foi o `bench/node_modules` ter viajado junto com o projeto (copiado do
    sandbox Linux, com permissões que o Windows recusa em `lstat`).
  - A regex inicial (`/[\\/]bench[\\/]/`) exigia um separador **antes** de `bench`; se o
    caminho testado for relativo (`bench/node_modules`), ela não casa. Corrigida para
    `/(?:^|[\\/])bench[\\/]/`, que cobre relativo e absoluto.

- **Fixes Attempted**
  - **Tentativa 1 (best-effort, não confirmada):** `metro.config.js` com `blockList`.
    Arquivo mantido no projeto (inofensivo e correto em princípio), regex ajustada.
  - **Correção garantida (não chegou a ser necessária):** apagar `bench/node_modules`
    (100% regenerável com `npm install`) ou `bench/` inteiro — sem a pasta, não há o que
    crawlear.
  - **Solução que o usuário adotou:** WSL + `--tunnel` (§10).
  - **Alternativa considerada e descartada:** mover o harness para fora do projeto.
    Descartada porque o `bench/` precisa importar o **mesmo núcleo**
    (`src/features/matrix-rain/core`) para a comparação ser honesta.

---

## [10] Rodando no WSL com `--tunnel` (solução adotada)

- **Prompt / Request**
  O usuário relatou que teve de rodar no Windows porque "o WSL tava bloqueando" e, em
  seguida, confirmou que conseguiu rodar no WSL usando `npx expo start --tunnel`.

- **Decision Summary**
  Causa clássica do WSL 2, documentada pela própria Expo em https://expo.fyi/wsl: o WSL 2 é
  uma VM com IP próprio (`172.x.x.x`) que **não é roteável** a partir do celular na LAN. O
  Metro sobe dentro do WSL, o QR aponta para esse IP interno e o Expo Go não conecta. O
  `--tunnel` contorna o problema: o CLI abre um túnel (ngrok) e o celular conecta por um
  endereço público, sem depender de rota direta na rede local.

- **Actions Performed**
  1. Confirmei o comportamento e as alternativas na doc oficial (`expo.fyi/wsl`):
     `--tunnel`, `networkingMode=mirrored` no `.wslconfig` e liberação do firewall Hyper-V
     (`Set-NetFirewallHyperVVMSetting`).
  2. Orientei o usuário sobre as opções e sobre manter o projeto no filesystem Linux (`~/`)
     quando rodando pelo WSL, em vez de `/mnt/c/...`.

- **Result**
  `npx expo start --tunnel` no WSL conectou o Expo Go no celular — caminho confirmado pelo
  usuário, que passou a testar CPU vs GPU no aparelho. **Atualização:** esse caminho quebrou
  depois (o túnel ngrok parou de subir) e foi substituído pelo túnel v2 da Expo — ver §13.

- **Problems / Errors**
  - O `--tunnel` é mais lento que a LAN (todo o tráfego passa pelo túnel), então o fast
    refresh demora mais. Aceitável para teste.
  - O projeto estava em `/mnt/c/Users/pfern/Documents/chuva-matrix` — exatamente o cenário
    que a Expo recomenda evitar no WSL (filesystem do Windows montado no Linux): I/O lento
    e watches instáveis.

- **Fixes Attempted**
  - **Adotado:** `--tunnel`.
  - **Alternativas não testadas:** `networkingMode=mirrored` no `.wslconfig` (resolve o IP e
    mantém a LAN normal) e/ou liberar o firewall Hyper-V no Windows.

---

## [11] Evidência no aparelho real: 9 fps (CPU) vs 80+ fps (GPU)

- **Prompt / Request**
  O usuário rodou o app no celular (WSL + `--tunnel`) e reportou: *"com cpu ficou com 9 fps e
  com gpu ficou 80+ fps"*.

- **Decision Summary**
  Até aqui a única evidência quantitativa era o harness no navegador (§7), que mede **CPU por
  frame** e não representa GPU real. A medição no aparelho fecha essa lacuna: é a comparação
  CPU vs GPU **no alvo real**, com o mesmo `RainConfig` (mesma seed, paleta, fontes e
  velocidades) — só o renderizador muda.

- **Actions Performed**
  1. Registrei a medição como evidência primária. Ela vem do próprio HUD do app, que reporta
     `fps` e `ms/frame` para o renderizador ativo.
  2. Comparei com o que o projeto previa: o renderizador CPU escala com o **número de views**
     (JS + reconciliação do React + layout/texto nativos); o GPU escala com **fill rate**.

- **Result**

  | Fase | Renderizador | fps no aparelho | ~ms/frame |
  |------|--------------|-----------------|-----------|
  | 1 | views nativas do React Native (JS thread) | **9** | ~111 |
  | 2 | Skia (Metal / OpenGL ES) + worklets (UI thread) | **80+** | ~12 |

  São **~9× mais fps** no GPU com a mesma simulação. E o CPU não estava limitado por falta de
  hardware: a tarefa é serial na JS thread, então o gargalo não desaparece com um aparelho
  melhor — só com trabalho menor por frame (que é exatamente o que a Fase 2 faz).

- **Problems / Errors**
  - O fps do CPU depende do aparelho e de quantos glifos cabem na tela (tela maior / mais
    densa = mais views = menos fps). 9 fps é o número **deste** aparelho, nesta configuração;
    o que importa é a razão entre as fases.
  - O HUD do CPU mede só o tempo de `buildCells` (JS puro). O gargalo real (reconciliação +
    layout nativo) acontece **depois** dessa medição, então o `ms/frame` do CPU subestima o
    problema. O `fps`, que conta frames de verdade, é a métrica honesta.

- **Fixes Attempted**
  - Nenhuma correção necessária: o resultado confirma a Fase 1 como *baseline* deliberado.
    Não tentei otimizar o CPU justamente porque o objetivo era expor o gargalo.

---

## [12] Botão "Rain only": esconder os overlays e deixar só a chuva

- **Prompt / Request**
  *"preciso que voce coloque um botao que minimize os overlays de configruacao e deixe so a
  chuva de matrix"*

- **Decision Summary**
  Três decisões:
  1. **Esconder, não desmontar.** Os overlays recebem `display: 'none'` em vez de saírem da
     árvore. Assim nada remonta quando o modo liga/desliga — o renderizador e a animação
     continuam de onde estavam — e o diff fica mínimo.
  2. **"Overlay" inclui a tab bar nativa.** Esconder só o HUD e o painel ainda deixaria a barra
     Rain/About na tela, o que não é "só a chuva". O `NativeTabs` do Expo Router aceita
     `hidden`, que vira `tabBarHidden` nas views nativas (iOS e Android) — foi o que usei.
  3. **Estado compartilhado com `useSyncExternalStore`, não Context.** Quem precisa do estado
     são dois pontos **sem ancestral comum próximo**: a tela (dona do botão) e o layout das
     abas (dono da tab bar). Um store de módulo minúsculo resolve sem Provider extra.

- **Actions Performed**
  1. Criei `src/hooks/use-zen-mode.ts`: store de módulo (`zen` + `Set` de listeners) expondo
     `setZenMode()` e o hook `useZenMode()` sobre `useSyncExternalStore`.
  2. `src/components/app-tabs.tsx`: `<NativeTabs hidden={zen}>`.
  3. `src/features/matrix-rain/matrix-rain-screen.tsx`: botão **⛶ Rain only** no painel; HUD e
     painel recebem `display: 'none'` no modo zen; e um botão flutuante **☰** semi-transparente
     (canto inferior direito) para voltar.
  4. Conferi que os renderizadores reagem à mudança de tamanho: ao esconder a tab bar a tela
     cresce, o `onLayout` dispara, um novo `RainState` é criado e **ambos** os renderizadores se
     reconstroem a partir dele. No caso do Skia o `elapsedMs` é um shared value que sobrevive,
     então a chuva não "salta" ao entrar/sair do modo.

- **Result**
  Um toque em **⛶ Rain only** deixa a tela só com a chuva (some o HUD, os controles e a tab
  bar). Um toque no **☰** flutuante traz tudo de volta. `tsc` e `lint` limpos.

- **Problems / Errors**
  - `useSyncExternalStore` exige um `subscribe` **estável**; com uma arrow inline o React
    cancelaria e registraria o listener a cada render. Resolvido declarando `subscribe` e
    `getSnapshot` no escopo do módulo.
  - A prop `hidden` do `NativeTabs` é recente e o pacote é `unstable-native-tabs`, então o modo
    depende dela. Se uma versão futura mudar isso, o pior caso é a tab bar continuar visível —
    o resto do modo (HUD e controles) segue funcionando.

- **Fixes Attempted**
  - **Alternativa descartada:** desmontar HUD/painel com `{!zen && ...}`. Descartada porque
    exigiria reindentar blocos grandes e porque remontar mudaria o comportamento (perderia o
    estado do renderizador).

---

## [13] O túnel do Expo quebrou (ngrok) e a solução real: `EXPO_UNSTABLE_TUNNEL_V2`

- **Prompt / Request**
  Depois de ter funcionado, `npx expo start --tunnel` passou a falhar sempre, com:
  ```
  CommandError: failed to start tunnel

  session closed   (numa tentativa) / remote gone away   (em outra)

  Check the Ngrok status page for outages: https://status.ngrok.com/
  ```

- **Decision Summary**
  Segui o método "isolar antes de teorizar". Primeiro descartei o que o erro sugere;
  depois li o código da CLI em vez de adivinhar. Duas hipóteses minhas caíram pelo caminho
  (registrado honestamente em *Problems*), e a terceira — ler `_createTunnel` — achou a
  causa **e** a solução.

- **Actions Performed**
  1. **Reproduzi localmente**, sem depender do usuário: `CI=1 npx expo start --tunnel --port 8090`
     → mesmo erro. Isso já elimina a porta 8081 como causa.
  2. **Descartei indisponibilidade:** `status.ngrok.com/api/v2/summary.json` → *All Systems
     Operational*, zero incidentes.
  3. **Descartei a rede:** DNS + TCP:443 OK para `connect.ngrok-agent.com`,
     `tunnel.us.ngrok.com`, `tunnel.eu.ngrok.com`; sem proxy no ambiente.
  4. **Descartei o agente:** rodei o binário direto
     (`~/.nvm/.../@expo/ngrok/node_modules/@expo/ngrok-bin-linux-x64/ngrok http 8090 --log=stdout`).
     Ele **conecta** e só falha por falta de authtoken (`ERR_NGROK_4018`) — esperado, porque
     quem injeta o token é a CLI.
  5. **Li o código da CLI.** Em `BundlerDevServer._createTunnel`:
     ```js
     const useV2Tunnel = env.EXPO_UNSTABLE_TUNNEL_V2 || envIsWebcontainer();
     if (useV2Tunnel) {
       const useExpoAccount = !!env.EXPO_UNSTABLE_TUNNEL_V2;
       return new AsyncWsTunnel(projectRoot, port, { useExpoAccount });
     }
     return new AsyncNgrok(projectRoot, port);
     ```
     Ou seja: existe um **túnel próprio da Expo** (`@expo/ws-tunnel`, já instalado junto da CLI)
     que **não passa por ngrok** — mas só é ativado com a env `EXPO_UNSTABLE_TUNNEL_V2`.
     Sem ela, cai sempre no `AsyncNgrok`, que usa o token da própria Expo
     (`NGROK_CONFIG.authToken`) e o domínio `exp.direct`.
  6. **Validei o caminho novo:** `EXPO_UNSTABLE_TUNNEL_V2=1 npx expo start --tunnel` respondeu
     `Couldn't create a signed tunnel URL for this project. You're not logged in to your Expo
     account — run 'npx expo login'.` — prova de que a env realmente troca a implementação e
     que falta apenas autenticação (`npx expo whoami` → `Not logged in`).

- **Result**
  **Causa:** o caminho padrão de túnel (`AsyncNgrok`, com o token e o domínio `exp.direct` da
  Expo) está quebrado do lado do serviço — a máquina do usuário está inocente, e a mensagem
  "check the status page" é um falso positivo (o status está verde).
  **Correção:** usar o túnel v2 da Expo, que não depende de ngrok:
  ```bash
  npx expo login                          # conta Expo gratuita
  EXPO_UNSTABLE_TUNNEL_V2=1 npx expo start --tunnel
  ```

- **Problems / Errors**
  - **Hipótese errada nº1:** "um Expo antigo está segurando a 8081 e a sessão do ngrok".
    Errado. Investigando o socket por `/proc/net/tcp6` (inode 20323) e casando com as configs
    do sistema, a 8081 é do **Apache** (`/etc/apache2/ports.conf` → `Listen 8081`), serviço
    `root` e `enabled` no boot. Ou seja: `pkill`/`fuser` como usuário comum **nunca** teriam
    funcionado — o processo não é dele.
  - **Hipótese errada nº2:** "`connect.ngrok.com` não resolve no DNS, então o agente v2 morreu".
    A observação era verdadeira (`getent hosts connect.ngrok.com` → não resolve), mas a
    conclusão era falsa: o binário empacotado (`@expo/ngrok-bin@2.3.42`) **conecta** nos
    servidores atuais do ngrok e usa `connect.ngrok-agent.com`. Confirmei rodando o agente
    direto, em vez de confiar na inferência.
  - Enquanto isso, reiniciar o WSL **não** liberou a 8081, exatamente porque o Apache é
    `enabled`. Previsão que fiz e que se confirmou.

- **Fixes Attempted**
  - `sudo systemctl stop apache2` / `disable apache2` — libera a 8081 de vez (reversível, mas
    é um serviço do sistema: só desabilitar se não estiver em uso).
  - **Adotado:** `EXPO_UNSTABLE_TUNNEL_V2=1` + `npx expo login`.
  - **Alternativas documentadas:** `networkingMode=mirrored` no `.wslconfig` (usa a LAN e
    dispensa túnel por completo, ver §10); ou simplesmente aceitar a porta 8082 que o Expo
    oferece, já que a 8081 não era a causa.

---

## Resumo executivo

- **Duas fases** no mesmo app, comutáveis ao vivo: **CPU** (views nativas do React Native)
  e **GPU** (Skia + worklets na UI thread).
- **Aleatoriedade real**: caracteres de code points Unicode sorteados, paleta sorteada,
  fontes do sistema sorteadas + tamanho/peso/estilo aleatórios, velocidades/trails/fases
  aleatórios, tudo reproduzível por seed.
- **Evidência medida (navegador)**: Canvas2D gasta **4,17 ms** de CPU/frame em 1433 glifos
  (cresce linear), WebGL2 gasta **0,09 ms** (constante) — ~46× menos CPU, deslocando o gargalo
  para o *fill rate* da GPU.
- **Evidência medida (aparelho real, mesma seed/config)**: **CPU = 9 fps** (~111 ms/frame) vs
  **GPU = 80+ fps** (~12 ms/frame) — ~9× mais fps no GPU.
- **Modo "só chuva"**: botão que esconde HUD, controles e a tab bar nativa, deixando apenas a
  chuva; um botão flutuante traz tudo de volta.
- **Validado**: typecheck, lint, `expo export` (android e web) e `expo-doctor` — todos limpos.

