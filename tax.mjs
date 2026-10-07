// Sales tax for the Lavish Leaf store: ONE set of rules, used by the cart in
// the browser (cart.js imports this file) and by the checkout and subscribe
// functions on the server. Like shipping.mjs, the server's answer is the one
// PayPal charges; the cart only shows the same sum in advance.
//
// The owner's rule, 2026-10-07: "Our sales tax rate of 6% applies to every
// product (except groceries) regardless of location and how it is paid or
// delivered/shipped." Oklahoma 4.5% plus Pittsburg County 1.5%. Lavish Leaf
// has a physical place in Oklahoma only, so no other state's rate is ever
// charged. A product marked "grocery": true in products.json carries the
// grocery rate instead (Oklahoma removed its STATE tax on groceries in 2024).
// Shipping charges are not taxed here.

export const TAX = {
  // Basis points: 450 = 4.5%.
  stateBp: 450,
  localBp: 150,
  // Groceries: no STATE tax since 29 Aug 2024 (HB 1955), but the Tax
  // Commission says "All local sales and use taxes still apply", so the
  // county 1.5% stays (oklahoma.gov/tax, food and food ingredients). Live
  // plants and garden seeds are NOT groceries: they carry the full 6%.
  groceryBp: 150,
  label: 'Sales tax (Oklahoma 6%)',
};

export const RATE_BP = TAX.stateBp + TAX.localBp;

/** Whole cents, half a cent rounding up. */
const at = (cents, bp) => Math.round((cents * bp) / 10000);
export const taxOn = (cents) => at(cents, RATE_BP);

/**
 * The tax on an order.
 *   lines: [{ product: { price, grocery? }, qty }]
 * Returns { cents, taxableCents, label }.
 */
export function taxQuote(lines) {
  let full = 0, grocery = 0;
  for (const { product, qty } of lines) {
    if (product.grocery === true) grocery += product.price * qty;
    else full += product.price * qty;
  }
  return { cents: taxOn(full) + at(grocery, TAX.groceryBp), taxableCents: full + grocery, label: TAX.label };
}
