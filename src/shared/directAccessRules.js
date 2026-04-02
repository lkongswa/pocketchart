"use strict";
/**
 * Direct Access Rules by State and Discipline
 *
 * Determines whether a physician referral/order is required before a therapist
 * can treat a patient in a given state. This data drives the referral enforcement
 * gate in the compliance engine.
 *
 * Sources: APTA, AOTA, ASHA state-by-state practice act summaries.
 * Last updated: 2025-01 — Review annually as state laws change.
 *
 * `true` = referral IS required (no direct access)
 * `false` = direct access allowed (no referral needed)
 *
 * When a state is not listed for a discipline, the default is `true` (referral required)
 * to be conservative.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.requiresReferral = requiresReferral;
exports.getAllRules = getAllRules;
// ── Physical Therapy Direct Access ──
// All 50 states + DC allow some form of PT direct access as of 2024,
// but many have limitations (time-limited, evaluation only, etc.)
// We mark states with UNRESTRICTED direct access as false.
// States with significant restrictions are marked true to be safe.
const PT_DIRECT_ACCESS_STATES = {
    // States with unrestricted or broad direct access for PT
    AK: false, AZ: false, CO: false, HI: false, ID: false,
    IA: false, KS: false, KY: false, MD: false, MA: false,
    MI: false, MN: false, MT: false, NE: false, NH: false,
    NM: false, NC: false, ND: false, OH: false, OR: false,
    SD: false, TX: false, UT: false, VT: false, VA: false,
    WV: false, WI: false, WY: false,
    // States with limited/provisional direct access (treat as requiring referral to be safe)
    AL: true, AR: true, CA: true, CT: true, DE: true,
    FL: true, GA: true, IL: true, IN: true, LA: true,
    ME: true, MS: true, MO: true, NV: true, NJ: true,
    NY: true, OK: true, PA: true, RI: true, SC: true,
    TN: true, WA: true, DC: true,
};
// ── Occupational Therapy Direct Access ──
// Fewer states allow OT direct access than PT
const OT_DIRECT_ACCESS_STATES = {
    // States allowing OT direct access / evaluation without referral
    AZ: false, CO: false, HI: false, ID: false, KS: false,
    MD: false, MT: false, NE: false, NH: false, NV: false,
    OH: false, OR: false, SD: false, TX: false, UT: false,
    VT: false, WI: false, WY: false,
    // Most states require referral for OT — default is true
};
// ── Speech-Language Pathology Direct Access ──
// Most states allow SLP direct access for evaluation;
// treatment often requires referral
const ST_DIRECT_ACCESS_STATES = {
    // States allowing SLP direct access
    AK: false, AZ: false, CO: false, HI: false, ID: false,
    KS: false, MD: false, MT: false, NE: false, NH: false,
    NV: false, OH: false, OR: false, SD: false, TX: false,
    UT: false, VT: false, WI: false, WY: false,
    // Most states require referral for SLP treatment
};
const DISCIPLINE_MAPS = {
    PT: PT_DIRECT_ACCESS_STATES,
    OT: OT_DIRECT_ACCESS_STATES,
    ST: ST_DIRECT_ACCESS_STATES,
};
/**
 * Check if a referral is required for a given state and discipline.
 * Returns true (referral required) by default if state is not found.
 */
function requiresReferral(state, discipline) {
    const map = DISCIPLINE_MAPS[discipline];
    if (!map)
        return true;
    const stateUpper = state.toUpperCase();
    // If state is not in the map, default to requiring referral (conservative)
    return map[stateUpper] ?? true;
}
/**
 * Get all rules as a flat array for UI display
 */
function getAllRules() {
    const rules = [];
    const allStates = [
        'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN',
        'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH',
        'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT',
        'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
    ];
    const disciplines = ['PT', 'OT', 'ST'];
    for (const state of allStates) {
        for (const disc of disciplines) {
            rules.push({
                state,
                discipline: disc,
                requires_referral: requiresReferral(state, disc),
            });
        }
    }
    return rules;
}
//# sourceMappingURL=directAccessRules.js.map