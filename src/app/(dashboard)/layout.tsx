export const dynamic = "force-dynamic";

import { Sidebar } from "@/components/layout/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      {/* pt-14 on mobile offsets the fixed top bar; md:pt-0 removes it on desktop */}
      <main className="flex flex-1 flex-col overflow-auto pt-14 md:pt-0">{children}</main>
    </div>
  );
}
