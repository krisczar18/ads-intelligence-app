import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

export default function PnLPage() {
  return (
    <>
      <Header title="P&L Dashboard" />
      <div className="flex flex-1 flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" />
              P&L Dashboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Profit & Loss tracking coming in Phase 4. You&apos;ll be able to
              log income streams, compare against ad spend, and track net margin
              over custom date ranges.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
