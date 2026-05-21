# Cloud reminders setup (Google Sheets + Apps Script)

This setup runs reminder emails from Google's servers, so they fire even when
your laptop is off. End-to-end takes ~10 minutes.

You already chose to use a **dedicated Google account** for PolicyHub. Sign
into that account in your browser before starting.

---

## Step 1 — Create the Sheet

1. Go to <https://sheets.google.com/> and create a new blank spreadsheet.
2. Give it a memorable name, e.g. **"PolicyHub Sync"**.

## Step 2 — Install the Apps Script

1. In the Sheet, open **Extensions → Apps Script**. A new browser tab opens.
2. You'll see a default `Code.gs` file with a `function myFunction()` stub.
   **Delete everything** in that file.
3. Open `docs/cloud-reminders/apps-script.gs` from this PolicyHub repository.
   Copy the entire file contents.
4. Paste into the Apps Script editor. Press **Ctrl+S** (or ⌘+S) to save.
5. Give the project a name when prompted — e.g. **"PolicyHub"**.

## Step 3 — Run setup once

1. In the Apps Script editor's toolbar, choose **`setup`** in the function
   dropdown.
2. Click the **Run** button (▶).
3. Google will prompt: *"Authorization required"*. Click **Review permissions**.
4. Choose the PolicyHub Google account.
5. You'll see a warning *"Google hasn't verified this app"* — this is normal
   for personal scripts. Click **Advanced → Go to PolicyHub (unsafe)**.
6. Approve the permissions:
   - **Manage your spreadsheets in Google Drive** (so the script can write to
     your Sheet)
   - **Send email as you** (so it can send reminder emails)
7. Wait ~5 seconds — you'll see a dialog: *"PolicyHub setup complete."* Close
   it.

Switch back to the Sheet tab — you'll see 6 new tabs at the bottom:

- **Settings** — where the shared secret + agent email live
- **Policies** — synced from PolicyHub
- **Installments** — synced from PolicyHub
- **Repayments** — synced from PolicyHub
- **SyncLog** — append-only log of each sync push
- **ReminderLog** — append-only log of each reminder email sent

## Step 4 — Deploy as a Web App

1. Back in the Apps Script editor, click **Deploy → New deployment**.
2. Click the gear ⚙ next to *"Select type"* → choose **Web app**.
3. Fill in:
   - **Description:** `PolicyHub sync`
   - **Execute as:** **Me** (your PolicyHub account)
   - **Who has access:** **Anyone with the link**
4. Click **Deploy**.
5. Google shows a panel with **Web app URL** ending in `/exec`. Click the
   copy icon next to it.
6. Click **Done**.

## Step 5 — Paste the URL into PolicyHub

1. Open PolicyHub → **Settings** → scroll to the **Cloud reminders** card.
2. Paste the URL into **Apps Script Web App URL**.
3. Click **Generate** next to **Shared secret**. A long random string appears
   in the field and is copied to your clipboard. (If clipboard didn't work,
   click the copy icon ⎘ next to the field.)
4. Click **Save settings** at the bottom of the page.

## Step 6 — Paste the secret into the Sheet

1. Go back to the Sheet.
2. Click the **Settings** tab.
3. Click cell **B1** (next to "shared_secret").
4. Paste (Ctrl+V) the secret. Press Enter to commit.
5. Click cell **B2** (next to "agent_email") and type the email that should
   receive the reminders. Press Enter.

## Step 7 — Test it end-to-end

1. Back in PolicyHub → Settings → Cloud reminders card.
2. Click **Test connection**. You should see a green toast: *"Cloud connection
   OK"*.
3. Click **Sync now**. After ~3–10 seconds you'll see a toast: *"Synced — N
   policies, M installments, K repayments"*.
4. Go to the Sheet and check the **Policies** and **Installments** tabs —
   your data should be there.

## Step 8 — Verify a reminder will actually send

The daily trigger runs at 9 a.m. (the script's timezone) on the 1st, 10th, and
20th of each month. To test it manually:

1. In the Apps Script editor, choose function **`sendReminders`** in the
   dropdown.
2. Click **Run**.
3. If today's date is not 1/10/20, nothing happens (look at the **ReminderLog**
   tab — no new row). To force a test send:
   - Open `apps-script.gs` in the editor.
   - Find `const REMINDER_DAYS_OF_MONTH = [1, 10, 20];` near the top.
   - Temporarily change it to include today's day — e.g. if today is the 23rd:
     `[1, 10, 20, 23]`.
   - Save (Ctrl+S).
   - Click **Run** on `sendReminders`.
   - Check your inbox — an email titled
     "PolicyHub: Premium summary for … (day 23)" should arrive within a few
     seconds.
   - Change the constant back to `[1, 10, 20]` and save.

If you got the email, you're done. The trigger Google installed during
`setup()` will now run automatically every morning.

---

## Daily life

- **When you add/edit/pay policies in PolicyHub**, click **Sync now** in
  Settings to push the latest data to the Sheet.
- Or turn on **Auto-sync on quit** — every time you quit PolicyHub from the
  tray, it pushes the latest data before exiting.
- Open the **SyncLog** tab in the Sheet to see when the last push happened.
- Open the **ReminderLog** tab to see what emails have been sent.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Test failed: No shared_secret set in the Sheet's Settings tab" | You didn't paste the secret yet | Step 6 |
| "Test failed: Invalid secret" | Secret in PolicyHub doesn't match cell B1 | Re-copy from PolicyHub, paste into B1 |
| "Response wasn't JSON" | Deployment isn't set to "Anyone with the link", or URL doesn't end in `/exec` | Redeploy with correct access settings |
| Sync succeeds, but reminder email doesn't arrive | `agent_email` cell B2 is wrong or empty | Set it |
| Reminder email arrives once, then stops | The Apps Script trigger needs re-authorisation (Google does this every ~90 days for unverified scripts) | In Apps Script: Triggers (clock icon left sidebar) → see the broken trigger → click the menu → Run the function manually once → reauth |
| "Quota exceeded" in ReminderLog | Free Gmail caps at 100 emails/day | Either upgrade to Workspace (1500/day), or reduce reminder days |
| Auto-sync on quit doesn't fire | Quit didn't go through (window close just hides) | Click tray icon → Quit PolicyHub. Look at SyncLog to confirm. |

## What gets synced — privacy & data

PolicyHub pushes the following to your Sheet:

- All **active** and **active-PPT-over** policies (basic identifiers, premium info, sum assured, maturity date)
- All **pending and overdue** installments
- Recently paid installments (last 90 days, for context)
- All non-cancelled repayments

It does NOT push:

- Attachments (the PDF/image files you uploaded — they stay local)
- SMTP credentials
- Settings or templates
- Lapsed/surrendered/matured policies (to keep the Sheet tidy)

The Sheet lives in your dedicated Google account. Only you and anyone you
explicitly share the Sheet with can see it. The Web App URL grants ability
to **push** data, but the **shared secret** check stops random people from
filling your Sheet with junk.

## Removing it later

If you want to disconnect cloud reminders:

1. PolicyHub → Settings → Cloud reminders → clear the Web App URL → Save
   settings. PolicyHub stops pushing.
2. In the Apps Script editor → Deploy → Manage deployments → archive the
   deployment. The URL stops accepting requests.
3. In the Sheet → Apps Script → Triggers (clock icon) → delete the
   `sendReminders` trigger. Emails stop.
4. Delete the Sheet, or keep it as a historical archive.

Your local PolicyHub data is untouched throughout.
