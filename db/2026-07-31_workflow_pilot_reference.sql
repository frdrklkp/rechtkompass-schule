-- Sprint 4.3 – Referenz-Pilot-Workflow
--
-- Ein einziger, vollständig ausgearbeiteter Workflow als reine Seed-Definition.
-- Zweck: Demonstrations- und Referenzimplementierung für alle Fähigkeiten der
-- generischen Workflow-Engine. Es wird KEIN Engine-Code geändert. Fachliche
-- Logik lebt ausschließlich in dieser Seed-Datei.
--
-- Genutzte Fähigkeiten:
--   • Kategorie + Template (published, internal)
--   • 5 Phasen mit unterschiedlichen Anforderungen
--   • 10 Schritte über ALLE workflow_step_type-Varianten
--     (information, decision, action, document, review, communication, wait)
--   • Verzweigte Abhängigkeitsgraphen (kein reiner linearer Pfad)
--   • Prioritäten (low/normal/high/critical) und Risiko-Level
--   • Checklisten (required + optional)
--   • Dokumentvorschläge (template_slug + note)
--   • Rollen mit differenzierten Rechten (can_edit / can_complete)
--   • Rechtsgrundlagen-Referenzen via citation_hint (+ optional legal_section_id)
--   • Regeln über alle Aktionstypen der WorkflowRuleEngine:
--       when: step_completed, checklist_missing, document_missing
--       then: unlock_step, block_workflow, set_priority, recommend
--
-- Slug: 'ordnungsmassnahme-pflichtverletzung' – Referenz-Workflow zur
-- strukturierten Bearbeitung eines schwerwiegenden Vorfalls bis zur
-- Ordnungsmaßnahme.

BEGIN;

DO $$
DECLARE
  cat_id  uuid;
  tpl_id  uuid;
  ph1_id  uuid;  -- Sofortlage
  ph2_id  uuid;  -- Sachverhaltsklärung
  ph3_id  uuid;  -- Anhörung
  ph4_id  uuid;  -- Entscheidung
  ph5_id  uuid;  -- Umsetzung & Nachsorge
  st_sichern_id      uuid;
  st_meldung_id      uuid;
  st_zeugen_id       uuid;
  st_beweise_id      uuid;
  st_einordnung_id   uuid;
  st_anhoerung_id    uuid;
  st_bescheid_id     uuid;
  st_wartefrist_id   uuid;
  st_umsetzung_id    uuid;
  st_nachsorge_id    uuid;
