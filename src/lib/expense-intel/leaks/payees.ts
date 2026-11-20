// Payees that repeat but are not merchants: money sent to people, cash,
// card payments, housing and debt. Rent paid on the 1st is regular, but it is
// not a subscription, and two equal transfers to friends are not a duplicate
// charge. Tested against vendorKey plus display name, both lowercase.
import type { Txn } from "../contracts";

const TRANSFERS_AND_CASH =
  /\b(zelle|venmo|cash ?app|square cash|wire|transfer|xfer|atm|withdrawal|cash advance|check|cheque)\b/;

const CARD_PAYMENTS =
  /\b(credit (card|crd) (payment|pmt|autopay)|card payment|payment thank you|payment to)\b/;

// "rent" alone, but not "Rent the Runway" or car rental desks.
const HOUSING_AND_DEBT =
  /\b(rent(?! the runway| a car)|rental payment|lease|landlord|apartments?|apts|property (management|mgmt)|prop mgmt|properties|realty|hoa|homeowners|mortgage|loan)\b/;

export function isNonMerchant(txn: Pick<Txn, "vendor" | "vendorKey">): boolean {
  const text = `${txn.vendorKey} ${txn.vendor.toLowerCase()}`;
  return (
    TRANSFERS_AND_CASH.test(text) || CARD_PAYMENTS.test(text) || HOUSING_AND_DEBT.test(text)
  );
}

/**
 * Housing is never a subscription, however regular. Accommodation also covers
 * hotels, whose double charges still matter, so it is excluded only here.
 */
export function canBeSubscription(txn: Pick<Txn, "vendor" | "vendorKey" | "category">): boolean {
  return txn.category !== "Accommodation" && !isNonMerchant(txn);
}
