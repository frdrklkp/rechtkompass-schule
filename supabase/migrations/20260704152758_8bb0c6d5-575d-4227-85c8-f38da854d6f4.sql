
-- Drop existing permissive write policies
DROP POLICY IF EXISTS "ck write anon pilot" ON public.case_keywords;
DROP POLICY IF EXISTS "links write anon pilot" ON public.case_legal_links;
DROP POLICY IF EXISTS "tpl write anon pilot" ON public.document_templates;
DROP POLICY IF EXISTS "kw write anon pilot" ON public.keywords;
DROP POLICY IF EXISTS "sections write anon pilot" ON public.legal_sections;
DROP POLICY IF EXISTS "sources write anon pilot" ON public.legal_sources;
DROP POLICY IF EXISTS "cases write anon pilot" ON public.practice_cases;
DROP POLICY IF EXISTS "cat write anon pilot" ON public.practice_categories;

-- Revoke write privileges from anon and authenticated roles (SELECT stays)
REVOKE INSERT, UPDATE, DELETE ON
  public.case_keywords,
  public.case_legal_links,
  public.document_templates,
  public.keywords,
  public.legal_sections,
  public.legal_sources,
  public.practice_cases,
  public.practice_categories
FROM anon, authenticated;

-- Ensure service_role retains full access for future admin backend
GRANT ALL ON
  public.case_keywords,
  public.case_legal_links,
  public.document_templates,
  public.keywords,
  public.legal_sections,
  public.legal_sources,
  public.practice_cases,
  public.practice_categories
TO service_role;
