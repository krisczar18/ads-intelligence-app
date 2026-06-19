import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap } from "lucide-react";

export default function AdsCommandPage() {
  return (
    <>
      <Header title="Ads Command" />
      <div className="flex flex-1 flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4 text-primary" />
              Ads Command
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Connect an ad account in Settings to start syncing your Meta Ads data.
              Lifecycle scoring, creative insights, and winning pattern analysis will
              appear here once data is flowing.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
