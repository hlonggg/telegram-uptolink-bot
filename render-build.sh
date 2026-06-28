#!/bin/bash

# Cập nhật và cài Chromium + ChromeDriver
apt-get update
apt-get install -y chromium-driver chromium

# Tạo symlink để Selenium tìm thấy
ln -s /usr/bin/chromium /usr/bin/chromium-browser

echo "[+] Chromium đã được cài đặt"
