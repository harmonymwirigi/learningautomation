# StudyFlow — Study Automation

A full-stack study assistant to organize units, upload notes and past papers, track assignment deadlines with notifications, and log daily study sessions.

## Features

- **Student accounts** — Each student signs up with their full name, admission number, email, phone, school, course and year of study, then sees only their own units, notes, papers, deadlines, quizzes and study log
- **Units** — Add and manage courses/subjects with color coding
- **Notes** — Upload PDFs, docs, images per unit
- **Past Papers** — Store exam papers with year/semester tags
- **Assignments** — Set deadlines, priorities, and reminder days
- **Notifications** — Automatic alerts for upcoming and overdue deadlines
- **Study Log** — Track daily study time, streaks, and weekly charts
- **Training Journal** — Daily learning log with Cursor notes for day-by-day training
- **Calendar** — Month view of deadlines, study days, and journal entries
- **Browser Notifications** — Desktop alerts for approaching assignment deadlines
- **Study Timetable** — Weekly class and study schedule with today's view on dashboard
- **Exam Prep** — Track syllabus coverage, analyze past papers against covered topics, get predicted questions with solutions from your notes
- **Admin area** — Admins manage the school and course lists students pick from at sign-up, and can search accounts, promote or demote admins, suspend or reactivate students, reset passwords and delete accounts
- **Study Assistant** — A chat bubble on every page that answers from your own data ("what do I have today?", "what is due this week?") and explains how any part of the app works
- **Semesters & years** — Work is organised into terms (Year 2 · Semester 1, and so on). Start a new semester with one click; every past semester keeps its units, notes and final score
- **Study Progress** — A progress ring blending syllabus coverage, completed assignments, quiz averages and your weekly study goal, shown per semester with a history of every term you have finished
- **Dashboard** — Overview of everything at a glance

## Tech Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Frontend | React, Vite, Tailwind CSS           |
| Backend  | Node.js, Express                    |
| Database | SQLite (sql.js)                     |
| Files    | Local storage via Multer            |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or later (check with `node -v`)
- A terminal open in the `learningautomation` folder

### 1. Install dependencies

Run this once, from the `learningautomation` folder:

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure the backend

`backend/.env` holds your secrets and is gitignored. If it is missing, create it
from the template:

```bash
cd backend
cp .env.example .env        # Windows PowerShell: copy .env.example .env
```

It needs **`JWT_SECRET`** — a long random string that signs the login tokens.
Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

To enable AI summaries, quiz generation and marking, paste an API key into
`OPENAI_API_KEY=` (no quotes, no spaces) and restart the backend — the Dashboard
banner turns violet and reads *AI Active*. Everything else in `.env` is optional:
the app runs without an AI key, without Telegram/WhatsApp, and on a local SQLite
file that creates itself on first boot.

### 3. Run it

You need two terminals while developing — the backend API and the Vite dev server
with hot reload.

**Terminal 1 — backend (port 3001):**
```bash
cd backend
npm run dev
```

**Terminal 2 — frontend (port 5173):**
```bash
cd frontend
npm run dev
```

Then open **http://localhost:5173**. The frontend proxies `/api` calls to the
backend, so both must be running.

### 4. Create your account and make yourself admin

1. Click **Create an account** and fill in your details
2. Stop the backend (`Ctrl+C`), then promote yourself:

```bash
your@email.ccd backend
npm run make-admin -- om
```

3. Start the backend again — **Accounts** and **Schools & Courses** now appear in
   the sidebar

> **Why the restart?** With SQLite the whole database is held in memory while the
> server runs, so a change written by the CLI is only picked up on the next boot —
> and would otherwise be overwritten. With Postgres you can skip the restart.

Other ways to manage admins:

```bash
npm run make-admin -- --list              # who is an admin
npm run make-admin -- them@email.com      # promote someone
npm run make-admin -- them@email.com --remove   # demote (never the last admin)
```

On a hosted deployment where you have no shell, set `ADMIN_EMAILS` in `.env`
instead — every matching account is promoted at boot:

```
ADMIN_EMAILS=you@example.com,cohead@example.com
```

### Running it as one app (production style)

Build the frontend and let the backend serve it, so everything is on port 3001:

```bash
cd backend
npm run build:frontend
npm start
```

