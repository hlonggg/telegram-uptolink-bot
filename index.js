const { Telegraf } = require('telegraf');
const axios = require('axios');
const cron = require('node-cron');

// =================== CẤU HÌNH ===================
// 🔧 SỬA CÁC GIÁ TRỊ BÊN DƯỚI THEO CỦA BẠN
const CONFIG = {
    // Telegram Bot
    BOT_TOKEN: '8801698234:AAGUersDEYljjVSxgMzSJeNjbEv0RI2fNWc',  // Token bot Telegram
    CHAT_ID: '8801698234',                                  // Chat ID Telegram

    // Uptolink
    UPTO_LINK: 'https://uptolink.vip/Ce8sj', // Link Uptolink cần kiểm tra

    // Từ khóa
    KEYWORDS_KEEP: ['linkhuongdan.online'],   // Domain chứa mã cần giữ
    KEYWORDS_IGNORE: ['totreview.com', 'totreview'], // Domain bỏ qua

    // Cài đặt kiểm tra
    MAX_CHECKS: 15,        // Số lần kiểm tra mỗi chu kỳ
    WAIT_SECONDS: 10,       // Giây chờ giữa các lần kiểm tra
    CHECK_INTERVAL_MINUTES: 60  // Phút giữa các chu kỳ
};
// ===================================================

// Khởi tạo bot
const bot = new Telegraf(CONFIG.BOT_TOKEN);

// =================== HÀM CHÍNH ===================
function extractCode(url) {
    let match = url.match(/\/(\d+-\d+)\/?/);
    if (match) return match[1];
    match = url.match(/\/(\d+)(?:\?|$)/);
    if (match) return match[1];
    return null;
}

async function checkUptoLink() {
    try {
        const response = await axios.get(CONFIG.UPTO_LINK, {
            maxRedirects: 0,
            validateStatus: null,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });

        if (response.status === 301 || response.status === 302) {
            const redirectUrl = response.headers.location;
            if (!redirectUrl) return null;

            const url = new URL(redirectUrl);
            const domain = url.hostname.toLowerCase();

            for (const keep of CONFIG.KEYWORDS_KEEP) {
                if (domain.includes(keep)) {
                    const code = extractCode(redirectUrl);
                    if (code) return { type: 'keep', code };
                }
            }

            for (const ignore of CONFIG.KEYWORDS_IGNORE) {
                if (domain.includes(ignore)) {
                    return { type: 'ignore' };
                }
            }

            return { type: 'unknown' };
        }
        return null;
    } catch (error) {
        console.error(`[!] Lỗi: ${error.message}`);
        return null;
    }
}

async function sendTelegram(message) {
    try {
        await bot.telegram.sendMessage(CONFIG.CHAT_ID, message, { parse_mode: 'HTML' });
        console.log('[+] Đã gửi tin nhắn');
    } catch (error) {
        console.error(`Telegram lỗi: ${error.message}`);
    }
}

function formatMessage(codes) {
    const now = new Date();
    const timeStr = now.toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
    const codesList = [...codes].sort().map(c => `- ${c}`).join('\n');
    return `PHÁT HIỆN MÃ MỚI ✅ \n${codesList}\n${timeStr}`;
}

// =================== KIỂM TRA ===================
async function runCheck() {
    console.log(`\n[*] Bắt đầu kiểm tra lúc: ${new Date().toLocaleString('vi-VN')}`);
    const foundCodes = new Set();
    let hasKeep = false;
    let hasIgnore = false;

    for (let i = 0; i < CONFIG.MAX_CHECKS; i++) {
        console.log(`[*] Lần ${i + 1}/${CONFIG.MAX_CHECKS}`);
        const result = await checkUptoLink();

        if (!result) continue;

        if (result.type === 'keep') {
            hasKeep = true;
            console.log(`[+] Phát hiện mã: ${result.code}`);
            foundCodes.add(result.code);
        } else if (result.type === 'ignore') {
            hasIgnore = true;
            console.log('[*] Phát hiện totreview');
        }

        await new Promise(resolve => setTimeout(resolve, CONFIG.WAIT_SECONDS * 1000));
    }

    // Xử lý kết quả
    if (foundCodes.size > 0) {
        await sendTelegram(formatMessage(foundCodes));
        console.log(`[+] Đã thông báo ${foundCodes.size} mã`);
    } else if (hasKeep && foundCodes.size === 0) {
        console.log('[!] Có link hướng dẫn nhưng không lấy được mã');
    } else if (hasIgnore && foundCodes.size === 0) {
        console.log('🖕🏻 LINK ĐÃ HẾT MÃ');
        await sendTelegram('❌ LINK ĐÃ HẾT MÃ.');
    } else {
        console.log('[ ] Không tìm thấy mã nào');
    }

    console.log('[*] Kết thúc kiểm tra');
}

