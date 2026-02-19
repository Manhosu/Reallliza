import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { jsonResponse } from "@/lib/api-helpers/response";

interface Column {
  key: string;
  label: string;
  width?: number;
}

// ---------------------------------------------------------------------------
// PDF Generation
// ---------------------------------------------------------------------------

export async function generatePdf(
  title: string,
  columns: Column[],
  rows: Record<string, any>[],
  summary?: Record<string, any>
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 40 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ---- Header -----------------------------------------------------------
    doc.fontSize(18).font("Helvetica-Bold").text(title, { align: "center" });
    doc.moveDown(0.3);
    doc
      .fontSize(9)
      .font("Helvetica")
      .text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, {
        align: "center",
      });
    doc.moveDown(1);

    // ---- Summary ----------------------------------------------------------
    if (summary && Object.keys(summary).length > 0) {
      doc.fontSize(11).font("Helvetica-Bold").text("Resumo");
      doc.moveDown(0.3);

      for (const [label, value] of Object.entries(summary)) {
        doc
          .fontSize(10)
          .font("Helvetica-Bold")
          .text(`${label}: `, { continued: true })
          .font("Helvetica")
          .text(String(value ?? ""));
      }

      doc.moveDown(1);
    }

    // ---- Table ------------------------------------------------------------
    const tableTop = doc.y;
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // Compute column widths: use explicit width when provided, otherwise split
    // remaining space equally among columns without an explicit width.
    const explicitTotal = columns.reduce((s, c) => s + (c.width ?? 0), 0);
    const flexCount = columns.filter((c) => !c.width).length;
    const flexWidth = flexCount > 0 ? (pageWidth - explicitTotal) / flexCount : 0;

    const colWidths = columns.map((c) => c.width ?? flexWidth);

    const drawRow = (y: number, values: string[], bold: boolean) => {
      let x = doc.page.margins.left;
      const fontSize = 9;
      doc.fontSize(fontSize).font(bold ? "Helvetica-Bold" : "Helvetica");

      columns.forEach((_, i) => {
        doc.text(values[i] ?? "", x + 4, y + 4, {
          width: colWidths[i] - 8,
          ellipsis: true,
          lineBreak: false,
        });
        x += colWidths[i];
      });

      return 20; // row height
    };

    // Header row background
    let x = doc.page.margins.left;
    colWidths.forEach((w) => {
      doc.rect(x, tableTop, w, 20).fill("#e2e8f0");
      x += w;
    });

    drawRow(
      tableTop,
      columns.map((c) => c.label),
      true
    );

    let currentY = tableTop + 20;

    for (let r = 0; r < rows.length; r++) {
      // Add new page if close to bottom
      if (currentY + 24 > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        currentY = doc.page.margins.top;
      }

      // Alternating row background
      if (r % 2 === 1) {
        let bgX = doc.page.margins.left;
        colWidths.forEach((w) => {
          doc.rect(bgX, currentY, w, 20).fill("#f8fafc");
          bgX += w;
        });
      }

      const row = rows[r];
      const values = columns.map((c) => formatCellValue(row[c.key]));
      const rowHeight = drawRow(currentY, values, false);
      currentY += rowHeight;
    }

    // Footer
    doc.moveDown(1);
    doc
      .fontSize(8)
      .font("Helvetica")
      .text(`Total de registros: ${rows.length}`, doc.page.margins.left, currentY + 10);

    doc.end();
  });
}

// ---------------------------------------------------------------------------
// Excel Generation
// ---------------------------------------------------------------------------

export async function generateExcel(
  title: string,
  columns: Column[],
  rows: Record<string, any>[],
  summary?: Record<string, any>
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Reallliza";
  workbook.created = new Date();

  // ---- Summary sheet (optional) -------------------------------------------
  if (summary && Object.keys(summary).length > 0) {
    const summarySheet = workbook.addWorksheet("Resumo");

    summarySheet.getColumn(1).width = 30;
    summarySheet.getColumn(2).width = 40;

    const titleRow = summarySheet.addRow([title]);
    titleRow.font = { bold: true, size: 14 };
    summarySheet.addRow([]);

    for (const [label, value] of Object.entries(summary)) {
      const row = summarySheet.addRow([label, String(value ?? "")]);
      row.getCell(1).font = { bold: true };
    }
  }

  // ---- Data sheet ---------------------------------------------------------
  const dataSheet = workbook.addWorksheet("Dados");

  // Header row
  const headerRow = dataSheet.addRow(columns.map((c) => c.label));
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF000000" } },
    };
  });

  // Data rows
  for (const row of rows) {
    dataSheet.addRow(columns.map((c) => row[c.key] ?? ""));
  }

  // Auto-width columns (measure header + first 50 data rows)
  dataSheet.columns.forEach((col, i) => {
    let maxLen = columns[i].label.length;
    const sampleRows = rows.slice(0, 50);
    for (const row of sampleRows) {
      const val = String(row[columns[i].key] ?? "");
      if (val.length > maxLen) maxLen = val.length;
    }
    col.width = Math.min(maxLen + 4, 50);
  });

  // Auto-filter on the header row
  dataSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ---------------------------------------------------------------------------
// Unified Response Helper
// ---------------------------------------------------------------------------

export async function formatReportResponse(
  format: string | null | undefined,
  title: string,
  columns: Column[],
  rows: Record<string, any>[],
  summary?: Record<string, any>,
  jsonData?: any
): Promise<Response> {
  if (format === "pdf") {
    try {
      const buffer = await generatePdf(title, columns, rows, summary);
      const filename = slugify(title) + ".pdf";

      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    } catch (err) {
      console.error("PDF generation failed:", err);
      throw err;
    }
  }

  if (format === "excel") {
    try {
      const buffer = await generateExcel(title, columns, rows, summary);
      const filename = slugify(title) + ".xlsx";

      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    } catch (err) {
      console.error("Excel generation failed:", err);
      throw err;
    }
  }

  // Default: JSON
  return jsonResponse(jsonData ?? { data: rows, summary });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toLocaleDateString("pt-BR");
  if (typeof value === "number") return value.toLocaleString("pt-BR");
  if (typeof value === "boolean") return value ? "Sim" : "Nao";
  return String(value);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
