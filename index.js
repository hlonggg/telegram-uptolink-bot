const { Telegraf } = require('telegraf');
const axios = require('axios');
const cron = require('node-cron');

// =================== CẤU HÌNH ===================
// 🔧 SỬA CÁC GIÁ TRỊ BÊN DƯỚI THEO CỦA BẠN
// HOẶC DÙNG BIẾN MÔI TRƯỜNG (khuyến nghị cho Railway)
const CONFIG = {
    // Telegram Bot
    BOT_TOKEN: process.env.BOT_TOKEN || '8801698234:AAGUersDEYljjVSxgMzSJeNjbEv0RI2fNWc',
    CHAT_ID: process.env.CHAT_ID || '5550417994',

    // Uptolink
    UPTO_LINK: process.env.UPTO_LINK || 'https://uptolink.vip/Ce8sj',

    // Từ khóa
    KEYWORDS_KEEP: ['linkhuongdan.online'],
    KEYWORDS_IGNORE: ['totreview.com', 'totreview'],

    // Cài đặt kiểm tra
    MAX_CHECKS: 15,
    WAIT_SECONDS: 2,
    CHECK_INTERVAL_MINUTES: 30
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

    // Xử lý kết quả và GỬI TIN NHẮN TRONG MỌI TRƯỜNG HỢP
    let message = '';
    
    if (foundCodes.size > 0) {
        message = formatMessage(foundCodes);
        console.log(`[+] Đã thông báo ${foundCodes.size} mã`);
    } else if (hasKeep && foundCodes.size === 0) {
        message = '⚠️ Có link hướng dẫn nhưng không lấy được mã.\nVui lòng kiểm tra lại cấu hình hoặc link Uptolink.';
        console.log('[!] Lỗi parse mã');
    } else if (hasIgnore && foundCodes.size === 0) {
        message = '❌ LINK ĐÃ HẾT MÃ.\nKhông còn mã nào để lấy.';
        console.log('🖕🏻 LINK ĐÃ HẾT MÃ');
    } else {
        message = 'ℹ️ Không tìm thấy mã nào trong lần kiểm tra này.\nCó thể link chưa có mã hoặc đã hết hạn.';
        console.log('[ ] Không tìm thấy mã nào');
    }

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

    // ✅ FIX LỖI 409: Xóa webhook cũ trước khi dùng polling
    try {
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        console.log('[+] Đã xóa webhook cũ, giải phóng cho polling.');
    } catch (error) {
        console.log('[!] Không xóa được webhook:', error.message);
        // Vẫn tiếp tục, có thể không có webhook cũ
    }

    // ✅ LAUNCH BOT VỚI POLLING
    await bot.launch({
        polling: {
            timeout: 30,    // Thời gian chờ mỗi request
            limit: 100,     // Số update tối đa mỗi request
        }
    });
    console.log('[+] Bot đã sẵn sàng (polling)!');

    console.log('[*] Chạy kiểm tra lần đầu...');
    await runCheck();

    // Xử lý tắt bot
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
