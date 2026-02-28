import { Tagesbericht } from "@/types/tagesbericht";

export function createDefaultTagesbericht(): Tagesbericht {
  return {
    reportType: "tagesbericht",
    status: "draft",

    date: "",

    name: "",
    project: "",
    client: "",
    firma: "",
    berichtNr: "",
    plz: "",
    ort: "",
    bohrungNr: "",
    bohrrichtung: "",
    winkelHorizontal: "",
    winkelNord: "",
    verrohrungAbGok: "",

    // Kopf / oben rechts
    vehicles: "",
    aNr: "",
    trailer: "",
    device: "",

    // Zeiten
    workTimeRows: [{ name: "", from: "", to: "" }],
    breakRows: [{ name: "", from: "", to: "" }],

    // Wetter
    weather: {
      conditions: [],
      tempMaxC: null,
      tempMinC: null,
    },

    // Transport
    transportRows: [
  { from: "", to: "", km: null, time: "" },],

    // Rhein-Main-Link: Wasserspiegel ab GOK
    waterLevelRows: [{ time: "", meters: "" }],
    // Rhein-Main-Link: Verrohrung ab GOK
    verrohrungRows: [{ diameter: "", meters: "" }],


    tableSectionsEnabled: { proben: true, versuche: true, verfuellung: true },

    // ✅ Tabelle (NEU: flags arrays statt boolean/objekte)
    tableRows: [
      {
        boNr: "",
        schappeDurchmesser: "",
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
        probenValues: {},
        indivProbe: "",

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
    rmlSptRows: [
      {
        boNr: "",
        schappeDurchmesser: "",
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
        probenValues: {},
        indivProbe: "",
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
        wochenendfahrtJa: false,
        wochenendfahrtVon: "",
        wochenendfahrtBis: "",
        wochenendfahrtDauer: "",
        ausfallStd: "",
        ausloeseT: false,
        ausloeseN: false,
        arbeitsakteNr: "",
        stunden: Array(16).fill(""),
        workCycles: [""],
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
        ausbauArtType: "",
        ausbauArtCustom: "",
        schlitzweiteSwMm: "",

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
        blech: false,
        abstHalter: "",
        klarpump: false,
        filterkiesKoernung: "",
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
    workCyclesSame: false,
    otherWork: "",
    remarks: "",
    besucher: "",
    sheVorfaelle: "",
    toolBoxTalks: "",
    taeglicheUeberpruefungBg: "",

    signatures: {
    clientOrManagerName: "",
    drillerName: "",
    clientOrManagerSigPng: "",
    drillerSigPng: "",
    },
  };
}
