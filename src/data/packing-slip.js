// An order-arrival copy is paperwork, not proof of payment or fulfillment.
export function needsOrderCopy(order) {
  return order?.payment_status === "AWAITING_PAYMENT" || order?.backorder_pending === true;
}

export function canPrintOrderCopy(order) {
  return ["AWAITING_PAYMENT", "PAID"].includes(order?.payment_status)
    && !["CANCELLED", "REFUNDED"].includes(order?.status)
    && order?.fulfillment_status !== "CANCELLED"
    && Array.isArray(order?.items) && order.items.length > 0 && order.items.length <= 200
    && order.items.every(item => String(item?.name || item?.id || "").trim()
      && Number.isInteger(Number(item.qty)) && Number(item.qty) > 0 && Number(item.qty) <= 1000);
}
