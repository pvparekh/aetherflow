import { describe, expect, it } from "vitest";
import { displayVendor, vendorKey } from "./index";

// Raw descriptors as banks, card issuers and processors print them.
const DESCRIPTORS: [raw: string, display: string][] = [
  // Processor prefixes
  ["SQ *BLUE BOTTLE 0423 SAN FRANCISCO CA", "Blue Bottle"],
  ["SQ * VERVE COFFEE ROASTERS", "Verve Coffee Roasters"],
  ["TST* JOE'S PIZZA #12", "Joe's Pizza"],
  ["TST*TARTINE BAKERY SAN FRANCISCO CA", "Tartine Bakery"],
  ["PAYPAL *SPOTIFY", "Spotify"],
  ["PP*ETSY SELLER 4029357733", "Etsy Seller"],
  ["SP * ALLBIRDS", "Allbirds"],
  ["BT*DIGITALOCEAN.COM", "DigitalOcean"],
  ["DD *DOORDASH DASHPASS", "DoorDash"],
  ["IN *ACME PLUMBING LLC", "Acme Plumbing"],
  ["FS *SKETCH", "Sketch"],
  ["PADDLE.NET* SETAPP", "Setapp"],
  // Bank prefixes and posting dates
  ["POS DEBIT NETFLIX.COM 866-579-7172 CA", "Netflix"],
  ["POS PURCHASE WHOLEFDS MKT 10234 AUSTIN TX", "Whole Foods"],
  ["DEBIT CARD PURCHASE CHIPOTLE 1234 DENVER CO", "Chipotle"],
  ["CHECKCARD 1001 STARBUCKS STORE 12345 SEATTLE WA", "Starbucks"],
  ["PURCHASE AUTHORIZED ON 10/01 SQ *BLUE BOTTLE OAKLAND CA", "Blue Bottle"],
  ["RECURRING PAYMENT AUTHORIZED ON 09/15 ADOBE *CREATIVE CLD", "Adobe"],
  ["10/03 LOCAL HARDWARE CO", "Local Hardware"],
  ["ACH DEBIT COMCAST CABLE", "Xfinity"],
  ["VISA PURCHASE SHELL OIL 57444 HOUSTON TX", "Shell"],
  // Software and subscriptions
  ["AMZN Mktp US*2K4AB91", "Amazon"],
  ["AMAZON.COM*MK1AB2CD3 AMZN.COM/BILL WA", "Amazon"],
  ["Amazon Prime*1A2B3C4D5", "Amazon Prime"],
  ["AWS EMEA aws.amazon.co", "Amazon Web Services"],
  ["GOOGLE *CLOUD 4H7KQ", "Google Cloud"],
  ["GOOGLE *GSUITE_acme.co", "Google Workspace"],
  ["GOOGLE *ADS1234567", "Google Ads"],
  ["GOOGLE *Google Storage g.co/helppay#", "Google One"],
  ["GOOGLE *YouTubePremium g.co/helppay#", "YouTube"],
  ["GOOGLE *YouTube TV", "YouTube TV"],
  ["APPLE.COM/BILL 866-712-7753 CA", "Apple"],
  ["NETFLIX.COM", "Netflix"],
  ["HULU 877-8244858 CA", "Hulu"],
  ["DISNEY PLUS 888-905-7888 CA", "Disney+"],
  ["HBO MAX 855-442-6629 NY", "Max"],
  ["SPOTIFY USA", "Spotify"],
  ["OPENAI *CHATGPT SUBSCR", "OpenAI"],
  ["CHATGPT SUBSCRIPTION", "OpenAI"],
  ["ADOBE *ACROPRO SUBS 800-833-6687 CA", "Adobe"],
  ["FIGMA MONTHLY", "Figma"],
  ["Figma", "Figma"],
  ["CANVA* I03984-1234", "Canva"],
  ["SLACK T0123ABCD", "Slack"],
  ["NOTION LABS, INC.", "Notion"],
  ["GITHUB INC", "GitHub"],
  ["ATLASSIAN 415-701-1110 CA", "Atlassian"],
  ["MSFT *<E0300ABCD>", "Microsoft"],
  ["MICROSOFT*365 PERSONAL", "Microsoft"],
  ["ZOOM.US 888-799-9666 CA", "Zoom"],
  ["DROPBOX*7Q2W3E4R5T", "Dropbox"],
  ["VERCEL INC.", "Vercel"],
  ["SQSP* INV12345678", "Squarespace"],
  ["DNH*GODADDY.COM", "GoDaddy"],
  ["INTUIT *QBooks Online", "QuickBooks"],
  ["LINKEDIN PRE 1234567", "LinkedIn"],
  ["FACEBK *ZX12AB34CD", "Meta Ads"],
  // Transport, travel and lodging
  ["UBER *EATS PENDING", "Uber Eats"],
  ["UBER *TRIP HELP.UBER.COM CA", "Uber"],
  ["LYFT *RIDE TUE 5PM", "Lyft"],
  ["DELTA AIR 0062345678901", "Delta Air Lines"],
  ["UNITED 0162345678901", "United Airlines"],
  ["SOUTHWES 5262345678901", "Southwest Airlines"],
  ["AMTRAK .COM 0123456789", "Amtrak"],
  ["AIRBNB * HMABCDE123", "Airbnb"],
  ["MARRIOTT SAN DIEGO DOWNTOWN", "Marriott"],
  ["HILTON HOTELS 0123 NEW YORK NY", "Hilton"],
  ["CHEVRON 0091234 SAN JOSE CA", "Chevron"],
  // Everyday merchants
  ["COSTCO WHSE #0123 MOUNTAIN VIEW CA", "Costco"],
  ["WAL-MART #1234", "Walmart"],
  ["TARGET 00012345 BROOKLYN NY", "Target"],
  ["TRADER JOE S #123 QPS", "Trader Joe's"],
  ["IC* COSTCO BY INSTACART", "Instacart"],
  ["CVS/PHARMACY #01234", "CVS"],
  ["THE HOME DEPOT #6543", "The Home Depot"],
  ["STAPLES 00123 BOSTON MA", "Staples"],
  ["FEDEX OFFICE 1234", "FedEx"],
  ["USPS PO 1234567890", "USPS"],
  ["VERIZON WRLS P1234-01", "Verizon"],
  ["AT&T *BILL PAYMENT", "AT&T"],
  ["PGANDE WEB ONLINE", "PG&E"],
  ["PG&E WEBRECURRING", "PG&E"],
  ["MCDONALD'S F12345", "McDonald's"],
  ["7-ELEVEN 12345", "7-Eleven"],
  ["24 HOUR FITNESS USA", "24 Hour Fitness"],
  // Local merchants: location and legal suffixes removed
  ["BLUE BOTTLE COFFEE   MOUNTAIN VIEW CA", "Blue Bottle Coffee"],
  ["RITUAL COFFEE ROASTERS SAN FRANCISCO CA 94110", "Ritual Coffee Roasters"],
  ["GREEN LEAF DELI CHICAGO IL", "Green Leaf Deli"],
  ["BANK OF AMERICA ATM FEE", "Bank of America Atm Fee"],
  ["BOSTON MARKET 0456", "Boston Market"],
  ["Acme Design Studio Ltd", "Acme Design Studio"],
  ["PRINTFUL INC", "Printful"],
];

