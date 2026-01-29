# AlgoTrendy VPS Profiles

Your CLI now supports multiple VPS deployments with interactive selection!

---

## Available VPS Profiles

### 🇺🇸 US Central (GCP)
- **SSH Host:** `central`
- **Location:** GCP us-central1-a
- **VM:** algotrendy-fut-prod
- **IP:** 136.114.194.83

### 🇸🇬 Singapore (GCP Asia)
- **SSH Host:** `singapore`
- **Location:** GCP asia-southeast1-b
- **VM:** bybit-demo-sg
- **IP:** 34.87.54.76

---

## Usage

### Interactive Selection (Arrow Keys)

```bash
algo up
```

You'll see:
```
? Select VPS deployment
❯ 🇺🇸 US Central (GCP) - GCP VM - algotrendy-fut-prod (us-central1-a)
  🇸🇬 Singapore (GCP Asia) - GCP VM - bybit-demo-sg (asia-southeast1-b)
```

**Use arrow keys (↑/↓) to select, then press Enter.**

---

### Direct Selection (Skip Menu)

```bash
algo up central      # Connect to US Central
algo up singapore    # Connect to Singapore
```

---

## Adding New VPS Profiles

Edit `algotrendy_up.py` and add to the `VPS_PROFILES` dictionary:

```python
VPS_PROFILES = {
    "your-vps": {
        "name": "Your VPS Name",
        "ssh_host": "your-ssh-host",  # From ~/.ssh/config
        "ssh_user": "your-username",
        "description": "VPS description",
        "location": "🌍 Your Location"
    }
}
```

---

## SSH Configuration

Make sure each VPS is configured in `~/.ssh/config`:

```
Host central
    HostName 136.114.194.83
    User kennethsarmstrong_gmail_com
    IdentityFile ~/.ssh/id_ed25519

Host singapore
    HostName 34.87.54.76
    User kennethsarmstrong_gmail_com
    IdentityFile ~/.ssh/id_ed25519
```

---

**Now you have multi-VPS support with arrow key selection!** 🚀
