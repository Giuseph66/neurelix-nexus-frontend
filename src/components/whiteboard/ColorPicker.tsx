import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  label?: string;
}

const presetColors = [
  "#1e293b", "#dc2626", "#ea580c", "#ca8a04", 
  "#16a34a", "#0891b2", "#2563eb", "#7c3aed",
  "#c026d3", "#e11d48", "#000000", "#ffffff",
];

export function ColorPicker({ color, onChange, label }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      {label && <Label className="text-xs text-muted-foreground">{label}</Label>}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 w-8 p-0 border-2"
            style={{ backgroundColor: color }}
          />
        </PopoverTrigger>
        <PopoverContent className="w-48 p-3 bg-popover" align="start">
          <div className="grid grid-cols-6 gap-1.5 mb-3">
            {presetColors.map((c) => (
              <button
                key={c}
                className={`w-6 h-6 rounded border-2 transition-transform hover:scale-110 ${
                  color === c ? 'border-primary ring-2 ring-primary/30' : 'border-border'
                }`}
                style={{ backgroundColor: c }}
                onClick={() => {
                  onChange(c);
                  setIsOpen(false);
                }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div 
              className="w-6 h-6 rounded border border-border"
              style={{ backgroundColor: color }}
            />
            <Input
              type="text"
              value={color}
              onChange={(e) => onChange(e.target.value)}
              className="h-7 text-xs font-mono"
              placeholder="#000000"
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
