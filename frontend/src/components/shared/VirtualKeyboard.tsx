import { Delete, Keyboard, Space } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getAnalyzerLanguage, getKeyboardRows } from "@/lib/analyzerLanguage";

interface VirtualKeyboardProps {
  languageCode: string;
  onInsert: (value: string) => void;
  onBackspace: () => void;
  onSpace: () => void;
  onNewLine: () => void;
  onHide: () => void;
}

const VirtualKeyboard = ({
  languageCode,
  onInsert,
  onBackspace,
  onSpace,
  onNewLine,
  onHide,
}: VirtualKeyboardProps) => {
  const language = getAnalyzerLanguage(languageCode);
  const rows = getKeyboardRows(languageCode);

  if (!rows.length) return null;

  return (
    <div className="rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Keyboard className="h-4 w-4 text-blue-600" />
            Virtual Keyboard
          </p>
          <p className="text-xs text-slate-500">
            Typing support for {language.label} ({language.nativeLabel})
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onHide}>
          Hide Keyboard
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {rows.map((row, rowIndex) => (
          <div key={`${language.code}-row-${rowIndex}`} className="flex flex-wrap gap-2">
            {row.map((keyValue) => (
              <Button
                key={`${language.code}-${keyValue}`}
                type="button"
                variant="outline"
                className="min-w-11 border-slate-200 bg-slate-50 px-3 text-base hover:bg-slate-100"
                onClick={() => onInsert(keyValue)}
              >
                {keyValue}
              </Button>
            ))}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onBackspace}>
          <Delete className="mr-2 h-4 w-4" />
          Backspace
        </Button>
        <Button type="button" variant="outline" onClick={onSpace}>
          <Space className="mr-2 h-4 w-4" />
          Space
        </Button>
        <Button type="button" variant="outline" onClick={onNewLine}>
          New Line
        </Button>
      </div>
    </div>
  );
};

export default VirtualKeyboard;
