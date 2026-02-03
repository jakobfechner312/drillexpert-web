import { Tagesbericht } from "@/types/tagesbericht";

export function createDefaultTagesbericht(): Tagesbericht {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  return {
    reportType: "tagesbericht",
    status: "draft",

    date: today,

    name: "",
    project: "",
    client: "",

    // Kopf / oben rechts
    vehicles: "",
    aNr: "",
    trailer: "",
    device: "",

    // Zeiten
    workTimeRows: [{ from: "", to: "" }],
    breakRows: [{ from: "", to: "" }],

    // Wetter
    weather: {
      conditions: [],
      tempMaxC: null,
      tempMinC: null,
    },

    // Transport
    transportRows: [
  { from: "", to: "", km: null, time: "" },],


    tableSectionsEnabled: { proben: true, versuche: true, verfuellung: true },

    // ✅ Tabelle (NEU: flags arrays statt boolean/objekte)
    tableRows: [
      {
        boNr: "",
        gebohrtVon: "",
        gebohrtBis: "",
        verrohrtVon: "",
        verrohrtBis: "",
        verrohrtFlags: [],

        vollbohrVon: "",
        vollbohrBis: "",

        hindernisVon: "",
        hindernisBis: "",
        hindernisZeit: "",

        schachtenVon: "",
        schachtenBis: "",
        schachtenZeit: "",

        probenFlags: [],

        spt: "",

        verfuellung: {
          tonVon: "",
          tonBis: "",
          bohrgutVon: "",
          bohrgutBis: "",
          zementBentVon: "",
          zementBentBis: "",
          betonVon: "",
          betonBis: "",
        },
      },
    ],

    // ✅ Arbeiterblock (immer 1 Worker)
    workers: [
      {
        name: "",
        reineArbeitsStd: "",
        wochenendfahrt: "",
        ausfallStd: "",
        ausloeseT: false,
        ausloeseN: false,
        arbeitsakteNr: "",
        stunden: Array(16).fill(""),
      },
    ],

    // ✅ Umsetzen (immer 1 Zeile)
    umsetzenRows: [
      { von: "", auf: "", entfernungM: "", zeit: "", begruendung: "", wartezeit: "" },
    ],

    // ✅ Pegelausbau (immer 1 Zeile)
    pegelAusbauRows: [
      {
        bohrNr: "",
        pegelDm: "",

        // ROHRE
        sumpfVon: "",
        sumpfBis: "",
        filterVon: "",
        filterBis: "",

        rohrePvcVon: "",
        rohrePvcBis: "",
        aufsatzPvcVon: "",
        aufsatzPvcBis: "",
        aufsatzStahlVon: "",
        aufsatzStahlBis: "",
        filterkiesVon: "",
        filterkiesBis: "",

        // DICHTUNG-VERFÜLLUNG
        tonVon: "",
        tonBis: "",
        sandVon: "",
        sandBis: "",
        zementBentVon: "",
        zementBentBis: "",
        bohrgutVon: "",
        bohrgutBis: "",

        // VERSCHLÜSSE
        sebaKap: false,
        boKap: false,
        hydrKap: false,
        fernGask: false,
        passavant: false,
        betonSockel: false,
        abstHalter: false,
        klarpump: false,
      },
    ],

    // Ruhewasser / Entfernung
    ruhewasserVorArbeitsbeginnM: null,
    entfernungWohnwagenBaustelleKm: null,
    entfernungWohnwagenBaustelleZeit: "",

    // Arbeitsbeginn / Entfernung (später)
    workStartBefore: null,
    workStartAfter: null,
    workStartDistanceM: null,

    // MVP-Felder
    workCycles: [],
    otherWork: "",
    remarks: "",

    signatures: {
    clientOrManagerName: "",
    drillerName: "",
    clientOrManagerSigPng: "",
    drillerSigPng: "",
    },
  };
}
