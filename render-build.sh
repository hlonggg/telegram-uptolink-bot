#!/bin/bash
apt-get update
apt-get install -y chromium-driver chromium
ln -s /usr/bin/chromium /usr/bin/chromium-browser
