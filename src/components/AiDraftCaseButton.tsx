import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  createCase,
  createLegalLink,
  linkCaseKeyword,
  listCategories,
  listKeywords,
  listSections,
  listTemplates,
} from "@/lib/coreBuilder";

type Draft = {
  title?: string;
  category?: string;
  subcategory?: string;
  ampel?: "gruen" | "gelb" | "rot";
  short_description?: string;
  short_answer?: string;
  immediate_actions?: string;
  recommendation?: string;
  legal_explanation?: string;
  responsibilities?: string;
  practice_tip?: string;
  checklist?: string[];
  documentation?: string[];
  common_mistakes?: string[];
  faq?: Array<{ q: string; a: string }>;
  keyword_ids?: string[];
  template_ids?: string[];
  legal_section_ids?: string[];
  related_hints?: string[];
  keyword_hints?: string[];
  bildungsgang?: string;
  zielgruppe?: string;
  schwierigkeit?: "leicht" | "mittel" | "komplex";
  bearbeitungsdauer?: string;
};

export function AiDraftCaseButton() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string>("");

  const generate = async () => {
    const description = text.trim();
    if (description.length < 20) {
      toast.error("Bitte beschreibe den Sachverhalt in mindestens 20 Zeichen.");
      return;
    }
    setBusy(true);
    try {
      setStep("Lade Kategorien, Rechtsgrundlagen, Schlagwörter…");
      const [cats, kws, tmpls, secs] = await Promise.all([
        listCategories(),
        listKeywords(),
        listTemplates(),
        listSections(),
      ]);

      const publishedSecs = (secs as Array<Record<string, unknown>>).filter(
        (s) => (s.status ?? "published") === "published" || s.status === undefined,
      );

      setStep("KI erstellt Entwurf…");
      const res = await fetch("/api/ai-draft-case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          categories: cats.map((c) => c.name),
          keywords: kws.map((k) => k.keyword),
          templates: tmpls.map((t) => ({ id: t.id, label: t.title })),
          sections: publishedSecs.map((s) => ({
            id: s.id as string,
            label: `${(s as { legal_sources?: { name?: string } }).legal_sources?.name ?? ""} ${(s.section_number as string) ?? ""} ${(s.title as string) ?? ""}`.trim(),
          })),
        }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `AI-Anfrage fehlgeschlagen (${res.status})`);
      }
      const { draft } = (await res.json()) as { draft: Draft };

      setStep("Speichere Entwurf in Supabase…");

      // Map hints -> keyword names to keyword_ids (only existing ones)
      const kwByName = new Map(kws.map((k) => [k.keyword.toLowerCase(), k.id]));
      const keywordIds = new Set<string>();
      for (const id of draft.keyword_ids ?? []) {
        if (kws.some((k) => k.id === id)) keywordIds.add(id);
      }
      for (const hint of draft.keyword_hints ?? []) {
        const kid = kwByName.get(hint.toLowerCase());
        if (kid) keywordIds.add(kid);
      }

      const templateIds = (draft.template_ids ?? []).filter((id) =>
        tmpls.some((t) => t.id === id),
      );
      const sectionIds = (draft.legal_section_ids ?? []).filter((id) =>
        publishedSecs.some((s) => s.id === id),
      );

      const meta = {
        bildungsgang: draft.bildungsgang ?? "",
        zielgruppe: draft.zielgruppe ?? "",
        schwierigkeit: draft.schwierigkeit ?? "",
        bearbeitungsdauer: draft.bearbeitungsdauer ?? "",
        template_ids: templateIds,
        risks: [],
        faq_items: draft.faq ?? [],
        keyword_hints: draft.keyword_hints ?? [],
        template_hints: [],
        legal_hints: [],
        related_hints: draft.related_hints ?? [],
      };

      const payload = {
        title: draft.title ?? "Ohne Titel",
        short_description: draft.short_description ?? "",
        category: draft.category ?? "",
        subcategory: draft.subcategory ?? "",
        ampel: draft.ampel ?? "gelb",
        status: "draft" as const,
        short_answer: draft.short_answer ?? "",
        immediate_actions: draft.immediate_actions ?? "",
        recommendation: draft.recommendation ?? "",
        legal_explanation: draft.legal_explanation ?? "",
        responsibilities: draft.responsibilities ?? "",
        practice_tip: draft.practice_tip ?? "",
        checklist: (draft.checklist ?? []).filter(Boolean),
        documentation: (draft.documentation ?? []).filter(Boolean),
        common_mistakes: (draft.common_mistakes ?? []).filter(Boolean),
        faq: { meta } as unknown as import("@/integrations/supabase/types").Json,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = await createCase(payload as any);
      const caseId = row.id;

      setStep("Verknüpfe Schlagwörter…");
      for (const kid of keywordIds) {
        try {
          await linkCaseKeyword(caseId, kid);
        } catch {
          /* ignore duplicates */
        }
      }

      // Rechtsgrundlagen NICHT direkt verknüpfen. Die zentrale
      // completePracticeCase-Pipeline führt die Legal-Matching-Engine aus
      // (§ 53-Guard, Kandidaten-Bewertung, fachliche Rollen, keine Auffüllung).
      setStep("Führe zentrale Fall-Fertigstellungs-Pipeline aus…");
      try {
        const { completePracticeCase } = await import("@/lib/casePipeline.completion");
        await completePracticeCase(caseId, { source: "ai_case_machine" });
      } catch (e) {
        console.warn("[AiDraftCaseButton] Pipeline nach Erstellung fehlgeschlagen", e);
      }


      toast.success("KI-Entwurf erstellt. Bitte prüfen und ergänzen.");
      setOpen(false);
      setText("");
      navigate({ to: "/admin/faelle/$id", params: { id: caseId } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("KI-Entwurf fehlgeschlagen: " + msg);
    } finally {
      setBusy(false);
      setStep("");
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        title="Praxisfall aus freier Beschreibung mit KI erstellen"
      >
        <Sparkles className="h-4 w-4" />
        Praxisfall mit KI erstellen
      </Button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (busy) return;
          setOpen(v);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Praxisfall mit KI erstellen
            </DialogTitle>
            <DialogDescription>
              Beschreibe den schulischen Sachverhalt in eigenen Worten. Die KI erstellt
              daraus einen vollständigen Entwurf (Status: Entwurf). Alle Felder bleiben
              vollständig editierbar. Es werden nur bestehende Rechtsgrundlagen,
              Schlagwörter und Vorlagen vorgeschlagen – nichts wird automatisch
              veröffentlicht.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="ai-desc">Sachverhalt</Label>
            <Textarea
              id="ai-desc"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder="z. B. Ein Schüler filmt heimlich die Lehrkraft im Unterricht und teilt das Video anschließend in einer Klassen-Chatgruppe…"
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground">
              Tipp: Personen, Rollen, Zeitpunkt, Ort und bereits ergriffene Maßnahmen
              nennen – je konkreter, desto besser der Entwurf.
            </p>
          </div>

          {busy && step && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {step}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Abbrechen
            </Button>
            <Button type="button" onClick={generate} disabled={busy}>
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Entwurf erzeugen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
