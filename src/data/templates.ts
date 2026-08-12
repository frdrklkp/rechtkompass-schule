export interface TemplateField {
  name: string;
  label: string;
  type: "text" | "textarea" | "date";
  placeholder?: string;
}

export interface TemplateDef {
  id: string;
  title: string;
  description: string;
  fields: TemplateField[];
  render: (v: Record<string, string>) => string;
}

const today = () => new Date().toLocaleDateString("de-DE");
const val = (v: string | undefined, fallback = "—") => (v && v.trim() ? v : fallback);

export const TEMPLATES: TemplateDef[] = [
  {
    id: "aktennotiz",
    title: "Aktennotiz",
    description: "Kurze, sachliche Notiz zu einem Vorfall für die Akte.",
    fields: [
      { name: "datum", label: "Datum", type: "date" },
      { name: "verfasser", label: "Verfasser:in", type: "text", placeholder: "Name, Funktion" },
      { name: "betreff", label: "Betreff", type: "text", placeholder: "Kurztitel" },
      { name: "sachverhalt", label: "Sachverhalt", type: "textarea", placeholder: "Was ist passiert? Wer war beteiligt?" },
      { name: "massnahme", label: "Ergriffene Maßnahme", type: "textarea" },
    ],
    render: (v) =>
      `AKTENNOTIZ (BKO)\n\nDatum: ${val(v.datum, today())}\nVerfasser:in: ${val(v.verfasser)}\nBetreff: ${val(v.betreff)}\n\nSachverhalt:\n${val(v.sachverhalt)}\n\nMaßnahme:\n${val(v.massnahme)}`,
  },
  {
    id: "gespraechsprotokoll",
    title: "Gesprächsprotokoll",
    description: "Ergebnisprotokoll eines Gesprächs mit Beteiligten.",
    fields: [
      { name: "datum", label: "Datum", type: "date" },
      { name: "teilnehmer", label: "Teilnehmende", type: "textarea" },
      { name: "anlass", label: "Anlass", type: "text" },
      { name: "inhalt", label: "Wesentliche Inhalte", type: "textarea" },
      { name: "vereinbarung", label: "Vereinbarungen", type: "textarea" },
    ],
    render: (v) =>
      `GESPRÄCHSPROTOKOLL\n\nDatum: ${val(v.datum, today())}\nTeilnehmende:\n${val(v.teilnehmer)}\n\nAnlass: ${val(v.anlass)}\n\nInhalt:\n${val(v.inhalt)}\n\nVereinbarungen:\n${val(v.vereinbarung)}`,
  },
  {
    id: "elterninformation",
    title: "Elterninformation",
    description: "Schriftliche Information an Erziehungsberechtigte oder Ausbildungsbetrieb.",
    fields: [
      { name: "empfaenger", label: "Empfänger:in", type: "text", placeholder: "Eltern von … / Ausbildungsbetrieb" },
      { name: "datum", label: "Datum", type: "date" },
      { name: "betreff", label: "Betreff", type: "text" },
      { name: "text", label: "Text", type: "textarea" },
      { name: "unterschrift", label: "Unterschrift", type: "text" },
    ],
    render: (v) =>
      `Sehr geehrte Damen und Herren${v.empfaenger ? " " + v.empfaenger : ""},\n\nBetreff: ${val(v.betreff)}\nDatum: ${val(v.datum, today())}\n\n${val(v.text)}\n\nMit freundlichen Grüßen\n${val(v.unterschrift)}\nBerufskolleg Olsberg`,
  },
  {
    id: "schulleitungsinformation",
    title: "Information an die Schulleitung",
    description: "Interne Information an die Schulleitung des BKO.",
    fields: [
      { name: "datum", label: "Datum", type: "date" },
      { name: "von", label: "Von", type: "text" },
      { name: "betreff", label: "Betreff", type: "text" },
      { name: "sachverhalt", label: "Sachverhalt", type: "textarea" },
      { name: "bitte", label: "Bitte um / Vorschlag", type: "textarea" },
    ],
    render: (v) =>
      `An die Schulleitung des Berufskollegs Olsberg\n\nVon: ${val(v.von)}\nDatum: ${val(v.datum, today())}\nBetreff: ${val(v.betreff)}\n\nSachverhalt:\n${val(v.sachverhalt)}\n\nBitte um:\n${val(v.bitte)}`,
  },
  {
    id: "anhoerung",
    title: "Anhörung (§ 28 VwVfG NRW)",
    description: "Formularvorlage für die Anhörung vor belastender Entscheidung.",
    fields: [
      { name: "betroffen", label: "Betroffene Person", type: "text" },
      { name: "datum", label: "Datum", type: "date" },
      { name: "vorwurf", label: "Sachverhalt / Vorwurf", type: "textarea" },
      { name: "stellungnahme", label: "Möglichkeit zur Stellungnahme bis", type: "date" },
    ],
    render: (v) =>
      `ANHÖRUNG (§ 28 VwVfG NRW)\n\nBetroffen: ${val(v.betroffen)}\nDatum: ${val(v.datum, today())}\n\nSachverhalt:\n${val(v.vorwurf)}\n\nSie erhalten Gelegenheit zur Stellungnahme bis: ${val(v.stellungnahme)}`,
  },
  {
    id: "vorfallprotokoll",
    title: "Vorfallprotokoll",
    description: "Chronologische Erfassung eines relevanten Vorfalls.",
    fields: [
      { name: "datum", label: "Datum & Uhrzeit", type: "text", placeholder: "z. B. 04.07.2026, 09:35" },
      { name: "ort", label: "Ort", type: "text" },
      { name: "beteiligte", label: "Beteiligte / Zeug:innen", type: "textarea" },
      { name: "hergang", label: "Hergang (chronologisch)", type: "textarea" },
      { name: "reaktion", label: "Reaktion / Sofortmaßnahmen", type: "textarea" },
      { name: "informiert", label: "Informierte Stellen", type: "textarea" },
    ],
    render: (v) =>
      `VORFALLPROTOKOLL (BKO)\n\nDatum/Zeit: ${val(v.datum)}\nOrt: ${val(v.ort)}\n\nBeteiligte:\n${val(v.beteiligte)}\n\nHergang:\n${val(v.hergang)}\n\nReaktion:\n${val(v.reaktion)}\n\nInformierte Stellen:\n${val(v.informiert)}`,
  },
  {
    id: "fehlzeiten",
    title: "Dokumentation bei Fehlzeiten",
    description: "Übersicht und Maßnahmen bei auffälligen Fehlzeiten.",
    fields: [
      { name: "schueler", label: "Schüler:in / Klasse", type: "text" },
      { name: "zeitraum", label: "Zeitraum", type: "text" },
      { name: "fehltage", label: "Fehltage (entschuldigt / unentschuldigt)", type: "textarea" },
      { name: "kontakte", label: "Kontakte zu Erziehungsberechtigten / Betrieb", type: "textarea" },
      { name: "massnahmen", label: "Ergriffene Maßnahmen", type: "textarea" },
    ],
    render: (v) =>
      `FEHLZEITENDOKUMENTATION\n\nSchüler:in: ${val(v.schueler)}\nZeitraum: ${val(v.zeitraum)}\n\nFehltage:\n${val(v.fehltage)}\n\nKontakte:\n${val(v.kontakte)}\n\nMaßnahmen:\n${val(v.massnahmen)}`,
  },
  {
    id: "kindeswohl",
    title: "Dokumentation bei Kindeswohlverdacht",
    description: "Sachliche Beobachtungsdokumentation nach § 4 KKG / § 8a SGB VIII.",
    fields: [
      { name: "datum", label: "Datum", type: "date" },
      { name: "schueler", label: "Betroffene Person / Klasse", type: "text" },
      { name: "beobachtung", label: "Konkrete Beobachtungen (ohne Wertung)", type: "textarea" },
      { name: "aeusserung", label: "Wörtliche Äußerungen", type: "textarea" },
      { name: "beratung", label: "Kollegiale Fallberatung / insoFa", type: "textarea" },
      { name: "naechste", label: "Nächste Schritte", type: "textarea" },
    ],
    render: (v) =>
      `KINDESWOHLDOKUMENTATION (vertraulich)\n\nDatum: ${val(v.datum, today())}\nBetroffene:r: ${val(v.schueler)}\n\nBeobachtungen:\n${val(v.beobachtung)}\n\nÄußerungen:\n${val(v.aeusserung)}\n\nFallberatung:\n${val(v.beratung)}\n\nNächste Schritte:\n${val(v.naechste)}`,
  },
  {
    id: "pruefungsprotokoll",
    title: "Prüfungsprotokoll",
    description: "Ergebnisprotokoll bei mündlichen oder praktischen Prüfungen.",
    fields: [
      { name: "datum", label: "Datum", type: "date" },
      { name: "pruefling", label: "Prüfling", type: "text" },
      { name: "fach", label: "Fach / Bildungsgang", type: "text" },
      { name: "kommission", label: "Prüfungskommission", type: "textarea" },
      { name: "verlauf", label: "Verlauf und Themen", type: "textarea" },
      { name: "bewertung", label: "Bewertung / Begründung", type: "textarea" },
    ],
    render: (v) =>
      `PRÜFUNGSPROTOKOLL\n\nDatum: ${val(v.datum, today())}\nPrüfling: ${val(v.pruefling)}\nFach: ${val(v.fach)}\n\nKommission:\n${val(v.kommission)}\n\nVerlauf:\n${val(v.verlauf)}\n\nBewertung:\n${val(v.bewertung)}`,
  },
  {
    id: "datenschutzvorfall",
    title: "Datenschutzvorfall",
    description: "Interne Dokumentation nach Art. 33 DSGVO – Grundlage für Meldung.",
    fields: [
      { name: "datum", label: "Datum & Uhrzeit", type: "text" },
      { name: "art", label: "Art des Vorfalls", type: "text" },
      { name: "betroffene", label: "Betroffene Datenkategorien / Personen", type: "textarea" },
      { name: "hergang", label: "Hergang", type: "textarea" },
      { name: "massnahmen", label: "Sofortmaßnahmen", type: "textarea" },
      { name: "meldung", label: "Meldung an DSB / Aufsichtsbehörde", type: "textarea" },
    ],
    render: (v) =>
      `DATENSCHUTZVORFALL (Art. 33 DSGVO)\n\nDatum/Zeit: ${val(v.datum)}\nArt: ${val(v.art)}\n\nBetroffene:\n${val(v.betroffene)}\n\nHergang:\n${val(v.hergang)}\n\nSofortmaßnahmen:\n${val(v.massnahmen)}\n\nMeldung:\n${val(v.meldung)}`,
  },
];
