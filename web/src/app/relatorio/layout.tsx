import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verificação de Documento - Reallliza",
  description: "Verifique a autenticidade do Relatório Técnico de Execução e Termo de Garantia",
};

export default function RelatorioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
