import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PAGE = { width: 612, height: 792, margin: 42 };
const RED = rgb(0.77, 0.12, 0.16);
const BLACK = rgb(0.08, 0.08, 0.08);
const GREY = rgb(0.38, 0.38, 0.38);
const LIGHT = rgb(0.86, 0.86, 0.86);
const WHITE = rgb(1, 1, 1);

let cachedLogoBytes = null;

export function assertOrderPrintable(order) {
  if (order?.payment_status !== "PAID") return "Confirm payment before printing the packing slip.";
  if (order?.fulfillment_method === "LOCAL_HANDOFF") {
    return "Local handoff orders do not create a packing slip.";
  }
  const allocations = Array.isArray(order?.allocations) ? order.allocations : [];
  if (allocations.length === 0) return "This order has no inventory allocation.";
  if (allocations.some(allocation => !allocation?.lot
      || allocation.lot.is_provisional
      || !String(allocation.lot.lot_number || "").trim())) {
    return "Replace every provisional lot with its real lot number before printing.";
  }
  if (allocations.some(allocation => allocation?.state !== "COMMITTED")) {
    return "Inventory has not been committed for this order.";
  }
  return "";
}

export function buildPackingRows(order) {
  const itemMap = new Map((order?.items || []).map(item => [item.id, item]));
  return (order?.allocations || []).map(allocation => {
    const item = itemMap.get(allocation.productId) || {};
    return {
      productId: safe(allocation.productId),
      item: `${safe(item.name || allocation.productId)} ${safe(item.dose || "")}`.trim(),
      lotNumber: safe(allocation.lot?.lot_number || "-"),
      storageLocation: safe(allocation.lot?.storage_location || "-"),
      quantity: Number(allocation.quantity) || 0,
    };
  });
}

export async function buildFulfillmentPdf(order) {
  const blocked = assertOrderPrintable(order);
  if (blocked) throw new Error(blocked);

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(loadLogoBytes());
  const fonts = { regular, bold };

  drawPackingSlip(pdf, fonts, logo, order, buildPackingRows(order));

  pdf.setTitle(`Tier One packing slip - ${safe(order.order_number)}`);
  pdf.setAuthor("Tier One BioSystems");
  pdf.setSubject("Branded order packing slip");
  pdf.setCreator("Tier One Operations");
  return pdf.save({ useObjectStreams: true });
}

function drawPackingSlip(pdf, fonts, logo, order, rows) {
  let pageNumber = 1;
  let { page, y } = newPage(pdf, fonts, logo, order, pageNumber, "PACKING SLIP");

  y = detailPair(page, fonts, "Order", order.order_number, "Order date", formatDate(order.created_at), y);
  y = detailPair(page, fonts, "Customer", order.customer_name, "Payment", "Paid", y);
  y = drawWrapped(page, fonts, `Ship to: ${shippingAddress(order)}`, PAGE.margin, y - 2, 520, 9, GREY) - 15;

  page.drawText("PICK, PACK & VERIFY", { x: PAGE.margin, y, size: 10, font: fonts.bold, color: BLACK });
  y -= 19;
  drawPackingHeader(page, fonts, y);
  y -= 15;

  for (const row of rows) {
    const layout = packingRowLayout(fonts.regular, row);
    const rowHeight = layout.height;
    if (y - rowHeight < 205) {
      drawFooter(page, fonts);
      pageNumber += 1;
      ({ page, y } = newPage(pdf, fonts, logo, order, pageNumber, "PACKING SLIP - CONTINUED"));
      drawPackingHeader(page, fonts, y);
      y -= 15;
    }
    drawPackingRow(page, fonts, row, layout, y);
    y -= rowHeight;
  }

  if (y < 210) {
    drawFooter(page, fonts);
    pageNumber += 1;
    ({ page, y } = newPage(pdf, fonts, logo, order, pageNumber, "PACKING SLIP - TOTALS"));
  }
  drawPackedByAndTotals(page, fonts, order, y - 9);
  drawFooter(page, fonts);
}

function newPage(pdf, fonts, logo, order, pageNumber, label) {
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  const logoWidth = 190;
  const logoHeight = logo.height * (logoWidth / logo.width);
  page.drawImage(logo, {
    x: PAGE.margin,
    y: 750 - logoHeight,
    width: logoWidth,
    height: logoHeight,
  });
  page.drawText(label, {
    x: 360,
    y: 738,
    size: 13,
    font: fonts.bold,
    color: RED,
  });
  page.drawText(safe(order.order_number), {
    x: 360,
    y: 718,
    size: 10,
    font: fonts.bold,
    color: BLACK,
  });
  page.drawText(`Page ${pageNumber}`, {
    x: 360,
    y: 701,
    size: 8.5,
    font: fonts.regular,
    color: GREY,
  });
  page.drawLine({
    start: { x: PAGE.margin, y: 662 },
    end: { x: 570, y: 662 },
    thickness: 2,
    color: RED,
  });
  return { page, y: 640 };
}