BEGIN
  -- ---------------------------------------------------------------------
  -- Kategorie
  -- ---------------------------------------------------------------------
  INSERT INTO public.workflow_categories (slug, title, description, icon, sort_order)
  VALUES ('ordnungsmassnahmen','Ordnungsmaßnahmen & Konflikte',
          'Workflows für schwerwiegende Pflichtverletzungen und Konflikte.',
          'gavel', 20)
  ON CONFLICT (slug) DO UPDATE SET
    title       = EXCLUDED.title,
    description = EXCLUDED.description,
    icon        = EXCLUDED.icon,
    sort_order  = EXCLUDED.sort_order
  RETURNING id INTO cat_id;

  -- ---------------------------------------------------------------------
  -- Template
  -- ---------------------------------------------------------------------
  INSERT INTO public.workflow_templates
    (category_id, slug, title, subtitle, description,
     workflow_status, publication_tier)
  VALUES (cat_id,'ordnungsmassnahme-pflichtverletzung',
          'Ordnungsmaßnahme nach schwerer Pflichtverletzung',
          'Referenz-Workflow: von der Sofortlage bis zur formalen Maßnahme',
          'Vollständig ausgearbeiteter Referenz-Workflow. Führt strukturiert '
          || 'durch Sicherung, Sachverhaltsklärung, Anhörung, Entscheidung '
          || 'und Nachsorge. Nutzt alle Fähigkeiten der Workflow-Engine.',
          'published','internal')
  ON CONFLICT (slug) DO UPDATE SET
    title            = EXCLUDED.title,
    subtitle         = EXCLUDED.subtitle,
    description      = EXCLUDED.description,
    workflow_status  = EXCLUDED.workflow_status,
    publication_tier = EXCLUDED.publication_tier
  RETURNING id INTO tpl_id;

  -- Alte Kind-Datensätze aufräumen (idempotent re-seed)
  DELETE FROM public.workflow_rules            WHERE template_id = tpl_id;
  DELETE FROM public.workflow_step_sources
    WHERE step_id IN (SELECT id FROM public.workflow_steps WHERE template_id = tpl_id);
  DELETE FROM public.workflow_step_roles
    WHERE step_id IN (SELECT id FROM public.workflow_steps WHERE template_id = tpl_id);
  DELETE FROM public.workflow_step_documents
    WHERE step_id IN (SELECT id FROM public.workflow_steps WHERE template_id = tpl_id);
  DELETE FROM public.workflow_step_checklists
    WHERE step_id IN (SELECT id FROM public.workflow_steps WHERE template_id = tpl_id);
  DELETE FROM public.workflow_step_dependencies
    WHERE step_id IN (SELECT id FROM public.workflow_steps WHERE template_id = tpl_id);
  DELETE FROM public.workflow_steps  WHERE template_id = tpl_id;
  DELETE FROM public.workflow_phases WHERE template_id = tpl_id;

  -- ---------------------------------------------------------------------
  -- Phasen
  -- ---------------------------------------------------------------------
  INSERT INTO public.workflow_phases
    (template_id, sort_order, title, description, is_required, completion_condition)
  VALUES (tpl_id, 10, 'Sofortlage',
          'Sicherheit herstellen und Vorfall unverzüglich dokumentieren.',
          true, 'Alle Pflicht-Schritte der Phase abgeschlossen.')
  RETURNING id INTO ph1_id;

  INSERT INTO public.workflow_phases
    (template_id, sort_order, title, description, is_required, completion_condition)
  VALUES (tpl_id, 20, 'Sachverhaltsklärung',
          'Beweise sichern, Zeugen befragen, Sachverhalt objektiv einordnen.',
          true, 'Sachverhalt ist konsolidiert dokumentiert.')
  RETURNING id INTO ph2_id;

  INSERT INTO public.workflow_phases
    (template_id, sort_order, title, description, is_required, completion_condition)
  VALUES (tpl_id, 30, 'Anhörung',
          'Rechtliches Gehör für Betroffene und Erziehungsberechtigte.',
          true, 'Protokolliertes Anhörungsgespräch liegt vor.')
  RETURNING id INTO ph3_id;

  INSERT INTO public.workflow_phases
    (template_id, sort_order, title, description, is_required, completion_condition)
  VALUES (tpl_id, 40, 'Entscheidung',
          'Ordnungsmaßnahme wählen, Verhältnismäßigkeit prüfen, Bescheid erstellen.',
          true, 'Bescheid ist unterschrieben und zugestellt.')
  RETURNING id INTO ph4_id;

  INSERT INTO public.workflow_phases
    (template_id, sort_order, title, description, is_required, completion_condition)
  VALUES (tpl_id, 50, 'Umsetzung & Nachsorge',
          'Maßnahme umsetzen, Frist wahren, pädagogisch begleiten.',
          false, 'Nachsorge dokumentiert oder Frist abgelaufen.')
  RETURNING id INTO ph5_id;

  -- ---------------------------------------------------------------------
  -- Schritte – decken alle workflow_step_type-Werte ab
  -- ---------------------------------------------------------------------
  -- Phase 1: Sofortlage
  INSERT INTO public.workflow_steps
    (template_id, phase_id, sort_order, title, description, goal,
     step_type, priority, is_required, estimated_minutes, primary_role, risk_level)
  VALUES (tpl_id, ph1_id, 10, 'Situation sichern',
          'Beteiligte trennen, akute Gefährdung abwenden, Ruhe herstellen.',
          'Keine weitere Eskalation.',
          'action','critical', true, 15, 'teacher','high')
  RETURNING id INTO st_sichern_id;

  INSERT INTO public.workflow_steps
    (template_id, phase_id, sort_order, title, description, goal,
     step_type, priority, is_required, estimated_minutes, primary_role, risk_level)
  VALUES (tpl_id, ph1_id, 20, 'Vorfall an Schulleitung melden',
          'Kurze, sachliche Meldung mit Zeit, Ort, Beteiligten und Kernaussage.',
          'Schulleitung ist informiert und einbezogen.',
          'communication','high', true, 15, 'teacher','medium')
  RETURNING id INTO st_meldung_id;

  -- Phase 2: Sachverhaltsklärung
  INSERT INTO public.workflow_steps
    (template_id, phase_id, sort_order, title, description, goal,
     step_type, priority, is_required, estimated_minutes, primary_role, risk_level)
  VALUES (tpl_id, ph2_id, 10, 'Zeuginnen und Zeugen befragen',
          'Einzeln, sachlich, mit Datum und Wortlaut protokollieren.',
          'Belastbare Zeugenaussagen liegen vor.',
          'information','normal', true, 60, 'class_lead','medium')
  RETURNING id INTO st_zeugen_id;

  INSERT INTO public.workflow_steps
    (template_id, phase_id, sort_order, title, description, goal,
     step_type, priority, is_required, estimated_minutes, primary_role, risk_level)
  VALUES (tpl_id, ph2_id, 20, 'Beweise sichern',
          'Fotos, Screenshots, Sachbeschädigungen dokumentieren; Originale aufbewahren.',
          'Beweislage ist gesichert und nachvollziehbar abgelegt.',
          'document','high', false, 30, 'class_lead','medium')
  RETURNING id INTO st_beweise_id;

  INSERT INTO public.workflow_steps
    (template_id, phase_id, sort_order, title, description, goal,
     step_type, priority, is_required, estimated_minutes, primary_role, risk_level)
  VALUES (tpl_id, ph2_id, 30, 'Sachverhalt einordnen',
          'Ist eine erzieherische Einwirkung ausreichend oder ist eine förmliche '
          || 'Ordnungsmaßnahme erforderlich?',
          'Rechtliche Einordnung getroffen.',
          'decision','high', true, 30, 'principal','high')
  RETURNING id INTO st_einordnung_id;

  -- Phase 3: Anhörung
  INSERT INTO public.workflow_steps
    (template_id, phase_id, sort_order, title, description, goal,
     step_type, priority, is_required, estimated_minutes, primary_role, risk_level)
  VALUES (tpl_id, ph3_id, 10, 'Anhörung durchführen',
          'Betroffene Schülerin/Schüler sowie Erziehungsberechtigte anhören und protokollieren.',
          'Rechtliches Gehör gewährt und dokumentiert.',
          'communication','high', true, 60, 'principal','high')
  RETURNING id INTO st_anhoerung_id;

  -- Phase 4: Entscheidung
  INSERT INTO public.workflow_steps
    (template_id, phase_id, sort_order, title, description, goal,
     step_type, priority, is_required, estimated_minutes, primary_role, risk_level)
  VALUES (tpl_id, ph4_id, 10, 'Bescheid erstellen und unterzeichnen',
          'Ordnungsmaßnahme festlegen, Verhältnismäßigkeit begründen, Bescheid ausfertigen.',
          'Rechtsmittelfähiger Bescheid liegt vor.',
          'review','critical', true, 45, 'principal','high')
  RETURNING id INTO st_bescheid_id;

  INSERT INTO public.workflow_steps
    (template_id, phase_id, sort_order, title, description, goal,
     step_type, priority, is_required, estimated_minutes, primary_role, risk_level)
  VALUES (tpl_id, ph4_id, 20, 'Zustellung & Wartefrist',
          'Bescheid nachweisbar zustellen und Rechtsmittelfrist abwarten.',
          'Zustellung dokumentiert, Frist läuft.',
          'wait','normal', true, 5, 'office','low')
  RETURNING id INTO st_wartefrist_id;

  -- Phase 5: Umsetzung & Nachsorge
  INSERT INTO public.workflow_steps
    (template_id, phase_id, sort_order, title, description, goal,
     step_type, priority, is_required, estimated_minutes, primary_role, risk_level)
  VALUES (tpl_id, ph5_id, 10, 'Maßnahme umsetzen',
          'Angeordnete Maßnahme organisatorisch umsetzen (z. B. Kursausschluss, Klassenwechsel).',
          'Maßnahme wirksam umgesetzt.',
          'action','normal', true, 30, 'deputy','medium')
  RETURNING id INTO st_umsetzung_id;

  INSERT INTO public.workflow_steps
    (template_id, phase_id, sort_order, title, description, goal,
     step_type, priority, is_required, estimated_minutes, primary_role, risk_level)
  VALUES (tpl_id, ph5_id, 20, 'Pädagogische Nachsorge',
          'Reflexionsgespräch, Wiedergutmachung, Anbindung Schulsozialarbeit.',
          'Reintegration angebahnt.',
          'communication','normal', false, 45, 'social_worker','low')
  RETURNING id INTO st_nachsorge_id;

  -- ---------------------------------------------------------------------
  -- Abhängigkeitsgraph (verzweigt, kein reiner linearer Pfad)
  --
  --   sichern
  --      └─► meldung
  --             ├─► zeugen ──┐
  --             └─► beweise ─┤
  --                          └─► einordnung ──► anhörung
  --                                                 └─► bescheid ──► wartefrist
  --                                                                      ├─► umsetzung
  --                                                                      └─► nachsorge
  -- ---------------------------------------------------------------------
  INSERT INTO public.workflow_step_dependencies (step_id, depends_on_step_id) VALUES
    (st_meldung_id,    st_sichern_id),
    (st_zeugen_id,     st_meldung_id),
    (st_beweise_id,    st_meldung_id),
    (st_einordnung_id, st_zeugen_id),
    (st_einordnung_id, st_beweise_id),
    (st_anhoerung_id,  st_einordnung_id),
    (st_bescheid_id,   st_anhoerung_id),
    (st_wartefrist_id, st_bescheid_id),
    (st_umsetzung_id,  st_wartefrist_id),
    (st_nachsorge_id,  st_wartefrist_id);

  -- ---------------------------------------------------------------------
  -- Checklisten (Pflicht + optional)
  -- ---------------------------------------------------------------------
  INSERT INTO public.workflow_step_checklists (step_id, sort_order, title, is_required) VALUES
    (st_sichern_id,     10, 'Beteiligte räumlich getrennt',                   true),
    (st_sichern_id,     20, 'Notruf / Erste Hilfe geprüft',                   true),
    (st_sichern_id,     30, 'Zeitpunkt und Ort notiert',                      false),

    (st_meldung_id,     10, 'Schulleitung mündlich informiert',               true),
    (st_meldung_id,     20, 'Kurznotiz schriftlich an Sekretariat',           true),

    (st_zeugen_id,      10, 'Einzelbefragungen durchgeführt',                 true),
    (st_zeugen_id,      20, 'Protokolle unterschrieben',                      false),

    (st_beweise_id,     10, 'Fotos/Screenshots gesichert',                    false),
    (st_beweise_id,     20, 'Originale abgelegt',                             false),

    (st_einordnung_id,  10, 'Verhältnismäßigkeit geprüft',                    true),
    (st_einordnung_id,  20, 'Milderes Mittel abgewogen',                      true),

    (st_anhoerung_id,   10, 'Erziehungsberechtigte eingeladen',               true),
    (st_anhoerung_id,   20, 'Anhörungsprotokoll erstellt',                    true),
    (st_anhoerung_id,   30, 'Gegenvortrag zur Kenntnis genommen',             true),

    (st_bescheid_id,    10, 'Begründung enthält Sachverhalt',                 true),
    (st_bescheid_id,    20, 'Rechtsbehelfsbelehrung enthalten',               true),
    (st_bescheid_id,    30, 'Unterschrift Schulleitung',                      true),

    (st_wartefrist_id,  10, 'Zustellungsnachweis in Akte',                    true),

    (st_umsetzung_id,   10, 'Klassenleitung informiert',                      true),
    (st_umsetzung_id,   20, 'Stundenplan/Organisatorisches angepasst',        false),

    (st_nachsorge_id,   10, 'Reflexionsgespräch geführt',                     false),
    (st_nachsorge_id,   20, 'Schulsozialarbeit einbezogen',                   false);

  -- ---------------------------------------------------------------------
  -- Dokumentvorschläge (verweisen auf template_slug in Vorlagen-Bibliothek)
  -- ---------------------------------------------------------------------
  INSERT INTO public.workflow_step_documents (step_id, template_slug, title, note) VALUES
    (st_meldung_id,    'meldung-schulleitung',   'Meldung an Schulleitung',
       'Kurze sachliche Erstmeldung.'),
    (st_zeugen_id,     'zeugenprotokoll',        'Zeugenprotokoll',
       'Ein Formular je Zeugin/Zeuge.'),
    (st_beweise_id,    'beweisverzeichnis',      'Beweisverzeichnis',
       'Nummerierte Ablage mit Fundort.'),
    (st_anhoerung_id,  'anhoerungsprotokoll',    'Anhörungsprotokoll',
       'Wortlautprotokoll, von beiden Seiten unterschrieben.'),
    (st_bescheid_id,   'bescheid-ordnungsmassnahme','Bescheid Ordnungsmaßnahme',
       'Mit Rechtsbehelfsbelehrung.'),
    (st_nachsorge_id,  'reflexionsprotokoll',    'Reflexionsprotokoll',
       'Pädagogische Nachsorge.');

  -- ---------------------------------------------------------------------
  -- Rollen (differenzierte Rechte je Schritt)
  -- ---------------------------------------------------------------------
  INSERT INTO public.workflow_step_roles (step_id, role, can_edit, can_complete) VALUES
    (st_sichern_id,     'teacher',       true,  true),
    (st_sichern_id,     'class_lead',    true,  true),

    (st_meldung_id,     'teacher',       true,  true),
    (st_meldung_id,     'office',        true,  false),

    (st_zeugen_id,      'class_lead',    true,  true),
    (st_zeugen_id,      'teacher',       true,  false),

    (st_beweise_id,     'class_lead',    true,  true),

    (st_einordnung_id,  'principal',     true,  true),
    (st_einordnung_id,  'deputy',        true,  false),

    (st_anhoerung_id,   'principal',     true,  true),
    (st_anhoerung_id,   'deputy',        true,  true),

    (st_bescheid_id,    'principal',     true,  true),
    (st_bescheid_id,    'office',        false, false),

    (st_wartefrist_id,  'office',        true,  true),

    (st_umsetzung_id,   'deputy',        true,  true),
    (st_umsetzung_id,   'office',        true,  false),

    (st_nachsorge_id,   'social_worker', true,  true),
    (st_nachsorge_id,   'class_lead',    true,  false);

  -- ---------------------------------------------------------------------
  -- Rechtsgrundlagen-Referenzen
  -- (legal_section_id bleibt NULL, wenn Bibliothek den Eintrag noch nicht kennt)
  -- ---------------------------------------------------------------------
  INSERT INTO public.workflow_step_sources (step_id, legal_section_id, citation_hint, note) VALUES
    (st_sichern_id,     NULL, 'Aufsichtspflicht der Lehrkraft',
       'Grundlage für sofortiges Handeln.'),
    (st_einordnung_id,  NULL, 'Schulgesetz – Ordnungsmaßnahmen (Verhältnismäßigkeit)',
       'Ist die formale Maßnahme geboten?'),
    (st_anhoerung_id,   NULL, 'Anspruch auf rechtliches Gehör',
       'Vor jeder belastenden Maßnahme.'),
    (st_bescheid_id,    NULL, 'Schulgesetz – Katalog der Ordnungsmaßnahmen',
       'Auswahl der konkreten Maßnahme.'),
    (st_bescheid_id,    NULL, 'Verwaltungsverfahrensrecht – Bescheidbestandteile',
       'Begründung und Rechtsbehelfsbelehrung.'),
    (st_wartefrist_id,  NULL, 'Rechtsmittelfrist nach Zustellung',
       'Fristbeginn dokumentieren.');

  -- ---------------------------------------------------------------------
  -- Regeln – decken alle Aktions- und Ereignistypen der RuleEngine ab
  --   when: step_completed | checklist_missing | document_missing
  --   then: unlock_step | block_workflow | set_priority | recommend
  --
  -- Referenzen werden per Titel/Slug aufgelöst (siehe WorkflowRuleEngine).
  -- ---------------------------------------------------------------------
  INSERT INTO public.workflow_rules
    (template_id, when_type, when_ref, then_action, then_ref, priority) VALUES
    -- 1) Bescheid darf ohne Anhörungsprotokoll niemals versendet werden.
    (tpl_id, 'checklist_missing', 'Anhörungsprotokoll erstellt',
             'block_workflow',    NULL, 10),

    -- 2) Ohne Rechtsbehelfsbelehrung darf der Workflow nicht abgeschlossen werden.
    (tpl_id, 'checklist_missing', 'Rechtsbehelfsbelehrung enthalten',
             'block_workflow',    NULL, 10),

    -- 3) Fehlt der Bescheid als Dokument, blockieren.
    (tpl_id, 'document_missing',  'bescheid-ordnungsmassnahme',
             'block_workflow',    NULL, 15),

    -- 4) Sobald Sofortlage gesichert ist, Meldung an Schulleitung freigeben.
    (tpl_id, 'step_completed',    'Situation sichern',
             'unlock_step',       'Vorfall an Schulleitung melden', 20),

    -- 5) Nach der Einordnung Anhörung mit hoher Priorität führen.
    (tpl_id, 'step_completed',    'Sachverhalt einordnen',
             'set_priority',      'Anhörung durchführen', 30),

    -- 6) Nach der Anhörung Bescheid als kritisch markieren.
    (tpl_id, 'step_completed',    'Anhörung durchführen',
             'set_priority',      'Bescheid erstellen und unterzeichnen', 30),

    -- 7) Nach Zustellung Nachsorge empfehlen (optional, keine Blockade).
    (tpl_id, 'step_completed',    'Zustellung & Wartefrist',
             'recommend',         'Pädagogische Nachsorge', 40),

    -- 8) Fehlt das Zeugenprotokoll, Beweissicherung mit höherer Priorität empfehlen.
    (tpl_id, 'document_missing',  'zeugenprotokoll',
             'set_priority',      'Beweise sichern', 50);

END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
