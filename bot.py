import time
import re
import json
import os
import threading
import platform
from datetime import datetime
from urllib.parse import urlparse
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
import requests

# =================== CẤU HÌNH ===================
# Lấy từ biến môi trường (Render) hoặc dùng mặc định (Termux)
CONFIG = {
    "BOT_TOKEN": os.getenv("BOT_TOKEN", "8801698234:AAGv2fEwBt7LDmTOBJugJLWHHnNQFizbw_0"),
    "ADMIN_ID": os.getenv("ADMIN_ID", "5550417994"),
    "UPTO_LINK": os.getenv("UPTO_LINK", "https://uptolink.vip/Ce8sj"),
    "KEYWORDS_KEEP": ["linkhuongdan.online"],
    "KEYWORDS_IGNORE": ["totreview.com", "totreview"],
    "MAX_CHECKS": 15,
    "WAIT_SECONDS": 2,
    "CHECK_INTERVAL_MINUTES": 5,
    "LOG_FILE": "found_codes.json",
    "USERS_FILE": "users.json"
}
# ===================================================

# =================== PHÁT HIỆN MÔI TRƯỜNG ===================
if platform.system() == "Linux" and os.path.exists("/usr/bin/chromium"):
    CHROME_PATH = "/usr/bin/chromium"
    CHROMEDRIVER_PATH = "/usr/bin/chromedriver"
    print("[+] Đang chạy trên Render/Linux server")
else:
    CHROME_PATH = '/data/data/com.termux/files/usr/lib/chromium/chrome'
    CHROMEDRIVER_PATH = '/data/data/com.termux/files/usr/lib/chromium/chromedriver'
    print("[+] Đang chạy trên Termux")
# =============================================================

running = False
bot_thread = None
last_clear_hour = -1
last_check_time = 0

# =================== QUẢN LÝ USER ===================
def load_users():
    if os.path.exists(CONFIG["USERS_FILE"]):
        try:
            with open(CONFIG["USERS_FILE"], "r", encoding="utf-8") as f:
                data = json.load(f)
                return set(data.get("users", []))
        except:
            return set()
    return set()

def save_users(users):
    with open(CONFIG["USERS_FILE"], "w", encoding="utf-8") as f:
        json.dump({
            "users": list(users),
            "last_update": datetime.now().isoformat()
        }, f, indent=2)

# =================== QUẢN LÝ LOG MÃ ===================
def load_log():
    if os.path.exists(CONFIG["LOG_FILE"]):
        try:
            with open(CONFIG["LOG_FILE"], "r", encoding="utf-8") as f:
                data = json.load(f)
                return set(data.get("codes", []))
        except:
            return set()
    return set()

def save_log(codes):
    with open(CONFIG["LOG_FILE"], "w", encoding="utf-8") as f:
        json.dump({
            "codes": list(codes),
            "last_update": datetime.now().isoformat()
        }, f, indent=2)

def clear_log():
    with open(CONFIG["LOG_FILE"], "w", encoding="utf-8") as f:
        json.dump({
            "codes": [],
            "last_update": datetime.now().isoformat(),
            "cleared": True
        }, f, indent=2)
    print(f"[+] Đã xóa sạch log mã lúc {datetime.now().strftime('%H:%M')}")
    send_telegram_to_all(f"🔄 LOG MÃ ĐÃ ĐƯỢC XÓA ({datetime.now().strftime('%H:%M')})")

# ===================================================

def extract_code(url):
    match = re.search(r'/(\d+-\d+)/?', url)
    if match:
        return match.group(1)
    match = re.search(r'/(\d+)(?:\?|$)', url)
    if match:
        return match.group(1)
    return None

