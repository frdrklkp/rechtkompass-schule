/**
 * Festes Testset realistischer Lehrerfragen für die semantische Suche.
 *
 * Ground Truth: Bevorzugt über konkrete caseIds (expectedCaseIds / acceptableCaseIds).
 * Titel-Fragmente werden nur noch dann für die Auflösung genutzt, wenn keine
 * caseIds hinterlegt sind — und dienen sonst ausschließlich der Diagnose,
 * nicht der Accuracy-Berechnung.
 */

export type TestAudit =
  | "EXACT_MATCH_AVAILABLE"
  | "GOOD_ALTERNATIVE_AVAILABLE"
  | "CONTENT_GAP"
  | "AMBIGUOUS_EXPECTATION";

export type SearchTestCase = {
  id: string;
  category: string;
  query: string;
  /** Primäre Ground Truth: caseIds die als Top-1 akzeptiert werden. */
  expectedCaseIds?: string[];
  /** Weitere fachlich vertretbare caseIds (zählen für Top-1/Top-3). */
  acceptableCaseIds?: string[];
  /** Diagnose-Hilfe zur Titel-basierten Auflösung, falls keine caseIds gesetzt. */
  expectedTopMatchTitleContains: string[];
  acceptableAlternativesTitleContains?: string[];
  notAcceptableTitleContains?: string[];
  /** Redaktionelle Klassifikation der Testerwartung. */
  audit?: TestAudit;
  /** Redaktionelle Notiz aus dem Overrides-Editor. */
  note?: string;
};

/** Minimaler Override-Datensatz (Untermenge von TestOverride aus dem Repo). */
export type TestSetOverride = {
  test_id: string;
  expected_case_ids: string[];
  acceptable_case_ids: string[];
  audit: TestAudit | null;
  note: string | null;
};

/**
 * Mischt persistierte Ground-Truth-Overrides über die statische SEARCH_TESTSET.
 * Ein Override ersetzt expectedCaseIds/acceptableCaseIds/audit/note vollständig,
 * sobald einer für die test_id existiert. Fragen-Text, Kategorie und
 * Titel-Fragment-Fallbacks bleiben aus dem Code.
 */
export function resolveTestSet(overrides: TestSetOverride[]): SearchTestCase[] {
  const byId = new Map(overrides.map((o) => [o.test_id, o]));
  return SEARCH_TESTSET.map((t) => {
    const o = byId.get(t.id);
    if (!o) return t;
    return {
      ...t,
      expectedCaseIds: o.expected_case_ids,
      acceptableCaseIds: o.acceptable_case_ids,
      audit: o.audit ?? t.audit,
      note: o.note ?? t.note,
    };
  });
}

