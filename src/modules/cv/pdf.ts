/**
 * ATS-friendly PDF generation (spec §20, §21).
 *
 * Design constraints, all deliberate:
 *  - real embedded text (selectable / parseable), never a rasterised image
 *  - single column, no tables, no icons, no text boxes
 *  - standard section headings an ATS recognises
 *  - conservative fonts (Helvetica / Times) and plain bullets
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { TEMPLATES, type TemplateId } from "./templates";

export { TEMPLATES };
export type { TemplateId };

export interface CvContent {
  name: string;
  contact: string[];
  summary?: string | null;
  experiences: {
    position: string;
    company: string;
    period?: string | null;
    bullets: string[];
  }[];
  educations: { institution: string; degree?: string | null; period?: string | null }[];
  skills: Record<string, string[]>;
  certifications: string[];
  projects: { name: string; description?: string | null; technologies: string[] }[];
}

interface Style {
  nameSize: number;
  headingSize: number;
  bodySize: number;
  lineGap: number;
  sectionGap: number;
  rule: boolean;
  serif: boolean;
}

const STYLES: Record<TemplateId, Style> = {
  "ats-simple": { nameSize: 18, headingSize: 11.5, bodySize: 10, lineGap: 3.2, sectionGap: 11, rule: false, serif: false },
  "modern-professional": { nameSize: 20, headingSize: 12, bodySize: 10, lineGap: 3.6, sectionGap: 13, rule: true, serif: false },
  "compact-technical": { nameSize: 16, headingSize: 10.5, bodySize: 9, lineGap: 2.4, sectionGap: 8, rule: true, serif: false },
  "executive-clean": { nameSize: 22, headingSize: 12.5, bodySize: 10.5, lineGap: 4, sectionGap: 16, rule: false, serif: true },
};

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 54;

export async function generateCvPdf(content: CvContent, template: TemplateId = "ats-simple"): Promise<Uint8Array> {
  const style = STYLES[template] ?? STYLES["ats-simple"];
  const doc = await PDFDocument.create();

  doc.setTitle(`${content.name} — CV`);
  doc.setProducer("JobPilot");
  doc.setCreator("JobPilot CV Optimizer");

  const regular = await doc.embedFont(style.serif ? StandardFonts.TimesRoman : StandardFonts.Helvetica);
  const bold = await doc.embedFont(style.serif ? StandardFonts.TimesRomanBold : StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(style.serif ? StandardFonts.TimesRomanItalic : StandardFonts.HelveticaOblique);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const width = PAGE_W - MARGIN * 2;

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  const drawLines = (text: string, font: PDFFont, size: number, indent = 0) => {
    const lines = wrap(text, font, size, width - indent);
    for (const line of lines) {
      newPageIfNeeded(size + style.lineGap);
      page.drawText(line, { x: MARGIN + indent, y: y - size, size, font, color: rgb(0.1, 0.1, 0.12) });
      y -= size + style.lineGap;
    }
  };

  const heading = (label: string) => {
    y -= style.sectionGap;
    newPageIfNeeded(style.headingSize + 10);
    page.drawText(label.toUpperCase(), {
      x: MARGIN, y: y - style.headingSize, size: style.headingSize, font: bold, color: rgb(0.06, 0.06, 0.1),
    });
    y -= style.headingSize + 4;
    if (style.rule) {
      page.drawLine({
        start: { x: MARGIN, y: y + 1 }, end: { x: PAGE_W - MARGIN, y: y + 1 },
        thickness: 0.6, color: rgb(0.7, 0.7, 0.75),
      });
      y -= 5;
    }
  };

  // ── Header ──
  page.drawText(content.name, {
    x: MARGIN, y: y - style.nameSize, size: style.nameSize, font: bold, color: rgb(0.05, 0.05, 0.1),
  });
  y -= style.nameSize + 6;
  if (content.contact.length) {
    drawLines(content.contact.join("  |  "), regular, style.bodySize);
  }

  // ── Professional Summary ──
  if (content.summary?.trim()) {
    heading("Professional Summary");
    drawLines(content.summary.trim(), regular, style.bodySize);
  }

  // ── Experience ──
  if (content.experiences.length) {
    heading("Professional Experience");
    for (const exp of content.experiences) {
      newPageIfNeeded(style.bodySize * 3);
      const title = `${exp.position}${exp.company ? ` — ${exp.company}` : ""}`;
      page.drawText(truncate(title, regular, style.bodySize + 0.5, width - 110), {
        x: MARGIN, y: y - (style.bodySize + 0.5), size: style.bodySize + 0.5, font: bold, color: rgb(0.08, 0.08, 0.12),
      });
      if (exp.period) {
        const pw = italic.widthOfTextAtSize(exp.period, style.bodySize - 0.5);
        page.drawText(exp.period, {
          x: PAGE_W - MARGIN - pw, y: y - (style.bodySize + 0.5), size: style.bodySize - 0.5,
          font: italic, color: rgb(0.35, 0.35, 0.4),
        });
      }
      y -= style.bodySize + 5;
      for (const b of exp.bullets) {
        const clean = b.replace(/^[-•·●*]\s*/, "").trim();
        if (!clean) continue;
        const lines = wrap(`• ${clean}`, regular, style.bodySize, width - 12);
        for (const line of lines) {
          newPageIfNeeded(style.bodySize + style.lineGap);
          page.drawText(line, {
            x: MARGIN + 10, y: y - style.bodySize, size: style.bodySize, font: regular, color: rgb(0.12, 0.12, 0.15),
          });
          y -= style.bodySize + style.lineGap;
        }
      }
      y -= 3;
    }
  }

  // ── Skills (categorised, plain text — no tables) ──
  const skillCats = Object.entries(content.skills).filter(([, v]) => v.length);
  if (skillCats.length) {
    heading("Technical Skills");
    for (const [cat, list] of skillCats) {
      const label = `${cat}: `;
      const labelW = bold.widthOfTextAtSize(label, style.bodySize);
      newPageIfNeeded(style.bodySize + style.lineGap);
      page.drawText(label, { x: MARGIN, y: y - style.bodySize, size: style.bodySize, font: bold, color: rgb(0.1, 0.1, 0.14) });
      const lines = wrap(list.join(", "), regular, style.bodySize, width - labelW);
      lines.forEach((line, i) => {
        if (i > 0) { newPageIfNeeded(style.bodySize + style.lineGap); }
        page.drawText(line, {
          x: i === 0 ? MARGIN + labelW : MARGIN, y: y - style.bodySize,
          size: style.bodySize, font: regular, color: rgb(0.12, 0.12, 0.15),
        });
        y -= style.bodySize + style.lineGap;
      });
    }
  }

  // ── Projects ──
  if (content.projects.length) {
    heading("Projects");
    for (const p of content.projects) {
      newPageIfNeeded(style.bodySize * 2);
      page.drawText(truncate(p.name, bold, style.bodySize + 0.5, width), {
        x: MARGIN, y: y - (style.bodySize + 0.5), size: style.bodySize + 0.5, font: bold, color: rgb(0.08, 0.08, 0.12),
      });
      y -= style.bodySize + 4;
      if (p.description) drawLines(p.description, regular, style.bodySize, 10);
      if (p.technologies.length) drawLines(`Technologies: ${p.technologies.join(", ")}`, italic, style.bodySize - 0.5, 10);
      y -= 2;
    }
  }

  // ── Education ──
  if (content.educations.length) {
    heading("Education");
    for (const e of content.educations) {
      newPageIfNeeded(style.bodySize * 2);
      const line = e.degree ? `${e.degree} — ${e.institution}` : e.institution;
      page.drawText(truncate(line, bold, style.bodySize, width - 110), {
        x: MARGIN, y: y - style.bodySize, size: style.bodySize, font: bold, color: rgb(0.08, 0.08, 0.12),
      });
      if (e.period) {
        const pw = italic.widthOfTextAtSize(e.period, style.bodySize - 0.5);
        page.drawText(e.period, {
          x: PAGE_W - MARGIN - pw, y: y - style.bodySize, size: style.bodySize - 0.5,
          font: italic, color: rgb(0.35, 0.35, 0.4),
        });
      }
      y -= style.bodySize + style.lineGap + 2;
    }
  }

  // ── Certifications ──
  if (content.certifications.length) {
    heading("Certifications");
    for (const c of content.certifications) {
      drawLines(`• ${c}`, regular, style.bodySize, 10);
    }
  }

  // Classic cross-reference table instead of compressed object/xref streams.
  // Older ATS parsers (and pdf.js builds) handle the plain structure reliably,
  // which is the whole point of an ATS-friendly export.
  return doc.save({ useObjectStreams: false });
}

/** Greedy word wrap using real font metrics. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const clean = sanitize(text);
  const words = clean.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const attempt = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(attempt, size) <= maxWidth) {
      line = attempt;
    } else {
      if (line) lines.push(line);
      // A single word longer than the line: hard-split it.
      if (font.widthOfTextAtSize(w, size) > maxWidth) {
        let chunk = "";
        for (const ch of w) {
          if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) { lines.push(chunk); chunk = ch; }
          else chunk += ch;
        }
        line = chunk;
      } else {
        line = w;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const clean = sanitize(text);
  if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;
  let out = clean;
  while (out.length > 4 && font.widthOfTextAtSize(`${out}…`, size) > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

/**
 * StandardFonts are WinAnsi-encoded, so characters outside that range throw.
 * Map the common typographic ones and drop anything else.
 */
function sanitize(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u2022\u25CF\u00B7]/g, "•")
    .replace(/\u00A0/g, " ")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A1-\u00FF\u2022]/g, "");
}
