# Tier One Bio — Auth Email Setup

Branded HTML for the Supabase auth emails, matched to the order-confirmation email.
Supabase can't be configured through code here, so these are applied in the dashboard.

Project: **tier-one-bio** (`nmafhetkofrekabqawgb`)

---

## 1. Install the templates (5 min)

Dashboard → **Authentication → Emails** (Email Templates). For each type below, set the
**Subject** and paste the matching file's HTML into the message body, then **Save**.

| Supabase template        | File                        | Subject line                              |
|--------------------------|-----------------------------|-------------------------------------------|
| Confirm signup           | `auth-confirm-signup.html`  | Confirm your Tier One BioSystems account  |
| Reset Password           | `auth-reset-password.html`  | Reset your Tier One BioSystems password   |
| Magic Link               | `auth-magic-link.html`      | Your Tier One BioSystems sign-in link     |
| Change Email Address     | `auth-change-email.html`    | Confirm your new email address            |

The templates use Supabase's variables (`{{ .ConfirmationURL }}`, `{{ .Email }}`,
`{{ .NewEmail }}`) — leave those exactly as-is.

---

## 2. Custom SMTP — send from your own domain (the important part)

Without this, mail sends from `noreply@mail.app.supabase.io`, is rate-limited to a few
per hour, and often lands in spam. Custom SMTP makes it send from `noreply@tierone.bio`.

**Recommended provider: Resend** (free tier = 3,000 emails/mo, simplest DNS setup).

1. Create an account at https://resend.com
2. **Add Domain** → enter `tierone.bio`
3. Resend shows DNS records (SPF, DKIM, and a return-path/MX). Add them wherever
   `tierone.bio` DNS is managed (likely your domain registrar or Netlify DNS). Wait for
   Resend to show the domain **Verified** (usually minutes).
4. Create an **API key** in Resend.
5. In Supabase: **Authentication → Emails → SMTP Settings → Enable Custom SMTP**, and enter:
   - **Host:** `smtp.resend.com`
   - **Port:** `465`
   - **Username:** `resend`
   - **Password:** your Resend API key
   - **Sender email:** `noreply@tierone.bio`
   - **Sender name:** `Tier One BioSystems`
6. Save. Send a test (e.g. trigger a password reset) and confirm it arrives from your domain.

Once custom SMTP is on, you can also raise the rate limits under
**Authentication → Rate Limits**.

> Note: this same Resend domain + API key could later replace EmailJS for the order
> emails too, consolidating everything onto one branded sender — optional, separate task.
