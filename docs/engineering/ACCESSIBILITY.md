# Accessibility

Target: **WCAG 2.1 level AA** on every page, in light and dark themes.

## Automated (every E2E run)

`tests/e2e/accessibility.spec.ts` runs axe-core (`@axe-core/playwright`, dev only) with the
`wcag2a`, `wcag2aa`, `wcag21a` and `wcag21aa` rules on:

- public pages, the auth pages and the legal pages, in light and dark themes;
- the traveller area, in light and dark themes;
- the partner portal and the admin console.

Scans run with reduced motion, so scroll-reveal animations don't leave content half-transparent while
it is measured. Any violation fails the test, and the message names the rule, element and contrast ratio.

Fixed in the first audit (2026-10-15):

- **Admin sidebar links:** white on the light page background (contrast about 1:1).
- **Logo accent:** on the dark admin bar and the auth panel.
- **Inline links:** links in body text relied on colour alone, so they are now underlined (WCAG 1.4.1).
- **Admin filter tab counts:** contrast was 4.4:1.

## Manual (before launch and after large UI changes)

Automated checks find only part of the problems. Check by hand:

- [ ] **Keyboard only:** every flow can be completed with Tab, Shift+Tab, Enter, Space and Esc (sign up,
      plan a trip, book, the partner sees the booking, delete an account). Focus is always visible and the
      order is logical.
- [ ] **Screen reader** (VoiceOver on macOS/iOS, TalkBack on Android):
  - pages have one `h1`;
  - form errors are announced (`role="alert"` / `role="status"`);
  - status badges and alert counts are read with their meaning.
- [ ] **Zoom:** 200 % zoom and 320 px width have no horizontal scrolling and no clipped text.
- [ ] **Motion:** with "reduce motion" on, nothing animates.
- [ ] **Forms:**
  - every input has a visible label;
  - errors say how to fix them;
  - nothing depends on colour alone.

Record the date, the tester and any issues in the release report.
