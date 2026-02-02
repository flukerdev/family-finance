Read the file `MATH_AUDIT.md` in the project root. I have reviewed every calculation and marked corrections.

## Your Job
1. Find every entry I marked with "❌ Correction:" (ignore entries marked ✅ Correct)
2. For each correction, read my notes and the fix I described
3. Before making ANY changes, list out every correction you found and tell me:
   - What the current code does
   - What I want it to do instead
   - Which file(s) you'll modify
   - Whether fixing this could affect other calculations (chain reactions)
4. Wait for my approval before editing any code

## Rules
- Make all fixes in a single pass — I don't want to go back and forth
- After all fixes are applied, re-run the examples with real numbers to confirm the math is now correct
- If any of my corrections conflict with each other, stop and ask me before proceeding
- If a correction would break another part of the app, tell me before making the change
- Commit all fixes together with the message: "fix: math audit corrections — [brief summary]"
- Explain every change you make so I understand what was wrong and why the fix works

After applying all fixes, tell me how many corrections were made and suggest I run `/project:math-audit` again to verify everything is clean.
