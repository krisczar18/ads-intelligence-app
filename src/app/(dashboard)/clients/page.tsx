import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

export default function ClientsPage() {
  return (
    <>
      <Header title="Clients" />
      <div className="flex flex-1 flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              Clients
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Client CRM coming in Phase 6. Manage brands, link ad accounts,
              and add notes — lightweight scaffolding for the eventual
              multi-client pivot.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
