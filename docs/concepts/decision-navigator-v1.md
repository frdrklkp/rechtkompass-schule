# Whitepaper W1 – Decision Navigator v1.0

**Status:** Fachliches Produktkonzept (keine technische Spezifikation)
**Stand:** Juli 2026
**Bezug:** Architecture Freeze v1.0 (M1), Maintenance Release M1.1
**Geltungsbereich:** RechtsKompass Schule – zentrales Produktmodul

> Dieses Dokument beschreibt ausschließlich **was** der Decision Navigator fachlich leistet
> und **warum**. Es enthält bewusst keine Implementierungsvorgaben, keine Datenmodelle,
> keine Schnittstellen und keine UI-Spezifikationen.

---

## 1. Vision

### Warum der Decision Navigator existiert

Schulische Alltagssituationen sind selten rein pädagogisch. Ein Handy-Video im Unterricht,
eine Beleidigung auf dem Schulhof, ein wiederholt unentschuldigtes Fehlen, ein Verdacht auf
Kindeswohlgefährdung – jede dieser Situationen hat eine rechtliche Dimension. Lehrkräfte
müssen sie in Minuten bewerten, oft zwischen zwei Unterrichtsstunden, ohne juristische
Ausbildung und ohne verlässliche Ansprechperson im Moment der Entscheidung.

Das vorhandene Recht ist nicht das Problem – es ist vollständig verfügbar. Das Problem ist
seine **Zugänglichkeit im Moment des Handelns**. Schulgesetz, APO-BK, BASS-Erlasse,
Verwaltungsvorschriften und schulinterne Regelungen liegen verstreut, in Fachsprache, ohne
Bezug zur konkreten Situation. Der typische Ausweg – „Ich frage morgen mal jemanden" –
kostet Zeit, erzeugt Unsicherheit und führt regelmäßig zu Verfahrensfehlern, die später
nicht mehr heilbar sind (fehlende Anhörung, fehlende Dokumentation, verpasste Fristen).

Der Decision Navigator schließt genau diese Lücke: Er übersetzt eine geschilderte Situation
in eine geführte, begründete und dokumentierbare Handlungsfolge.

### Das Problem in einem Satz

> Lehrkräfte müssen rechtlich relevante Entscheidungen sofort treffen, haben aber weder die
> Zeit noch die Fachsprache noch die Quellenübersicht, um sie abgesichert zu treffen.

### Zielgruppe

Primär: pädagogisches Personal an Berufskollegs und allgemeinbildenden Schulen in
Nordrhein-Westfalen. Sekundär: Schulleitungen und Schulverwaltung. Nicht Zielgruppe:
Juristinnen und Juristen, Schulaufsicht in ihrer Prüffunktion, Rechtsberatung Dritter.

### Nutzen nach Rolle

**Lehrkräfte**
Sie erhalten in der akuten Situation eine klare Antwort auf drei Fragen: Wie ernst ist das?
Was muss ich jetzt tun? Was muss ich festhalten? Sie handeln nicht mehr aus dem Bauch
heraus, sondern nachvollziehbar – und sind dadurch persönlich entlastet und abgesichert.

**Klassenleitungen**
Sie bündeln Vorgänge über einzelne Schülerinnen und Schüler hinweg. Der Navigator macht
sichtbar, ob ein Einzelfall vorliegt oder ein Muster – und ab wann aus wiederholten
Kleinigkeiten ein formelles Verfahren wird. Dokumentation entsteht nebenbei und ist
anschlussfähig für Elterngespräche und Klassenkonferenzen.

**Bildungsgangleitungen**
Sie erkennen Häufungen im Bildungsgang, verantworten die Einhaltung der APO-BK bei
Leistungsbewertung, Fehlzeiten und Abschlüssen und können prüfen, ob Verfahren formal
sauber laufen, bevor sie eskalieren. Der Navigator liefert dafür eine einheitliche
Vorgehensweise statt individueller Praxis pro Lehrkraft.

**Schulleitungen**
Sie erhalten Verfahrenssicherheit: einheitliche Standards im Kollegium, vollständige
Dokumentation bei Ordnungsmaßnahmen und Meldepflichten, geringeres Risiko formaler Fehler
bei Widersprüchen. Zusätzlich sinkt der Beratungsaufwand, weil Standardfälle nicht mehr
einzeln erklärt werden müssen.

### Was der Navigator ausdrücklich nicht ist

Keine Rechtsberatung, kein Ersatz für Schulleitung, Schulaufsicht, Jugendamt, Polizei oder
Rechtsbeistand, keine automatisierte Entscheidung. Er bereitet Entscheidungen vor – treffen
muss sie ein Mensch mit Amtsverantwortung.

---

## 2. Leitprinzipien

Diese sieben Prinzipien sind verbindlich. Jede spätere Ausgestaltung des Navigators wird an
ihnen gemessen.

