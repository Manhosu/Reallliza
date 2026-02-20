import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rastreamento - Reallliza Revestimentos",
  description: "Acompanhe em tempo real o deslocamento do tecnico",
};

export default function TrackingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
