import test from "node:test";
import assert from "node:assert/strict";

import {
  drainOrderProcessedEmailQueue,
  recordOrderPrintSubmission,
  renderOrderProcessedEmail,
  safeTrackingUrl,
  sendOrderProcessedDelivery,
  sendQueuedOrderProcessedEmail,
} from "../netlify/functions/_shared/order-processed-email.js";

const PACKING_EVENT = "FULFILLMENT_PACKET_PRINTED";
const LABEL_EVENT = "SHIPPING_LABEL_PRINTED";

function baseDelivery(overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    order_id: "22222222-2222-4222-8222-222222222222",
    status: "PENDING",
    recipient_email: "researcher@example.com",
    customer_name: "Research Customer",
    order_number: "T1B-260814-123456",
    template_version: 1,
    fulfillment_method: "SHIP",
    carrier: "USPS",
    service_name: "Ground Advantage",
    tracking_number: "9400111899223856928499",
    tracking_url: "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223856928499",
    idempotency_key: "order-processed/v1/22222222-2222-4222-8222-222222222222",
    claim_token: "33333333-3333-4333-8333-333333333333",
    ...overrides,
  };
}

function handoffDelivery(overrides = {}) {
  return baseDelivery({
    template_version: 2,
    fulfillment_method: "LOCAL_HANDOFF",
    carrier: null,
    service_name: null,
    tracking_number: null,
    tracking_url: null,
    idempotency_key: "order-processed/v2/22222222-2222-4222-8222-222222222222",
    ...overrides,
  });
}

function createFakeSupabase({ isTest = false, fulfillmentMethod = "SHIP" } = {}) {
  const state = {
    events: new Set(),
    outbox: null,
    sentCount: 0,
    failedCount: 0,
  };
  const supabase = {
    async rpc(name, args) {
      if (name === "record_order_print_submission") {
        state.events.add(args.p_event_type);
        const hasPacking = state.events.has(PACKING_EVENT);
        const hasLabel = state.events.has(LABEL_EVENT);
        if (fulfillmentMethod === "LOCAL_HANDOFF") {
          if (args.p_event_type === LABEL_EVENT) {
            return { data: null, error: new Error("local_handoff_does_not_ship") };
          }
          if (!hasPacking) {
            return { data: [{ delivery_id: null, delivery_status: null, readiness: "WAITING_FOR_PACKING_SLIP" }], error: null };
          }
          if (!state.outbox) state.outbox = handoffDelivery();
        } else {
          if (isTest && hasLabel) {
            return { data: [{ delivery_id: null, delivery_status: null, readiness: "TEST_LABEL" }], error: null };
          }
          if (!hasPacking || !hasLabel) {
            return { data: [{ delivery_id: null, delivery_status: null, readiness: !hasPacking ? "WAITING_FOR_PACKING_SLIP" : "WAITING_FOR_LABEL" }], error: null };
          }
          if (!state.outbox) state.outbox = baseDelivery();
        }
        return {
          data: [{
            delivery_id: state.outbox.id,
            delivery_status: state.outbox.status,
            readiness: state.outbox.status,
          }],
          error: null,
        };
      }
      if (name === "claim_order_processed_email") {
        const candidate = state.outbox;
        if (!candidate
            || (args.p_delivery_id && args.p_delivery_id !== candidate.id)
            || !["PENDING", "ERROR"].includes(candidate.status)) {
          return { data: [], error: null };
        }
        candidate.status = "SENDING";
        candidate.claim_token = "33333333-3333-4333-8333-333333333333";
        return { data: [{ ...candidate }], error: null };
      }
      if (name === "complete_order_processed_email") {
        if (state.outbox?.status !== "SENDING"
            || args.p_claim_token !== state.outbox.claim_token) {
          return { data: null, error: new Error("claim conflict") };
        }
        state.outbox.status = "SENT";
        state.outbox.provider_message_id = args.p_provider_message_id;
        state.sentCount += 1;
        return { data: { ...state.outbox }, error: null };
      }
      if (name === "fail_order_processed_email") {
        state.outbox.status = args.p_retryable ? "ERROR" : "NEEDS_REVIEW";
        state.failedCount += 1;
        return { data: { ...state.outbox }, error: null };
      }
      return { data: null, error: new Error(`unexpected RPC: ${name}`) };
    },
  };
  return { supabase, state };
}

