import { describe, expect, it } from "vitest";
import { codificarCursor, decodificarCursor } from "./query";

/**
 * O cursor da paginação do feed.
 *
 * Ele existe porque paginar por deslocamento fazia a página seguinte repetir o
 * último item da anterior quando alguém publicava durante a rolagem. O cursor
 * é (sort_key, id) — e `sort_key` é BIGINT, que não cabe em `number` com
 * segurança, então trafega como texto.
 *
 * Um cursor que volta `null` faz a rolagem recomeçar do topo em silêncio. É o
 * tipo de defeito que ninguém reporta como defeito, só como "o feed está
 * estranho".
 */

describe("cursor do feed", () => {
  it("volta igual ao que entrou", () => {
    const c = { k: "9007199254740993", id: "0f4c6c1e-1b2a-4c3d-8e9f-000000000001" };
    expect(decodificarCursor(codificarCursor(c))).toEqual(c);
  });

  it("preserva sort_key grande demais para number", () => {
    // 2^53 + 1: se em algum momento passar por Number, volta errado por um.
    const k = "9007199254740993";
    const voltou = decodificarCursor(codificarCursor({ k, id: "a" }));
    expect(voltou?.k).toBe(k);
  });

  it("usa base64url, sem caractere que precise de escape na URL", () => {
    const s = codificarCursor({ k: "-1", id: "ffffffff-ffff-ffff-ffff-ffffffffffff" });
    expect(s).not.toMatch(/[+/=]/);
  });

  it("cursor ausente é null, não erro", () => {
    expect(decodificarCursor(null)).toBeNull();
    expect(decodificarCursor("")).toBeNull();
  });

  it("cursor corrompido é null, não exceção", () => {
    // Vem da URL: qualquer pessoa pode digitar qualquer coisa ali. A rota
    // inteira cairia se isto lançasse.
    expect(decodificarCursor("nao-e-base64-!!!")).toBeNull();
    expect(decodificarCursor(Buffer.from("{isto nao e json").toString("base64url"))).toBeNull();
  });

  it("cursor com formato errado é null", () => {
    const semId = Buffer.from(JSON.stringify({ k: "1" })).toString("base64url");
    const kNumerico = Buffer.from(JSON.stringify({ k: 1, id: "a" })).toString("base64url");
    expect(decodificarCursor(semId)).toBeNull();
    // `k` precisa ser texto: aceitar número aqui é como o BIGINT se perde.
    expect(decodificarCursor(kNumerico)).toBeNull();
  });
});
