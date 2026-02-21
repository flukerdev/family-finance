# MATH AUDIT — Flip Family Finance App

**Generated:** 2026-02-02
**Reviewed by:** Mat
**Status:** READY FOR /apply-math-fixes

**How to use this file:**
1. Save this file as `MATH_AUDIT.md` in your project root (replace the old one)
2. Run `/apply-math-fixes` in Claude Code
3. Claude Code will implement all corrections marked with ❌

---

## SUMMARY OF CORRECTIONS

| Category | Count |
|----------|-------|
| **Values that are CORRECT** | 18 |
| **Values that need FIXING** | 6 |
| **New features needed (Settings UI)** | 12 configurable fields |
| **Logic changes needed** | 4 |
| **CLAUDE.md updates needed** | 2 |

### High-Level Changes:
1. **Health score reweight:** 70/10/10/10 instead of 60/15/15/10
2. **Disposable income fix:** Subtract statement balance only, not total
3. **Credit card display:** Show both statement AND total, handle $0 statement correctly
4. **Add "OVERDUE" indicator** for past-due unpaid statements
5. **Add manual payment entry** for credit cards (Plaid can't connect to Amex yet)
6. **Move 12 hardcoded values to Settings** so they're user-configurable

### CLAUDE.md Corrections Needed:
1. Mara's pay should be $1,302.06 (not $1,320.88)
2. Discover due date should be 2nd (not 4th)

---

## CATEGORY: Income Configuration

### 1. Mat's Biweekly Pay Amount
- **File:** App.jsx:13
- **Current:** `matPayAmount: 2018.55`
- **✅ Correct** — Value is right
- **❌ Correction:** Make this editable in Settings tab. Store in Supabase config table so it persists.

---

### 2. Mara's Biweekly Pay Amount
- **File:** App.jsx:14
- **Current:** `maraPayAmount: 1302.06`
- **✅ Correct** — $1,302.06 is the correct amount
- **❌ Correction:** Make this editable in Settings tab. Store in Supabase config table so it persists.
- **Notes:** CLAUDE.md incorrectly says $1,320.88 — update CLAUDE.md too.

---

## CATEGORY: Income Splits

### 3. Give Percentage Split
- **File:** App.jsx:16
- **Current:** `give: 0.20` (20%)
- **✅ Correct** — No changes needed

---

### 4. Save Percentage Split
- **File:** App.jsx:17
- **Current:** `save: 0.20` (20%)
- **✅ Correct** — No changes needed

---

### 5. Mat's LIVE Contribution
- **File:** App.jsx:18
- **Current:** `matLive: 984.00`
- **✅ Correct** — Value is right
- **❌ Correction:** Make this editable in Settings tab. Store in Supabase config table.

---

### 6. Mara's LIVE Contribution
- **File:** App.jsx:19
- **Current:** `maraLive: 656.00`
- **✅ Correct** — Value is right
- **❌ Correction:** Make this editable in Settings tab. Store in Supabase config table.

---

### 7. Personal Account Split Calculation
- **File:** App.jsx:74-83 `getPersonalSplits()`
- **Current formula:** Remainder after Give+Save+LIVE, split 50/50
- **✅ Correct** — Logic is right, no changes needed

---

## CATEGORY: Credit Card Due Dates

### 8. Blue Amex Due Date
- **File:** App.jsx:22
- **Current:** `blue: 8`
- **✅ Correct** — Due on the 8th

---

### 9. Gold Amex Due Date
- **File:** App.jsx:23
- **Current:** `gold: 15`
- **✅ Correct** — Due on the 15th

---

### 10. Discover Due Date
- **File:** App.jsx:24
- **Current:** `discover: 2`
- **✅ Correct** — Due on the 2nd
- **Notes:** CLAUDE.md incorrectly says 4th — update CLAUDE.md too.

---

### 11. Rent Due Date
- **File:** App.jsx:25
- **Current:** `rent: 'last'` (last day of month)
- **✅ Correct** — No changes needed

---

## CATEGORY: Monthly Bills

### 12. Rent Amount
- **File:** App.jsx:28
- **Current:** `rent: 2135`
- **✅ Correct** — Value is right
- **❌ Correction:** Make this editable in Settings tab.

---

### 13. Insurance Amount
- **File:** App.jsx:29
- **Current:** `insurance: 28`
- **✅ Correct** — Value is right (car insurance will be rolled into this when it starts)
- **❌ Correction:** Make this editable in Settings tab.

---

### 14. Gym Amount
- **File:** App.jsx:30
- **Current:** `gym: 100`
- **✅ Correct** — Value is right
- **❌ Correction:** Make this editable in Settings tab.

---

### 15. Date Nights Budget
- **File:** App.jsx:31
- **Current:** `dateNights: 200`
- **✅ Correct** — Value is right
- **❌ Correction:** Make this editable in Settings tab.

---

### 16. Power Bill Estimate
- **File:** App.jsx:32
- **Current:** `power: 120`
- **✅ Correct** — $120 is a fair estimate for $70-$225 range
- **❌ Correction:** Make this editable in Settings tab.

---

### 17. Groceries Budget
- **File:** App.jsx:33
- **Current:** `groceries: 500`
- **✅ Correct** — Leave as-is for now (actually higher in reality, but ok)
- **❌ Correction:** Make this editable in Settings tab.

---

### 18. Gas Budget
- **File:** App.jsx:34
- **Current:** `gas: 270`
- **✅ Correct** — Value is accurate
- **❌ Correction:** Make this editable in Settings tab.

---

## CATEGORY: LIVE Budget Calculations

### 19. Monthly Variable Expenses Total
- **File:** App.jsx:682
- **Current:** Sum of groceries + gas + dateNights + power + gym + insurance
- **✅ Correct** — Logic is right

---

### 20. Projected Remaining Expenses
- **File:** App.jsx:683
- **Current:** `monthlyVariableExpenses * (1 - monthProgress)`
- **✅ Correct** — Logic is right

---

### 21. Kickback Projection
- **File:** App.jsx:638-707 `calculateProjectedKickback()`
- **Current:** Subtracts Blue Amex TOTAL balance
- **✅ Correct** — This is intentional. Blue Amex should be treated like a debit card. Current total represents spending already done this month. This is the correct behavior.

---

## CATEGORY: Disposable Income

### 22. Disposable Income Calculation
- **File:** App.jsx:491-552 `calculateDisposableIncome()`
- **Current logic:** When statement > 0, use statement. When statement = 0, use (total - statement) which equals total.
- **❌ Correction:** Fix the $0 statement case. When statement is $0, the next payment amount should be the TOTAL balance (not $0). This is the conservative approach — assume the user needs to cover their full balance even before the statement posts. The formula should be:
  
  const nextPaymentAmount = cardStatement > 0 ? cardStatement : cardTotal;
- **Notes:** The total balance should still be VISIBLE on the card display so the user knows what's building up. The display text should say "Statement paid. Total balance ($X) due next cycle." instead of showing "$0.00 due."

---

## CATEGORY: Health Score

### 23. Health Score Calculation
- **File:** App.jsx:710-1005 `calculateHealth()`
- **Current weights:**
  - Bills covered: 60 points
  - Personal disposable: 15 points (7.5 each)
  - Kickback projection: 15 points
  - Prompt payments: 10 points
- **❌ Correction:** Reweight the scoring:
  - Bills covered (statements + rent paid before due date): **70 points**
  - Personal disposable income: **10 points** (5 each for Mat/Mara)
  - Living under budget (kickback): **10 points**
  - Prompt payments (BONUS: can pay off total, not just statement): **10 points**
  
  Update the scoring logic:
  ```javascript
  // Bills score: 70 points max (was 60)
  scoreBreakdown.billsScore = totalBills > 0 
    ? (billsCovered / totalBills) * 70 
    : 70;
  
  // Personal score: 10 points max (was 15)
  // 5 points each for Mat/Mara instead of 7.5
  // Thresholds stay the same: $200/100/50/0
  // Scale: 5, 4, 2.5, 1.5, 0 (instead of 7.5, 6, 4, 2, 0)
  
  // Kickback score: 10 points max (was 15)
  // Thresholds stay same: $200/100/0
  // Scale: 10, 7, 3, 0 (instead of 15, 10, 5, 0)
  
  // Prompt payments: 10 points (unchanged)
  // This is now the BONUS category for paying off total balance
  ```

---

### 24. Credit Card Payment Ability Percentage
- **File:** App.jsx:1788-1793
- **Current:** Shows statement ability and total ability
- **✅ Correct** — Logic is right. Statement ability = can we pay what's due. Total ability = bonus/health check.

---

## CATEGORY: Date/Time Calculations

### 25. Payday Base Dates
- **File:** App.jsx:303-312
- **Current:** Mara = Jan 23, 2026 / Mat = Jan 30, 2026
- **✅ Correct** — These dates are accurate and should stay hardcoded (not editable in Settings)

---

### 26. Days Until Calculation
- **File:** App.jsx:1185-1194
- **✅ Correct** — No changes needed

---

## CATEGORY: Display Formatting

### 27. Balance Display Format (Account Mapping UI)
- **File:** AccountMappingUI.jsx:184
- **✅ Correct** — Math.abs for credit cards is correct

---

### 28. Credit Card Balance Conversion (Server)
- **File:** server/index.js:276-279
- **✅ Correct** — Converting negative Plaid balances to positive is correct

---

### 29. Snapshot History Total
- **File:** App.jsx:2289
- **✅ Correct** — Checking-only total is fine (net worth is out of scope)

---

## CATEGORY: Cushion Amount

### 30. Cushion Amount ($150)
- **Files:** App.jsx:495, 688, 702, 959-976, 1792
- **Current:** Hardcoded `150` in 6+ places
- **✅ Correct** — $150 is the right amount
- **❌ Correction:** Extract to a single configurable value in Settings. Store in Supabase config table. Replace all hardcoded `150` references with the config value.

---

## CATEGORY: Scoring Thresholds

### 31. Disposable Income Score Thresholds
- **File:** App.jsx:902-922
- **Current:** $200 / $100 / $50 / $0
- **✅ Correct** — Thresholds are right. Keep hardcoded (not editable).

---

### 32. Kickback Score Thresholds
- **File:** App.jsx:940-943
- **Current:** $200 / $100 / $0
- **✅ Correct** — Thresholds are right. Keep hardcoded (not editable).

---

## NEW FEATURES NEEDED

### 33. Add "OVERDUE" Indicator
- **File:** App.jsx (credit card display section)
- **What:** If today's date is PAST a credit card's due date AND the statement balance has not been paid, show "OVERDUE" in red.
- **Logic:** 
  ```javascript
  const isOverdue = today.getDate() > dueDate && statementBalance > 0;
  // Display "OVERDUE" badge if true
  ```
- **Notes:** Plaid updates statement balance after payment. If statement shows $0 or less than original, assume paid.

---

### 34. Add Manual Credit Card Payment Entry
- **File:** New feature in Settings or Dashboard
- **What:** Since Plaid cannot connect to Amex yet (no full production access), add a way to manually record a credit card payment. This updates the statement balance to $0 (or entered amount) for that card.
- **Implementation:** 
  - Button on each credit card: "Record Payment"
  - Modal: "How much did you pay?" with options: "Full Statement ($X)" or "Custom Amount"
  - Saves to Supabase and updates the snapshot
- **Notes:** This is a stopgap until Amex Plaid access is available.

---

## SETTINGS TAB: New Configurable Fields

Add these fields to the Settings tab, stored in Supabase config table:

| Field | Default | Type |
|-------|---------|------|
| Mat's Biweekly Pay | $2,018.55 | Currency |
| Mara's Biweekly Pay | $1,302.06 | Currency |
| Mat's LIVE Contribution | $984.00 | Currency |
| Mara's LIVE Contribution | $656.00 | Currency |
| Cushion Amount | $150.00 | Currency |
| Rent | $2,135.00 | Currency |
| Insurance | $28.00 | Currency |
| Gym | $100.00 | Currency |
| Date Nights Budget | $200.00 | Currency |
| Power Bill Estimate | $120.00 | Currency |
| Groceries Budget | $500.00 | Currency |
| Gas Budget | $270.00 | Currency |

All these values should load from Supabase on app start. If no saved config exists, use the defaults above.

---

## CLAUDE.md UPDATES

After applying code fixes, also update the CLAUDE.md file:

1. **Line with Mara's pay:** Change $1,320.88 to $1,302.06
2. **Line with Discover due date:** Change "4th" to "2nd"
3. **Add note:** "Most financial values are now configurable in the Settings tab"

---

## IMPLEMENTATION ORDER (Suggested)

1. **First:** Create the Settings fields and Supabase config table structure
2. **Second:** Replace all hardcoded values with config lookups
3. **Third:** Fix the disposable income $0 statement bug
4. **Fourth:** Reweight the health score (70/10/10/10)
5. **Fifth:** Add OVERDUE indicator
6. **Sixth:** Add manual payment entry feature
7. **Last:** Update CLAUDE.md

---

**End of Audit**
