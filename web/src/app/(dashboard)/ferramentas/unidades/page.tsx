import { redirect } from "next/navigation";

/**
 * `/ferramentas/unidades` não é uma tela — as unidades vivem no Inventário e a
 * ficha individual fica em `/ferramentas/unidades/[id]`.
 *
 * Este redirect existe porque o breadcrumb do layout monta um link por segmento
 * da URL, então a ficha da unidade exibia "unidades" como link clicável que
 * dava 404 (e o prefetch do Next batia nele em toda visita).
 */
export default function UnidadesIndexPage() {
  redirect("/ferramentas/inventario");
}
