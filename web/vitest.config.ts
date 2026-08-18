import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Os testes cobrem funções puras: o contrato de exclusão, as travas de estado,
 * o compilador de audiência do Feed e o cursor da paginação. É o que quebra em
 * silêncio — sem erro na tela, sem exceção no log, só um número errado ou um
 * registro que sumiu.
 *
 * Não há teste de componente nem de rota: exigiriam um banco e um navegador, e
 * a validação desses caminhos hoje é feita contra a produção.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
