const { Telegraf } = require('telegraf');
const axios = require('axios');
const cron = require('node-cron');

// =================== CẤU HÌNH ===================
// 🔧 SỬA CÁC GIÁ TRỊ BÊN DƯỚI THEO CỦA BẠN
const CONFIG = {
    // Telegram Bot
    BOT_TOKEN: '8801698234:AAGUersDEYljjVSxgMzSJeNjbEv0RI2fNWc',  // Token bot Telegram
    CHAT_ID: '5550417994',                                  // Chat ID Telegram

    // Uptolink
    UPTO_LINK: 'https://uptolink.vip/Ce8sj', // Link Uptolink cần kiểm tra

    // Từ khóa
    KEYWORDS_KEEP: ['linkhuongdan.online'],   // Domain chứa mã cần giữ
    KEYWORDS_IGNORE: ['totreview.com', 'totreview'], // Domain bỏ qua

    // Cài đặt kiểm tra
    MAX_CHECKS: 20,        // Số lần kiểm tra mỗi chu kỳ
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
    let checkResults = [];

    for (let i = 0; i < CONFIG.MAX_CHECKS; i++) {
        console.log(`[*] Lần ${i + 1}/${CONFIG.MAX_CHECKS}`);
        const result = await checkUptoLink();

        if (!result) continue;

        if (result.type === 'keep') {
            hasKeep = true;
            console.log(`[+] Phát hiện mã: ${result.code}`);
            foundCodes.add(result.code);
            checkResults.push(`✅ Mã ${result.code}`);
        } else if (result.type === 'ignore') {
            hasIgnore = true;
            console.log('[*] Phát hiện totreview');
            checkResults.push('❌ Totreview (hết mã)');
        } else if (result.type === 'unknown') {
            checkResults.push('❓ Domain lạ');
        }

        await new Promise(resolve => setTimeout(resolve, CONFIG.WAIT_SECONDS * 1000));
    }

    // Xử lý kết quả và GỬI TIN NHẮN TRONG MỌI TRƯỜNG HỢP
    let message = '';
    
    if (foundCodes.size > 0) {
        // CÓ MÃ → gửi danh sách mã
        message = formatMessage(foundCodes);
        console.log(`[+] Đã thông báo ${foundCodes.size} mã`);
    } else if (hasKeep && foundCodes.size === 0) {
        // Có link hướng dẫn nhưng không lấy được mã
        message = '⚠️ Có link hướng dẫn nhưng không lấy được mã.\nVui lòng kiểm tra lại cấu hình hoặc link Uptolink.';
        console.log('[!] Lỗi parse mã');
    } else if (hasIgnore && foundCodes.size === 0) {
        // Link đã hết mã (totreview)
        message = '❌ LINK ĐÃ HẾT MÃ.\nKhông còn mã nào để lấy.';
        console.log('🖕🏻 LINK ĐÃ HẾT MÃ');
    } else {
        // Không tìm thấy gì
        message = 'ℹ️ Không tìm thấy mã nào trong lần kiểm tra này.\nCó thể link chưa có mã hoặc đã hết hạn.';
        console.log('[ ] Không tìm thấy mã nào');
    }

    // Gửi tin nhắn tới user (bất kể có mã hay không)
    await sendTelegram(message);
    console.log('[*] Kết thúc kiểm tra');
}

// =================== LỆNH TELEGRAM ===================
bot.command('start', async (ctx) => {
    const chatId = ctx.chat.id;
    await bot.telegram.sendMessage(
        chatId,
        '🤖 Chào mừng bạn đến với UptoLink Monitor Bot!\n\n' +
        'Bot sẽ tự động kiểm tra link Uptolink mỗi 30 phút và gửi thông báo kết quả (có mã hoặc không có mã).\n\n' +
        '📌 Lệnh:\n' +
        '/start - Xem hướng dẫn\n' +
        '/status - Xem trạng thái bot'
    );
    console.log(`[+] User ${chatId} đã dùng /start`);
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