function successfulResend(counter) {
  return async (url, options) => {
    counter.calls += 1;
    counter.url = url;
    counter.options = options;
    return new Response(JSON.stringify({ id: `email-${counter.calls}` }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

test("the processed-order email is branded, escaped, and contains tracking in HTML and text", () => {
  const rendered = renderOrderProcessedEmail(baseDelivery({
    customer_name: "<Research & Development>",
    order_number: "T1B-<unsafe>",
    carrier: "USPS & Partners",
  }));
  assert.equal(rendered.to, "researcher@example.com");
  assert.match(rendered.subject, /T1B-<unsafe> processed/);
  assert.match(rendered.html, /&lt;Research &amp; Development&gt;/);
  assert.match(rendered.html, /T1B-&lt;unsafe&gt;/);
  assert.match(rendered.html, /USPS &amp; Partners/);
  assert.match(rendered.html, /9400111899223856928499/);
  assert.match(rendered.html, /Track Package/);
  assert.match(rendered.html, /research and laboratory use only/i);
  assert.doesNotMatch(rendered.html, /\{\{[A-Z_]+\}\}/);
  assert.match(rendered.text, /Tracking number: 9400111899223856928499/);
  assert.match(rendered.text, /sales@tierone\.bio/);
  assert.match(rendered.text, /Not for human consumption/);
});

test("the hand-delivery email is branded, escaped, and contains no tracking payload", () => {
  const rendered = renderOrderProcessedEmail(handoffDelivery({
    customer_name: "<Local & Customer>",
    order_number: "T1B-<handoff>",
  }));
  assert.match(rendered.subject, /prepared for hand delivery/);
  assert.match(rendered.html, /&lt;Local &amp; Customer&gt;/);
  assert.match(rendered.html, /T1B-&lt;handoff&gt;/);
  assert.match(rendered.html, /hand delivery/i);
  assert.doesNotMatch(rendered.html, /Track Package|Tracking number|USPS/i);
  assert.doesNotMatch(rendered.html, /\{\{[A-Z_]+\}\}/);
  assert.match(rendered.text, /prepared it for hand delivery/i);
  assert.doesNotMatch(rendered.text, /tracking number:/i);
});

test("only bounded HTTPS tracking URLs become links", () => {
  assert.match(safeTrackingUrl("https://example.com/track?id=1"), /^https:/);
  assert.equal(safeTrackingUrl("http://example.com/track"), "");
  assert.equal(safeTrackingUrl("javascript:alert(1)"), "");
  assert.equal(safeTrackingUrl("not a url"), "");

  const rendered = renderOrderProcessedEmail(baseDelivery({
    tracking_url: "javascript:alert(1)",
  }));
  assert.doesNotMatch(rendered.html, /Track Package/);
  assert.doesNotMatch(rendered.text, /javascript:/);
});

test("Resend receives both bodies and a stable idempotency key", async () => {
  const counter = { calls: 0 };
  const delivery = baseDelivery();
  const sent = await sendOrderProcessedDelivery(delivery, {
    apiKey: "re_test_only",
    fetchImpl: successfulResend(counter),
  });
  assert.equal(sent.providerMessageId, "email-1");
  assert.equal(counter.url, "https://api.resend.com/emails");
  assert.equal(counter.options.headers["Idempotency-Key"], delivery.idempotency_key);
  const payload = JSON.parse(counter.options.body);
  assert.equal(payload.from, "Tier One BioSystems <noreply@tierone.bio>");
  assert.equal(payload.reply_to, "sales@tierone.bio");
  assert.deepEqual(payload.to, [delivery.recipient_email]);
  assert.match(payload.html, /Track Package/);
  assert.match(payload.text, /Tracking number/);
});

test("Resend receives the stable hand-delivery v2 payload without tracking", async () => {
  const counter = { calls: 0 };
  const delivery = handoffDelivery();
  await sendOrderProcessedDelivery(delivery, { apiKey: "re_test_only", fetchImpl: successfulResend(counter) });
  assert.equal(counter.options.headers["Idempotency-Key"], delivery.idempotency_key);
  const payload = JSON.parse(counter.options.body);
  assert.match(payload.subject, /hand delivery/);
  assert.match(payload.html, /Hand delivery/);
  assert.doesNotMatch(payload.text, /Tracking number:/i);
});

test("template versions and idempotency-key versions must stay aligned", () => {
  const rendered = renderOrderProcessedEmail(baseDelivery());
  assert.equal(rendered.from, "Tier One BioSystems <noreply@tierone.bio>");
  assert.equal(rendered.replyTo, "sales@tierone.bio");
  assert.throws(
    () => renderOrderProcessedEmail(baseDelivery({ template_version: 3 })),
    /unsupported template version/,
  );
  assert.throws(
    () => renderOrderProcessedEmail(baseDelivery({ idempotency_key: "order-processed/v2/order" })),
    /does not match its template version/,
  );
  assert.throws(
    () => renderOrderProcessedEmail(handoffDelivery({ fulfillment_method: "SHIP" })),
    /method does not match its template version/,
  );
  assert.throws(
    () => renderOrderProcessedEmail(handoffDelivery({ carrier: "USPS" })),
    /cannot contain shipping fields/,
  );
});

for (const sequence of [
  [PACKING_EVENT, LABEL_EVENT],
  [LABEL_EVENT, PACKING_EVENT],
]) {
  test(`email sends once when ${sequence[0]} is followed by ${sequence[1]}`, async () => {
    const { supabase, state } = createFakeSupabase();
    const counter = { calls: 0 };
    const sendOptions = { apiKey: "re_test_only", fetchImpl: successfulResend(counter) };
    const first = await recordOrderPrintSubmission({
      supabase,
      orderId: baseDelivery().order_id,
      eventType: sequence[0],
      actorUserId: "44444444-4444-4444-8444-444444444444",
      jobId: 101,
      sendOptions,
    });
    assert.match(first.state, /^WAITING_FOR_/);
    assert.equal(counter.calls, 0);

    const second = await recordOrderPrintSubmission({
      supabase,
      orderId: baseDelivery().order_id,
      eventType: sequence[1],
      actorUserId: "44444444-4444-4444-8444-444444444444",
      jobId: 102,
      sendOptions,
    });
    assert.equal(second.state, "SENT");
    assert.equal(state.sentCount, 1);
    assert.equal(counter.calls, 1);

    const reprint = await recordOrderPrintSubmission({
      supabase,
      orderId: baseDelivery().order_id,
      eventType: sequence[1],
      actorUserId: "44444444-4444-4444-8444-444444444444",
      jobId: 103,
      sendOptions,
    });
    assert.equal(reprint.state, "SENT");
    assert.equal(reprint.alreadySent, true);
    assert.equal(counter.calls, 1);
  });
}

test("local handoff sends once after the packing slip without a shipping label", async () => {
  const { supabase, state } = createFakeSupabase({ fulfillmentMethod: "LOCAL_HANDOFF" });
  const counter = { calls: 0 };
  const sendOptions = { apiKey: "re_test_only", fetchImpl: successfulResend(counter) };
  const first = await recordOrderPrintSubmission({
    supabase, orderId: handoffDelivery().order_id, eventType: PACKING_EVENT,
    actorUserId: "44444444-4444-4444-8444-444444444444", jobId: 150, sendOptions,
  });
  assert.equal(first.state, "SENT");
  assert.equal(counter.calls, 1);
  assert.equal(state.sentCount, 1);
  assert.equal(state.events.has(LABEL_EVENT), false);

  const reprint = await recordOrderPrintSubmission({
    supabase, orderId: handoffDelivery().order_id, eventType: PACKING_EVENT,
    actorUserId: "44444444-4444-4444-8444-444444444444", jobId: 151, sendOptions,
  });
  assert.equal(reprint.state, "SENT");
  assert.equal(reprint.alreadySent, true);
  assert.equal(counter.calls, 1);
});

test("a persisted Shippo test label stays suppressed after the token is swapped", async () => {
  const { supabase, state } = createFakeSupabase({ isTest: true });
  const counter = { calls: 0 };
  const sendOptions = { apiKey: "re_test_only", fetchImpl: successfulResend(counter) };
  const labelResult = await recordOrderPrintSubmission({
    supabase,
    orderId: baseDelivery().order_id,
    eventType: LABEL_EVENT,
    actorUserId: "44444444-4444-4444-8444-444444444444",
    jobId: 201,
    sendOptions,
  });
  assert.equal(labelResult.state, "TEST_LABEL");
  // Changing an environment token cannot change the test flag saved with the
  // Shippo Transaction, so the later packing-slip event must remain blocked.
  const result = await recordOrderPrintSubmission({
    supabase,
    orderId: baseDelivery().order_id,
    eventType: PACKING_EVENT,
    actorUserId: "44444444-4444-4444-8444-444444444444",
    jobId: 202,
    sendOptions,
  });
  assert.equal(result.state, "TEST_LABEL");
  assert.equal(state.outbox, null);
  assert.equal(counter.calls, 0);
});

test("the long label-purchase path can queue without waiting for Resend", async () => {
  const { supabase, state } = createFakeSupabase();
  const counter = { calls: 0 };
  const sendOptions = { apiKey: "re_test_only", fetchImpl: successfulResend(counter) };
  await recordOrderPrintSubmission({
    supabase,
    orderId: baseDelivery().order_id,
    eventType: PACKING_EVENT,
    actorUserId: "44444444-4444-4444-8444-444444444444",
    jobId: 211,
    sendOptions,
  });
  const queued = await recordOrderPrintSubmission({
    supabase,
    orderId: baseDelivery().order_id,
    eventType: LABEL_EVENT,
    actorUserId: "44444444-4444-4444-8444-444444444444",
    jobId: 212,
    deferDelivery: true,
    sendOptions,
  });
  assert.equal(queued.state, "QUEUED");
  assert.equal(counter.calls, 0);
  assert.equal(state.outbox.status, "PENDING");

  const delivered = await sendQueuedOrderProcessedEmail({ supabase, ...sendOptions });
  assert.equal(delivered.state, "SENT");
  assert.equal(counter.calls, 1);
});

test("a transient print-recorder failure retries the same idempotent job id", async () => {
  let calls = 0;
  const supabase = {
    async rpc(name, args) {
      assert.equal(name, "record_order_print_submission");
      assert.equal(args.p_printnode_job_id, 220);
      calls += 1;
      if (calls === 1) throw new Error("temporary database network failure");
      return {
        data: [{
          delivery_id: baseDelivery().id,
          delivery_status: "PENDING",
          readiness: "QUEUED",
        }],
        error: null,
      };
    },
  };
  const result = await recordOrderPrintSubmission({
    supabase,
    orderId: baseDelivery().order_id,
    eventType: LABEL_EVENT,
    actorUserId: "44444444-4444-4444-8444-444444444444",
    jobId: 220,
    deferDelivery: true,
  });
  assert.equal(result.state, "QUEUED");
  assert.equal(calls, 2);
});

test("a temporary Resend failure is recorded and a later retry succeeds", async () => {
  const { supabase, state } = createFakeSupabase();
  await supabase.rpc("record_order_print_submission", { p_event_type: PACKING_EVENT });
  await supabase.rpc("record_order_print_submission", { p_event_type: LABEL_EVENT });
  const first = await sendQueuedOrderProcessedEmail({
    supabase,
    apiKey: "re_test_only",
    fetchImpl: async () => new Response(JSON.stringify({ message: "temporary outage" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    }),
  });
  assert.equal(first.state, "RETRYING");
  assert.equal(state.outbox.status, "ERROR");
  assert.equal(state.failedCount, 1);

  const counter = { calls: 0 };
  const second = await sendQueuedOrderProcessedEmail({
    supabase,
    apiKey: "re_test_only",
    fetchImpl: successfulResend(counter),
  });
  assert.equal(second.state, "SENT");
  assert.equal(state.sentCount, 1);
  assert.equal(counter.calls, 1);
  assert.equal(state.outbox.idempotency_key, baseDelivery().idempotency_key);
});

test("a claim-network failure never turns a successful print into an endpoint failure", async () => {
  const supabase = {
    async rpc(name) {
      if (name === "record_order_print_submission") {
        return {
          data: [{
            delivery_id: baseDelivery().id,
            delivery_status: "PENDING",
            readiness: "QUEUED",
          }],
          error: null,
        };
      }
      throw new Error("database network unavailable");
    },
  };
  const result = await recordOrderPrintSubmission({
    supabase,
    orderId: baseDelivery().order_id,
    eventType: LABEL_EVENT,
    actorUserId: "44444444-4444-4444-8444-444444444444",
    jobId: 301,
    sendOptions: { apiKey: "re_test_only", fetchImpl: successfulResend({ calls: 0 }) },
  });
  assert.equal(result.state, "NEEDS_REVIEW");
  assert.equal(result.sent, false);
});

test("provider acceptance followed by a completion-network failure stays leased for reconciliation", async () => {
  let failureRpcCalls = 0;
  const supabase = {
    async rpc(name) {
      if (name === "claim_order_processed_email") {
        return { data: [{ ...baseDelivery(), status: "SENDING" }], error: null };
      }
      if (name === "complete_order_processed_email") {
        throw new Error("database network unavailable");
      }
      if (name === "fail_order_processed_email") failureRpcCalls += 1;
      return { data: null, error: null };
    },
  };
  const counter = { calls: 0 };
  const result = await sendQueuedOrderProcessedEmail({
    supabase,
    apiKey: "re_test_only",
    fetchImpl: successfulResend(counter),
  });
  assert.equal(result.state, "RETRYING");
  assert.equal(counter.calls, 1);
  assert.equal(failureRpcCalls, 0);
});

test("terminalized deliveries are reported and do not stall later due mail", async () => {
  let claimCalls = 0;
  let completed = 0;
  const supabase = {
    async rpc(name, args) {
      if (name === "claim_order_processed_email") {
        claimCalls += 1;
        if (claimCalls === 1) {
          return { data: [{ ...baseDelivery(), status: "NEEDS_REVIEW", claim_token: null }], error: null };
        }
        return { data: [{ ...baseDelivery(), status: "SENDING" }], error: null };
      }
      if (name === "complete_order_processed_email") {
        assert.equal(args.p_claim_token, baseDelivery().claim_token);
        completed += 1;
        return { data: [{ ...baseDelivery(), status: "SENT" }], error: null };
      }
      throw new Error(`unexpected RPC: ${name}`);
    },
  };
  const counter = { calls: 0 };
  const results = await drainOrderProcessedEmailQueue({
    supabase,
    limit: 2,
    apiKey: "re_test_only",
    fetchImpl: successfulResend(counter),
  });
  assert.deepEqual(results.map(result => result.state), ["NEEDS_REVIEW", "SENT"]);
  assert.equal(counter.calls, 1);
  assert.equal(completed, 1);
});

test("concurrent workers claim one logical send", async () => {
  const { supabase, state } = createFakeSupabase();
  await supabase.rpc("record_order_print_submission", { p_event_type: PACKING_EVENT });
  await supabase.rpc("record_order_print_submission", { p_event_type: LABEL_EVENT });
  const counter = { calls: 0 };
  const options = {
    supabase,
    apiKey: "re_test_only",
    fetchImpl: successfulResend(counter),
  };
  const results = await Promise.all([
    sendQueuedOrderProcessedEmail(options),
    sendQueuedOrderProcessedEmail(options),
  ]);
  assert.deepEqual(results.map(result => result.state).sort(), ["SENT", "UNCHANGED"]);
  assert.equal(counter.calls, 1);
  assert.equal(state.sentCount, 1);
});