export const SEARCH_TESTSET: SearchTestCase[] = [
  // Elternkommunikation / Leistungsbewertung
  {
    id: "T01",
    category: "Elternkommunikation",
    query: "Die Mutter akzeptiert die Note nicht und droht mit einem Anwalt.",
    expectedTopMatchTitleContains: ["note", "bewertung", "widerspruch", "beschwerde"],
    acceptableAlternativesTitleContains: ["eltern"],
  },
  {
    id: "T02",
    category: "Elternkommunikation",
    query: "Eltern schreiben mir abends um 22 Uhr in WhatsApp.",
    expectedTopMatchTitleContains: ["eltern", "kommunikation", "whatsapp", "messenger"],
  },
  {
    id: "T03",
    category: "Elternkommunikation",
    query: "Vater will die Zeugniskonferenz aufzeichnen.",
    expectedTopMatchTitleContains: ["aufzeichn", "gespräch", "eltern"],
  },
  // Datenschutz / Kollegium / Verschwiegenheit
  {
    id: "T04",
    category: "Datenschutz",
    query: "Ein Kollege speichert Schülerdaten in einer privaten Cloud.",
    expectedTopMatchTitleContains: ["datenschutz", "schülerdaten", "cloud"],
    acceptableAlternativesTitleContains: ["dienstliche", "datenverarbeit"],
  },
  {
    id: "T05",
    category: "Datenschutz",
    query: "Darf ich Klassenfotos in einer WhatsApp-Gruppe teilen?",
    expectedTopMatchTitleContains: ["foto", "datenschutz", "persönlichkeit"],
  },
  {
    id: "T06",
    category: "Kollegium",
    query: "Ein Kollege spricht im Lehrerzimmer offen über Schülerinnen mit Namen.",
    expectedTopMatchTitleContains: ["verschwiegen", "datenschutz", "dienst"],
  },
  // Dienstrecht
  {
    id: "T07",
    category: "Dienstrecht",
    query: "Kann die Schulleitung mich morgen zu einer zusätzlichen Konferenz verpflichten?",
    expectedTopMatchTitleContains: ["konferenz", "weisung", "dienst"],
  },
  {
    id: "T08",
    category: "Dienstrecht",
    query: "Muss ich eine Vertretungsstunde übernehmen, obwohl ich Freistunde habe?",
    expectedTopMatchTitleContains: ["vertretung", "dienst", "weisung"],
  },
  {
    id: "T09",
    category: "Dienstrecht",
    query: "Darf die Schulleitung mir eine bestimmte Klasse zwangsweise zuweisen?",
    expectedTopMatchTitleContains: ["weisung", "dienst", "einsatz"],
  },
  // Digitale Medien / Datenschutz / Persönlichkeitsrecht
  {
    id: "T10",
    category: "digitale Medien",
    query: "Ein Schüler macht ständig Fotos, aber ich weiß nicht, ob er sie weitergibt.",
    expectedTopMatchTitleContains: ["foto", "handy", "smartphone", "persönlichkeit"],
    acceptableAlternativesTitleContains: ["datenschutz"],
  },
  {
    id: "T11",
    category: "digitale Medien",
    query: "Ein Schüler filmt mich heimlich im Unterricht.",
    expectedTopMatchTitleContains: ["film", "aufzeichn", "unterricht"],
  },
  {
    id: "T12",
    category: "digitale Medien",
    query: "Darf ich das Handy einziehen und bis Schulschluss behalten?",
    expectedTopMatchTitleContains: ["handy", "smartphone", "einzieh"],
  },
  {
    id: "T13",
    category: "digitale Medien",
    query: "Schüler verbreiten TikTok-Video von einer Mitschülerin.",
    expectedTopMatchTitleContains: ["tiktok", "video", "persönlichkeit", "cybermobbing"],
  },
  // Fehlzeiten / Schulpflicht
  {
    id: "T14",
    category: "Fehlzeiten",
    query: "Der Schüler kommt seit Wochen nicht und niemand erreicht die Eltern.",
    expectedTopMatchTitleContains: ["fehlzeit", "schulpflicht", "unentschuldigt"],
  },
  {
    id: "T15",
    category: "Fehlzeiten",
    query: "Eltern melden Kind ständig krank, es sieht gesund aus.",
    expectedTopMatchTitleContains: ["attest", "krank", "fehlzeit"],
  },
  {
    id: "T16",
    category: "Fehlzeiten",
    query: "Familie will vor den Ferien in Urlaub fliegen.",
    expectedTopMatchTitleContains: ["beurlaub", "ferien", "schulpflicht"],
  },
  // Prüfungen / Leistungsbewertung
  {
    id: "T17",
    category: "Prüfungsrecht",
    query: "Täuschungsversuch Prüfung",
    expectedTopMatchTitleContains: ["täusch", "spick", "prüf"],
  },
  {
    id: "T18",
    category: "Prüfungsrecht",
    query: "Schüler hat während der Klausur auf sein Handy geschaut.",
    expectedTopMatchTitleContains: ["täusch", "handy", "klausur", "prüf"],
  },
  {
    id: "T19",
    category: "Leistungsbewertung",
    query: "Eltern verlangen Einsicht in die Klausur ihres Kindes.",
    expectedTopMatchTitleContains: ["einsicht", "klausur", "note"],
  },
  // Aufsicht / Sicherheit
  {
    id: "T20",
    category: "Aufsicht",
    query: "Ein Kind hat sich in der Pause verletzt, weil niemand hingesehen hat.",
    expectedTopMatchTitleContains: ["aufsicht", "pause", "unfall"],
  },
  {
    id: "T21",
    category: "Aufsicht",
    query: "Klassenfahrt: Darf ich die Schüler abends allein ins Hotelzimmer lassen?",
    expectedTopMatchTitleContains: ["klassenfahrt", "aufsicht", "exkursion"],
  },
  {
    id: "T22",
    category: "Aufsicht",
    query: "Muss ich im Sportunterricht immer daneben stehen?",
    expectedTopMatchTitleContains: ["sport", "aufsicht"],
  },
  // Ordnungsmaßnahmen
  {
    id: "T23",
    category: "Ordnungsmaßnahmen",
    query: "Schüler stört massiv und dauerhaft den Unterricht.",
    expectedTopMatchTitleContains: ["stör", "ordnungs", "unterricht"],
  },
  {
    id: "T24",
    category: "Ordnungsmaßnahmen",
    query: "Darf ich Strafarbeit als Sanktion aufgeben?",
    expectedTopMatchTitleContains: ["strafarbeit", "sanktion", "erzieh"],
  },
  {
    id: "T25",
    category: "Ordnungsmaßnahmen",
    query: "Ausschluss vom Unterricht für einen Tag – wie geht das?",
    expectedTopMatchTitleContains: ["ausschluss", "ordnungs"],
  },
  // Kindeswohl
  {
    id: "T26",
    category: "Kindeswohl",
    query: "Ein Schüler kommt regelmäßig mit blauen Flecken.",
    expectedTopMatchTitleContains: ["kindeswohl", "gefährd", "misshandl"],
  },
  {
    id: "T27",
    category: "Kindeswohl",
    query: "Eine Schülerin vertraut mir an, dass sie sich selbst verletzt.",
    expectedTopMatchTitleContains: ["kindeswohl", "gefährd", "selbst"],
  },
  {
    id: "T28",
    category: "Kindeswohl",
    query: "Ein Schüler bringt ein Messer mit in die Schule.",
    expectedTopMatchTitleContains: ["waffe", "messer", "gefahr"],
  },
  // Cybermobbing
  {
    id: "T29",
    category: "digitale Medien",
    query: "In der Klassen-WhatsApp-Gruppe wird eine Schülerin systematisch fertiggemacht.",
    expectedTopMatchTitleContains: ["cybermobb", "mobbing", "messenger"],
  },
  // Verschwiegenheit
  {
    id: "T30",
    category: "Verschwiegenheit",
    query: "Darf ich meinem Partner erzählen, was in einer Klassenkonferenz besprochen wurde?",
    expectedTopMatchTitleContains: ["verschwiegen", "dienst", "geheim"],
  },
];
