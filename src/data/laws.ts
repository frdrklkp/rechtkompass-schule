export interface LawEntry {
  id: string;
  title: string;
  short: string;
  scope: string;
  description: string;
  topicCount: number;
  keyParagraphs: { ref: string; note: string }[];
}

export const LAWS: LawEntry[] = [
  {
    id: "gg",
    title: "Grundgesetz",
    short: "GG",
    scope: "Bundesweit – Grundrechte und staatliche Ordnung.",
    description:
      "Die Grundrechte prägen jede schulische Entscheidung – vom Persönlichkeitsrecht bis zum Elternrecht.",
    topicCount: 8,
    keyParagraphs: [
      { ref: "Art. 2 GG", note: "Allgemeines Persönlichkeitsrecht." },
      { ref: "Art. 6 Abs. 2 GG", note: "Elternrecht und staatliches Wächteramt." },
      { ref: "Art. 7 GG", note: "Schulwesen unter staatlicher Aufsicht." },
      { ref: "Art. 14 GG", note: "Eigentumsgarantie – relevant bei Einzug von Gegenständen." },
    ],
  },
  {
    id: "schulg-nrw",
    title: "Schulgesetz NRW",
    short: "SchulG NRW",
    scope: "Rechtsgrundlage des Schulwesens in Nordrhein-Westfalen.",
    description:
      "Zentrales Landesgesetz: Rechte und Pflichten, Aufsicht, Bewertung, Ordnungsmaßnahmen.",
    topicCount: 24,
    keyParagraphs: [
      { ref: "§ 42 SchulG", note: "Rechte und Pflichten der Schüler:innen." },
      { ref: "§ 43 SchulG", note: "Teilnahmepflicht und Beurlaubung." },
      { ref: "§ 48 SchulG", note: "Grundsätze der Leistungsbewertung." },
      { ref: "§ 53 SchulG", note: "Erzieherische Einwirkungen und Ordnungsmaßnahmen." },
      { ref: "§ 57 SchulG", note: "Aufgaben, Pflichten und Aufsicht der Lehrkräfte." },
      { ref: "§ 65 SchulG", note: "Aufgaben der Schulkonferenz." },
      { ref: "§ 120 SchulG", note: "Datenverarbeitung in der Schule." },
      { ref: "§ 126 SchulG", note: "Ordnungswidrigkeiten." },
    ],
  },
  {
    id: "bass",
    title: "BASS NRW",
    short: "BASS",
    scope: "Bereinigte Amtliche Sammlung der Schulvorschriften.",
    description:
      "Erlasse und Verordnungen zu Aufsicht, Datenschutz, Fahrten, Prüfungen und mehr.",
    topicCount: 18,
    keyParagraphs: [
      { ref: "BASS 12 – 08 Nr. 1", note: "Aufsichtserlass." },
      { ref: "BASS 12 – 51 Nr. 5", note: "Sicherung der Schulpflicht." },
      { ref: "BASS 13 – 41 Nr. 1", note: "Förderung bei besonderen Schwierigkeiten." },
      { ref: "BASS 14 – 12 Nr. 2", note: "Wanderrichtlinien / Klassenfahrten." },
      { ref: "BASS 14 – 41 Nr. 6", note: "Datenschutz an Schulen." },
    ],
  },
  {
    id: "ado",
    title: "ADO NRW",
    short: "ADO",
    scope: "Allgemeine Dienstordnung für Lehrkräfte und Schulleitungen.",
    description:
      "Konkretisiert Dienstpflichten, Aufgabenverteilung und Beschwerdewege innerhalb der Schule.",
    topicCount: 9,
    keyParagraphs: [
      { ref: "§ 11 ADO", note: "Dienstpflichten der Lehrkräfte." },
      { ref: "§ 20 ADO", note: "Aufgaben der Klassenleitung." },
      { ref: "§ 44 ADO", note: "Beschwerdeweg und Umgang mit Beschwerden." },
    ],
  },
  {
    id: "dsgvo",
    title: "DSGVO",
    short: "DSGVO",
    scope: "Europäische Datenschutz-Grundverordnung – gilt unmittelbar.",
    description:
      "Rahmen für alle Verarbeitungen personenbezogener Daten – von Fotos bis Notenlisten.",
    topicCount: 12,
    keyParagraphs: [
      { ref: "Art. 5 DSGVO", note: "Grundsätze: Zweckbindung, Datenminimierung." },
      { ref: "Art. 6 DSGVO", note: "Rechtmäßigkeit der Verarbeitung." },
      { ref: "Art. 7 DSGVO", note: "Einwilligung." },
      { ref: "Art. 13 DSGVO", note: "Informationspflichten." },
      { ref: "Art. 15 DSGVO", note: "Auskunftsrecht." },
    ],
  },
  {
    id: "vwvfg",
    title: "Verwaltungsverfahrensrecht",
    short: "VwVfG NRW",
    scope: "Regeln für Verwaltungsentscheidungen an Schulen.",
    description:
      "Anhörung, Begründung, Akteneinsicht und Rechtsmittel bei belastenden Entscheidungen.",
    topicCount: 7,
    keyParagraphs: [
      { ref: "§ 28 VwVfG NRW", note: "Anhörungspflicht vor belastenden Entscheidungen." },
      { ref: "§ 29 VwVfG NRW", note: "Akteneinsicht durch Beteiligte." },
      { ref: "§ 39 VwVfG NRW", note: "Begründung von Verwaltungsakten." },
    ],
  },
  {
    id: "datenschutz-nrw",
    title: "Datenschutzrecht NRW",
    short: "DSG NRW",
    scope: "Schulische Datenverarbeitung – ergänzt die DSGVO.",
    description:
      "Landesspezifische Regeln für schulische Daten, Fotos, digitale Dienste und Speicherfristen.",
    topicCount: 10,
    keyParagraphs: [
      { ref: "§ 120 SchulG NRW", note: "Datenverarbeitung in der Schule." },
      { ref: "VO-DV I", note: "Datenverarbeitung von Schüler:innen." },
      { ref: "VO-DV II", note: "Datenverarbeitung von Lehrkräften." },
    ],
  },
];
