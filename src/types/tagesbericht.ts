export type ReportStatus = "draft" | "submitted";

export type TimeRange = {
  name?: string;
  from: string; // "HH:MM"
  to: string;   // "HH:MM"
};

export type WeatherCondition = "trocken" | "regen" | "frost";

export type Weather = {
  conditions: WeatherCondition[]; // Auswahl
  tempMaxC: number | null;
  tempMinC: number | null;
};

export type TransportRow = {
  from: string;
  to: string;
  km: number | null;
  time: string;
};

export type WaterLevelRow = {
  time: string;
  meters: string;
};

export type VerrohrungRow = {
  diameter: string;
  meters: string;
};

export type UmsetzenRow = {
  von: string;
  auf: string;
  entfernungM: string; // als string, weil im PDF eh Text
  zeit: string;        // z.B. "00:20" oder "20 min"
  begruendung: string;
  wartezeit: string;
};

export type VerrohrtFlag =
  | "RB"
  | "EK"
  | "DK"
  | "S"
  | "Rammkernbohrung"
  | "Rotationsbohrung"
  | "Greiferbohrung"
  | "Vollbohrung"
  | "Seilkernbohrung";
export type ProbenFlag = "GP" | "KP" | "SP" | "WP" | "BKB" | "KK-LV";

export type TableRow = {
  boNr: string;
  gebohrtVon: string;
  gebohrtBis: string;
  verrohrtVon: string;
  verrohrtBis: string;
  verrohrtFlags: VerrohrtFlag[];

  vollbohrVon?: string;
  vollbohrBis?: string;

  hindernisVon?: string;
  hindernisBis?: string;
  hindernisZeit?: string;

  schachtenVon?: string;
  schachtenBis?: string;
  schachtenZeit?: string;

  probenFlags?: ProbenFlag[]; // Checkboxen GP/KP/...
  probenValues?: Partial<Record<ProbenFlag, string>>;
  indivProbe?: string;
  spt: string;

  verfuellung?: {
    tonVon?: string;
    tonBis?: string;
    bohrgutVon?: string;
    bohrgutBis?: string;
    zementBentVon?: string;
    zementBentBis?: string;
    betonVon?: string;
    betonBis?: string;
  };
};

export type WorkerRow = {
  name: string;
  reineArbeitsStd: string;
  wochenendfahrt: string;
  ausfallStd: string;
  ausloeseT: boolean;
  ausloeseN: boolean;
  arbeitsakteNr: string;
  stunden: string[]; // 16 Kästchen
  workCycles?: string[];
};

export type TableSectionsEnabled = {
  proben: boolean;
  versuche: boolean;
  verfuellung: boolean;
};

export type PegelAusbauRow = {
  bohrNr: string;
  pegelDm: string;

  // ROHRE
  sumpfVon: string;
  sumpfBis: string;
  filterVon: string;
  filterBis: string;

  rohrePvcVon: string;
  rohrePvcBis: string;

  aufsatzPvcVon: string;
  aufsatzPvcBis: string;

  aufsatzStahlVon: string;
  aufsatzStahlBis: string;

  filterkiesVon: string;
  filterkiesBis: string;

  // DICHTUNG-VERFÜLLUNG
  tonVon: string;
  tonBis: string;
  sandVon: string;
  sandBis: string;
  zementBentVon: string;
  zementBentBis: string;
  bohrgutVon: string;
  bohrgutBis: string;

  // VERSCHLÜSSE
  sebaKap: boolean;
  boKap: boolean;
  hydrKap: boolean;
  fernGask: boolean;
  passavant: boolean;
  betonSockel: boolean;
  blech: boolean;
  abstHalter: string;
  klarpump: boolean;
  filterkiesKoernung: string;
};

export type Tagesbericht = {
  reportType: "tagesbericht" | "tagesbericht_rhein_main_link";
  status: ReportStatus;

  date: string; // "YYYY-MM-DD"

  // links im Kopf
  name: string;
  project: string;
  client: string;
  firma: string;
  berichtNr: string;
  plz: string;
  ort: string;
  bohrungNr: string;
  bohrrichtung: string;
  winkelHorizontal: string;
  winkelNord: string;
  verrohrungAbGok: string;

  // falls du das später brauchst (Nummerierung)

  // ===== Tabelle =====
  tableSectionsEnabled: TableSectionsEnabled;
  tableRows: TableRow[];

  // ===== Arbeiterblock =====
  workers: WorkerRow[];

  // ===== Pegelausbau =====
  // -> NICHT optional, damit im Formular immer mindestens 1 Zeile existiert
  pegelAusbauRows: PegelAusbauRow[];

  // ===== Umsetzen =====
  // -> NICHT optional, damit im Formular immer mindestens 1 Zeile existiert
  umsetzenRows: UmsetzenRow[];

  // ===== OBEN RECHTS (Kopfbereich) =====
  vehicles: string; // Fahrzeuge
  aNr: string;      // A.Nr.
  device: string;   // Gerät
  trailer: string;  // optional im PDF, aber string für Form

  // Zeiten (2 Zeilen möglich)
  workTimeRows: TimeRange[]; // max 2
  breakRows: TimeRange[];    // max 2

  // Wetter
  weather: Weather;

  // Transport
  transportRows: TransportRow[];

  // Rhein-Main-Link: Wasserspiegel ab GOK (mehrere Messpunkte)
  waterLevelRows?: WaterLevelRow[];
  // Rhein-Main-Link: Verrohrung ab GOK (Ø + Meter)
  verrohrungRows?: VerrohrungRow[];

  // Ruhewasser / Entfernung
  ruhewasserVorArbeitsbeginnM: number | null;
  entfernungWohnwagenBaustelleKm: number | null;
  entfernungWohnwagenBaustelleZeit: string;

  // (kannst du später noch ans PDF mappen – ist ok im Model)
  workStartBefore: number | null;
  workStartAfter: number | null;
  workStartDistanceM: number | null;

  workCycles: string[]; // MVP: einfache Liste
  customWorkCycles?: string[]; // feste Reihenfolge aus Profil (ab Nr. 23)
  workCyclesSame?: boolean;
  otherWork: string;
  remarks: string;
  besucher: string;
  sheVorfaelle: string;
  toolBoxTalks: string;
  taeglicheUeberpruefungBg: string;

  signatures: {
  clientOrManagerName: string;
  drillerName: string;

  clientOrManagerSigPng?: string;
  drillerSigPng?: string;
};
};
