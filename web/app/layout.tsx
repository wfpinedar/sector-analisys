export const metadata = { title: "Sector Analysis", description: "Matriz de influencias" };
import "./globals.css"; 
import type { ReactNode } from "react";
import { Sidebar } from "../components/layout/Sidebar";
import { Topbar } from "../components/layout/Topbar";
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">
        <div className="grid min-h-screen grid-cols-1 grid-rows-[auto_1fr] md:grid-cols-[220px_1fr] md:grid-rows-[auto_1fr]">
          <div className="hidden md:block md:row-span-2"><Sidebar /></div>
          <div className="md:col-start-2"><Topbar /></div>
          <main className="md:col-start-2 px-4 pb-10 pt-6 md:px-6 lg:px-8">
            <div className="mx-auto max-w-6xl">
              {children}
              <footer className="mt-10 text-center text-xs text-slate-400">
                <span>Hecho con </span>
                <span className="text-[var(--sky-blue)]">datos</span>
                <span> y </span>
                <span className="text-[var(--sky-blue)]">criterio</span>
              </footer>
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
