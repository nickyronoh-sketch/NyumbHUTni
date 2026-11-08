# NyumbHUTni M-Pesa STK Push — setup guide

The website shows **no payment buttons** until you switch them on in `assets/pay.js`.
Everything below can be done in practice mode (no real money) before KCB BUNI credentials arrive.

## How it fits together

```
Customer's browser  ──►  Google Apps Script (Code.gs)  ──►  KCB BUNI  ──►  STK prompt on customer's phone
(products page)     ◄──  checks status every 3 s        ◄──  KCB sends result (callback)
                          writes every order to Google Sheet: "Orders" tab
                          reads prices from Google Sheet: "Products" tab
```

* Secret keys live only in Apps Script **Script Properties**, never on the website.
* Prices live only in the **Products** tab. Change a price there and the site updates.
* A product gets a "Pay with M-Pesa" button only if it has a price and `YES` in the Products tab.

## Part A — practice mode (do now)

1. Create a new Google Sheet called `NyumbHUTni Payments`.
2. **Extensions → Apps Script**. Delete what is there, paste the whole of `backend/Code.gs`, click **Save**.
3. In the function dropdown at the top choose **setup**, click **Run**, and allow the permissions.
   The sheet now has **Products** and **Orders** tabs.
4. In the **Products** tab, put a price and `YES` against one product to test.
5. **Deploy → New deployment → Web app**
   * Execute as: **Me**
   * Who has access: **Anyone**
   * Click **Deploy** and copy the **Web app URL** (ends in `/exec`).
6. **Project Settings (⚙) → Script Properties → Add property**: `WEB_APP_URL` = that link.
7. In `assets/pay.js` set `enabled: true` and paste the link into `endpoint`. Commit.
8. Open the Products page, click **Pay with M-Pesa**, and fill the form. After about 8 seconds it shows
   a practice "payment received", and a row appears in the **Orders** tab.

## Part B — going live (when KCB BUNI credentials arrive)

In **Script Properties**, add or update:

| Property | Value |
|---|---|
| `BUNI_BASE_URL` | `https://uat.buni.kcbgroup.com` for testing; KCB gives the live address |
| `CONSUMER_KEY` | from the BUNI portal |
| `CONSUMER_SECRET` | from the BUNI portal |
| `ACCOUNT_REF` | your KCB account number used with paybill 522533 |
| `ORG_PASSKEY` | only if KCB gives you one |
| `INVOICE_FORMAT` | only if KCB says the reference must look different (default `{account}-{order}`) |
| `MODE` | change `mock` to `live` |

No code changes are needed. To pause payments at any time, set `MODE` back to `mock`, or
`enabled: false` in `pay.js`.

**Confirm with KCB:** the exact format of `invoiceNumber` (the account reference) for paybill 522533.

## After changing Code.gs

**Deploy → Manage deployments → ✏️ → Version: New version → Deploy.** The link stays the same.
