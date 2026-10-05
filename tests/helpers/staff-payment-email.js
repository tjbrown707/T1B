import { randomUUID } from "node:crypto";

// The real transaction/claim/immutability rules are exercised in PostgreSQL.
// This mock supplies queue responses for server, transport and UI integration.
export function paymentQueueFixture(options = {}) {
  const rows = [];
  const calls = [];
  function enqueue(order, kind = "confirmed", previousAmount = null) {
    const eventId = rows.length + 1;
    const noticeId = randomUUID();
    const row = { id: noticeId, event_id: eventId, order_id: order.id, kind,
      payment_amount_received: order.payment_amount_received, previous_amount: previousAmount,
      order_snapshot: { ...order }, idempotency_key: `staff-payment/v1/${noticeId}`,
      status: "PENDING", attempt_count: 0, message_payload: null };
    rows.push(row);
    return row;
  }
  async function rpc(name, args) {
    calls.push({ name, args });
    if (options.rpcError === name) return { error: new Error("database unavailable") };
    if (name === "claim_staff_payment_email") {
      const row = rows.find(row => (!args.p_delivery_id || row.id === args.p_delivery_id)
        && (!args.p_order_id || row.order_id === args.p_order_id) && ["PENDING", "ERROR"].includes(row.status));
      if (!row) return { data: [] };
      row.status = "SENDING";
      row.claim_token = randomUUID();
      row.attempt_count += 1;
      return { data: [{ ...row }] };
    }
    const row = rows.find(row => row.id === args.p_delivery_id);
    if (!row || row.claim_token !== args.p_claim_token) throw new Error("invalid mock claim");
    if (name === "prepare_staff_payment_email") row.message_payload ||= args.p_payload;
    else if (name === "complete_staff_payment_email") { row.status = "SENT"; row.provider_message_id = args.p_provider_message_id; }
    else if (name === "fail_staff_payment_email") row.status = args.p_retryable ? "ERROR" : "NEEDS_REVIEW";
    else throw new Error(`Unexpected queue RPC ${name}`);
    return { data: { ...row } };
  }
  return { rows, calls, enqueue, rpc };
}
