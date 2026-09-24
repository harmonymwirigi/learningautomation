# Pushing to GitHub

This project is already a Git repository connected to
`https://github.com/harmonymwirigi/learningautomation` on the `main` branch.
Most of the time you only need the three commands in *Everyday workflow*.

---

## Before your first push: check what is being sent

Two things must **never** reach GitHub:

| File | Why |
|------|-----|
| `backend/.env` | Holds your `JWT_SECRET` and your OpenAI API key. A key pushed to a public repo is found by bots within minutes and billed to you. |
| `backend/data/study.db` | Your database — real student names, emails, phone numbers and password hashes. |

Both are already listed in `.gitignore`, so Git ignores them. Confirm it yourself:

```bash
git status --short
```

If `.env` or `study.db` appear in that list, **stop** and fix `.gitignore` before
continuing. To be certain, ask Git directly:

```bash
git check-ignore -v backend/.env backend/data/study.db
```

Output naming the `.gitignore` rule means they are safely excluded. No output means
they are **not** ignored — do not push.

---

## Everyday workflow

Run these from the `learningautomation` folder each time you finish a piece of work:

```bash
git add .
git commit -m "Add study assistant chatbot"
git push
```

That is it. `git add .` stages everything that changed (ignored files stay out),
`git commit` saves a snapshot with a message, and `git push` sends it to GitHub.

**Writing the message:** say what changed, not what you typed. `Add semester tracking
to study progress` is useful in six months; `update files` is not.

### Seeing what you are about to commit

```bash
git status          # which files changed
git diff            # the actual line-by-line changes
git log --oneline   # your previous commits
```

---

## First time on a new computer

If you are setting this up somewhere fresh:

```bash
git clone https://github.com/harmonymwirigi/learningautomation.git
cd learningautomation
cd backend && npm install
cd ../frontend && npm install
```

Then recreate `backend/.env` — it is **not** in the repository by design. Copy
`backend/.env.example` to `backend/.env`, generate a new `JWT_SECRET`, and paste in your
AI key. See the main README's *Getting Started*.

## Starting a brand-new repository

Only needed if you are creating a second project from scratch:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

Create the empty repository on github.com first (**New repository**, no README or
`.gitignore` — you already have both).

---

## Signing in when Git asks

GitHub stopped accepting account passwords on the command line. When prompted for a
password, paste a **personal access token** instead:

1. GitHub → your avatar → **Settings**
2. **Developer settings** → **Personal access tokens** → **Tokens (classic)**
3. **Generate new token**, tick the **repo** scope, choose an expiry
4. Copy the token — it is shown only once
5. Use your GitHub username, and paste the token as the password

Windows remembers it afterwards via Credential Manager, so you are only asked once.

---

## When something goes wrong

**`rejected — fetch first`** — someone (or you, elsewhere) pushed changes you do not
have yet. Pull them, then push:

```bash
git pull --rebase
git push
```

**A merge conflict after pulling** — Git marks the clashing sections inside the file
with `<<<<<<<`, `=======` and `>>>>>>>`. Open it, keep the version you want, delete the
markers, then:

```bash
git add <the-file>
git rebase --continue
```

**You committed something secret** — do not just delete it in a new commit; it stays in
the history. Immediately **revoke the key** on the provider's site (OpenAI → API keys →
revoke) and generate a new one. That is the only step that actually protects you. Then
remove the file from tracking:

```bash
git rm --cached backend/.env
git commit -m "Stop tracking .env"
git push
```

**You want to undo the last commit** but keep the changes on disk:

```bash
git reset --soft HEAD~1
```

**You want to throw away all uncommitted changes** (destructive — there is no undo):

```bash
git restore .
```

---

## A note on `package-lock.json`

Commit it. It pins exact dependency versions so the app installs identically on every
machine and on your host. It changes whenever you install or update a package, and that
is fine — it is meant to be tracked.
