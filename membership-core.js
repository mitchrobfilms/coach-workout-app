// Shared membership rules for the browser, admin page and tests.
// Codes are generated only on the server. This module never invents a code or a price.
export const DURATION_MAX_DAYS = 3650;

export function assertAdmin(isAdmin) {
  if (isAdmin !== true) { const e = new Error('admin only'); e.code = 'admin_only'; throw e; }
}

export function validateCodeCreate({ lifetime = false, durationDays = null, maxRedemptions = null, redeemBy = null, now = new Date() } = {}) {
  const errors = [];
  const life = lifetime === true;
  const daysGiven = durationDays !== null && durationDays !== '';
  if (life && daysGiven) errors.push('Choose a number of days or lifetime, not both.');
  if (!life) {
    const d = Number(durationDays);
    if (!Number.isInteger(d) || d < 1 || d > DURATION_MAX_DAYS) errors.push(`Enter how many days this code grants (1 to ${DURATION_MAX_DAYS}), or explicitly choose lifetime.`);
  }
  const max = Number(maxRedemptions);
  if (!Number.isInteger(max) || max < 1 || max > 100000) errors.push('Enter how many people can redeem this code.');
  if (redeemBy) {
    const t = new Date(redeemBy);
    if (Number.isNaN(+t) || t.getTime() <= +now) errors.push('Redeem-by must be in the future, or leave it empty.');
  }
  return { ok: !errors.length, errors, lifetime: life, durationDays: life ? null : Number(durationDays), maxRedemptions: Number.isInteger(max) ? max : null };
}

export function evaluateRedemption({ offer, alreadyRedeemed = false, usedCount = 0, now = new Date() } = {}) {
  if (!offer || offer.active === false || offer.revoked) return { ok: false, reason: 'invalid' };
  if (offer.redeemBy && new Date(offer.redeemBy).getTime() <= +now) return { ok: false, reason: 'expired' };
  if (alreadyRedeemed) return { ok: false, reason: 'replay' };
  if (!(offer.maxRedemptions > 0) || usedCount >= offer.maxRedemptions) return { ok: false, reason: 'limit' };
  if (offer.lifetime === true) return { ok: true, kind: 'complimentary', endsAt: null, lifetime: true };
  const days = Number(offer.durationDays);
  if (!Number.isInteger(days) || days < 1) return { ok: false, reason: 'unconfigured' };
  return { ok: true, kind: 'complimentary', lifetime: false, endsAt: new Date(+now + days * 864e5).toISOString() };
}

// Preview never rewrites the real entitlement. Non-admins cannot preview.
export function withPreview({ entitlement, previewMode = null, isAdmin = false } = {}) {
  const preview = isAdmin === true && (previewMode === 'free' || previewMode === 'premium') ? previewMode : null;
  return { entitlement: entitlement || null, preview, livePaywall: false };
}

export function hasRealPremium(entitlement, now = new Date()) {
  if (!entitlement || entitlement.kind === 'none') return false;
  if (entitlement.lifetime === true && entitlement.active !== false) return true;
  if (!entitlement.endsAt) return false;
  return entitlement.active !== false && new Date(entitlement.endsAt).getTime() > +now;
}
