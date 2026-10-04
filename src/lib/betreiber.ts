// Anbieterangaben für Impressum (§ 5 DDG) und Datenschutzerklärung (Art. 13 DSGVO).
//
// EINMAL AUSFÜLLEN, dann greifen beide Seiten darauf zu. Solange ein Wert mit
// "[" beginnt, zeigen die Seiten den Platzhalter sichtbar an - so fällt eine
// unvollständige Angabe sofort auf, statt still eine falsche Seite zu zeigen.
//
// Hinweis: Der Betreiber ist nach eigener Angabe eine Privatperson mit
// angemeldetem Gewerbe (Stand 03.10.2026). Ob während der Pilotphase die
// Schule als (gemeinsam) Verantwortliche auftritt, ist mit dem
// Datenschutzbeauftragten zu klären - siehe Datenschutzerklärung, Abschnitt 1.

export const BETREIBER = {
  name: "[Vor- und Nachname des Betreibers]",
  zusatz: "RechtKompass Schule – Einzelunternehmen",
  strasse: "[Straße und Hausnummer]",
  plzOrt: "[PLZ Ort]",
  land: "Deutschland",
  email: "[kontakt@rechtkompass-schule.de]",
  telefon: "[Telefonnummer – freiwillig, aber eine zweite schnelle Kontaktmöglichkeit ist Pflicht]",
  /** Umsatzsteuer-ID nach § 27a UStG - oder Hinweis auf Kleinunternehmerregelung. */
  ustId: "[USt-IdNr. oder: „Kleinunternehmer gemäß § 19 UStG, keine USt-IdNr.“]",
  /** Zuständige Datenschutz-Aufsichtsbehörde für nicht-öffentliche Stellen in NRW. */
  aufsicht: {
    name: "Landesbeauftragte für Datenschutz und Informationsfreiheit Nordrhein-Westfalen (LDI NRW)",
    adresse: "Kavalleriestraße 2–4, 40213 Düsseldorf",
    web: "https://www.ldi.nrw.de",
  },
  /** Stand der Datenschutzerklärung - bei jeder inhaltlichen Änderung anpassen. */
  standDatenschutz: "4. Oktober 2026",
} as const;

export function istPlatzhalter(wert: string): boolean {
  return wert.trim().startsWith("[");
}
