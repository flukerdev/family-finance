# Onboarding V2 — Implementation Plan

## Summary
Major overhaul of `src/components/Onboarding.jsx` with Motion animations, animated SVG icons, UX improvements, and flow restructuring. Install `motion` (Framer Motion) as a new dependency.

---

## Step-by-step Changes

### 1. Install Motion dependency
- `npm install motion` (Framer Motion v11+, rebranded as "motion")
- This is already planned for Phase 5 — we're pulling it forward for onboarding

### 2. Remove "Skip for now" button
- Delete the `skipLink` style and the skip button from `renderNav()`
- Remove the `onSkip` prop from `Onboarding` component
- Update App.jsx to remove the `onSkip={() => setOnboardingComplete(true)}` prop
- **Why:** Forces users through the full onboarding, ensuring proper account setup

### 3. Add Motion-powered slide transitions
- Wrap each step's content in `<motion.div>` with `AnimatePresence` for smooth slide + fade transitions
- Transition: content slides horizontally (left/right based on direction) with opacity fade
- Duration: ~300ms, ease-out curve
- Track navigation direction (forward/back) to animate in the correct direction
- **Why:** Makes step changes feel fluid and premium instead of instant content swaps

### 4. Animate Give/Save/Live icons with Motion
- **Give (Heart):** Heart SVG grows cartoon arms (two curved paths) that wrap around itself in a hug motion. Arms start hidden, swing outward, then close in around the heart. Uses `motion.path` with `pathLength` and custom transforms.
- **Save (Arrow):** Arrow turns green and has a pulsing throb animation — scales up/down rhythmically (1.0 → 1.15 → 1.0) with a subtle glow. Uses `motion.path` with `animate={{ scale: [1, 1.15, 1] }}` loop.
- **Live (House):** House does a playful side-to-side wobble/shake — rotates ±5° like it's dancing. Uses `motion.g` with `animate={{ rotate: [-5, 5, -5, 0] }}` loop.
- **Flip Coin (Welcome):** Gentle continuous rotation/flip on the "F" coin. 3D-style Y-axis rotation.
- Each animation triggers when the slide appears (via `AnimatePresence` enter animation)
- **Why:** Keeps users engaged and makes the brand philosophy memorable

### 5. Fix shield checkmark centering (Privacy step)
- The checkmark path `d="M28 34L32 38L40 28"` is off-center in the shield
- Adjust to `d="M26 33L30 37L38 27"` to visually center it within the shield shape
- **Why:** Visual polish — the checkmark currently looks shifted right

### 6. Privacy policy as inline modal (not new page)
- Change the "Read our full Privacy Policy" button from `window.open('/privacy', '_blank')` to toggling a local `showPrivacyModal` state
- Add a full-screen modal overlay with the privacy policy content rendered inline
- Scrollable content area with close button at top
- Modal uses Motion for fade-in/slide-up entrance
- Extract the privacy policy JSX from App.jsx's public routes section (or duplicate the text content) into a shared constant or component
- **Why:** Prevents navigating away from onboarding, which currently resets the step state

