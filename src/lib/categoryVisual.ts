// Central mapping from category names to visual style (emoji + colors + description).
// Colors are Tailwind utility classes so they can be composed statically.
// A neutral default is returned for unknown categories.

export type CategoryVisual = {
  emoji: string;
  description: string;
  iconBg: string;
  iconText: string;
  border: string;
  hoverBorder: string;
  ring: string;
};

type Rule = {
  keywords: string[];
  visual: CategoryVisual;
};

const DEFAULT_VISUAL: CategoryVisual = {
  emoji: "📚",
  description: "Weitere Themen und Praxisfälle",
  iconBg: "bg-muted",
  iconText: "text-foreground",
  border: "border-border",
  hoverBorder: "hover:border-accent/60",
  ring: "ring-border/40",
};

// Ordered rules — first keyword match wins.
const RULES: Rule[] = [
  {
    keywords: ["ordnungs", "disziplin", "sanktion", "maßnahme"],
    visual: {
      emoji: "⚖️",
      description: "Konflikte, Fehlverhalten und schulische Maßnahmen",
      iconBg: "bg-orange-500/10",
      iconText: "text-orange-600 dark:text-orange-400",
      border: "border-orange-500/20",
      hoverBorder: "hover:border-orange-500/60",
      ring: "ring-orange-500/30",
    },
  },
  {
    keywords: ["gewalt", "gefährdung", "gefahr", "bedrohung", "waffe"],
    visual: {
      emoji: "🚨",
      description: "Bedrohungen, Gewaltvorfälle und Schutzmaßnahmen",
      iconBg: "bg-red-500/10",
      iconText: "text-red-600 dark:text-red-400",
      border: "border-red-500/20",
      hoverBorder: "hover:border-red-500/60",
      ring: "ring-red-500/30",
    },
  },
  {
    keywords: ["datenschutz", "dsgvo"],
    visual: {
      emoji: "🔐",
      description: "Personenbezogene Daten und Datenschutzrecht",
      iconBg: "bg-sky-500/10",
      iconText: "text-sky-600 dark:text-sky-400",
      border: "border-sky-500/20",
      hoverBorder: "hover:border-sky-500/60",
      ring: "ring-sky-500/30",
    },
  },
  {
    keywords: ["digital", "medien", "smartphone", "handy", "social", "internet"],
    visual: {
      emoji: "📱",
      description: "Smartphones, Aufnahmen, soziale Medien und Datenschutz",
      iconBg: "bg-blue-500/10",
      iconText: "text-blue-600 dark:text-blue-400",
      border: "border-blue-500/20",
      hoverBorder: "hover:border-blue-500/60",
      ring: "ring-blue-500/30",
    },
  },
  {
    keywords: ["gesundheit", "notfall", "unfall", "krank", "verletz", "medikament"],
    visual: {
      emoji: "🩹",
      description: "Unfälle, Erkrankungen und akute Situationen",
      iconBg: "bg-emerald-500/10",
      iconText: "text-emerald-600 dark:text-emerald-400",
      border: "border-emerald-500/20",
      hoverBorder: "hover:border-emerald-500/60",
      ring: "ring-emerald-500/30",
    },
  },
  {
    keywords: ["eltern", "kommunikation", "erziehungsberecht", "beschwerde"],
    visual: {
      emoji: "👥",
      description: "Elterngespräche, Beschwerden und Zusammenarbeit",
      iconBg: "bg-purple-500/10",
      iconText: "text-purple-600 dark:text-purple-400",
      border: "border-purple-500/20",
      hoverBorder: "hover:border-purple-500/60",
      ring: "ring-purple-500/30",
    },
  },
  {
    keywords: ["mobbing", "konflikt", "streit"],
    visual: {
      emoji: "🤝",
      description: "Konflikte, Mobbing und Deeskalation",
      iconBg: "bg-rose-500/10",
      iconText: "text-rose-600 dark:text-rose-400",
      border: "border-rose-500/20",
      hoverBorder: "hover:border-rose-500/60",
      ring: "ring-rose-500/30",
    },
  },
  {
    keywords: ["aufsicht"],
    visual: {
      emoji: "👀",
      description: "Aufsichtspflicht in Schule und Pausen",
      iconBg: "bg-amber-500/10",
      iconText: "text-amber-600 dark:text-amber-400",
      border: "border-amber-500/20",
      hoverBorder: "hover:border-amber-500/60",
      ring: "ring-amber-500/30",
    },
  },
  {
    keywords: ["prüfung", "leistung", "note", "bewertung", "klausur"],
    visual: {
      emoji: "📝",
      description: "Prüfungen, Noten und Leistungsbewertung",
      iconBg: "bg-indigo-500/10",
      iconText: "text-indigo-600 dark:text-indigo-400",
      border: "border-indigo-500/20",
      hoverBorder: "hover:border-indigo-500/60",
      ring: "ring-indigo-500/30",
    },
  },
  {
    keywords: ["fehlzeit", "schulpflicht", "abwesen", "verspät"],
    visual: {
      emoji: "⏰",
      description: "Fehlzeiten, Schulpflicht und Beurlaubung",
      iconBg: "bg-yellow-500/10",
      iconText: "text-yellow-600 dark:text-yellow-500",
      border: "border-yellow-500/20",
      hoverBorder: "hover:border-yellow-500/60",
      ring: "ring-yellow-500/30",
    },
  },
  {
    keywords: ["inklusion", "förder", "sonderpäd", "behinder"],
    visual: {
      emoji: "♿",
      description: "Inklusion, Nachteilsausgleich und Förderung",
      iconBg: "bg-teal-500/10",
      iconText: "text-teal-600 dark:text-teal-400",
      border: "border-teal-500/20",
      hoverBorder: "hover:border-teal-500/60",
      ring: "ring-teal-500/30",
    },
  },
  {
    keywords: ["personal", "dienst", "arbeitszeit", "kollegium"],
    visual: {
      emoji: "💼",
      description: "Personal-, Dienst- und Arbeitsrecht",
      iconBg: "bg-slate-500/10",
      iconText: "text-slate-600 dark:text-slate-300",
      border: "border-slate-500/20",
      hoverBorder: "hover:border-slate-500/60",
      ring: "ring-slate-500/30",
    },
  },
  {
    keywords: ["dokumentation", "verfahren", "protokoll"],
    visual: {
      emoji: "📄",
      description: "Dokumentation, Verfahren und Formalien",
      iconBg: "bg-stone-500/10",
      iconText: "text-stone-600 dark:text-stone-300",
      border: "border-stone-500/20",
      hoverBorder: "hover:border-stone-500/60",
      ring: "ring-stone-500/30",
    },
  },
  {
    keywords: ["klassenfahrt", "veranstaltung", "ausflug", "exkursion", "schulfahrt"],
    visual: {
      emoji: "🚌",
      description: "Schulveranstaltungen, Ausflüge und Klassenfahrten",
      iconBg: "bg-cyan-500/10",
      iconText: "text-cyan-600 dark:text-cyan-400",
      border: "border-cyan-500/20",
      hoverBorder: "hover:border-cyan-500/60",
      ring: "ring-cyan-500/30",
    },
  },
  {
    keywords: ["unterricht", "schulalltag", "störung", "organisation"],
    visual: {
      emoji: "🏫",
      description: "Aufsicht, Unterrichtsstörungen und Organisation",
      iconBg: "bg-lime-500/10",
      iconText: "text-lime-700 dark:text-lime-400",
      border: "border-lime-500/20",
      hoverBorder: "hover:border-lime-500/60",
      ring: "ring-lime-500/30",
    },
  },
];

export function getCategoryVisual(category: string | null | undefined): CategoryVisual {
  if (!category) return DEFAULT_VISUAL;
  const name = category.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => name.includes(k))) return rule.visual;
  }
  return DEFAULT_VISUAL;
}
