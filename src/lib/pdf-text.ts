/**
 * PDF text extraction — single entry point for the whole app.
 *
 * Two problems this module exists to solve:
 *
 * 1. `pdf-parse@1.1.1` bundles an old pdf.js that keeps global worker state:
 *    the FIRST extraction in a Node process succeeds and later ones throw
 *    "bad XRef entry" as an UNHANDLED rejection that escapes try/catch. On a
 *    long-running server that means the second CV analysed fails until restart.
 *
 * 2. Naive text extraction concatenates every fragment with spaces, producing
 *    ONE long line. A CV parser needs line structure to find section headings
 *    and bullet points, so we rebuild newlines from each text item's Y
 *    position instead of relying on the library's joined output.
 */

export interface ExtractedPdf {
  text: string;
  pages: number;
}

interface TextItemLike {
  str?: string;
  transform?: number[];
  hasEOL?: boolean;
  width?: number;
}

/** Vertical movement (in PDF units) large enough to count as a new line. */
const LINE_EPSILON = 2.2;

/**
 * Rebuild page text with line breaks, using the Y coordinate of each text item.
 * pdf.js emits items in reading order with `transform[5]` as the baseline Y.
 */
function itemsToLines(items: TextItemLike[]): string[] {
  const lines: string[] = [];
  let current = "";
  let lastY: number | null = null;
  let lastEndX: number | null = null;

  const flush = () => {
    const cleaned = current.replace(/[ \t]+/g, " ").trim();
    if (cleaned) lines.push(cleaned);
    current = "";
  };

  for (const item of items) {
    const str = item.str ?? "";
    const y = item.transform?.[5] ?? null;
    const x = item.transform?.[4] ?? null;

    if (lastY != null && y != null && Math.abs(y - lastY) > LINE_EPSILON) {
      flush();
      lastEndX = null;
    }

    if (str) {
      // Insert a space when there is a visible horizontal gap, so
      // right-aligned fragments (e.g. a date column) do not glue together.
      const needsSpace =
        current.length > 0 &&
        !current.endsWith(" ") &&
        !str.startsWith(" ") &&
        (lastEndX == null || x == null || x - lastEndX > 1);
      current += (needsSpace ? " " : "") + str;
    }

    if (item.hasEOL) {
      flush();
      lastEndX = null;
    } else if (x != null) {
      lastEndX = x + (item.width ?? 0);
    }

    if (y != null) lastY = y;
  }
  flush();
  return lines;
}

/**
 * Extract text from a PDF buffer, preserving line structure.
 * Throws a user-facing Error when the file has no extractable text (a scan).
 */
export async function extractPdfText(buffer: Buffer): Promise<ExtractedPdf> {
  let text = "";
  let pages = 0;

  try {
    const { getDocumentProxy } = await import("unpdf");
    // Copy into a fresh Uint8Array: pdf.js may transfer/detach the input buffer.
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    pages = pdf.numPages;

    const pageTexts: string[] = [];
    for (let p = 1; p <= pages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const items = (content.items ?? []) as TextItemLike[];
      pageTexts.push(itemsToLines(items).join("\n"));
    }
    text = pageTexts.join("\n\n");
  } catch (e) {
    throw new Error(
      `Could not read the PDF: ${e instanceof Error ? e.message : "unknown error"}. ` +
      "If the CV is a scanned image, the text cannot be extracted — please upload a text-based PDF."
    );
  }

  if (text.trim().length < 50) {
    throw new Error(
      "Almost no text found in this PDF. It is likely a scan or image-only file, which cannot be analysed. Please upload a text-based CV."
    );
  }

  return { text, pages };
}

/** Best-effort variant for paths where extraction failure must not block. */
export async function tryExtractPdfText(buffer: Buffer): Promise<string> {
  try {
    return (await extractPdfText(buffer)).text;
  } catch {
    return "";
  }
}
