---
name: praxisfall-komplett-erstellen
description: Legt für RechtKompass Schule (dieses Repo) einen kompletten Praxisfall an und veröffentlicht ihn vollautomatisiert - von der KI-Erstentwurf über Rechtsgrundlagen-Verknüpfung, Entscheidungsbaum, Qualitätsoptimierung bis zur Veröffentlichung. Nutze diese Skill IMMER, wenn der Nutzer einen neuen Praxisfall/Fallbeispiel erstellt haben möchte, einen Fall zu einem Thema/Titel "anlegen", "erstellen" oder "hinzufügen" will, oder von "komplett bis zur Veröffentlichung" oder ähnlichem spricht - auch wenn er nicht explizit "Skill" sagt. Löst NICHT aus für reine Bearbeitung bestehender Fälle oder allgemeine Fragen zur App.
---

# Praxisfall komplett erstellen

Führt den kompletten, in dieser Session gebauten und live verifizierten Pipeline-Lauf aus: KI-Entwurf → anlegen → Rechtsgrundlagen/Schlagwörter/Vorlagen verknüpfen → Entscheidungsbaum generieren → iterativ auf Score 100 optimieren → Baum freigeben → Redaktions-Workflow (einreichen → genehmigen → veröffentlichen, Tier "internal").

**Wichtig, weil der Nutzer es explizit als Kernanforderung genannt hat:** Ein Fall ohne verknüpfte Rechtsgrundlage wird NIE veröffentlicht. Das Skript prüft das hart nach Schritt 3 und bricht mit klarer Meldung ab statt eine Norm zu erfinden oder den Fall trotzdem durchzuschieben.

## Ausführung

1. Ermittle Titel und (falls vom Nutzer gegeben) eine kurze Sachverhalts-Skizze aus der Anfrage.
2. Stelle sicher, dass der Dev-Server auf `http://127.0.0.1:8080` läuft (`preview_start` mit dem Launch-Config-Namen aus `.claude/launch.json`, falls noch nicht aktiv).
3. Führe aus:
   ```bash
   cd "/Users/frederik/Downloads/rechtkompass-standalone" && bun run scripts/_create-and-publish-case.ts "<Titel>" "<Sachverhalt-Skizze oder leer>"
   ```
   Das Skript braucht mehrere KI-Aufrufe (Entwurf, Rechtsgrundlagen-Matching, Entscheidungsbaum, ggf. mehrere Optimierungsrunden) und läuft typischerweise 1-3 Minuten. Bei mehreren Fällen in einer Anfrage: nacheinander ausführen, nicht parallel (gemeinsame KI-Rate-Limits).
4. Das Skript gibt einen strukturierten Abschlussbericht aus (Titel, Fall-ID, Score, Anzahl Rechtsgrundlagen, Baum-Status, Veröffentlichungsstatus). Gib diesen Bericht dem Nutzer wieder - übersetze ihn nicht in eine vage Zusammenfassung, die konkreten Zahlen sind der Punkt.
5. Falls Score 100 nicht erreicht wurde, listet das Skript die konkreten verbleibenden Gründe (aus der Qualitäts-Engine) mit auf - gib auch diese wieder, statt nur "fast geschafft" zu sagen. Die meisten verbleibenden Lücken an diesem Punkt sind "nur redaktionell behebbar" (z.B. eine fachliche Einschätzung, die kein Automatismus treffen kann) - das ist normal und kein Fehler des Skripts.
6. Falls das Skript wegen fehlender Rechtsgrundlage abbricht (Exit-Code 1, Meldung "ABBRUCH"): das ist beabsichtigtes Verhalten, kein Bug. Erkläre dem Nutzer, dass für dieses Thema keine passende Rechtsgrundlage in der Wissensbasis gefunden wurde und der Fall manuell geprüft werden muss - schlage NICHT vor, eine Norm zu erfinden oder die Prüfung zu umgehen.

## Warum diese Reihenfolge

Jeder Schritt baut auf einer in dieser Session gefundenen echten Ursache auf: die Ampel-Kriterien und das Markdown-Verbot stecken bereits im KI-Prompt (nicht Aufgabe dieses Skripts); die harte Rechtsgrundlagen-Prüfung existiert, weil KI-Fallgenerierung ohne sie regelmäßig Fälle ganz ohne Rechtsgrundlage erzeugt hatte; die Qualitätsoptimierung nutzt bewusst dieselbe Engine (`fixCaseQualityTasks`) wie der Qualitätsmanager in der Admin-UI, statt eigene Feld-für-Feld-Logik zu erfinden.

Das vollständige Skript liegt unter `scripts/_create-and-publish-case.ts` - bei Bedarf (z.B. neue Anforderungen an den Ablauf) dort direkt anpassen, nicht die Logik hier im SKILL.md duplizieren.