### 7. Fix onboarding state persistence
- The real issue: navigating to `/privacy` causes a full page reload, which re-renders App.jsx from scratch. On reload, `onboardingComplete === false && connectedAccounts.length === 0` is true again, so onboarding restarts at step 0.
- Fix: Store current onboarding step in `sessionStorage` (not localStorage — we want it per-session only)
- On mount, check `sessionStorage.getItem('onboarding_step')` and restore the step
- On step change, write to `sessionStorage`
- Clear on completion
- With the modal fix (#6), the navigation issue goes away, but sessionStorage is a safety net
- **Why:** Ensures users don't lose progress if the page reloads for any reason

### 8. Change "Who's budgeting?" to welcoming language
- Replace heading: `"Who's budgeting?"` → `"Let's get to know you"`
- Replace subtext for solo: `"What should we call you?"` → `"What's your first name?"`
- Replace subtext for joint: `"Great! Enter both names..."` → `"We'd love to know both of your names so we can personalize your experience."`
- **Why:** More inviting, warm tone that draws users into the flow rather than feeling like a form

### 9. Redesign Connect Accounts step (Plaid-like green)
- Change the step's accent color to a light green background (`#E8F5E9` or similar) with dark green border (`#2E7D32`)
- Replace the generic heading/subtext with friendlier language
- Add a small animated illustration (bank/connection icon with Motion) instead of just text
- Style the PlaidLink button wrapper area with the green theme
- Remove the "AI" feel — no bullet points about "securely link" — instead use simple, warm copy like "Let's connect your bank so Flip can see your balances"
- **Why:** Matches Plaid's own UI aesthetic and feels less corporate/techy

### 10. Add celebration after Connect, before Map
- New intermediate step (inserted between current step 6 and 7)
- Shows a success animation: checkmark morphs into confetti/sparkle burst (Motion)
- Brief message: "Nice! Your accounts are linked." with count of connected accounts
- Auto-advances after ~2 seconds OR user taps Continue
- **Why:** Acknowledges the user's effort and creates a moment of delight

### 11. Add "What's next" explainer before Map step
- New intermediate step after celebration, before mapping UI
- Explains what mapping means in simple terms: "Now let's tell Flip which account is which — your checking, savings, credit cards, etc."
- Include a simple visual showing account → bucket mapping concept
- **Why:** Users need context before the mapping UI, which can be confusing without explanation

### 12. Apply green Plaid styling to Map step too
- Map accounts step gets the same light green background/border treatment as Connect
- Keeps visual consistency for the "bank connection" portion of onboarding
- **Why:** User chose Connect + Map both get the green treatment

### 13. Enhanced Done screen (post-sync celebration)
- After sync completes, the Done screen should feel celebratory:
  - Large animated checkmark with expanding ring
  - Summary of what was set up: "X accounts connected, balances synced, transactions imported"
  - Personalized: "You're all set, [Name]! Let's see your finances."
  - Motion entrance: staggered fade-up for each element

### 14. Update step numbering
- Current: 0-3 (welcome), 4 (privacy), 5 (names), 6 (connect), 7 (map), 8 (sync), 9 (done)
- New: 0-3 (welcome), 4 (privacy), 5 (names), 6 (connect), **7 (celebration)**, **8 (mapping explainer)**, 9 (map), 10 (sync), 11 (done)
- Update `STEPPER_LABELS`, `stepToDotIndex`, `canGoNext`, and `renderStep` accordingly
- Celebration + explainer steps don't need stepper dots — they share the "Connect" dot

---

## Files Modified

1. **`package.json`** — add `motion` dependency
2. **`src/components/Onboarding.jsx`** — bulk of changes (animations, new steps, modal, green styling, icon animations)
3. **`src/App.jsx`** — remove `onSkip` prop, extract privacy policy text if needed

## Files NOT Modified
- `server/index.js` — no backend changes
- No new SQL migrations
- No new components (everything stays in Onboarding.jsx)

---

## Implementation Order

1. `npm install motion`
2. Restructure step numbering (add celebration + explainer steps)
3. Add AnimatePresence + slide/fade transitions for all steps
4. Build animated SVG icons (Give/Save/Live/Flip)
5. Fix checkmark centering
6. Build privacy policy modal
7. Add sessionStorage persistence
8. Update Names step copy
9. Restyle Connect + Map steps (green Plaid theme)
10. Build celebration step
11. Build mapping explainer step
12. Enhance Done screen
13. Remove skip button + update App.jsx
14. Test full flow end-to-end
15. `npx vite build` to verify

---

## Risk Notes
- Motion adds ~30-40KB gzipped to the bundle. Acceptable since it's planned for Phase 5 anyway.
- The animated SVG icons (especially the heart with arms) will require careful SVG path work. If the hugging animation is too complex, we can simplify to the heart scaling with a warm glow + pulse effect.
- Privacy policy text duplication: we'll extract it to a shared constant to avoid maintaining it in two places.
