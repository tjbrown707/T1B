// netlify.toml headers cover static files, but not function responses or the
// /checkout redirect. Change only HSTS on those paths: do not read request or
// response bodies, change status codes, or replace the existing redirect rule.
export const HSTS_VALUE = "max-age=31536000; includeSubDomains";

export default async function transportSecurity(request, context) {
  const response = await context.next({ sendConditionalRequest: true });
  // Redirect response headers can be immutable. Copy the response while
  // passing its stream through untouched (including PDFs and empty 204s).
  const secured = new Response(response.body, response);
  secured.headers.set("Strict-Transport-Security", HSTS_VALUE);
  return secured;
}

export const config = {
  path: ["/checkout", "/checkout/", "/.netlify/functions/*"],
};
