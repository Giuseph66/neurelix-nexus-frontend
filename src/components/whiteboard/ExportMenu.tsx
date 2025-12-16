import { Download, Image, FileJson } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ExportMenuProps {
  onExportPNG: () => void;
  onExportSVG: () => void;
  onExportJSON: () => void;
}

export function ExportMenu({ onExportPNG, onExportSVG, onExportJSON }: ExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <Download className="h-4 w-4 mr-2" />
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover">
        <DropdownMenuItem onClick={onExportPNG}>
          <Image className="h-4 w-4 mr-2" />
          Exportar como PNG
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExportSVG}>
          <FileJson className="h-4 w-4 mr-2" />
          Exportar como SVG
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onExportJSON}>
          <FileJson className="h-4 w-4 mr-2" />
          Exportar como JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