// =================== LỆNH TELEGRAM ===================
bot.command('start', async (ctx) => {
    const chatId = ctx.chat.id;
    await bot.telegram.sendMessage(
        chatId,
        '🤖 Chào mừng bạn đến với UptoLink Monitor Bot!\n\n' +
        'Bot sẽ tự động kiểm tra link Uptolink và gửi thông báo khi phát hiện mã mới.\n\n' +
        '📌 Lệnh:\n' +
        '/start - Xem hướng dẫn\n' +
        '/run - Chạy kiểm tra ngay lập tức\n' +
        '/status - Xem trạng thái bot\n' +
        '/help - Hỗ trợ'
    );
    console.log(`[+] User ${chatId} đã dùng /start`);
});

bot.command('run', async (ctx) => {
    const chatId = ctx.chat.id;
    await bot.telegram.sendMessage(chatId, '🔄 Đang kiểm tra... Vui lòng chờ!');
    console.log(`[+] User ${chatId} yêu cầu chạy thủ công`);
    runCheck().catch(err => console.error(err));
});

bot.command('status', async (ctx) => {
    const chatId = ctx.chat.id;
    const now = new Date();
    const status = `📊 TRẠNG THÁI BOT\n\n` +
                   `🟢 Bot: Đang chạy\n` +
                   `📅 Thời gian: ${now.toLocaleString('vi-VN')}\n` +
                   `🔗 Link: ${CONFIG.UPTO_LINK}\n` +
                   `⏱ Chu kỳ: ${CONFIG.CHECK_INTERVAL_MINUTES} phút\n` +
                   `📌 Số lần kiểm tra: ${CONFIG.MAX_CHECKS}`;
    await bot.telegram.sendMessage(chatId, status);
    console.log(`[+] User ${chatId} đã dùng /status`);
});

bot.command('help', async (ctx) => {
    const chatId = ctx.chat.id;
    await bot.telegram.sendMessage(
        chatId,
        '📖 HƯỚNG DẪN SỬ DỤNG\n\n' +
        'Bot tự động kiểm tra link Uptolink mỗi 30 phút.\n' +
        'Khi phát hiện mã mới, bot sẽ gửi thông báo.\n\n' +
        '📌 Lệnh:\n' +
        '/start - Xem hướng dẫn\n' +
        '/run - Chạy kiểm tra ngay\n' +
        '/status - Xem trạng thái\n' +
        '/help - Hỗ trợ\n\n' +
        '🔧 Cấu hình hiện tại:\n' +
        `- Link Uptolink: ${CONFIG.UPTO_LINK}\n` +
        `- Chu kỳ: ${CONFIG.CHECK_INTERVAL_MINUTES} phút`
    );
    console.log(`[+] User ${chatId} đã dùng /help`);
});

// =================== CRON JOB ===================
cron.schedule(`*/${CONFIG.CHECK_INTERVAL_MINUTES} * * * *`, async () => {
    console.log('[*] === Cron job chạy ===');
    await runCheck();
    console.log('[*] === Kết thúc cron ===');
});

// =================== KHỞI ĐỘNG ===================
async function main() {
    console.log('='.repeat(50));
    console.log('TELEGRAM UPTOLINK MONITOR BOT');
    console.log(`Link: ${CONFIG.UPTO_LINK}`);
    console.log(`Bot Token: ${CONFIG.BOT_TOKEN.substring(0, 10)}...`);
    console.log(`Chu kỳ: ${CONFIG.CHECK_INTERVAL_MINUTES} phút`);
    console.log('='.repeat(50));

    await bot.launch();
    console.log('[+] Bot đã sẵn sàng!');

    console.log('[*] Chạy kiểm tra lần đầu...');
    await runCheck();

    process.once('SIGINT', () => {
        console.log('\n[*] Đang dừng bot...');
        bot.stop('SIGINT');
        process.exit(0);
    });
    process.once('SIGTERM', () => {
        console.log('\n[*] Đang dừng bot...');
        bot.stop('SIGTERM');
        process.exit(0);
    });
}

main().catch(err => {
    console.error('[!] Lỗi khởi động:', err);
    process.exit(1);
});
