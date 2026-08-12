import { Copy, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DocTemplate } from "@/lib/templatesRepo";

export function TemplatePreviewModal({
  template,
  open,
  onOpenChange,
}: {
  template: DocTemplate | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  async function copyBody() {
    if (!template?.meta.body) return;
    try {
      await navigator.clipboard.writeText(template.meta.body);
      toast.success("Textbaustein kopiert");
    } catch {
      toast.error("Kopieren nicht möglich");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-accent" />
            {template?.title ?? "Vorlage"}
          </DialogTitle>
          {template?.meta.type && (
            <DialogDescription className="text-xs">Typ: {template.meta.type}</DialogDescription>
          )}
        </DialogHeader>

        {template && (
          <div className="space-y-4">
            {template.description && (
              <section>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Zweck
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
                  {template.description}
                </p>
              </section>
            )}

            <section>
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Vorlage / Textbaustein
                </p>
                {template.meta.body && (
                  <button
                    type="button"
                    onClick={copyBody}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted"
                  >
                    <Copy className="h-3 w-3" /> Kopieren
                  </button>
                )}
              </div>
              {template.meta.body ? (
                <pre className="mt-2 max-h-[45vh] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 font-sans text-sm leading-relaxed text-foreground/90">
{template.meta.body}
                </pre>
              ) : (
                <p className="mt-1 text-xs italic text-muted-foreground">
                  Für diese Vorlage ist noch kein Textbaustein hinterlegt.
                </p>
              )}
            </section>

            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] italic text-amber-800 dark:text-amber-300">
              Vor Nutzung an den Einzelfall anpassen.
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
