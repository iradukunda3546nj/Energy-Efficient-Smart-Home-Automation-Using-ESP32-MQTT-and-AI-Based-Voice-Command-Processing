# Urugo Management System — Auth Setup & Deployment Guide

---

## 📁 Final Folder Structure

```
BMS/
├── index.html                          ← Root redirect to login
├── dashboard.html                      ← Your existing dashboard
├── .htaccess                           ← Apache security config
│
└── assets/
    ├── css/                            ← Your existing styles
    ├── js/                             ← Your existing scripts
    ├── photos/
    ├── urugo/
    │
    └── login/
        ├── login.html
        ├── signup.html
        ├── otp-verification.html
        ├── forgot-password.html
        │
        ├── css/
        │   └── auth.css
        │
        ├── js/
        │   ├── auth.js                 ← Shared utilities
        │   └── auth-guard.js           ← Dashboard protection
        │
        └── php/
            ├── db.php                  ← DB connection (configure credentials)
            ├── helpers.php             ← Shared PHP utilities
            ├── register.php
            ├── login.php
            ├── logout.php
            ├── verify_otp.php
            ├── resend_otp.php
            ├── forgot_password.php
            ├── reset_password.php
            ├── session_check.php
            └── urugo_bms_auth.sql      ← Database schema
```

---

## 🚀 Step-by-Step cPanel Deployment

### Step 1 — Create the Database

1. Log into **cPanel → phpMyAdmin**
2. Click **New** → create database named `urugo_bms_auth`
3. Select the new database
4. Click the **SQL** tab
5. Paste the entire contents of `assets/login/php/urugo_bms_auth.sql`
6. Click **Go**

> ✅ You should see 4 tables: `users`, `otps`, `password_resets`, `remember_tokens`

---

### Step 2 — Create a Database User

1. cPanel → **MySQL Databases**
2. Under *Add New User*, create:
   - Username: `urugo_auth`
   - Password: (generate a strong one, save it)
3. Under *Add User to Database*, assign `urugo_auth` to `urugo_bms_auth`
4. Grant **ALL PRIVILEGES**

---

### Step 3 — Configure Database Credentials

Edit `assets/login/php/db.php`:

```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'cpanel_username_urugo_bms_auth');  // cPanel prefixes DB names
define('DB_USER', 'cpanel_username_urugo_auth');       // cPanel prefixes usernames
define('DB_PASS', 'your_strong_password_here');
```

> ⚠️ On cPanel, database and username are prefixed with your cPanel username.
> Example: if your cPanel username is `mysite`, the DB name becomes `mysite_urugo_bms_auth`.

---

### Step 4 — Upload Files

**Option A — File Manager:**
1. cPanel → **File Manager** → `public_html`
2. Upload the entire `BMS/` folder
3. Your site will be at `https://yourdomain.com/BMS/`

**Option B — FTP (FileZilla):**
1. Connect with your FTP credentials
2. Upload `BMS/` to `public_html/`

**Option C — Root deployment (recommended for production):**
1. Move all contents of `BMS/` directly into `public_html/`
2. Update paths in `auth-guard.js`:
   ```js
   const LOGIN_URL = 'assets/login/login.html';
   const CHECK_URL = 'assets/login/php/session_check.php';
   ```

---

### Step 5 — Protect the Dashboard

Add this single line to the `<head>` of your `dashboard.html`, **before any other scripts**:

```html
<head>
  <!-- Auth Guard — MUST be first script -->
  <script src="assets/login/js/auth-guard.js"></script>

  <!-- ... rest of your existing head tags ... -->
</head>
```

That's it. The guard will:
- Show a loading overlay instantly
- Check the PHP session
- Redirect unauthenticated users to login
- Inject a logout button into your navbar

---

### Step 6 — Configure SMS (Optional but recommended)

**Option A — Africa's Talking (Rwanda-friendly, supports MTN/Airtel):**
```php
// In helpers.php → sendSmsOtp()
$at = new AfricasTalking\SDK\AfricasTalking('YOUR_USERNAME', 'YOUR_API_KEY');
$sms = $at->sms();
$sms->send(['to' => $phone, 'message' => "Your Urugo OTP: $otp (5 min)", 'from' => 'URUGO']);
```

**Option B — Twilio:**
```php
$twilio = new \Twilio\Rest\Client('YOUR_SID', 'YOUR_TOKEN');
$twilio->messages->create($phone, ['from' => '+1XXXXXXXXXX', 'body' => "Urugo OTP: $otp"]);
```

**Option C — Development (already enabled):**
OTPs are written to `assets/login/php/otp_log.txt`. View this file to get OTPs during testing.
**Delete this file before going live.**

---

### Step 7 — Change the Default Admin Password

The SQL seed creates an admin account with a placeholder hash.
**Before going live**, either:

1. Register normally through the signup page, OR
2. Generate a real hash and update via phpMyAdmin:
   ```php
   // Run this once in a temp PHP file to get the hash:
   echo password_hash('YourNewStrongPassword!', PASSWORD_BCRYPT, ['cost' => 12]);
   ```
   Then in phpMyAdmin:
   ```sql
   UPDATE users SET password_hash = 'paste_hash_here' WHERE email = 'admin@urugo.rw';
   ```

---

## 🔐 Security Checklist Before Go-Live

- [ ] Change DB credentials in `db.php`
- [ ] Delete `otp_log.txt` (or add it to `.htaccess` deny rules)
- [ ] Set up real SMS provider (Twilio / Africa's Talking)
- [ ] Enable HTTPS on cPanel (free via Let's Encrypt)
- [ ] Uncomment HSTS header in `.htaccess` after confirming HTTPS works
- [ ] Change default admin password
- [ ] Set `display_errors = Off` in PHP settings (cPanel → PHP Selector)
- [ ] Verify `.htaccess` is blocking direct access to `db.php` and `helpers.php`

---

## 🔄 Full Authentication Flow

```
User visits site
    ↓
index.html → redirect → login.html

New user?
    ↓ signup.html
    → register.php (validates, creates user, sends OTP)
    → otp-verification.html
    → verify_otp.php (activates account)
    → login.html ✓

Existing user?
    ↓ login.html
    → login.php (verifies credentials, starts session)
    → dashboard.html ✓

Forgot password?
    ↓ forgot-password.html (Step 1: enter email/phone)
    → forgot_password.php (sends OTP)
    → (Step 2: enter OTP)
    → verify_otp.php (issues reset token)
    → (Step 3: new password)
    → reset_password.php
    → login.html ✓

Logout?
    → logout.php (destroys session + cookie)
    → login.html ✓
```

---

## 🛠️ Local Testing (VS Code Live Server)

Since Live Server doesn't run PHP, the frontend operates in **demo mode**:
- All `fetch()` calls fall into the `catch` block
- You can navigate through all pages freely
- OTP verification skips to success automatically
- No real session is created

To test the full PHP flow locally, use **XAMPP** or **Laragon**:
1. Copy `BMS/` into `C:/xampp/htdocs/`
2. Import the SQL file into phpMyAdmin
3. Access at `http://localhost/BMS/`

---

## 📞 SMS Provider Comparison (Rwanda)

| Provider | Rwanda Support | Free Tier | Notes |
|----------|---------------|-----------|-------|
| Africa's Talking | ✅ MTN, Airtel | 10 free SMS | Best for Rwanda |
| Twilio | ✅ via shortcode | $15 credit | International |
| Vonage | ✅ | Trial credits | Good rates |

---

*Built for Urugo Management System — Production-ready auth for cPanel shared hosting.*