def check_upto_link():
    driver = None
    try:
        options = Options()
        options.add_argument('--headless')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-gpu')
        options.add_argument('--disable-software-rasterizer')
        options.add_argument('--window-size=1920,1080')
        options.binary_location = CHROME_PATH
        
        service = Service(CHROMEDRIVER_PATH)
        driver = webdriver.Chrome(service=service, options=options)
        driver.set_page_load_timeout(30)
        
        print("[*] Đang truy cập link Uptolink...")
        driver.get(CONFIG["UPTO_LINK"])
        
        print("[*] Đợi JavaScript chạy và redirect...")
        time.sleep(8)
        
        final_url = driver.current_url
        print(f"[*] URL cuối: {final_url}")
        
        domain = urlparse(final_url).netloc.lower()
        
        for keep in CONFIG["KEYWORDS_KEEP"]:
            if keep in domain:
                code = extract_code(final_url)
                if code:
                    print(f"[+] Phát hiện mã: {code}")
                    return {"type": "keep", "code": code}
                return {"type": "keep", "code": None}
        
        for ignore in CONFIG["KEYWORDS_IGNORE"]:
            if ignore in domain:
                print(f"[-] Phát hiện {ignore}")
                return {"type": "ignore"}
        
        print(f"[?] Domain lạ: {domain}")
        return {"type": "unknown"}
        
    except Exception as e:
        print(f"[!] Lỗi check_upto_link: {e}")
        return None
    finally:
        if driver:
            driver.quit()

def send_telegram(chat_id, message):
    if not CONFIG["BOT_TOKEN"] or not chat_id:
        return
    
    try:
        url = f"https://api.telegram.org/bot{CONFIG['BOT_TOKEN']}/sendMessage"
        requests.post(url, json={
            "chat_id": chat_id,
            "text": message,
            "parse_mode": "HTML"
        })
        print(f"[+] Đã gửi tin nhắn đến {chat_id}")
    except Exception as e:
        print(f"Telegram lỗi ({chat_id}): {e}")

def send_telegram_to_all(message):
    users = load_users()
    if not users:
        print("[!] Chưa có user nào /start")
        return
    
    success_count = 0
    for chat_id in users:
        try:
            url = f"https://api.telegram.org/bot{CONFIG['BOT_TOKEN']}/sendMessage"
            requests.post(url, json={
                "chat_id": chat_id,
                "text": message,
                "parse_mode": "HTML"
            })
            success_count += 1
        except Exception as e:
            print(f"Telegram lỗi ({chat_id}): {e}")
    
    print(f"[+] Đã gửi tin nhắn đến {success_count}/{len(users)} user")

def format_message(codes):
    now = datetime.now()
    time_str = now.strftime("%H:%M, %d/%m/%Y")
    codes_list = "\n".join([f"- {code}" for code in sorted(codes)])
    return f"PHÁT HIỆN MÃ MỚI ✅ \n{codes_list}\n{time_str}"

def run_check():
    global running
    if not running:
        return
    
    users = load_users()
    known_codes = load_log()
    
    print(f"\n[*] Kiểm tra lúc: {datetime.now().strftime('%H:%M:%S')}")
    found_codes = set()
    new_codes = set()
    has_keep = False
    has_ignore = False
    ignore_count = 0
    log_messages = []
    
    for i in range(CONFIG["MAX_CHECKS"]):
        if not running:
            break
        result = check_upto_link()
        
        if result is None:
            log_messages.append(f"❌ Lỗi kết nối (lần {i+1})")
            continue
            
        if result.get("type") == "keep":
            has_keep = True
            code = result.get('code')
            if code:
                if code in known_codes:
                    log_messages.append(f"⏭️ Mã {code} (đã có)")
                else:
                    print(f"[+] Mã mới: {code}")
                    found_codes.add(code)
                    new_codes.add(code)
                    log_messages.append(f"✅ Mã mới {code}")
            else:
                log_messages.append("⚠️ Link hướng dẫn nhưng không có mã")
        elif result.get("type") == "ignore":
            has_ignore = True
            ignore_count += 1
            log_messages.append(f"❌ Totreview (lần {ignore_count})")
        else:
            log_messages.append(f"❓ Không xác định (lần {i+1})")
        
        time.sleep(CONFIG["WAIT_SECONDS"])
    
    message = ""
    
    if new_codes:
        message = format_message(new_codes)
        print(f"[+] Đã thông báo {len(new_codes)} mã mới")
        all_codes = known_codes.union(new_codes)
        save_log(all_codes)
    elif has_ignore and not found_codes and ignore_count >= CONFIG["MAX_CHECKS"]:
        message = "Dữ Liệu Trả Về Totreview - Hết Mã 🖕🏻"
        print("🖕🏻 LINK ĐÃ HẾT MÃ (totreview)")
    elif has_keep and not found_codes:
        message = "⚠️ Có link hướng dẫn nhưng không lấy được mã."
        print("[!] Lỗi parse mã")
    else:
        message = "ℹ️ Không tìm thấy mã mới trong lần kiểm tra này."
        print("[ ] Không tìm thấy mã mới")
    
    send_telegram_to_all(message)
    
    if log_messages:
        log_text = "📋 LOG KIỂM TRA:\n" + "\n".join(log_messages[-5:])
        send_telegram_to_all(log_text)

