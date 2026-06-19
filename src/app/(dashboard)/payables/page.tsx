import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard } from "lucide-react";

export default function PayablesPage() {
  return (
    <>
      <Header title="Accounts Payable" />
      <div className="flex flex-1 flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4 text-primary" />
              Accounts Payable
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Payables tracking coming in Phase 5. Track what you owe per team
              member, mark items paid, and keep a full history.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
