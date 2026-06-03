import { Lock } from "lucide-react";
import { Card } from "@/components/ui";

export function AccessDenied() {
  return (
    <Card className="mx-auto max-w-xl p-8 text-center">
      <Lock className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
      <h1 className="text-xl font-semibold">Kein Zugriff</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Für diesen Bereich fehlen deinem Konto die passenden Rechte.
      </p>
    </Card>
  );
}