Open **http://localhost:3001**. Do this before deploying — the backend serves
`frontend/dist` when it exists.

### Common problems

| Symptom | Fix |
|---------|-----|
| `Frontend not built` at localhost:3001 | Run `npm run build:frontend` from `backend/`, or use the Vite dev server on 5173 |
| Signed out every time the server restarts | `JWT_SECRET` is missing from `backend/.env` |
| `EADDRINUSE: address already in use :::3001` | Another copy is running — close it, or set `PORT=3002` |
| Admin menu missing after `make-admin` | Restart the backend, then sign out and back in |
| Sign-up school dropdown is empty | Sign in as an admin and add schools under **Schools & Courses** |
| Changes to `.env` seem ignored | `.env` is only read at startup — restart the backend |
| Data disappears at random | Two servers are running against the same SQLite file. It is held in memory, so the last one to write wins — run only one backend at a time |

## Accounts

Everything in StudyFlow belongs to an account, so the first thing to do is create one.

1. Open the app and click **Create an account**
2. Fill in your full name, student/admission number, email, phone, school (e.g. School of Engineering), course, year of study, and a password (at least 8 characters with a letter and a number) — plus the confirmation
3. You are signed in straight away; your details live under **Profile**, where you can also change your password

You can sign in afterwards with **either** your email or your admission number. Both are unique across accounts and are matched case-insensitively.

Before deploying, set `JWT_SECRET` in `backend/.env` to a long random string (see `backend/.env.example`). Without it the server generates a new secret on every boot, which signs everyone out whenever it restarts.

> **Upgrading an existing install:** the database migrates itself on first boot — every table gains a `user_id` column. Data created before accounts existed is unowned until the **first** account registers, and that account adopts all of it. Register your own account first.

## Admin Guide

Admins get two extra sidebar entries under **Administration**. Everything else works
the same for them as for any student — an admin still has their own units and notes.

