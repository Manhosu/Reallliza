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

## Duas coisas que custaram tempo

**Mire os campos pelo texto de dica, não pelo rótulo.** Tocar no rótulo
"Senha" não dá foco ao campo — e-mail e senha acabavam no mesmo campo, e o
aplicativo respondia "Informe sua senha".

**Os tempos-limite são generosos de propósito.** Com GPU por software a
primeira tela leva cerca de 1m35s para aparecer. Num aparelho real são
segundos, mas o roteiro precisa aguentar o emulador.
