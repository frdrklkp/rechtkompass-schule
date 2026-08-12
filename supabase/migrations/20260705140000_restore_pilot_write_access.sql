-- Pilotphase: Schreibrechte auf Redaktionstabellen wiederherstellen.
GRANT INSERT, UPDATE, DELETE ON
  public.case_keywords,
  public.case_legal_links,
  public.document_templates,
  public.keywords,
  public.legal_sections,
  public.legal_sources,
  public.practice_cases,
  public.practice_categories
TO anon, authenticated;

DROP POLICY IF EXISTS "cases write pilot" ON public.practice_cases;
CREATE POLICY "cases write pilot" ON public.practice_cases FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ck write pilot" ON public.case_keywords;
CREATE POLICY "ck write pilot" ON public.case_keywords FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "links write pilot" ON public.case_legal_links;
CREATE POLICY "links write pilot" ON public.case_legal_links FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "tpl write pilot" ON public.document_templates;
CREATE POLICY "tpl write pilot" ON public.document_templates FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "kw write pilot" ON public.keywords;
CREATE POLICY "kw write pilot" ON public.keywords FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "sections write pilot" ON public.legal_sections;
CREATE POLICY "sections write pilot" ON public.legal_sections FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "sources write pilot" ON public.legal_sources;
CREATE POLICY "sources write pilot" ON public.legal_sources FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "cat write pilot" ON public.practice_categories;
CREATE POLICY "cat write pilot" ON public.practice_categories FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