See [Getting Started step 4](#4-create-your-account-and-make-yourself-admin) for how to
become one.

### Schools & Courses

This page controls the dropdowns students see when they sign up.

- **Add a school** — type the name and press *Add school* (e.g. `School of IT`)
- **Add courses** — each school card has its own "Add a course…" box
- **Rename** — click the pencil. Renaming a school or course **also updates every
  student already assigned to it**, so nobody is left pointing at a name that no
  longer exists
- **Delete** — removes it from the sign-up list. Students who already chose it
  **keep it on their profile**; deleting is not a bulk edit of people's records.
  Deleting a school also deletes its courses

Each card shows how many courses and students it has, so you can see the impact
before deleting.

A fresh install is seeded with eight common schools and their courses. That happens
only when the table is empty — once you edit the list, restarting never re-adds them.
Students whose school is not on the list (or who pick *Other*) can still type
their own, and that value is preserved.

### Accounts

Lists every registered account with their name, admission number, email, school,
course and a count of their units, notes and assignments.

| Action | What it does |
|--------|--------------|
| **Search / filter** | By name, email, admission number, school or course; filter by role or status |
| **Reset password** (key icon) | Sets a temporary password. There is no email in StudyFlow — pass it on yourself and ask them to change it |
| **Make / remove admin** (shield icon) | Grants or revokes admin rights. Takes effect on their very next request |
| **Suspend / reactivate** (ban icon) | A suspended account is signed out immediately and cannot log back in |
| **Delete** (bin icon) | Permanently deletes the account **and all their data** — units, notes, papers, assignments, quizzes, study log. Cannot be undone |

**What admins cannot do:**

- Act on their own account — no self-demotion, self-suspension or self-deletion, so
  you cannot lock yourself out. Ask another admin instead
- Read student content. The list shows *how many* notes and units someone has, never
  what is in them. Study data stays private to each student

## Usage Guide

1. **Add units** — Go to Units and create your courses (e.g. "Data Structures", code "CS201")
2. **Upload notes** — Notes page → select unit → upload files
3. **Upload past papers** — Past Papers page → add year/semester for easy filtering
4. **Add assignments** — Set deadline and "remind me X days before" — notifications appear automatically
5. **Log study time** — Study Log page → quick-log buttons or detailed sessions
6. **Training journal** — Journal page → record what you learned and Cursor workflows daily
7. **Calendar** — See all deadlines and study activity in one month view
8. **Enable notifications** — Click "Enable" in the banner for desktop deadline alerts
9. **Timetable** — Add your weekly class and study blocks per unit
10. **Exam Prep** — Add syllabus topics → mark covered → upload notes + past papers → Run Analysis

### Study Assistant (chatbot)

The round button in the bottom-right corner opens a chat panel. It knows two things:

- **Your data** — today's and tomorrow's timetable, open assignments and how close they are,
  your units and syllabus coverage this semester, recent notes, weak topics from quizzes,
  and how much you have studied today and this week.
- **The app itself** — what every page does and which button to press.

So you can ask *"what do I have today?"*, *"what is due soonest?"*, *"how is my progress?"*,
*"how do I upload notes?"* or *"how do I start a new semester?"* and get an answer about
**your** account, not a generic one.

It only ever reads your own rows — one student's assistant cannot see another's work. The
conversation is saved to your account so it survives a reload, and the bin icon clears it.

Answers use the AI key in `backend/.env`. **Without a key it still works**: it falls back to
answering the common questions (timetable, deadlines, units, progress, how-to) directly from
your data, so it is never simply broken — it just stops handling free-form phrasing.

### Semesters and years

Everything you do belongs to a **term** — one semester of one year, like
*Year 2 · Semester 1*. Your first term is created when you register, using the year
of study on your profile.

**Units belong to a term.** Notes, past papers, assignments, topics and quizzes all
hang off a unit, so they follow it automatically. Study sessions are stamped with the
term they were logged in, even when they are not tied to a unit.

**Starting a new semester** — press *Start Year N Semester M* on the Study Progress
page. This does not reset or archive anything: the semester you were in keeps its
units, notes, tasks and its final score. New units you add land in the new term.
Semester 1 → 2 steps within the year; the last semester of a year rolls over to
Semester 1 of the next. Three-semester years work too — set `semesters_per_year`
on the account.

The **Units** page has a semester dropdown (defaulting to the current one, with an
*All semesters* option), and the add/edit form lets you move a unit between terms —
which carries its whole history along with it.

A term can be deleted only once it is empty, and you always keep at least one.

### Study progress

Progress is **derived from what you already record** — there is nothing extra to keep
up to date. The ring sits at the top of your **Profile**, on the **Dashboard**, and on
the full **Study Progress** page.

The ring averages four measures, **for the semester you are looking at**:

| Measure | Comes from | Counts when |
|---------|-----------|-------------|
| Syllabus covered | Topics ticked off in Exam Prep | The term has topics |
| Assignments done | Assignments marked completed | The term has assignments |
| Quiz average | Marked quiz attempts | You have completed a quiz |
| Weekly study goal | Study log vs your target | The semester is still running |

A measure with no data is **skipped, not counted as 0%** — an empty quiz history does
not drag your score down. The ring says how many of the four are being measured.

**Finished semesters are judged differently on purpose.** The weekly study goal is
dropped for them, because scoring last semester against *this* week's study time would
put every completed term at a permanent disadvantage. A past term's score is its
syllabus coverage, completed tasks and quiz results — and it stops moving.

Below the ring: a card per semester showing its score (click one to scope the page to
it, or pick *All time*), your current and best streaks, total study time, a seven-day
chart for the live semester, and a per-unit breakdown.

Set your weekly target under **Profile → Weekly study goal** (default 10 hours).

### Exam Prep workflow

1. Select a unit on the **Exam Prep** page
2. Add syllabus topics (one by one or bulk paste)
3. Check off topics you've covered in class
4. Upload **notes** (PDF/TXT) and **past papers** for that unit
5. Click **Run Analysis** — StudyFlow reviews past papers only up to covered topics and suggests likely exam questions with solutions from your notes
6. Optional: add `OPENAI_API_KEY` in `backend/.env` for AI-enhanced analysis (see `.env.example`)

## Project Structure

```
learning automation/
├── backend/
│   ├── server.js          # Express server
│   ├── db.js              # SQLite schema
│   ├── routes/            # API endpoints (incl. auth.js, admin.js)
│   ├── services/          # Auth, users, catalog, notifications, AI
│   ├── middleware/        # requireAuth / requireAdmin, file uploads
│   ├── scripts/           # make-admin.js and database utilities
│   ├── data/              # SQLite database (auto-created)
│   └── uploads/           # Uploaded files (auto-created)
├── frontend/
│   └── src/
│       ├── pages/         # Dashboard, Units, Notes, Admin*, etc.
│       ├── components/    # Shared UI + route guards
│       ├── context/       # AuthContext (session state)
│       └── api/           # API client
└── README.md
```

## API Endpoints

Everything under `/api` requires an `Authorization: Bearer <token>` header, except `/api/auth/register`, `/api/auth/login`, `/api/auth/status`, `/api/schools` and `/api/health/*`. Routes marked *(admin)* additionally require an account with the `admin` role.

| Method | Endpoint                        | Description              |
|--------|---------------------------------|--------------------------|
| POST   | `/api/auth/register`            | Create an account        |
| POST   | `/api/auth/login`               | Sign in (email or admission number) |
| GET/PUT | `/api/auth/me`                 | Read/update your profile |
| PUT    | `/api/auth/me/password`         | Change your password     |
| GET    | `/api/schools`                  | School + course lists (public, for sign-up) |
| GET    | `/api/admin/stats`              | Account and catalog totals *(admin)* |
| GET    | `/api/admin/users`              | List/search accounts *(admin)* |
| PATCH  | `/api/admin/users/:id/role`     | Promote or demote *(admin)* |
| PATCH  | `/api/admin/users/:id/status`   | Suspend or reactivate *(admin)* |
| PUT    | `/api/admin/users/:id/password` | Reset a password *(admin)* |
| DELETE | `/api/admin/users/:id`          | Delete an account and its data *(admin)* |
| GET/POST | `/api/admin/schools`          | Manage schools *(admin)* |
| GET/POST | `/api/admin/courses`          | Manage courses *(admin)* |
| GET    | `/api/dashboard`                | Dashboard summary        |
| GET/POST/DELETE | `/api/chat`            | Assistant history, ask a question, clear |
| GET    | `/api/progress`                 | Progress for a term (`?term_id=<id>` or `all`), plus every term's score |
| GET/POST | `/api/terms`                  | List or create semesters |
| POST   | `/api/terms/next`               | Start the next semester |
| PATCH  | `/api/terms/:id/activate`       | Switch the current semester |
| GET/POST | `/api/units`                  | List/create units        |
| GET/POST | `/api/notes`                  | List/upload notes        |
| GET/POST | `/api/past-papers`            | List/upload past papers  |
| GET/POST | `/api/assignments`            | List/create assignments  |
| GET    | `/api/notifications`            | List notifications       |
| GET/POST | `/api/study-sessions`         | Study session log        |
| GET/POST | `/api/training-logs`          | Daily training journal   |
| GET    | `/api/calendar`                 | Calendar month data      |
| GET/POST | `/api/timetable`              | Weekly study timetable   |
| GET/POST | `/api/topics`                 | Syllabus topic coverage  |
| POST   | `/api/exam-prep/analyze`        | Analyze past papers vs notes |

## Pushing to GitHub

This repo is already connected to GitHub on the `main` branch. The everyday cycle, run
from the `learningautomation` folder:

```bash
git status                                   # see what changed
git add .
git commit -m "Add study assistant chatbot"  # say what changed, not "update"
git push
```

**`backend/.env` and `backend/data/study.db` must never be pushed** — they hold your API
key, your `JWT_SECRET`, and real student details. Both are already in `.gitignore`;
confirm with:

```bash
git check-ignore -v backend/.env backend/data/study.db
```

Output naming a `.gitignore` rule means they are safely excluded. No output means they
are not — fix that before pushing.

When Git asks for a password, it wants a **personal access token**, not your GitHub
password (Settings → Developer settings → Personal access tokens → Tokens (classic), with
the `repo` scope).

**[GITHUB.md](GITHUB.md) has the full guide** — cloning onto a new machine, starting a
fresh repo, resolving `rejected — fetch first`, fixing merge conflicts, and what to do if
you ever commit a secret by accident.

## Extending with Cursor

This project is designed to grow as you train it day by day. Ideas for future features:

- Browser push notifications
- Flashcards per unit
- AI-powered quiz generation from notes
- Calendar view for deadlines
- Export study reports
