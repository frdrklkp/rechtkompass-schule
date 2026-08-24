-- Final Legal Precision Pass: kompakte, klar gekennzeichnete
-- Rechtsquellen-Darstellung statt automatisch vollständiger Paragraphen
-- (Nutzer-Regelwerk Regel 15-17). Erweitert die bereits vorhandene
-- Fall-Quelle-Verknüpfung case_legal_links um genau die Felder, die die
-- vorherige Stufe (voller Normtext) durch eine gezielte, vom Legal Export
-- Quality Gate erzeugte Kurzfassung ersetzen - kolokiert bei der
-- bestehenden `explanation`-Spalte ("Bedeutung für diesen Fall"), da
-- inhaltlich derselbe Zweck (fallbezogene Quellendarstellung je Link).
-- Idempotent.

alter table public.case_legal_links
  add column if not exists content_summary text;

alter table public.case_legal_links
  add column if not exists content_summary_kind text;

alter table public.case_legal_links
  drop constraint if exists case_legal_links_content_summary_kind_chk;

alter table public.case_legal_links
  add constraint case_legal_links_content_summary_kind_chk
  check (content_summary_kind is null or content_summary_kind in ('wortlaut', 'zusammengefasst'));

alter table public.case_legal_links
  add column if not exists precise_reference text;

notify pgrst, 'reload schema';
