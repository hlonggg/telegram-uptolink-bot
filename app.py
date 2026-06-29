from flask import Flask
import threading
import os

app = Flask(__name__)

@app.route('/')
def home():
    return "Bot đang chạy!"

@app.route('/ping')
def ping():
    return "Pong!"

def run_bot():
    # Import và chạy bot chính
    os.system("python bot.py")

if __name__ == "__main__":
    # Chạy bot trong thread riêng
    bot_thread = threading.Thread(target=run_bot, daemon=True)
    bot_thread.start()
    
    # Chạy web server
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