# =================== VÒNG LẶP CHÍNH ===================
def main_loop():
    global running, last_clear_hour, last_check_time
    
    while running:
        try:
            now = datetime.now()
            current_hour = now.hour
            current_minute = now.minute
            
            # Xóa log vào phút 55 mỗi giờ
            if current_minute == 55 and current_hour != last_clear_hour:
                last_clear_hour = current_hour
                print(f"\n[*] === XÓA LOG LÚC {current_hour}:55 ===")
                clear_log()
                print(f"[*] === ĐÃ XÓA LOG ===\n")
            
            # Kiểm tra mỗi 5 phút
            current_time = time.time()
            if current_time - last_check_time >= CONFIG["CHECK_INTERVAL_MINUTES"] * 60:
                last_check_time = current_time
                print(f"[*] === BẮT ĐẦU KIỂM TRA {datetime.now().strftime('%H:%M')} ===")
                run_check()
                print(f"[*] === KẾT THÚC KIỂM TRA ===\n")
            
            # Hiển thị trạng thái
            if current_minute < 55:
                mins_to_clear = 55 - current_minute
                print(f"\r[*] Giờ {current_hour}:{current_minute:02d} | Xóa log sau {mins_to_clear} phút | Kiểm tra mỗi {CONFIG['CHECK_INTERVAL_MINUTES']} phút", end="")
            else:
                mins_to_next_hour = 60 - current_minute
                next_hour = (current_hour + 1) % 24
                print(f"\r[*] Đã xóa log {current_hour}:55 | Còn {mins_to_next_hour} phút đến giờ {next_hour}:00", end="")
            
            time.sleep(30)
            
        except Exception as e:
            print(f"[!] Lỗi trong main_loop: {e}")
            time.sleep(60)

