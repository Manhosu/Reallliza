/**
 * Carga dos municípios do IBGE em `br_cities`.
 *
 * A tabela nasceu na migration 062 com o comentário "carregada uma vez por
 * scripts/importar-municipios.mjs" — e o script nunca foi escrito. Resultado:
 * segmentar campanha por cidade devolvia zero pessoas, porque não havia
 * cidade nenhuma cadastrada.
 *
 * Roda quantas vezes for preciso: usa upsert por código do IBGE.
 *
 *   node web/scripts/importar-municipios.mjs
 *
 * A fonte é a API pública de localidades do IBGE. Sem chave, sem limite
 * praticável para uma carga anual — municípios mudam de nome raramente e são
 * criados quase nunca.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(aqui, "../../.env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !CHAVE) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env da raiz.");
  process.exit(1);
}

/** Sem acento e em minúscula: é assim que a busca por nome compara. */
const normalizar = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const IBGE = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios";

console.log("Buscando municípios no IBGE...");
const resposta = await fetch(IBGE);
if (!resposta.ok) {
  console.error(`IBGE respondeu ${resposta.status}. Tente de novo mais tarde.`);
  process.exit(1);
}
const municipios = await resposta.json();
console.log(`  ${municipios.length} municípios recebidos`);

// A UF vem por dois caminhos e o segundo tem chave com hífen. Municípios
// criados nos últimos anos — Boa Esperança do Norte, por exemplo — vêm com
// `microrregiao` nula e só têm o caminho da região imediata.
const acharUf = (m) =>
  m.microrregiao?.mesorregiao?.UF ??
  m["regiao-imediata"]?.["regiao-intermediaria"]?.UF ??
  null;

const linhas = municipios.map((m) => {
  const uf = acharUf(m);
  if (!uf) throw new Error(`Município ${m.id} (${m.nome}) veio sem UF na resposta do IBGE`);
  return {
    ibge_code: String(m.id),
    name: m.nome,
    name_norm: normalizar(m.nome),
    uf: uf.sigla,
  };
});

// Em lotes: 5.570 linhas num único corpo estoura o limite da requisição.
const LOTE = 500;
let gravadas = 0;
for (let i = 0; i < linhas.length; i += LOTE) {
  const parte = linhas.slice(i, i + LOTE);
  const r = await fetch(`${SB}/rest/v1/br_cities?on_conflict=ibge_code`, {
    method: "POST",
    headers: {
      apikey: CHAVE,
      Authorization: `Bearer ${CHAVE}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(parte),
  });
  if (!r.ok) {
    console.error(`Lote ${i / LOTE + 1} falhou: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
    process.exit(1);
  }
  gravadas += parte.length;
  process.stdout.write(`\r  gravadas ${gravadas}/${linhas.length}`);
}

console.log("\n");
const conf = await fetch(`${SB}/rest/v1/br_cities?select=uf&limit=1`, {
  headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, Prefer: "count=exact" },
});
console.log(`Total em br_cities: ${conf.headers.get("content-range")?.split("/")[1] ?? "?"}`);
