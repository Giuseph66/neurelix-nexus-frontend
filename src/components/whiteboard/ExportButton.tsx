import { Download, Image, FileJson, FileText, FileType } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Editor, exportToBlob } from "tldraw";
import { toast } from "sonner";

interface ExportButtonProps {
  editor: Editor | null;
  whiteboardName?: string;
}

export function ExportButton({ editor, whiteboardName = "whiteboard" }: ExportButtonProps) {
  const handleExportPNG = async () => {
    if (!editor) {
      toast.error('Editor não está pronto');
      return;
    }

    try {
      // Obter todos os shapes da página atual
      const shapeIds = editor.getCurrentPageShapeIds();
      
      if (shapeIds.length === 0) {
        toast.error('Nenhum elemento para exportar');
        return;
      }

      // Exportar usando a API do tldraw
      const blob = await exportToBlob({
        editor,
        ids: shapeIds,
        format: 'png',
        opts: {
          scale: 2,
          background: true,
        },
      });

      if (!blob) {
        toast.error('Erro ao gerar PNG');
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `${whiteboardName}-${Date.now()}.png`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('PNG exportado!');
    } catch (error) {
      console.error('Error exporting PNG:', error);
      toast.error('Erro ao exportar PNG');
    }
  };

  const handleExportSVG = async () => {
    if (!editor) {
      toast.error('Editor não está pronto');
      return;
    }

    try {
      // Obter todos os shapes da página atual
      const shapeIds = editor.getCurrentPageShapeIds();
      
      if (shapeIds.length === 0) {
        toast.error('Nenhum elemento para exportar');
        return;
      }

      // Exportar usando a API do tldraw
      const svgString = await editor.getSvgString(shapeIds, {
        scale: 1,
        background: true,
      });

      if (!svgString) {
        toast.error('Erro ao gerar SVG');
        return;
      }

      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `${whiteboardName}-${Date.now()}.svg`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('SVG exportado!');
    } catch (error) {
      console.error('Error exporting SVG:', error);
      toast.error('Erro ao exportar SVG');
    }
  };

  const handleExportJSON = () => {
    if (!editor) {
      toast.error('Editor não está pronto');
      return;
    }

    try {
      const snapshot = editor.store.getSnapshot();
      const json = JSON.stringify(snapshot, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `${whiteboardName}-${Date.now()}.json`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('JSON exportado!');
    } catch (error) {
      console.error('Error exporting JSON:', error);
      toast.error('Erro ao exportar JSON');
    }
  };

  const handleExportPDF = async () => {
    if (!editor) {
      toast.error('Editor não está pronto');
      return;
    }

    try {
      // Para PDF, vamos exportar como PNG primeiro e depois converter
      // Ou usar uma biblioteca como jsPDF
      toast.info('Exportação PDF em desenvolvimento');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Erro ao exportar PDF');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8"
          disabled={!editor}
          title="Exportar"
        >
          <Download className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover">
        <DropdownMenuItem onClick={handleExportPNG}>
          <Image className="h-4 w-4 mr-2" />
          Exportar como PNG
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportSVG}>
          <FileType className="h-4 w-4 mr-2" />
          Exportar como SVG
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportJSON}>
          <FileJson className="h-4 w-4 mr-2" />
          Exportar como JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportPDF} disabled>
          <FileText className="h-4 w-4 mr-2" />
          Exportar como PDF (em breve)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

