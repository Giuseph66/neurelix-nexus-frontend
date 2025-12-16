import { Card, CardContent } from "@/components/ui/card";
import { GitBranch } from "lucide-react";

export default function Code() {
  return (
    <div className="p-6 h-full">
      <Card className="h-full">
        <CardContent className="flex flex-col items-center justify-center h-full text-center py-12">
          <div className="p-4 rounded-full bg-warning/10 mb-4">
            <GitBranch className="h-8 w-8 text-warning" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Código - Integração Git</h2>
          <p className="text-muted-foreground max-w-md">
            A integração com GitHub será implementada na Fase 4.
            Inclui conexão OAuth, visualização de branches, PRs e vinculação com tarefas.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