function drawPackingHeader(page, fonts, y) {
  page.drawRectangle({ x: 42, y: y - 5, width: 528, height: 18, color: BLACK });
  page.drawText("CHECK", { x: 47, y, size: 7, font: fonts.bold, color: WHITE });
  page.drawText("ITEM / DOSE", { x: 79, y, size: 7, font: fonts.bold, color: WHITE });
  page.drawText("LOT", { x: 291, y, size: 7, font: fonts.bold, color: WHITE });
  page.drawText("STORAGE LOCATION", { x: 380, y, size: 7, font: fonts.bold, color: WHITE });
  page.drawText("QTY", { x: 546, y, size: 7, font: fonts.bold, color: WHITE });
}

export function packingRowLayout(font, row) {
  const itemLines = wrapTextLines(font, row.item, 198, 8.5);
  const lotLines = wrapTextLines(font, row.lotNumber, 78, 8);
  const locationLines = wrapTextLines(font, row.storageLocation, 150, 8);
  return {
    itemLines,
    lotLines,
    locationLines,
    height: Math.max(itemLines.length, lotLines.length, locationLines.length, 1) * 11 + 12,
  };
}

function drawPackingRow(page, fonts, row, layout, y) {
  const { itemLines, lotLines, locationLines, height } = layout;
  const textTop = y - 12;
  page.drawRectangle({
    x: 51,
    y: y - (height / 2) - 5,
    width: 12,
    height: 12,
    borderWidth: 1,
    borderColor: GREY,
  });
  drawLines(page, fonts.regular, itemLines, 79, textTop, 8.5, BLACK);
  drawLines(page, fonts.regular, lotLines, 291, textTop, 8, BLACK);
  drawLines(page, fonts.regular, locationLines, 380, textTop, 8, GREY);
  page.drawText(String(row.quantity), {
    x: 550,
    y: textTop,
    size: 9,
    font: fonts.bold,
    color: BLACK,
  });
  page.drawLine({
    start: { x: 42, y: y - height + 4 },
    end: { x: 570, y: y - height + 4 },
    thickness: 0.5,
    color: LIGHT,
  });
}

function drawPackedByAndTotals(page, fonts, order, y) {
  page.drawText("Packed by: ______________________________", {
    x: 42,
    y: y - 4,
    size: 8.5,
    font: fonts.regular,
    color: BLACK,
  });

  const totals = [
    ["Subtotal", money(order.subtotal)],
    ...(Number(order.discount_amount) > 0 ? [["Discount", `-${money(order.discount_amount)}`]] : []),
    ["Shipping", Number(order.shipping) === 0 ? "FREE" : money(order.shipping)],
    ["Total", money(order.total)],
  ];
  let totalY = y;
  for (const [label, value] of totals) {
    const important = label === "Total";
    page.drawText(label, {
      x: 414,
      y: totalY,
      size: important ? 10.5 : 8.5,
      font: important ? fonts.bold : fonts.regular,
      color: BLACK,
    });
    page.drawText(value, {
      x: 515,
      y: totalY,
      size: important ? 10.5 : 8.5,
      font: important ? fonts.bold : fonts.regular,
      color: BLACK,
    });
    totalY -= important ? 24 : 18;
  }
}

function drawFooter(page, fonts) {
  page.drawLine({ start: { x: 42, y: 73 }, end: { x: 570, y: 73 }, thickness: 0.75, color: LIGHT });
  page.drawText("Questions about your order? sales@tierone.bio", {
    x: 42,
    y: 55,
    size: 8.5,
    font: fonts.regular,
    color: GREY,
  });
  page.drawText("Research and laboratory use only. Not for human consumption.", {
    x: 298,
    y: 55,
    size: 7.5,
    font: fonts.regular,
    color: GREY,
  });
}

function detailPair(page, fonts, leftLabel, leftValue, rightLabel, rightValue, y) {
  const leftLines = wrapTextLines(fonts.regular, leftValue, 230, 9);
  const rightLines = wrapTextLines(fonts.regular, rightValue, 155, 9);
  page.drawText(`${leftLabel}:`, { x: 42, y, size: 8, font: fonts.bold, color: GREY });
  drawLines(page, fonts.regular, leftLines, 98, y, 9, BLACK);
  page.drawText(`${rightLabel}:`, { x: 340, y, size: 8, font: fonts.bold, color: GREY });
  drawLines(page, fonts.regular, rightLines, 410, y, 9, BLACK);
  return y - (Math.max(leftLines.length, rightLines.length) * 12) - 8;
}

function drawWrapped(page, fonts, text, x, y, maxWidth, size, color) {
  const lines = wrapTextLines(fonts.regular, text, maxWidth, size);
  drawLines(page, fonts.regular, lines, x, y, size, color);
  return y - (lines.length * (size + 3));
}

export function wrapTextLines(font, text, maxWidth, size) {
  let remaining = safe(text).replace(/\s+/g, " ").trim();
  if (!remaining) return ["-"];
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

function drawLines(page, font, lines, x, y, size, color) {
  lines.forEach((line, index) => {
    page.drawText(line, { x, y: y - (index * (size + 2.5)), size, font, color });
  });
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

function shippingAddress(order) {
  return [
    order.customer_name,
    order.ship_address,
    [order.ship_city, order.ship_state, order.ship_zip].filter(Boolean).join(", "),
  ].filter(Boolean).map(safe).join(" | ");
}

function formatDate(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function safe(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?")
    .slice(0, 500);
}
