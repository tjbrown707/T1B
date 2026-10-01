import { createClient as defaultCreateClient } from '@supabase/supabase-js';
import { hasOrderManagerRole } from '../../src/data/order-management.js';
import { dealerSummary } from '../../src/data/dealers.js';
import { getEnv, jsonResponse, readBearerToken, readJsonBody, rejectCrossOrigin } from './_shared/http.js';

const METHODS = 'GET, PUT, OPTIONS';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (status, error) => jsonResponse(status, { error }, METHODS);
export function createDealersHandler({ createClient = defaultCreateClient } = {}) {
  return async request => {
    const blocked = rejectCrossOrigin(request, METHODS);
    if (blocked) return blocked;
    if (request.method === 'OPTIONS') return jsonResponse(204, null, METHODS);
    if (!['GET', 'PUT'].includes(request.method)) return fail(405, 'Method not allowed.');
    if (!readBearerToken(request)) return fail(401, 'Sign in to continue.');
    if (!getEnv('SUPABASE_URL') || !getEnv('SUPABASE_SERVICE_ROLE_KEY')) return fail(503, 'Dealer system is unavailable.');
    const supabase = createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
    try {
      const { data, error } = await supabase.auth.getUser(readBearerToken(request));
      const user = data?.user;
      if (error || !user?.id || user.is_anonymous) return fail(401, 'Your session has expired. Sign in again.');
      const staff = hasOrderManagerRole(user) && !!user.email_confirmed_at;
      if (request.method === 'PUT') {
        if (!staff) return fail(403, 'Only staff can change dealer pricing.');
        const parsed = await readJsonBody(request, 4096);
        if (parsed.error) return fail(400, parsed.error);
        const body = parsed.data;
        if (!UUID.test(body.userId || '') || typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 120
            || typeof body.active !== 'boolean' || typeof body.percentOff !== 'number'
            || !Number.isFinite(body.percentOff) || body.percentOff <= 0 || body.percentOff >= 100
            || Math.abs(body.percentOff * 100 - Math.round(body.percentOff * 100)) > 0.000001) return fail(400, 'Enter a valid account, name and discount between 0 and 100 (up to two decimals).');
        const account = await supabase.auth.admin.getUserById(body.userId);
        if (account.error || !account.data?.user?.email_confirmed_at || account.data.user.is_anonymous) return fail(400, 'Choose an existing account with a confirmed email.');
        const saved = await supabase.rpc('save_dealer_account', { p_user_id: body.userId, p_name: body.name.trim(), p_percent_off: body.percentOff, p_active: body.active, p_actor: user.id });
        if (saved.error) throw saved.error;
        return jsonResponse(200, { dealer: { ...saved.data, email: account.data.user.email } }, METHODS);
      }
      const params = new URL(request.url).searchParams;
      if (params.get('staff') === '1') {
        if (!staff) return fail(403, 'Only staff can view other dealers.');
        const dealers = await supabase.from('dealer_accounts').select('*').order('display_name');
        if (dealers.error) throw dealers.error;
        const ids = (dealers.data || []).map(dealer => dealer.user_id);
        const profiles = ids.length ? await supabase.from('profiles').select('id,email').in('id', ids) : { data: [] };
        if (profiles.error) throw profiles.error;
        const dealerList = (dealers.data || []).map(dealer => ({ ...dealer, email: profiles.data?.find(profile => profile.id === dealer.user_id)?.email || '' }));
        let customer = null;
        const email = params.get('email')?.trim();
        if (email) {
          if (email.length > 254) return fail(400, 'Email is too long.');
          const result = await supabase.from('profiles').select('id,full_name,email').eq('email', email).maybeSingle();
          if (result.error) throw result.error;
          customer = result.data;
        }
        return jsonResponse(200, { dealers: dealerList, customer }, METHODS);
      }
      const dealerId = staff && params.get('dealerId') ? params.get('dealerId') : user.id;
      if (!UUID.test(dealerId)) return fail(400, 'Invalid dealer account.');
      const dealer = await supabase.from('dealer_accounts').select('*').eq('user_id', dealerId).maybeSingle();
      if (dealer.error) throw dealer.error;
      if (!dealer.data) return jsonResponse(200, { dealer: null, orders: [], summary: dealerSummary([]) }, METHODS);
      // No caller-controlled owner filter for ordinary customers. All historical
      // orders contribute to totals; the response caps each page at 50 orders.
      const start = Number(params.get('offset') || 0);
      if (!Number.isSafeInteger(start) || start < 0) return fail(400, 'Invalid page.');
      const orders = await supabase.from('orders').select('id,order_number,created_at,status,payment_status,payment_method,payment_amount_received,fulfillment_status,fulfillment_method,total,customer_name,ship_address,ship_city,ship_state,ship_zip,estimated_ship_date,dealer_sale')
        .eq('user_id', dealerId).not('dealer_sale', 'is', null).order('created_at', { ascending: false }).order('id', { ascending: false }).range(start, start + 50);
      if (orders.error) throw orders.error;
      const summary = await supabase.rpc('dealer_account_summary', { p_user_id: dealerId });
      if (summary.error) throw summary.error;
      return jsonResponse(200, { dealer: dealer.data, orders: (orders.data || []).slice(0, 50), summary: summary.data, nextOffset: orders.data?.length > 50 ? start + 50 : null }, METHODS);
    } catch (error) {
      console.error('dealers:', error?.message);
      return fail(503, 'Dealer details could not be loaded. Try again.');
    }
  };
}
export default createDealersHandler();
export const config = { path: '/.netlify/functions/dealers', rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
