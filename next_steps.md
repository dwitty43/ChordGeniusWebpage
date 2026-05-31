# Chord Genius Studio Layout Redesign & Monetization Integration

This document outlines the engineering blueprint to transition Chord Genius Studio into a premium, professional digital sheet music platform. We will implement a professional full-screen dashboard workspace, enforce server-side rate limits and access gates for Free vs. Pro accounts, and create a high-fidelity payment gateway simulator.

Additionally, we are upgrading the sheet music engines to construct gorgeous, publication-quality cover pages for setlist binders, render comprehensive original key and capo transposition metadata, and prevent overlapping lines in 2-column configurations.

---

### Design Bug Fixes:
# The Convert Page
1. The layout is very compressed, I don't want a horizontal scroller and I would like the Preview pane to be compressable and a lot smaller initially
2. The Stage View and Editor buttons reverted to the old bug of text not being visible in dark mode
3. The word Workstation at the top is misleading, it should be "Convert"
4. When a chart is in the preview section the "Chord Genius Stage" should go away. It currently causes the user not to be able to see the bottom of the chart.
5. The preview buttons, (Add to setlist, Download Current, and send to rehearse) should be on the right side at the top of Preview bar on the right side vertically and stylistically consistent with Stage View and Editor
6. The rehearse page should have a similar layout with the left sidebar being a page selector. Consider making a react layout and converting certain things to components
7. When switching between tabs of convert and rehearse (and later premium) the song that is in Chord Genius Stage should be cached and switching tabs should not make it so that goes away

### Next steps:
1. Login/Signup page init
2. Create premium page
3. Make it so current user would know the website is in Beta and because of this everyone has "Pro tier"

## Rate Limiting & Access Control Architecture
## THIS WILL BE DONE AFTER BETA

We will implement a rigorous gatekeeping system between the **Free** and **Pro** tiers.

| Feature | Free Tier | Pro Tier | Enforcement Strategy |
| :--- | :--- | :--- | :--- |
| **UG Scrapes** | 3 per day limit | Unlimited | Checked on server by IP address tracking & client token. |
| **ChordPro Exports** | Blocked | Unlocked | Server rejects `.pro` requests if `x-pro-status` is false. |
| **PDF Chord Glossary** | In-context Ad | Visual Diagrams | If `x-pro-status` is false, PDF generates with a premium upgrade notice. |
| **Setlist Compilation** | Blocked | Unlocked | Server rejects `/api/binder` requests with >1 song if `isPro` is false. |

---