# =================== XỬ LÝ LỆNH TELEGRAM ===================
def handle_telegram_updates():
    global running, bot_thread, last_check_time
    last_update_id = 0
    
    while True:
        try:
            url = f"https://api.telegram.org/bot{CONFIG['BOT_TOKEN']}/getUpdates"
            params = {"offset": last_update_id + 1, "timeout": 30}
            resp = requests.get(url, params=params, timeout=60)
            data = resp.json()
            
            if not data.get("ok"):
                continue
            
            for update in data.get("result", []):
                last_update_id = update.get("update_id")
                message = update.get("message")
                if message:
                    chat_id = message.get("chat", {}).get("id")
                    from_user = message.get("from", {})
                    user_id = str(from_user.get("id", ""))
                    text = message.get("text", "")
                    
                    # LỆNH /RUNBOT (CHỈ ADMIN)
                    if text == "/runbot" and user_id == CONFIG["ADMIN_ID"]:
                        if running:
                            send_telegram(chat_id, "⚠️ Bot đã đang chạy!")
                        else:
                            running = True
                            last_clear_hour = -1
                            last_check_time = time.time()
                            send_telegram(chat_id, f"✅ Bot đã khởi động! Kiểm tra mỗi {CONFIG['CHECK_INTERVAL_MINUTES']} phút.")
                            print("[+] Admin đã bật bot")
                            
                            if bot_thread is None or not bot_thread.is_alive():
                                bot_thread = threading.Thread(target=main_loop, daemon=True)
                                bot_thread.start()
                    
                    # LỆNH /STOPBOT (CHỈ ADMIN)
                    elif text == "/stopbot" and user_id == CONFIG["ADMIN_ID"]:
                        if running:
                            running = False
                            send_telegram(chat_id, "🛑 Bot đã được tắt!")
                            print("[+] Admin đã tắt bot")
                        else:
                            send_telegram(chat_id, "⚠️ Bot đã tắt rồi!")
                    
                    # LỆNH /START
                    elif text == "/start":
                        users = load_users()
                        users.add(str(chat_id))
                        save_users(users)
                        print(f"[+] User {chat_id} đã /start")
                        
                        is_group = int(chat_id) < 0
                        group_notice = " (nhóm)" if is_group else ""
                        
                        welcome_msg = f"🤖 Chào mừng bạn đến với UptoLink Monitor Bot{group_notice}!\n\n" + \
                                     f"🔄 Bot kiểm tra mỗi {CONFIG['CHECK_INTERVAL_MINUTES']} phút.\n" + \
                                     "📋 Log mã được xóa vào phút 55 mỗi giờ.\n\n" + \
                                     f"👥 Hiện có {len(users)} user đã đăng ký.\n\n" + \
                                     "🔐 Lệnh Admin:\n" + \
                                     "/runbot - Khởi động bot\n" + \
                                     "/stopbot - Tắt bot"
                        send_telegram(chat_id, welcome_msg)
                    
                    # LỆNH /STATUS
                    elif text == "/status":
                        users = load_users()
                        known_codes = load_log()
                        status = f"📊 TRẠNG THÁI BOT\n\n" + \
                                 f"🟢 Bot: {'Đang chạy' if running else 'Đã tắt'}\n" + \
                                 f"👥 Số user: {len(users)}\n" + \
                                 f"📋 Mã đã lưu: {len(known_codes)}\n" + \
                                 f"🔗 Link: {CONFIG['UPTO_LINK']}\n" + \
                                 f"⏱ Kiểm tra: Mỗi {CONFIG['CHECK_INTERVAL_MINUTES']} phút\n" + \
                                 f"🔄 Xóa log: Phút 55 mỗi giờ"
                        send_telegram(chat_id, status)
        
        except requests.exceptions.Timeout:
            print("[!] Timeout, bỏ qua và tiếp tục...")
            time.sleep(2)
            continue
        except Exception as e:
            print(f"[!] Lỗi handle updates: {e}")
            time.sleep(5)

# =================== MAIN ===================
def main():
    global running
    
    users = load_users()
    known_codes = load_log()
    
    # In thông tin khởi động
    print("=" * 50)
    print("TELEGRAM UPTOLINK MONITOR BOT")
    print(f"Link: {CONFIG['UPTO_LINK']}")
    print(f"Admin ID: {CONFIG['ADMIN_ID']}")
    print(f"Kiểm tra mỗi: {CONFIG['CHECK_INTERVAL_MINUTES']} phút")
    print(f"Xóa log: Phút 55 mỗi giờ")
    print(f"Bot đang: {'CHẠY' if running else 'TẮT'}")
    print(f"Số user: {len(users)}")
    print(f"Mã đã lưu: {len(known_codes)}")
    print("=" * 50)
    
    # Thread Telegram
    telegram_thread = threading.Thread(target=handle_telegram_updates, daemon=True)
    telegram_thread.start()
    print("[+] Thread Telegram đã chạy")
    
    # Nếu bot đã bật từ trước, chạy main_loop
    global bot_thread
    if running:
        bot_thread = threading.Thread(target=main_loop, daemon=True)
        bot_thread.start()
    else:
        print("[*] Bot đang tắt. Chờ admin gửi /runbot để khởi động.")
    
    # Giữ main chạy
    while True:
        try:
            time.sleep(10)
        except KeyboardInterrupt:
            print("\n[*] Dừng bot")
            send_telegram_to_all("🛑 Bot đã dừng.")
            break

if __name__ == "__main__":
    main()
