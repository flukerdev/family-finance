Perform a complete math audit of the entire codebase. Your job is to find EVERY calculation, formula, hardcoded number, and displayed value in the app and export them into a single reviewable file.

## Step 1 — Scan Everything
Read every file in src/ and server/. Look for:
- Hardcoded dollar amounts (rent, gym, insurance, etc.)
- Percentage calculations (20% to Give, 20% to Save, etc.)
- Paycheck split logic
- Credit card balance handling (negative to positive conversions, etc.)
- Budget calculations (LIVE budget, kickback, surplus, etc.)
- Date-based logic (due dates, pay cycles, month boundaries)
- Any rounding, Math.abs(), Math.round(), toFixed(), or similar
- Any conditional logic that changes how a number is displayed
- Health score formulas (if they exist yet)
- Anything that produces a number the user sees on screen

Do NOT skip anything. If a number appears on screen, I need to know where it comes from.

## Step 2 — Export the Audit File
Create a markdown file at the project root called `MATH_AUDIT.md` with this exact structure for EVERY calculation you find:

```
### [SHORT DESCRIPTION]
- **What it does:** [plain English explanation]
- **File:** [filename, line number or function name]
- **Current formula/logic:**
  ```
  [paste the exact code]
  ```
- **Example with real numbers:** [show the math step by step using our actual income figures]
- **Currently displays as:** [what the user sees on screen]
- **✅ Correct / ❌ Correction:** [LEAVE THIS BLANK — I will fill it in]
- **Notes:** [LEAVE THIS BLANK — I will add notes]
```

## Step 3 — Add a Summary Section
At the top of the file, add a section that lists:
- Total number of calculations found
- Files scanned
- Any values that seem inconsistent with each other (e.g., if one place says rent is $2,135 and another says $2,100)
- Any hardcoded numbers that probably should be configurable

## Step 4 — Add an Instructions Block
At the very top of the file, add this block:

```
# MATH AUDIT — Flip Family Finance App
**Generated:** [today's date]
**How to use this file:**
1. Review each calculation below
2. For each one, change "✅ Correct" to "❌ Correction:" and write what it should be
3. Add anything in the Notes field if needed
4. When done, save this file and give it back to Claude Code with the prompt:
   /project:apply-math-fixes
```

## Rules
- Use Mat's real biweekly pay of $2,018.55 and Mara's of $1,320.88 in all examples
- Show every step of multi-step calculations (don't skip arithmetic)
- If a value is derived from another value, note the dependency
- Group calculations by category: Income Splits, LIVE Budget, Credit Cards, Kickback, Health Score, Display Formatting, Other
- If you find duplicate logic (same calculation in multiple places), flag it — that's a bug risk
