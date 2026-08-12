import { Link } from "@tanstack/react-router";
import { Bookmark, FileText, Mail, ClipboardList } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Props = { caseId?: string; caseTitle?: string };

export function StickyActionBar({ caseId, caseTitle }: Props) {
  const [fav, setFav] = useState(false);

  useEffect(() => {
    if (!caseId) return;
    try {
      setFav(localStorage.getItem(`rk-fav:${caseId}`) === "1");
    } catch {
      /* noop */
    }
  }, [caseId]);

  const toggleFav = () => {
    if (!caseId) {
      toast.info("Diese Funktion wird vorbereitet.");
      return;
    }
    const next = !fav;
    setFav(next);
    try {
      if (next) localStorage.setItem(`rk-fav:${caseId}`, "1");
      else localStorage.removeItem(`rk-fav:${caseId}`);
    } catch {
      /* noop */
    }
    toast.success(next ? "Fall gemerkt." : "Merken entfernt.");
  };

  const saveVorgang = () => {
    if (!caseId) {
      toast.info("Diese Funktion wird vorbereitet.");
      return;
    }
    try {
      const key = "rk-vorgaenge";
      const raw = localStorage.getItem(key);
      const list: Array<{ id: string; title?: string; savedAt: string }> = raw ? JSON.parse(raw) : [];
      if (!list.find((v) => v.id === caseId)) {
        list.unshift({ id: caseId, title: caseTitle, savedAt: new Date().toISOString() });
        localStorage.setItem(key, JSON.stringify(list.slice(0, 100)));
      }
      toast.success("Vorgang gespeichert.");
    } catch {
      toast.info("Diese Funktion wird vorbereitet.");
    }
  };

  const sendToMe = () => {
    toast.info("An mich senden – diese Funktion wird vorbereitet.");
  };

  const items: Array<{ label: string; icon: typeof Bookmark; onClick?: () => void; to?: "/dokumentation"; active?: boolean }> = [
    { label: fav ? "Gemerkt" : "Merken", icon: Bookmark, onClick: toggleFav, active: fav },
    { label: "Dokument", icon: FileText, to: "/dokumentation" },
    { label: "E-Mail", icon: Mail, onClick: sendToMe },
    { label: "Vorgang", icon: ClipboardList, onClick: saveVorgang },
  ];

  return (
    <div className="fixed inset-x-0 bottom-[64px] z-30 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-2xl px-3">
        <div className="rounded-2xl border border-border bg-card/95 p-1.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/85">
          <div className="grid grid-cols-4 gap-1">
            {items.map((it) => {
              const Icon = it.icon;
              const cls = `flex flex-col items-center gap-1 rounded-xl px-1.5 py-2 text-[10px] font-medium transition-colors ${
                it.active ? "bg-accent/15 text-accent" : "text-foreground/80 hover:bg-muted hover:text-accent"
              }`;
              return it.to ? (
                <Link key={it.label} to={it.to} className={cls}>
                  <Icon className="h-4 w-4" />
                  {it.label}
                </Link>
              ) : (
                <button key={it.label} type="button" onClick={it.onClick} className={cls}>
                  <Icon className={`h-4 w-4 ${it.active ? "fill-current" : ""}`} />
                  {it.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
