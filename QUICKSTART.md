# AlgoTrendy CLI - Quick Start

## ✅ Setup Complete!

Your PowerShell profile has been updated to use the new AlgoTrendy CLI.

---

## 🚀 How to Use

### Step 1: Reload PowerShell

**Close your current PowerShell terminal and open a new one.**

This loads the updated profile with the new `algotrendy` function.

---

### Step 2: Run the CLI

```powershell
algo up
```

**Expected output:**
```
AlgoTrendy Localhost Startup
───────────────────────────
VPS Reachable ............. OK
SSH Tunnel ............... OK
Metrics API (9000) ........ OK
Dashboard Server (3000) ... OK
System Activity .......... ACTIVE
Seeding Scheduler ........ ACTIVE

Dashboard:
→ http://localhost:3000

Status: ✅ READY
```

Your browser will automatically open to the dashboard!

---

## 🔧 Troubleshooting

### If you get "command not found"

Your PowerShell profile wasn't loaded. Check:

```powershell
Get-Content $PROFILE | Select-String "algotrendy"
```

Should show the algotrendy function.

### If VPS connection fails

Test SSH manually:

```powershell
ssh algotrendy echo OK
```

Make sure your `~/.ssh/config` has the `algotrendy` host configured.

### Enable verbose mode

```powershell
algotrendy up --verbose
```

Shows detailed debugging information.

---

## 📚 What Changed

**Before (broken):**
```powershell
function algotrendy {
    python C:\algotrendy\algotrendy_cli.py $args  # Path didn't exist
}
```

**After (working):**
```powershell
function algotrendy {
    & "$env:USERPROFILE\opt\algotrendy\local\algotrendy.bat" @args
}
```

Now points to the correct CLI location!

---

## 🎯 Next Steps

1. **Close and reopen PowerShell** (to load the new profile)
2. **Run:** `algo up`
3. **Deploy VPS services** (see `vps_scripts/README.md` if needed)

**Note:** `algotrendy up` still works as a backwards-compatible alias!

---

## 📖 Full Documentation

- **LOCALHOST_RUNBOOK.md** - Complete guide
- **README.md** - Quick reference
- **vps_scripts/README.md** - VPS deployment

---

**Ready to go!** 🚀

Close this terminal, open a new one, and run `algo up`
