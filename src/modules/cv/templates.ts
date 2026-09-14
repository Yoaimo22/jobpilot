/**
 * CV template registry (spec §21). Kept free of any pdf-lib import so client
 * components can list templates without pulling the PDF engine into the bundle.
 */
export type TemplateId = "ats-simple" | "modern-professional" | "compact-technical" | "executive-clean";

export interface TemplateInfo {
  id: TemplateId;
  name: string;
  description: string;
  /** Every template must remain ATS-parseable — this is not a style-only flag. */
  atsFriendly: true;
}

export const TEMPLATES: TemplateInfo[] = [
  {
    id: "ats-simple",
    name: "ATS Simple",
    description: "Layout paling sederhana, kompatibilitas ATS maksimum. Disarankan.",
    atsFriendly: true,
  },
  {
    id: "modern-professional",
    name: "Modern Professional",
    description: "Garis halus di bawah judul bagian, tetap satu kolom.",
    atsFriendly: true,
  },
  {
    id: "compact-technical",
    name: "Compact Technical",
    description: "Spasi lebih rapat agar lebih banyak isi masuk dalam dua halaman.",
    atsFriendly: true,
  },
  {
    id: "executive-clean",
    name: "Executive Clean",
    description: "Judul lebih besar, ruang kosong lebih lega, huruf serif.",
    atsFriendly: true,
  },
];

export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id) as [TemplateId, ...TemplateId[]];
