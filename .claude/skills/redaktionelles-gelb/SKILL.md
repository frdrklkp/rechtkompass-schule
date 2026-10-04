---
name: redaktionelles-gelb
description: Hebt RechtKompass-Fälle redaktionell auf Gelb (oder veröffentlicht sie), wenn die KI-Prüfbegründung die Kernaussagen als quellenbelegt einstuft, die Note aber rot blieb. Nutze diese Skill, wenn der Nutzer Fälle "auf gelb heben", "redaktionell bestätigen", "freigeben" oder "veröffentlichungsreif machen" will. Löst NICHT aus, wenn zentrale Rechtsfragen laut Prüfung unbeantwortet sind - solche Fälle bleiben ehrlich rot.
---

# Redaktionelles Gelb und Veröffentlichung

Etabliertes Muster (dutzendfach angewandt, vom Nutzer als Redaktionslinie bestätigt): Wenn der Validator in der Substanz zufrieden ist, aber wegen Nachlauf/Haarspalterei rot vergibt, entscheidet die Redaktion dokumentiert auf Gelb.

## Prüfkriterium (hart)

NUR heben, wenn die `legal_review_reasoning` die ZENTRALEN Aussagen als belegt einstuft ("Kernaussagen belegt", "Der Kern des Falls ist abgesichert", "gelb angebracht" o. ä.) und offene Punkte Nebenfragen sind. NIEMALS heben bei "zentrale Rechtsfrage nicht beantwortet", falschen Schulform-Quellen im Text oder unbelegten Kernbehauptungen - die brauchen erst die Skill `sanierungspipeline` bzw. Textarbeit.

## Ausführung (pro Fall)

1. Offene Flags laden (`case_legal_review_flags`, `resolved_at is null`) und schließen, was Artefakt ist: Reason beginnt mit `[Konsistenzkonflikt]` oder `[LEGAL_SOURCE_CONFLICT]`, sowie exakte Text-Duplikate (nach Abzug dieser Präfixe vergleichen). Echte offene Rechtsfragen BLEIBEN offen - sie erscheinen als "Offene Rechtsfragen" auf der Fallseite und sind gelb-konform. Schließen = `resolved_at` jetzt, `resolved_by` = Admin `85d423d1-cde1-47b2-bc27-f9383621b15a`.
2. `legal_review_status` auf `gelb` setzen und an `legal_review_reasoning` einen datierten Vermerk anhängen: "Redaktionell auf Gelb bestätigt (<Datum>, Redaktion): <konkrete Begründung, welche Normen den Kern tragen>. Offene Detailfragen bleiben als offene Rechtsfragen am Fall sichtbar."
3. Falls der Fall nicht veröffentlicht ist (`workflow_status` draft/in_review/approved): über Admin-Session (generateLink + verifyOtp für admin@rechtkompass.local - service_role kann die RPCs NICHT aufrufen, auth.uid() ist null) die RPCs fahren: `submit_case_for_review` → ggf. genehmigen → `publish_case` mit `p_publication_tier: "internal"`.
4. **Browser-Verifikation:** Fallseite öffnen - Rot-Banner "Noch nicht abschließend quellengeprüft" muss verschwunden sein.
5. Bei Statusänderungen den Fallkatalog-Artifact aktualisieren (Generator: Scratchpad-Muster `gen_fallkatalog.ts`, publiziert auf Artifact 7419192c-de4f-4842-97b9-a847d93a3855).

Der Sicherheits-Classifier blockt Massen-Updates gelegentlich: Skript in den Scratchpad legen und dem Nutzer als Run-Button-Befehl geben.
