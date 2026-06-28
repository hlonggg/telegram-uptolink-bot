import os
import platform

# =================== PHÁT HIỆN MÔI TRƯỜNG ===================
if platform.system() == "Linux" and os.path.exists("/usr/bin/chromium"):
    # Môi trường Render/Linux server
    CHROME_PATH = "/usr/bin/chromium"
    CHROMEDRIVER_PATH = "/usr/bin/chromedriver"
    print("[+] Đang chạy trên Render/Linux server")
else:
    # Môi trường Termux (Android)
    CHROME_PATH = '/data/data/com.termux/files/usr/lib/chromium/chrome'
    CHROMEDRIVER_PATH = '/data/data/com.termux/files/usr/lib/chromium/chromedriver'
    print("[+] Đang chạy trên Termux")
# =============================================================
