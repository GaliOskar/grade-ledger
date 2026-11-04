# Grade Ledger

A personal GPA and degree-progress tracker for the **BEng in Electrical and Computer Engineering** at Nazarbayev University.
Plain HTML, CSS and vanilla JavaScript: no frameworks, no build step.

## Files

| File | What it is |
|---|---|
| `index.html` | Page shell |
| `styles.css` | All styling (light/dark themes via CSS variables) |
| `app.js` | App logic: GPA math, plan matching, rendering, storage |
| `curriculum.js` | **The degree plan as a data array: edit this when the plan changes** |

## Run it locally

Double-click `index.html` to open it in your browser. That's all.

If you want it served over `http://` (closer to how GitHub Pages behaves), start a local server from the project folder:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

> Data saved under `file://` and under `http://localhost:8000` are separate (different origins), and both are separate from your live GitHub Pages site. Use **Export / Import** to move data between them.

## Deploy to GitHub Pages

1. Create a new **empty** repository on GitHub (no README, no .gitignore), e.g. `grade-ledger`.
2. Push this folder:
   ```bash
   git remote add origin https://github.com/<your-username>/grade-ledger.git
   git branch -M main
   git push -u origin main
   ```
3. On GitHub, open the repo → **Settings → Pages**.
   Under **Build and deployment**, set **Source: Deploy from a branch**, **Branch: `main`**, folder **`/ (root)`**, then **Save**.
4. After a minute or two the Pages settings page shows **"Your site is live at"**
   `https://<your-username>.github.io/grade-ledger/`. The same link appears under **Deployments** on the repo's main page.

To update the site later: commit and `git push`. Pages redeploys automatically.

## Your data

- Everything is saved automatically to your browser's `localStorage` (a "✓ Saved" indicator flashes after each change).
- Nothing is sent anywhere. The repo contains only the app and your degree plan, not your grades.
- **Export** downloads a JSON backup; **Import** loads one (it's validated first, and your data is untouched if the file is invalid).
- Clearing browser data erases your grades, so export a backup now and then.

## How the numbers work

- **GPA** uses the 4.00 scale (A 4.00 … F 0.00), weighted by ECTS. P, W, I and In progress are left out of GPA.
- **Credits earned** = ECTS with a passing grade (D or better, or P). If you retake a course that was failed or below its minimum, its credits are counted once. Both attempts still count toward GPA.
- **Plan matching**: courses are matched to plan slots by **code** (cross-listed codes like `ELCE 205/MATH 251` match either one), or by **title** for slots without a code (e.g. *Ethics*, *Kazakh Language I*), regardless of which semester you take them in. For electives and the Open Box course, type the course into the slot in the Degree plan section.
- **Breakdown**: the final grade is out of 100%. The "needed" values are the average you need on the remaining (unscored) weight. If your weights add up to less than 100%, the missing part counts as not yet graded.

## Editing the plan

Open `curriculum.js`. Each slot looks like:

```js
{ id: 'y2f-elce200', year: 2, term: 'Fall', code: 'ELCE 200', title: 'Circuit Theory I', minGrade: 'C-', ects: 6 },
```

- Keep each `id` unchanged once you have data (your plan choices and electives are stored by id).
- `minGrade: 'D*'` means D if your Kazakh level is Advanced (setting), otherwise C-.
- `options: [...]` makes an "or" slot; `elective: true` makes a slot you fill in yourself.
