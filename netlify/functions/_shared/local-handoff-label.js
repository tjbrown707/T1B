import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const LABEL = { width: 288, height: 432, margin: 20 };
const RED = rgb(0.77, 0.12, 0.16);
const BLACK = rgb(0.08, 0.08, 0.08);
const GREY = rgb(0.38, 0.38, 0.38);
const LIGHT = rgb(0.88, 0.88, 0.88);
const WHITE = rgb(1, 1, 1);

let cachedLogoBytes = null;

export function assertLocalHandoffLabelPrintable(order) {
  if (order?.payment_status !== "PAID") return "Confirm payment before creating the pickup label.";
  if (order?.fulfillment_method !== "LOCAL_HANDOFF") {
    return "This 4x6 identification label is only for local handoff orders.";
  }
  if (!String(order?.order_number || "").trim()) return "This order is missing its order number.";
  if (!String(order?.customer_name || "").trim()) return "This order is missing the customer's name.";
  return "";
}

export async function buildLocalHandoffLabelPdf(order) {
  const blocked = assertLocalHandoffLabelPrintable(order);
  if (blocked) throw new Error(blocked);

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(loadLogoBytes());
  const page = pdf.addPage([LABEL.width, LABEL.height]);

  const logoWidth = 214;
  const logoHeight = logo.height * (logoWidth / logo.width);
  page.drawImage(logo, {
    x: (LABEL.width - logoWidth) / 2,
    y: 420 - logoHeight,
    width: logoWidth,
    height: logoHeight,
  });
  page.drawLine({
    start: { x: LABEL.margin, y: 331 },
    end: { x: LABEL.width - LABEL.margin, y: 331 },
    thickness: 2,
    color: RED,
  });

  page.drawRectangle({ x: LABEL.margin, y: 288, width: 248, height: 34, color: BLACK });
  drawCentered(page, bold, "LOCAL HANDOFF", 307, 11, WHITE);
  drawCentered(page, bold, "NO POSTAGE - DO NOT MAIL", 294, 8, WHITE);

  page.drawText("ORDER", { x: LABEL.margin, y: 270, size: 7.5, font: bold, color: GREY });
  drawCentered(page, bold, safe(order.order_number), 250, 15, BLACK);

  page.drawLine({
    start: { x: LABEL.margin, y: 234 },
    end: { x: LABEL.width - LABEL.margin, y: 234 },
    thickness: 0.75,
    color: LIGHT,
  });

  page.drawText("CUSTOMER", { x: LABEL.margin, y: 225, size: 7.5, font: bold, color: GREY });
  let y = 203;
  const customerLines = wrapTextLines(bold, order.customer_name, 248, 18).slice(0, 2);
  y = drawLines(page, bold, customerLines, LABEL.margin, y, 18, BLACK, 22) - 7;

  const addressLines = [
    ...wrapTextLines(regular, order.ship_address, 248, 11),
    ...wrapTextLines(
      regular,
      [order.ship_city, order.ship_state, order.ship_zip].filter(Boolean).join(", "),
      248,
      11,
    ),
  ].slice(0, 3);
  y = drawLines(page, regular, addressLines, LABEL.margin, y, 11, BLACK, 15) - 9;

  page.drawLine({
    start: { x: LABEL.margin, y },
    end: { x: LABEL.width - LABEL.margin, y },
    thickness: 0.75,
    color: LIGHT,
  });
  y -= 19;
  y = drawContactRow(page, regular, bold, "PHONE", order.customer_phone, y);
  y = drawContactRow(page, regular, bold, "EMAIL", order.customer_email, y);

  const itemCount = (Array.isArray(order.items) ? order.items : []).reduce((total, item) => {
    const quantity = Number(item?.qty);
    return total + (Number.isInteger(quantity) && quantity > 0 ? quantity : 0);
  }, 0);
  if (itemCount > 0 && y >= 62) {
    drawContactRow(page, regular, bold, "CONTENTS", `${itemCount} vial${itemCount === 1 ? "" : "s"}`, y);
  }

  page.drawRectangle({
    x: LABEL.margin,
    y: 14,
    width: 248,
    height: 42,
    borderWidth: 2,
    borderColor: RED,
  });
  drawCentered(page, bold, "CUSTOMER PICKUP", 39, 10, RED);
  drawCentered(page, regular, `Order placed ${formatDate(order.created_at)}`, 24, 8, GREY);

  pdf.setTitle(`Tier One local handoff label - ${safe(order.order_number)}`);
  pdf.setAuthor("Tier One BioSystems");
  pdf.setSubject("4x6 local handoff identification label - no postage");
  pdf.setCreator("Tier One Operations");
  return pdf.save({ useObjectStreams: true });
}

function drawContactRow(page, regular, bold, label, value, y) {
  page.drawText(`${label}:`, { x: LABEL.margin, y, size: 7.5, font: bold, color: GREY });
  const lines = wrapTextLines(regular, value || "Not provided", 190, 9).slice(0, 2);
  drawLines(page, regular, lines, 76, y, 9, BLACK, 12);
  return y - Math.max(20, lines.length * 12 + 7);
}

function drawCentered(page, font, text, y, size, color) {
  const value = safe(text);
  const width = font.widthOfTextAtSize(value, size);
  page.drawText(value, { x: Math.max(LABEL.margin, (LABEL.width - width) / 2), y, size, font, color });
}

function drawLines(page, font, lines, x, y, size, color, lineHeight) {
  lines.forEach((line, index) => {
    page.drawText(line, { x, y: y - (index * lineHeight), size, font, color });
  });
  return y - (lines.length * lineHeight);
}

export function wrapTextLines(font, text, maxWidth, size) {
  let remaining = safe(text).replace(/\s+/g, " ").trim();
  if (!remaining) return ["Not provided"];
  const lines = [];
  while (remaining) {
    if (font.widthOfTextAtSize(remaining, size) <= maxWidth) {
      lines.push(remaining);
      break;
    }

    let low = 1;
    let high = remaining.length;
    let fittingLength = 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (font.widthOfTextAtSize(remaining.slice(0, middle), size) <= maxWidth) {
        fittingLength = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    const lastSpace = remaining.lastIndexOf(" ", fittingLength - 1);
    const breakAt = lastSpace > 0 ? lastSpace : fittingLength;
    lines.push(remaining.slice(0, breakAt).trimEnd());
    remaining = remaining.slice(breakAt).trimStart();
  }
  return lines;
}

function loadLogoBytes() {
  if (cachedLogoBytes) return cachedLogoBytes;
  const candidates = [
    path.join(process.cwd(), "public", "logo-wide.png"),
    path.join(process.cwd(), "..", "public", "logo-wide.png"),
    path.resolve("public/logo-wide.png"),
  ];
  for (const candidate of candidates) {
    try {
      cachedLogoBytes = readFileSync(candidate);
      return cachedLogoBytes;
    } catch {
      // Try the next Netlify/local runtime path.
    }
  }
  throw new Error("logo-wide.png not found in the function bundle");
}

function formatDate(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "unknown date";
  return date.toLocaleDateString("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function safe(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?")
    .slice(0, 500);
}
