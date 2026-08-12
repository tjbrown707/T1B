import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PAGE = { width: 612, height: 792, margin: 42 };
const RED = rgb(0.77, 0.12, 0.16);
const BLACK = rgb(0.08, 0.08, 0.08);
const GREY = rgb(0.38, 0.38, 0.38);
const LIGHT = rgb(0.86, 0.86, 0.86);

export function assertOrderPrintable(order) {
  if (order?.payment_status !== "PAID") return "Confirm payment before printing fulfillment documents.";
  if (order?.fulfillment_method === "LOCAL_HANDOFF") {
    return "Local handoff orders do not create a fulfillment packet.";
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

export async function buildFulfillmentPdf(order) {
  const blocked = assertOrderPrintable(order);
  if (blocked) throw new Error(blocked);

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };

  drawPickTicket(pdf, fonts, order);
  drawPackingSlip(pdf, fonts, order);

  pdf.setTitle(`Tier One fulfillment - ${safe(order.order_number)}`);
  pdf.setAuthor("Tier One BioSystems");
  pdf.setSubject("Internal pick ticket and customer packing slip");
  pdf.setCreator("Tier One Operations");
  return pdf.save({ useObjectStreams: true });
}

function newPage(pdf, fonts, label, order, pageNumber) {
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  page.drawText("TIER ONE BIOSYSTEMS", {
    x: PAGE.margin,
    y: 744,
    size: 16,
    font: fonts.bold,
    color: BLACK,
  });
  page.drawText(label, {
    x: PAGE.margin,
    y: 720,
    size: 11,
    font: fonts.bold,
    color: RED,
  });
  page.drawText(`${safe(order.order_number)}  |  Page ${pageNumber}`, {
    x: 390,
    y: 742,
    size: 8.5,
    font: fonts.regular,
    color: GREY,
  });
  page.drawLine({ start: { x: PAGE.margin, y: 708 }, end: { x: 570, y: 708 }, thickness: 2, color: RED });
  return page;
}

function drawPickTicket(pdf, fonts, order) {
  let pageNumber = 1;
  let page = newPage(pdf, fonts, "INTERNAL PICK TICKET", order, pageNumber);
  let y = 682;

  y = detailPair(page, fonts, "Order", order.order_number, "Paid", formatDate(order.payment_confirmed_at), y);
  y = detailPair(page, fonts, "Customer", order.customer_name, "Method", order.payment_method, y);
  y = drawWrapped(page, fonts, `Ship to: ${shippingAddress(order)}`, PAGE.margin, y - 2, 520, 9, GREY) - 16;

  page.drawText("PICK AND VERIFY", { x: PAGE.margin, y, size: 10, font: fonts.bold, color: BLACK });
  y -= 20;
  drawPickHeader(page, fonts, y);
  y -= 19;

  const itemMap = new Map((order.items || []).map(item => [item.id, item]));
  for (const allocation of order.allocations || []) {
    if (y < 105) {
      pageNumber += 1;
      page = newPage(pdf, fonts, "INTERNAL PICK TICKET - CONTINUED", order, pageNumber);
      y = 682;
      drawPickHeader(page, fonts, y);
      y -= 19;
    }
    const item = itemMap.get(allocation.productId) || {};
    const lot = allocation.lot || {};
    const name = `${safe(item.name || allocation.productId)} ${safe(item.dose || "")}`.trim();
    y = drawWrapped(page, fonts, name, 42, y, 230, 9, BLACK);
    page.drawText(safe(lot.lot_number), { x: 285, y: y + 9, size: 8.5, font: fonts.regular, color: BLACK });
    page.drawText(safe(lot.storage_location || "-"), { x: 420, y: y + 9, size: 8.5, font: fonts.regular, color: BLACK });
    page.drawText(String(allocation.quantity), { x: 548, y: y + 9, size: 10, font: fonts.bold, color: BLACK });
    page.drawRectangle({ x: 527, y: y + 5, width: 12, height: 12, borderWidth: 1, borderColor: GREY });
    y -= 10;
    page.drawLine({ start: { x: 42, y }, end: { x: 570, y }, thickness: 0.5, color: LIGHT });
    y -= 17;
  }

  if (y < 195) {
    pageNumber += 1;
    page = newPage(pdf, fonts, "INTERNAL PICK TICKET - VERIFICATION", order, pageNumber);
    y = 682;
  }
  const checks = ["Products and doses match", "Lot numbers match", "Quantities match", "Package sealed"];
  for (const check of checks) {
    page.drawRectangle({ x: 42, y: y - 2, width: 13, height: 13, borderWidth: 1, borderColor: GREY });
    page.drawText(check, { x: 64, y, size: 9.5, font: fonts.regular, color: BLACK });
    y -= 24;
  }
  page.drawText("Picked by: ____________________", { x: 42, y: y - 4, size: 9, font: fonts.regular, color: BLACK });
  page.drawText("Verified by: ____________________", { x: 310, y: y - 4, size: 9, font: fonts.regular, color: BLACK });
}

function drawPackingSlip(pdf, fonts, order) {
  let pageNumber = 1;
  let page = newPage(pdf, fonts, "CUSTOMER PACKING SLIP", order, pageNumber);
  let y = 682;

  y = detailPair(page, fonts, "Order", order.order_number, "Order date", formatDate(order.created_at), y);
  y = detailPair(page, fonts, "Customer", order.customer_name, "Payment", "Paid", y);
  y = drawWrapped(page, fonts, `Ship to: ${shippingAddress(order)}`, PAGE.margin, y - 2, 520, 9, GREY) - 18;

  drawPackingHeader(page, fonts, y);
  y -= 20;
  for (const item of order.items || []) {
    if (y < 140) {
      pageNumber += 1;
      page = newPage(pdf, fonts, "CUSTOMER PACKING SLIP - CONTINUED", order, pageNumber);
      y = 682;
      drawPackingHeader(page, fonts, y);
      y -= 20;
    }
    const lots = (order.allocations || [])
      .filter(allocation => allocation.productId === item.id)
      .map(allocation => safe(allocation.lot?.lot_number))
      .join(", ");
    y = drawWrapped(page, fonts, `${safe(item.name)} ${safe(item.dose)}`, 42, y, 250, 9.5, BLACK);
    page.drawText(lots, { x: 306, y: y + 9, size: 8, font: fonts.regular, color: GREY });
    page.drawText(String(item.qty), { x: 457, y: y + 9, size: 9.5, font: fonts.bold, color: BLACK });
    page.drawText(money(item.lineTotal), { x: 518, y: y + 9, size: 9.5, font: fonts.regular, color: BLACK });
    y -= 10;
    page.drawLine({ start: { x: 42, y }, end: { x: 570, y }, thickness: 0.5, color: LIGHT });
    y -= 17;
  }

  if (y < 190) {
    pageNumber += 1;
    page = newPage(pdf, fonts, "CUSTOMER PACKING SLIP - TOTALS", order, pageNumber);
    y = 682;
  }
  const totals = [
    ["Subtotal", money(order.subtotal)],
    ...(Number(order.discount_amount) > 0 ? [["Discount", `-${money(order.discount_amount)}`]] : []),
    ["Shipping", Number(order.shipping) === 0 ? "FREE" : money(order.shipping)],
    ["Total", money(order.total)],
  ];
  for (const [label, value] of totals) {
    page.drawText(label, { x: 405, y, size: label === "Total" ? 11 : 9, font: label === "Total" ? fonts.bold : fonts.regular, color: BLACK });
    page.drawText(value, { x: 515, y, size: label === "Total" ? 11 : 9, font: label === "Total" ? fonts.bold : fonts.regular, color: BLACK });
    y -= label === "Total" ? 26 : 19;
  }
  page.drawLine({ start: { x: 42, y: 92 }, end: { x: 570, y: 92 }, thickness: 0.75, color: LIGHT });
  page.drawText("Questions about your order? sales@tierone.bio", { x: 42, y: 72, size: 9, font: fonts.regular, color: GREY });
  page.drawText("Thank you for choosing Tier One BioSystems.", { x: 333, y: 72, size: 9, font: fonts.bold, color: BLACK });
}

function drawPickHeader(page, fonts, y) {
  page.drawText("ITEM", { x: 42, y, size: 8, font: fonts.bold, color: GREY });
  page.drawText("LOT", { x: 285, y, size: 8, font: fonts.bold, color: GREY });
  page.drawText("LOCATION", { x: 420, y, size: 8, font: fonts.bold, color: GREY });
  page.drawText("CHECK / QTY", { x: 520, y, size: 8, font: fonts.bold, color: GREY });
}

function drawPackingHeader(page, fonts, y) {
  page.drawText("ITEM", { x: 42, y, size: 8, font: fonts.bold, color: GREY });
  page.drawText("LOT", { x: 306, y, size: 8, font: fonts.bold, color: GREY });
  page.drawText("QTY", { x: 457, y, size: 8, font: fonts.bold, color: GREY });
  page.drawText("AMOUNT", { x: 518, y, size: 8, font: fonts.bold, color: GREY });
}

function detailPair(page, fonts, leftLabel, leftValue, rightLabel, rightValue, y) {
  page.drawText(`${leftLabel}:`, { x: 42, y, size: 8, font: fonts.bold, color: GREY });
  page.drawText(safe(leftValue), { x: 98, y, size: 9, font: fonts.regular, color: BLACK });
  page.drawText(`${rightLabel}:`, { x: 340, y, size: 8, font: fonts.bold, color: GREY });
  page.drawText(safe(rightValue), { x: 410, y, size: 9, font: fonts.regular, color: BLACK });
  return y - 20;
}

function drawWrapped(page, fonts, text, x, y, maxWidth, size, color) {
  const words = safe(text).split(/\s+/);
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (fonts.regular.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) page.drawText(line, { x, y, size, font: fonts.regular, color });
    y -= size + 3;
    line = word;
  }
  if (line) page.drawText(line, { x, y, size, font: fonts.regular, color });
  return y - size - 3;
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
    hour: "numeric",
    minute: "2-digit",
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
