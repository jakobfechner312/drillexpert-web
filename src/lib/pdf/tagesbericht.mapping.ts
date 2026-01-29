export type PdfPoint = { x: number; y: number; size?: number };

export const TB_MAP = {
  date:   { x: 70,  y: 735, size: 11 },
  project:{ x: 70,  y: 705, size: 11 },
  client: { x: 70,  y: 675, size: 11 },

  // Beispiel: oben rechts
  vehicles: { x: 340, y: 735, size: 10 },
  aNr:      { x: 430, y: 735, size: 10 },
  device:   { x: 520, y: 735, size: 10 },

  // ...hier kommen später mehr Felder rein
} satisfies Record<string, PdfPoint>;