/**
 * Tipa o retorno de um `select` do Supabase.
 *
 * Quando a lista de colunas cresce — sobretudo com relação embutida — o
 * cliente do Supabase deixa de inferir a forma da linha e passa a devolver
 * uma união com `GenericStringError`. O TypeScript então recusa qualquer
 * acesso a campo, mesmo o campo estando lá em tempo de execução.
 *
 * A saída de sempre é espalhar `as any` pelo cálculo, o que apaga o tipo do
 * resto do arquivo junto. Aqui a conversão acontece uma vez, na fronteira, e
 * o formato esperado fica declarado — que é a informação que o próximo leitor
 * precisa.
 *
 *   const posts = linhas<Publicacao>(data);
 *
 * Só use depois de checar o `error` da consulta: isto assume que a consulta
 * deu certo, não verifica.
 */
export function linhas<T>(dados: unknown): T[] {
  return (dados ?? []) as T[];
}
