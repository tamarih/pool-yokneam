# בריכת יקנעם — מערכת ניהול כניסות

## התקנה והרצה

### דרישות מוקדמות
- [Node.js 20+](https://nodejs.org/en/download) — **יש להתקין תחילה**
- חשבון [Supabase](https://supabase.com) (חינמי)

### שלבי התקנה

```bash
# 1. התקן תלויות
npm install

# 2. צור קובץ .env
cp .env.example .env
# ערוך את .env והכנס את פרטי Supabase שלך

# 3. הרץ בסביבת פיתוח
npm run dev
```

### הגדרת Supabase

1. צור פרויקט חדש ב-[supabase.com](https://supabase.com)
2. לך ל-SQL Editor והרץ בסדר:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_functions.sql`
3. העתק את ה-URL וה-Anon Key מ-Settings → API אל `.env`

### יצירת משתמשים ראשוניים

ב-Supabase Dashboard → Authentication → Users → Add User:

| Email | Password | Role (metadata) |
|-------|----------|-----------------|
| admin@pool.com | ... | `{"role": "admin"}` |
| guard@pool.com | ... | `{"role": "guard"}` |

### פריסה ל-Netlify

1. `npm run build`
2. גרור את תיקיית `dist` ל-Netlify, **או** חבר ל-GitHub
3. הגדר Environment Variables ב-Netlify:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

---

## מבנה המערכת

```
src/
├── components/
│   ├── admin/     # FamilyFormModal
│   ├── guard/     # (סורק מובנה בעמוד)
│   ├── member/    # (כרטיס מובנה בעמוד)
│   └── shared/    # Layouts, QRCard, Spinner
├── contexts/      # AuthContext
├── lib/           # Supabase client
├── pages/
│   ├── admin/     # Dashboard, Families, FamilyDetail, Entries, Reports
│   ├── guard/     # Scanner, Entries
│   └── member/    # Card
├── types/         # TypeScript types
└── utils/         # format helpers
```

## תפקידים

| תפקיד | גישה |
|-------|------|
| `admin` | כל המערכת |
| `guard` | סורק QR + כניסות היום |
| `member` | כרטיס משפחה + QR |

## תכונות עתידיות (ארכיטקטורה מוכנה)

- רכישת מנוי אונליין (Stripe webhook → `memberships` table)
- SMS/WhatsApp (Supabase Edge Functions → Twilio)
- פתיחת שער (Edge Function → GPIO/relay API)
- מסך תפוסה בזמן אמת (Supabase Realtime subscriptions)
