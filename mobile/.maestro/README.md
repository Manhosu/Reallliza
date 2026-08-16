# Testes de interface do aplicativo

Fluxos do [Maestro](https://maestro.mobile.dev) que dirigem o aplicativo de
verdade, num emulador ou aparelho conectado.

## O que precisa estar instalado

- **JDK 17** — `winget install Microsoft.OpenJDK.17`
- **Android SDK** — ferramentas de linha de comando, `platform-tools`,
  `emulator` e uma imagem de sistema (`system-images;android-34;google_apis;x86_64`)
- **Driver de aceleração** — `extras;google;Android_Emulator_Hypervisor_Driver`.
  Sem ele o emulador não sobe. A instalação pede elevação uma vez.
- **Maestro** — o zip da versão em `C:\maestro`

Variáveis: `JAVA_HOME`, `ANDROID_HOME`, e no `Path` os diretórios
`platform-tools`, `emulator`, `cmdline-tools\latest\bin` e `C:\maestro\bin`.

## Rodar

```
emulator -avd reallliza_qa -no-snapshot-load -no-boot-anim -gpu swiftshader_indirect
adb install -r caminho/do/app.apk
maestro test .maestro/feed.yaml
```

## Coisas que custaram tempo

**Mire os campos pelo texto de dica, não pelo rótulo.** Tocar no rótulo
"Senha" não dá foco ao campo — e-mail e senha acabavam no mesmo campo, e o
aplicativo respondia "Informe sua senha".

**Os tempos-limite são generosos de propósito.** Com GPU por software a
primeira tela leva cerca de 1m35s para aparecer. Num aparelho real são
segundos, mas o roteiro precisa aguentar o emulador.

**A tela de Termos aparece uma vez por conta, não por instalação.** O aceite
fica gravado no servidor, então `clearState: true` não a traz de volta: o
roteiro passa por ela na primeira execução e nunca mais. Esperar por ela
incondicionalmente faz o teste passar uma vez e quebrar em todas as
seguintes. Os dois fluxos resolvem esperando pelas duas telas possíveis — o
texto do `visible` é tratado como expressão regular — e só executam o bloco
de aceite dentro de um `runFlow` com `when`.

**Vídeo de teste precisa de duração no cabeçalho.** O primeiro arquivo usado
aqui era uma gravação de tela feita com `adb shell screenrecord`, e esse
formato sai com `Duration: N/A` — o `mvhd` vem com duração zero. O player
carrega, cria o decodificador e encerra na hora: nenhum quartil é calculado,
porque a conta divide pela duração. O sintoma no emulador é o contador
parado em `00:00 · 00:00` com o botão de play no meio da tela.

Para gerar um arquivo válido:

```
ffmpeg -f lavfi -i "testsrc=size=720x720:rate=15:duration=8" \
  -c:v libx264 -profile:v baseline -level 3.0 -pix_fmt yuv420p \
  -movflags +faststart demo.mp4
```

O `testsrc` traz um cronômetro embutido, o que ajuda a conferir nas capturas
se a reprodução realmente andou.
