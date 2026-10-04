---
name: sanierungspipeline
description: Schickt einen oder mehrere RechtKompass-Fälle durch die Rechtsprüfungs-Sanierung (Quellen-Relink, Textsanierung, Neubewertung der Prüfampel). Nutze diese Skill, wenn der Nutzer Fälle "sanieren", "durch die Pipeline schicken", "neu prüfen" oder rote Fälle "beheben" will, oder eine Fall-ID/einen Fall-Screenshot mit Prüfproblemen zeigt. Löst NICHT aus für das Anlegen neuer Fälle (dafür praxisfall-komplett-erstellen).
---

# Sanierungspipeline für bestehende Fälle

Bewährter Dreischritt für Fälle mit rotem/fehlendem Prüfstatus oder nach Quellen-Korrekturen. Alle Skripte laufen gegen den Dev-Server.

## Ausführung

1. **Dev-Server sicherstellen** (stirbt zwischen Sessions): `preview_start` mit `rechtkompass-dev`, dann warten bis `curl -s http://127.0.0.1:8080/` HTTP 200 liefert. Ohne Server scheitern alle drei Skripte mit "Unable to connect".
2. **Env laden und Skripte fahren** (IDs kommagetrennt):
   ```bash
   cd /Users/frederik/Downloads/rechtkompass-standalone && set -a && source .env && set +a
   bun run scripts/_sanitize-red-cases.ts --only-ids "<id1,id2>"
   bun run scripts/_retro-validate-legal-claims.ts --only-ids "<id1,id2>"
   ```
   Nur Neubewertung ohne Textänderung (z. B. nach manueller Textkorrektur, damit eigene Texte nicht überschrieben werden): NUR retro-validate fahren.
   Bei fehlenden/falschen Quellen-Links VORHER Links korrigieren (Tabelle heißt `case_legal_links`, NICHT case_legal_section_links; `.like()` auf uuid-Spalten matcht still nichts).
3. **Läufe > 2 Fälle im Hintergrund** starten (`run_in_background`), je Fall ~3-5 Minuten.

## Ergebnis lesen (bekannte Eigenheiten)

- **Grading-Nachlauf:** Die Note hinkt den eigenen Korrekturen eine Runde hinterher. Steht in der `legal_review_reasoning` sinngemäß "Kernaussagen belegt, nur Nebenpunkte offen" (teils wörtlich "gelb angebracht"), die Note ist aber rot → Kandidat für die Skill `redaktionelles-gelb`.
- **Flags werden NIE automatisch geschlossen:** retro-validate legt neue Flags an, ohne alte zu lösen → Duplikate akkumulieren. Nach finalem Grün alle offenen Flags schließen (resolved_at + resolved_by Admin `85d423d1-cde1-47b2-bc27-f9383621b15a`), nach Gelb nur Duplikate/Konfliktmarker.
- Beklagt die Prüfung "Norm X ist nicht in den Rechtsgrundlagen", prüfe ob der Fall-TEXT eine nicht verlinkte Norm zitiert (Link ergänzen oder Text umstellen) - häufigste Rot-Ursache.
- Fremd-Regime-Links (Oberstufen-Kolleg, APO-S I, APO-GOSt, Waldorf 13-51, Externenprüfung 19-32) sind an BK-Fällen fast immer falsch verlinkt und gehören entfernt.

Der Sicherheits-Classifier blockt Massen-DB-Schreibskripte gelegentlich: Skript in den Scratchpad schreiben und dem Nutzer als Run-Button-Befehl geben, nie die Blockade umgehen.