**1. Verständlichkeit vor Vollständigkeit**
Sprache auf dem Niveau eines gut informierten Laien. Kein Satz, der eine juristische
Vorbildung voraussetzt. Wo ein Fachbegriff unvermeidbar ist (z. B. „Anhörung",
„Ordnungsmaßnahme"), wird er an Ort und Stelle erklärt – nicht in einem Glossar am Ende.

**2. Rechtssichere Unterstützung, keine Rechtsberatung**
Jede Empfehlung ist an eine belegbare Quelle gebunden. Wo keine Quelle greift, sagt der
Navigator das offen und verweist auf die zuständige Stelle, statt eine Antwort zu erfinden.

**3. Keine juristische Fachsprache als Eingangsvoraussetzung**
Nutzerinnen und Nutzer beschreiben, was passiert ist – in ihren Worten. Die Übersetzung in
Rechtsbegriffe ist Aufgabe des Systems, nicht der Lehrkraft.

**4. Schritt für Schritt statt Wand aus Text**
Immer nur eine Frage, ein Schritt, eine Entscheidung. Der Navigator zeigt, wo man steht,
wie viel noch kommt und dass man jederzeit unterbrechen und später fortsetzen kann.

**5. Unsicherheit wird sichtbar gemacht, nicht kaschiert**
Wenn die Datenlage dünn ist, die Situation mehrdeutig oder die Rechtslage strittig, wird das
ausgesprochen: „Hier gibt es zwei mögliche Wege – das hängt davon ab, ob …". Ein souveräner
Hinweis auf Unsicherheit ist wertvoller als eine falsche Sicherheit.

**6. Jede Empfehlung wird begründet**
Zu jedem Vorschlag gehört ein „Warum": die Rechtsgrundlage, das dahinterliegende Ziel
(z. B. Schutz der Betroffenen, Wahrung des rechtlichen Gehörs) und die Konsequenz eines
Unterlassens. Empfehlungen ohne Begründung sind unzulässig.

**7. Niemals Ersatz für Rechtsberatung**
An jedem Ergebnis steht klar, dass es sich um eine Orientierungshilfe handelt. Bei roter
Einstufung, bei Beteiligung externer Stellen und bei allen Maßnahmen mit Rechtsfolgen wird
aktiv auf die zuständige Instanz verwiesen.

---

## 3. Grundablauf

Der Navigator führt durch zehn Stationen. Nicht jede Station ist in jedem Fall gleich
umfangreich; bei einfachen Situationen werden Stationen zusammengezogen, bei roten Fällen
vollständig durchlaufen.

```text
   Situation
      |
   Einordnung
      |
   Analyse
      |
   Bewertung
      |
    Ampel
      |
 Sofortmaßnahmen
      |
 Dokumentation
      |
 Rechtsgrundlagen
      |
   Vorlagen
      |
   Abschluss
```

**Situation** – Die Lehrkraft schildert, was vorgefallen ist. Ohne Formularzwang, ohne
Kategorienwissen. Ziel dieser Station ist ausschließlich, den Fall in das System zu bringen.

**Einordnung** – Das System ordnet die Schilderung einem oder mehreren Themenfeldern zu
(z. B. Ordnungsmaßnahmen, Aufsichtspflicht, Datenschutz, Fehlzeiten, Kindeswohl) und schlägt
den oder die passenden Praxisfälle vor. Die Nutzerin bestätigt oder korrigiert. Die
Einordnung ist ein Vorschlag, nie eine Festlegung.

**Analyse** – Gezielte Rückfragen füllen die Lücken, die für eine belastbare Bewertung
fehlen: Beteiligte, Zeitpunkt, Ort, Vorgeschichte, akute Gefahr, bereits Veranlasstes. Es
werden nur Fragen gestellt, deren Antwort das Ergebnis verändern kann.

**Bewertung** – Die gesammelten Angaben werden gegen den kuratierten Entscheidungsbaum des
Praxisfalls geprüft. Ergebnis ist eine fachliche Einschätzung: Was liegt hier vor, wer ist
zuständig, welche Pflichten sind ausgelöst, welche Fristen laufen.

**Ampel** – Die Bewertung wird auf eine dreistufige Dringlichkeit verdichtet (grün, gelb,
rot). Die Ampel ist die Kernaussage des Navigators und beantwortet die Frage „Wie ernst ist
das?" in einer Sekunde.

**Sofortmaßnahmen** – Konkrete Handlungsschritte, priorisiert nach Zeitdruck (Jetzt / Heute /
Später), jeweils mit Zuständigkeit und Begründung.

**Dokumentation** – Der Navigator benennt, was schriftlich festgehalten werden muss, und
bietet die passende Dokumentationsform an. Bereits erfasste Angaben aus der Analyse fließen
ein, damit nichts doppelt eingegeben wird.

**Rechtsgrundlagen** – Die tragenden Quellen werden mit verständlicher Erklärung angezeigt:
worauf sich die Empfehlung stützt und was die Norm im Kern verlangt.

**Vorlagen** – Passende Schreiben und Formulare werden vorgeschlagen, vorbelegt und zur
Bearbeitung übergeben.

**Abschluss** – Zusammenfassung des Vorgangs: Einstufung, veranlasste Schritte, erzeugte
Dokumente, offene Punkte, empfohlene Wiedervorlage. Der Vorgang kann geschlossen, pausiert
oder an eine andere Rolle übergeben werden.

---

## 4. Die Situation – Wege in den Navigator

Es gibt nicht einen richtigen Einstieg. Menschen kommen mit unterschiedlichem Vorwissen und
unterschiedlichem Zeitdruck. Der Navigator bietet daher fünf gleichwertige Zugänge, die alle
im selben geführten Ablauf münden.

**Freitext**
Der Regelfall. „Ein Schüler hat mich vor der Klasse beleidigt und weigert sich, den Raum zu
verlassen." Die Schilderung wird semantisch ausgewertet und auf passende Praxisfälle
abgebildet. Es gibt keine Pflichtfelder und keine Formulierungsvorgaben.

**Auswahl geführter Einstiegsfragen**
Für Nutzende, die nicht formulieren wollen oder unter Druck stehen: eine kurze Kaskade
einfacher Auswahlfragen („Geht es um eine Person, eine Note, eine Fehlzeit oder etwas
anderes?").

**Kategorien**
Systematischer Zugang über die fachliche Gliederung – Ordnungsmaßnahmen, Aufsicht und
Haftung, Leistungsbewertung, Fehlzeiten, Datenschutz, Kindeswohl, Digitales, Elternarbeit.
Geeignet für Vorbereitung und Fortbildung, nicht für den Akutfall.

**Schlagwörter**
Direkter Sprung über Begriffe, die Betroffene tatsächlich verwenden: „Handy",
„Klassenfahrt", „Attest", „Mobbing", „Foto", „Notenschutz", „Nachteilsausgleich". Synonyme
und Umgangssprache werden mitberücksichtigt.

**Praxisfälle**
Der direkte Einstieg über einen bereits redaktionell aufbereiteten Fall. Wer den passenden
Fall kennt, überspringt Einordnung und Teile der Analyse.

**Wiederaufnahme**
Zusätzlich zu den fünf Zugängen: ein pausierter Vorgang kann jederzeit fortgesetzt werden.
Schulalltag ist unterbrechungsgetrieben; der Navigator muss das aushalten.

---

## 5. Analyse – Welche Informationen gesammelt werden

Die Analyse verfolgt ein einziges Ziel: genug wissen, um verantwortbar zu bewerten – und
keine Frage mehr als nötig stellen. Jede Frage muss die Bewertung beeinflussen können,
sonst entfällt sie.

**Wer?** Betroffene Person(en), Alter bzw. Volljährigkeit, Rolle (Schülerin, Lehrkraft,
Eltern, externe Person), Status im Bildungsgang. Relevant für Zuständigkeit,
Beteiligungsrechte und Elterninformation.

**Wann?** Zeitpunkt des Vorfalls, Dauer, Wiederholung, Vorgeschichte. Relevant für Fristen,
für die Abgrenzung Einzelfall/Muster und für die Verhältnismäßigkeit von Maßnahmen.

**Wo?** Unterricht, Schulgelände, Schulweg, Klassenfahrt, digitaler Raum, außerhalb der
Schule. Relevant für Aufsichtspflicht, Unfallversicherungsschutz und schulische
Zuständigkeit überhaupt.

**Welche Beteiligten?** Zeugen, Mitwirkende, informierte Personen, bereits eingebundene
Stellen. Relevant für Anhörung, Beweislage und Datenschutz.

**Gefahr?** Besteht eine akute Gefährdung für Leib, Leben, seelische Gesundheit oder
Sachwerte? Diese Frage wird immer zuerst gestellt und kann den gesamten Ablauf abkürzen: Bei
akuter Gefahr springt der Navigator sofort auf Sofortmaßnahmen und Alarmierungswege.

**Dokumentation vorhanden?** Gibt es bereits Notizen, Klassenbucheinträge, E-Mails, frühere
Vermerke? Relevant, um Doppelarbeit zu vermeiden und um Lücken in der Beweiskette
aufzuzeigen.

**Bereits veranlasst?** Wurde die Schulleitung informiert, Eltern kontaktiert, eine Maßnahme
ausgesprochen? Verhindert widersprüchliche Empfehlungen und deckt Verfahrensfehler auf,
solange sie noch korrigierbar sind.

**Ziel der Lehrkraft?** Deeskalation, Klärung, formelle Maßnahme, Absicherung, Weitergabe.
Die Empfehlung unterscheidet sich je nach Absicht – bei gleicher Rechtslage.

Grundsatz zur Datensparsamkeit: Es werden nur Angaben erhoben, die für die Bewertung nötig
sind. Namen sind fast nie erforderlich; wo sie nur der Wiedererkennung dienen, genügt ein
Kürzel.

---

## 6. Ampelsystem

Die Ampel ist die verdichtete Antwort auf „Wie ernst ist das?". Sie bewertet **Dringlichkeit
und Formalisierungsgrad**, nicht moralische Schwere. Sie ist immer begründet und immer
korrigierbar.

### Grün – Pädagogisch lösbar

**Bedeutung:** Die Situation liegt im pädagogischen Handlungsspielraum der Lehrkraft. Es sind
keine formellen Verfahren, keine Meldepflichten und keine Fristen ausgelöst. Eine kurze
Notiz genügt zur Absicherung.

**Beispiele:** Einmaliges Stören des Unterrichts; vergessene Hausaufgaben; ein Handy, das
kurz sichtbar war; ein Wortgefecht zwischen zwei Schülern, das sich vor Ort klären lässt;
einmaliges verspätetes Erscheinen.

**Handlungsempfehlung:** Situation vor Ort pädagogisch klären, kurze sachliche Notiz
(Datum, Beteiligte, Sachverhalt, Reaktion), keine weitere Eskalation. Der Navigator weist
darauf hin, ab welcher Wiederholung die Einstufung nach Gelb wechselt.

### Gelb – Formal absichern

**Bedeutung:** Die Situation hat eine rechtliche Dimension, ist aber nicht akut. Sie
erfordert saubere Dokumentation, meist die Einbindung einer weiteren Rolle (Klassenleitung,
Bildungsgangleitung) und häufig eine Information der Eltern. Fristen können laufen.

**Beispiele:** Wiederholte Unterrichtsstörung trotz vorheriger Ermahnung; unentschuldigte
Fehlzeiten oberhalb der Bagatellgrenze; Streit um eine Leistungsbewertung; Verdacht auf
Täuschung bei einer Klausur; unerlaubte Foto- oder Tonaufnahme ohne Verbreitung; Konflikt
mit Eltern über eine schulische Entscheidung.

**Handlungsempfehlung:** Sachverhalt schriftlich fixieren, Beteiligte anhören und die
Anhörung dokumentieren, zuständige Rolle einbinden, Eltern informieren, Wiedervorlage
setzen. Der Navigator benennt ausdrücklich, welcher Verfahrensschritt später nicht mehr
nachholbar ist.

### Rot – Sofort handeln und eskalieren

**Bedeutung:** Es besteht akute Gefahr, eine gesetzliche Melde- oder Handlungspflicht oder
ein Sachverhalt mit möglichen Rechtsfolgen außerhalb der Schule. Die Lehrkraft entscheidet
hier nicht allein.

**Beispiele:** Anhaltspunkte für Kindeswohlgefährdung; Gewalt mit Verletzungsfolge;
Bedrohung mit einer Waffe; Verbreitung strafbarer oder intimer Aufnahmen; Suizidäußerung;
Verdacht auf Straftat auf dem Schulgelände; erhebliche Datenschutzverletzung; Unfall mit
Personenschaden.

**Handlungsempfehlung:** Zuerst Schutz und Erste Hilfe, dann unverzügliche mündliche
Information der Schulleitung, dann Protokoll noch am selben Tag. Alle weiteren Schritte nur
in Abstimmung mit der Schulleitung bzw. den einbezogenen externen Stellen. Der Navigator
tritt hier bewusst in den Hintergrund: Er unterstützt die Dokumentation, ersetzt aber keine
Entscheidung der Schulleitung.

### Regeln für die Ampel

- Die Ampel ist **immer** von einer Begründung begleitet, die auf die konkreten Angaben
  Bezug nimmt.
- Im Zweifel wird **höher** eingestuft. Eine zu vorsichtige Einstufung ist ein akzeptabler
  Fehler, eine zu laxe nicht.
- Die Einstufung kann sich im Verlauf ändern, wenn neue Angaben hinzukommen. Änderungen
  werden sichtbar gemacht, nicht still ersetzt.
- Die Nutzerin kann die Einstufung mit Begründung überschreiben; das wird protokolliert.

---

## 7. Sofortmaßnahmen

Sofortmaßnahmen sind der handlungsorientierte Kern des Ergebnisses. Sie werden nicht als
Fließtext, sondern als kurze, überprüfbare Schritte dargestellt – jeder Schritt eine
Handlung, ein Verantwortlicher, ein Zeitfenster, eine Begründung.

### Priorisierung

**Jetzt** – Alles, was keinen Aufschub duldet: Gefahr abwenden, Erste Hilfe, Personen
trennen, Aufsicht sicherstellen, Schulleitung mündlich informieren, Beweismittel sichern.
Bei roter Ampel steht hier immer mindestens ein Schritt.

**Heute** – Alles, was am selben Tag erledigt sein muss, damit das Verfahren tragfähig
bleibt: Vorfall schriftlich festhalten, Beteiligte anhören, Eltern informieren, zuständige
Rolle einbinden, Meldung auf den Weg bringen.

**Später** – Alles mit definiertem Zeithorizont: Wiedervorlage setzen, Gespräch terminieren,
Maßnahme förmlich beschließen, Wirkung überprüfen, Vorgang abschließen. Jeder
Später-Schritt trägt eine Frist oder ein Datum – „später" ohne Termin gilt als
unvollständig.

### Darstellung

Jeder Schritt zeigt: **Was zu tun ist** (in einem Satz, Verb voran), **wer zuständig ist**
(Lehrkraft, Klassenleitung, Bildungsgangleitung, Schulleitung, externe Stelle), **warum**
(Rechtsgrundlage oder Schutzziel) und **was passiert, wenn er unterbleibt**.

Ergänzend enthält der Navigator eine Sektion **„Bitte vermeiden"** – typische Fehler, die
in genau dieser Fallkonstellation regelmäßig auftreten (z. B. Anhörung nachträglich
dokumentieren, Sanktion vor Anhörung aussprechen, Beteiligte gemeinsam befragen,
Verdachtsäußerungen in die Schülerakte schreiben).

Schritte lassen sich abhaken. Der Fortschritt bleibt erhalten, wenn der Vorgang unterbrochen
und später fortgesetzt wird.

---

## 8. Rechtsgrundlagen

Rechtsgrundlagen erfüllen im Navigator eine doppelte Funktion: Sie **begründen** die
Empfehlung und sie **belegen** sie gegenüber Dritten. Beides funktioniert nur, wenn sie
verständlich sind.

### Angezeigt werden nicht nur Paragraphen, sondern Quellenarten

**Gesetz** – z. B. Schulgesetz NRW. Die verbindliche Grundlage schulischen Handelns.
Angezeigt mit Kurzname, Fundstelle und Kernaussage in Alltagssprache.

**Verordnung** – z. B. APO-BK, Ausbildungs- und Prüfungsordnungen. Konkretisieren das
Gesetz für Bildungsgang, Versetzung, Prüfung und Abschluss.

**BASS** – die Bereinigte Amtliche Sammlung der Schulvorschriften NRW. Für den Schulalltag
oft die praktisch wichtigste Quelle, weil hier Erlasse und Runderlasse gebündelt sind.
Angezeigt mit BASS-Ordnungsnummer und Titel.

**Verwaltungsvorschrift** – Erlasse und Richtlinien, die das Ermessen der Schule binden.
Wichtig, weil hier häufig Fristen, Formvorgaben und Meldewege stehen.

**Schulinterne Regelung** – Schulordnung, Hausordnung, Konferenzbeschlüsse. Nachrangig,
aber im Alltag entscheidend für die Frage, was vor Ort tatsächlich gilt.

**Urteil (spätere Ausbaustufe)** – Entscheidungen der Verwaltungsgerichte, die die Auslegung
prägen. Bewusst als Ausbaustufe markiert, weil Rechtsprechung ohne Einordnung mehr
Verwirrung stiftet als Klarheit.

### Darstellungsprinzip

Jede Quelle wird dreistufig gezeigt:

1. **Was es bedeutet** – ein bis zwei Sätze in Alltagssprache, bezogen auf die konkrete
   Situation („Sie dürfen ein Handy einziehen, aber nur vorübergehend und nur, wenn der
   Unterricht gestört wurde.").
2. **Woher es kommt** – Quellenart, Bezeichnung, Fundstelle, Stand der Fassung.
3. **Originalwortlaut** – auf Wunsch aufklappbar, unverändert, zitierfähig.

Was der Navigator zusätzlich sichtbar macht: **Aktualität** (Stand und ob eine neuere
Fassung erkannt wurde), **Verbindlichkeit** (Gesetz vor Verordnung vor Erlass vor
Hausordnung) und **Reichweite** (gilt landesweit / für den Bildungsgang / nur an dieser
Schule).

Wenn zu einem Punkt keine belastbare Quelle vorliegt, wird das als solches ausgewiesen:
„Hierzu gibt es keine ausdrückliche Regelung – das ist eine pädagogische
Ermessensentscheidung." Diese Ehrlichkeit ist Teil der Rechtssicherheit.

---

## 9. Dokumentation

Dokumentation ist im Schulrecht kein Bürokratieanhängsel, sondern die Bedingung dafür, dass
eine Maßnahme später Bestand hat. Der Navigator behandelt sie deshalb als eigenen
Ablaufschritt und nicht als Nachgedanken.

Angeboten werden – abhängig von Fall und Ampelstufe – die folgenden Dokumentationsformen:

**Gesprächsnotiz** – Für Gespräche mit Schülerinnen, Eltern oder Kolleginnen. Festgehalten
werden Anlass, Teilnehmende, Zeitpunkt, wesentliche Aussagen, Vereinbarungen und der nächste
Schritt. Wird vor allem bei Grün und Gelb angeboten.

**Aktenvermerk** – Die sachliche Festhaltung eines Vorgangs für die eigene Akte, ohne
Adressat. Trennt konsequent Beobachtung von Bewertung. Grundlage für spätere Verfahren.

**Elterninformation** – Schriftliche Mitteilung an die Erziehungsberechtigten bzw. an
volljährige Schülerinnen und Schüler. Der Navigator weist auf Volljährigkeit,
Informationspflichten und Zustellform hin.

**Meldung** – Formalisierte Weitergabe an eine zuständige Stelle: Schulleitung, Schulaufsicht,
Schulträger, Unfallkasse, Jugendamt. Enthält die Pflichtangaben der jeweiligen Meldung und
den korrekten Meldeweg.

**Protokoll** – Die vollständige Aufzeichnung eines formellen Vorgangs: Vorfallprotokoll,
Anhörungsprotokoll, Konferenzprotokoll. Bei roter Einstufung immer angeboten, mit Hinweis
auf Erstellung noch am Ereignistag.

**Zusatzformen** – Klassenbucheintrag (niederschwellig), Verlaufsdokumentation über mehrere
Ereignisse (bei Mustern), Fristen- und Wiedervorlagenotiz.

### Regeln guter Dokumentation, die der Navigator durchsetzt

Sachlich statt wertend. Zeitnah statt rekonstruiert. Vollständig hinsichtlich Datum,
Ort, Beteiligten und Reaktion. Getrennt nach Wahrnehmung, Aussage Dritter und eigener
Einschätzung. Datensparsam – keine Angaben, die zur Sache nichts beitragen. Und
nachvollziehbar hinsichtlich der Frage, wer wann was veranlasst hat.

Bereits in der Analyse erfasste Angaben werden in die Dokumentation übernommen. Die
Lehrkraft gibt nichts zweimal ein.

---

## 10. Vorlagen

Vorlagen sind die Brücke zwischen Empfehlung und tatsächlichem Handeln. Sie werden nicht
pauschal angeboten, sondern **anlassbezogen**.

### Wann eine Vorlage vorgeschlagen wird

Eine Vorlage erscheint, wenn mindestens eine der folgenden Bedingungen erfüllt ist:

- Ein Sofortmaßnahmen-Schritt verlangt ein Schriftstück (Anhörung, Information, Meldung).
- Die Ampelstufe erfordert formale Dokumentation (immer bei Rot, überwiegend bei Gelb).
- Der zugeordnete Praxisfall führt die Vorlage als typischerweise passend.
- Eine Frist läuft, die nur mit einem Schriftstück gewahrt werden kann.
- Die Nutzerin fragt aktiv nach einer Formulierungshilfe.

Bei Grün wird höchstens eine leichtgewichtige Vorlage angeboten (Notiz, Klassenbucheintrag).
Der Navigator erzeugt keinen Schriftverkehr, wo pädagogisches Handeln genügt.

### Wie Vorlagen vorgeschlagen werden

Mit Zweck („Wofür brauche ich das?"), Adressat, Empfehlung zum Zeitpunkt und
Vorbelegung aus den bereits erfassten Angaben. Wo mehrere Vorlagen in Frage kommen, werden
sie in der Reihenfolge des Verfahrensablaufs gezeigt – erst Anhörung, dann Vermerk, dann
Information, dann Meldung.

Jede Vorlage bleibt vollständig editierbar. Der Navigator liefert einen Entwurf, keinen
Bescheid. Verantwortung für Inhalt und Versand bleibt bei der Nutzerin bzw. der zuständigen
Rolle.

---

## 11. Workflow

Der Decision Navigator entwickelt **keine eigene Workflowlogik**. Er ist fachlich gesehen
eine Anwendung der vorhandenen Workflow Engine der Plattform.

**Fachliches Verhältnis:** Die Workflow Engine kennt Vorgänge, Phasen, Schritte, Zustände
und Übergänge. Der Navigator liefert die fachliche Bedeutung: welcher Vorgangstyp zu einer
Situation gehört, welche Schritte in welcher Reihenfolge fachlich sinnvoll sind und welche
Bedingungen erfüllt sein müssen, bevor ein Schritt als erledigt gelten darf.

**Ein Navigator-Durchlauf ist ein Vorgang.** Er wird eröffnet, wenn eine Situation
eingegeben wird, und lebt so lange, bis er abgeschlossen oder verworfen wird. Er kann
pausiert und fortgesetzt werden.

**Die Ablaufstationen aus Kapitel 3 sind Phasen.** Erfassung, Bewertung, Maßnahmen,
Dokumentation, Abschluss. Innerhalb der Phasen liegen die einzelnen Schritte – Fragen,
Handlungen, Dokumente.

**Zustände beschreiben, wo der Vorgang steht:** offen, in Bearbeitung, wartend (z. B. auf
eine Rückmeldung der Schulleitung), abgeschlossen, abgebrochen. Der Navigator interpretiert
diese Zustände in Alltagssprache („Sie warten auf die Rückmeldung der Schulleitung").

**Rollen und Übergaben:** Ein Vorgang kann von einer Rolle an eine andere übergeben werden –
von der Lehrkraft an die Klassenleitung, von dort an die Schulleitung. Fachlich gilt: Der
Vorgang wandert, die Historie bleibt. Wer übernimmt, sieht, was bereits geschehen ist.

**Blockierende Schritte:** Bestimmte Schritte dürfen fachlich nicht übersprungen werden –
etwa die Anhörung vor einer Ordnungsmaßnahme. Der Navigator markiert sie als verbindlich und
erklärt, warum ein Überspringen das Verfahren angreifbar macht.

**Historie und Nachvollziehbarkeit:** Jeder Schritt, jede Einstufung, jede Änderung wird im
Vorgang festgehalten. Das ist keine Kontrolle der Lehrkraft, sondern ihr Nachweis, korrekt
gehandelt zu haben.

Neue Anforderungen an die Engine ergeben sich aus diesem Konzept nicht. Sollte sich im
Detailentwurf herausstellen, dass ein fachlicher Bedarf nicht abgedeckt ist, wird er als
Anforderung dokumentiert – nicht als Umgehung gelöst.

---

## 12. Praxisfälle

Praxisfälle sind das redaktionelle Rückgrat des Navigators. Sie sind keine Beispiele,
sondern kuratierte Wissenseinheiten, die jede Navigation trägt. Qualität und Abdeckung der
Praxisfälle bestimmen die Qualität des gesamten Produkts.

### Aufbau eines Praxisfalls

**Titel** – Die Situation aus Sicht der Lehrkraft, nicht aus Sicht des Rechts.
„Schüler weigert sich, das Handy abzugeben" statt „Einziehung von Gegenständen".

**Kurzbeschreibung** – Zwei bis drei Sätze, die die typische Konstellation umreißen und die
Abgrenzung zu ähnlichen Fällen deutlich machen.

**Kategorie** – Einordnung in die fachliche Systematik (z. B. Ordnungsmaßnahmen, Aufsicht,
Datenschutz, Fehlzeiten, Leistungsbewertung, Kindeswohl).

**Schlagwörter** – Suchbegriffe in der Sprache der Nutzenden, inklusive Umgangssprache und
Synonymen.

**Ampel-Grundeinstufung** – Die typische Einstufung dieses Falls, die im Einzelfall durch die
Analyse angehoben oder gesenkt werden kann.

**Zuständigkeit** – Wer diesen Fall regulär bearbeitet.

**Entscheidungsbaum** – Der kuratierte, fallspezifische Fragenpfad mit Ergebnissen. Er ist
das Herzstück und wird redaktionell erstellt, geprüft und freigegeben.

**Workflow** – Der zugeordnete Vorgangstyp mit seinen Phasen und Schritten.

**Handlungsempfehlung und Checkliste** – Die konkreten Schritte in empfohlener Reihenfolge.

**Typische Fehler** – Was in diesem Fall erfahrungsgemäß schiefgeht.

**Rechtsgrundlagen** – Die tragenden Quellen mit Bezug zum konkreten Fall.

**Dokumente und Vorlagen** – Die typischerweise benötigten Schriftstücke.

**Verwandte Fälle** – Abgrenzung und Anschlussfälle für Grenzsituationen.

**Redaktionelle Metadaten** – Status (Entwurf, Prüfung, freigegeben), Bearbeitungsstand,
Stand der Rechtsgrundlagen, Wiedervorlage.

### Qualitätsanspruch

Ein Praxisfall gilt erst als freigegeben, wenn er fachlich geprüft, sprachlich verständlich
und mit belegten Quellen versehen ist. Unfertige Fälle erscheinen im Navigator nicht als
vollwertiges Ergebnis, sondern werden als noch in Bearbeitung ausgewiesen. Lieber eine Lücke
zugeben als eine ungeprüfte Empfehlung geben.

---

## 13. KI-Unterstützung

Künstliche Intelligenz ist im Decision Navigator eine **dienende Funktion**. Sie beschleunigt
Formulierung und Verständnis. Sie entscheidet nicht und legt Recht nicht aus.

### Zulässige Aufgaben

**Formulierungshilfe** – Aus Stichpunkten der Lehrkraft einen sachlichen Entwurf für
Gesprächsnotiz, Vermerk oder Elternschreiben erzeugen. Die Lehrkraft bleibt Autorin.

**Zusammenfassung** – Lange Sachverhalte, Verläufe oder Dokumentenketten verdichten, damit
eine übernehmende Rolle schnell den Stand erfasst.

**Erklärung** – Rechtsbegriffe und Normtexte in Alltagssprache übersetzen – streng am
vorliegenden Quellentext entlang.

**Vorschläge** – Passende Praxisfälle, Kategorien, Schlagwörter, Vorlagen und mögliche
Rückfragen vorschlagen. Vorschläge sind immer bestätigungspflichtig.

**Redaktionelle Unterstützung** – Im Redaktionsbereich Entwürfe für Praxisfälle,
Entscheidungsbäume und Checklisten erzeugen, die anschließend fachlich geprüft und
freigegeben werden.

### Ausdrücklich unzulässig

**Eigene Rechtsauslegung** – Die KI leitet keine Rechtsfolgen ab, die nicht in der
kuratierten Wissensbasis stehen. Sie beantwortet keine Rechtsfrage aus Modellwissen.

**Freie Erfindungen** – Keine Paragraphen, Fundstellen, Fristen, Aktenzeichen oder
Zuständigkeiten, die nicht belegt sind. Fehlt eine Quelle, ist die korrekte Antwort:
„Dazu liegt mir keine gesicherte Grundlage vor."

**Unbegründete Empfehlungen** – Kein Handlungsvorschlag ohne Herkunft. Jede Empfehlung ist
entweder redaktionell kuratiert oder an eine belegte Quelle gebunden.

**Automatische Entscheidungen** – Keine Ampeleinstufung allein durch das Sprachmodell, keine
automatische Auslösung von Meldungen, kein Versand ohne Freigabe.

**Verarbeitung ohne Notwendigkeit** – Personenbezogene Daten werden nur verarbeitet, soweit
sie für die Aufgabe erforderlich sind.

### Sichtbarkeit

Wo KI beteiligt war, wird das gekennzeichnet. Nutzende sollen jederzeit unterscheiden
können, was redaktionell geprüftes Wissen ist und was maschinell erzeugter Entwurf.

---

## 14. Benutzererlebnis

Der Navigator wird typischerweise in einem Moment genutzt, in dem jemand angespannt ist:
gerade ist etwas passiert, es ist unklar, wie ernst es ist, und die nächste Stunde beginnt in
sieben Minuten. Das Erlebnis muss diesem Moment gerecht werden.

**Orientiert** – Zu jedem Zeitpunkt ist erkennbar: Wo bin ich? Was kommt noch? Wie lange
dauert das? Kein Schritt ohne Kontext, kein Ergebnis ohne Weg dorthin.

**Unterstützt** – Der Navigator nimmt Arbeit ab, statt sie zu erzeugen. Was bereits erfasst
wurde, wird weiterverwendet. Vorschläge sind konkret genug, um sie zu übernehmen.

**Ruhig** – Nüchterne Sprache, keine Dramatisierung, keine Ausrufezeichen, keine
Schuldzuweisung. Auch bei roter Einstufung bleibt der Ton sachlich und handlungsorientiert:
klar, aber nicht alarmistisch.

**Sicher** – Nach dem Durchlauf weiß die Lehrkraft, dass sie nichts Wesentliches übersehen
hat, worauf sich ihr Handeln stützt und dass es nachvollziehbar dokumentiert ist.

**Nicht überfordert** – Eine Frage nach der anderen. Kein Pflichtfeldwald, keine
Rechtstextwände. Details sind verfügbar, aber eingeklappt. Wer nur die Ampel und die drei
Sofortschritte braucht, bekommt genau das.

**Unterbrechbar** – Der Vorgang darf jederzeit pausieren. Nichts geht verloren, nichts muss
in einem Zug erledigt werden.

**Respektvoll gegenüber Erfahrung** – Der Navigator belehrt nicht. Er stellt Wissen bereit
und respektiert, dass die pädagogische Einschätzung bei der Lehrkraft liegt. Wer eine
Empfehlung übergeht, wird nicht getadelt, sondern auf die Konsequenz hingewiesen.

**Ehrlich in den Grenzen** – Wo der Navigator nicht weiterhelfen kann, sagt er es und nennt
die zuständige Stelle. Diese Ehrlichkeit erzeugt mehr Vertrauen als eine glatte, aber
unsichere Antwort.

---

## 15. Zukunft

Die folgenden Erweiterungen sind bewusst **nicht** Teil von Version 1.0. Sie sind hier
festgehalten, damit die fachliche Konzeption sie nicht ausschließt.

**Sprachsteuerung** – Situationsschilderung per Sprache, für Momente, in denen Tippen nicht
möglich ist (Aufsicht, Flur, unmittelbar nach einem Vorfall). Setzt hohe Anforderungen an
Datenschutz und Umgebungssituation voraus.

**Mobile App** – Native Nutzung mit Offline-Zugriff auf freigegebene Praxisfälle und
Checklisten, Erfassung ohne Netz, spätere Synchronisation.

**Schulinterne Regelwerke** – Einbindung von Schulordnung, Konferenzbeschlüssen und lokalen
Verfahrensabsprachen, sodass der Navigator nicht nur die Landesebene, sondern die tatsächlich
vor Ort geltende Praxis abbildet.

**Knowledge Graph** – Vernetzung von Fällen, Normen, Maßnahmen und Rollen zu einem
navigierbaren Wissensnetz. Ermöglicht Fragen wie „Welche Fälle betreffen dieselbe Norm?"
oder „Was ändert sich, wenn dieser Erlass neu gefasst wird?".

**Mehrsprachigkeit** – Zunächst für Elterninformationen und Schülerkommunikation, später für
die Oberfläche. Besonders relevant an Berufskollegs mit internationalen Klassen.

**Weitere Perspektiven** – Rechtsprechungsmodul mit eingeordneten Urteilen; anonymisierte
Auswertungen für Schulentwicklung; Fristen- und Wiedervorlagenassistenz; Übertragung auf
weitere Bundesländer; Fortbildungsmodus mit simulierten Fällen; Kollegiale Fallberatung.

Alle Erweiterungen unterliegen denselben Leitprinzipien. Keine Ausbaustufe darf
Verständlichkeit, Belegpflicht oder die Abgrenzung zur Rechtsberatung aufweichen.

---

## Abschluss

### Zusammenfassung

Der Decision Navigator führt eine Lehrkraft von einer alltagssprachlich geschilderten
Situation in zehn nachvollziehbaren Schritten zu einer begründeten Einschätzung, einer klaren
Dringlichkeitsstufe, priorisierten Sofortmaßnahmen, der passenden Dokumentation, den
tragenden Rechtsgrundlagen und den benötigten Vorlagen.

Er stützt sich dabei auf drei Fundamente: **kuratierte Praxisfälle** als redaktionell
geprüfte Wissensbasis, die **vorhandene Workflow Engine** als Ablaufrückgrat und die
**Legal-Knowledge-Plattform** als Quelle belegbarer Rechtsgrundlagen. Künstliche Intelligenz
unterstützt bei Formulierung, Zusammenfassung und Erklärung – sie entscheidet nicht und legt
Recht nicht aus.

Sein Versprechen an die Nutzerin lautet nicht „Wir sagen dir, was richtig ist", sondern:
**„Du weißt, wie ernst es ist, was jetzt zu tun ist, worauf sich das stützt und dass es
dokumentiert ist."**

### Einordnung im Produkt

Der Decision Navigator ist das **zentrale Produktmodul von RechtsKompass Schule**. Alle
bislang aufgebauten Plattformbestandteile – Import- und Legal-Knowledge-Pipeline, Workflow
Engine, Dokumentenerzeugung, Redaktionsplattform, KI-Schicht – sind Zulieferer für dieses
eine Modul. Sie sind Mittel, nicht Zweck. Was die Nutzerin am Ende erlebt und wofür sie das
Produkt einsetzt, ist der Navigator.

Damit ist die Reihenfolge der Weiterentwicklung fachlich vorgegeben: Alles, was den Navigator
verständlicher, belegter oder schneller macht, hat Vorrang. Alles andere ist Ausbau.

### Abgrenzung dieses Dokuments

Dieses Whitepaper ist ein Produktkonzept. Es enthält keine Implementierung, keine
Datenbankänderungen, keine Benutzeroberfläche, keine Schnittstellen und keine Tests. Die
technische Spezifikation folgt in einem eigenen Schritt und muss sich an den hier
festgelegten Leitprinzipien messen lassen.

---

*Whitepaper W1 – Decision Navigator v1.0 · RechtsKompass Schule · Fachliche Konzeption*