describe("displayVendor", () => {
  it("covers at least 60 raw descriptors", () => {
    expect(DESCRIPTORS.length).toBeGreaterThanOrEqual(60);
  });

  it.each(DESCRIPTORS)("%s -> %s", (raw, expected) => {
    expect(displayVendor(raw)).toBe(expected);
  });

  it("falls back to the raw text when nothing meaningful remains", () => {
    expect(displayVendor("#1234")).toBe("#1234");
    expect(displayVendor("   ")).toBe("Unknown");
  });
});

describe("vendorKey", () => {
  it.each([
    ["GOOGLE *CLOUD 4H7KQ", "Google Cloud"],
    ["TST* JOE'S PIZZA #12", "Joe's Pizza"],
    ["JOE S PIZZA", "Joe's Pizza"],
    ["SQ *BLUE BOTTLE 0423 SAN FRANCISCO CA", "BLUE BOTTLE OAKLAND CA"],
    ["POS DEBIT NETFLIX.COM 866-579-7172 CA", "Netflix"],
    ["DD *DOORDASH DASHPASS", "DOORDASH*DASHPASS"],
  ])("gives %s and %s the same key", (a, b) => {
    expect(vendorKey(a)).toBe(vendorKey(b));
  });

  it.each([
    ["Uber Eats", "Uber"],
    ["Amazon Prime", "AMZN Mktp US*2K4AB91"],
    ["GOOGLE *YouTube TV", "GOOGLE *YouTubePremium"],
    ["Amazon Web Services", "Amazon"],
    ["Delta Dental", "DELTA AIR 0062345678901"],
  ])("keeps %s and %s apart", (a, b) => {
    expect(vendorKey(a)).not.toBe(vendorKey(b));
  });

  it("is lowercase alphanumeric and single-spaced", () => {
    expect(vendorKey("AT&T *BILL PAYMENT")).toBe("att");
    expect(vendorKey("Disney Plus")).toBe("disney");
    expect(vendorKey("RITUAL  COFFEE ROASTERS SAN FRANCISCO CA")).toBe(
      "ritual coffee roasters",
    );
  });
});
