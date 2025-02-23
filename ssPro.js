const TelegramBot = require('node-telegram-bot-api');
const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
const chokidar = require('chokidar');

//目前群组任何人均可操控芙芙开车机器人，例如：/kc@机器人用户名、/zt@机器人用户名
//部署本代码的机器人可以在群组或者个人用户中提供服务，频道暂时不行，被@也收不到消息
//本代码能存储错误信息到error.txt文件中，存储运行日志信息到log.txt文件中
//msg.chat.type可以获取聊天对象类型。private为用户，supergroup为群组
//id为负数的为群组，正数的为用户

// 全局配置
let config = {};
let pool;
const timeoutMap = new Map();

/* 初始化函数 */
async function initialize() {
  await loadConfig();
  await initializeDatabase();
  startBot();
}

/* 配置加载 */
async function loadConfig() {
  try {
    const rawData = await fs.readFile(path.join(__dirname, './config.json'), 'utf8');
    config = JSON.parse(rawData);
    console.log('配置已加载:', config);
  } catch (err) {
    console.error('配置文件加载失败:', err.message);
    process.exit(1);
  }
}

// 监听配置文件变化
chokidar.watch('./config.json', { persistent: true }).on('change', () => {
  console.log('检测到配置文件更改，重新加载...');
  loadConfig();
});

/* 初始化数据库连接池 */
async function initializeDatabase() {
  pool = mysql.createPool({
    ...config.sql,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  try {
    await pool.query('SELECT 1');
    console.log('成功连接到数据库');
    await appendLog('数据库连接成功');
    
    setInterval(async () => {
      await pool.query('SELECT 1');
    }, config.pingInterval || 300000);
    
  } catch (err) {
    console.error('数据库连接失败:', err.message);
    await appendError(`数据库连接失败: ${err.message}`);
    process.exit(1);
  }
}

/* 日志记录函数 */
async function appendLog(message) {
  const timestamp = getBeijingTime();
  const logMessage = `${timestamp} [INFO] ${message}\n`;
  await fs.appendFile('log.txt', logMessage);
}

async function appendError(error) {
  const timestamp = getBeijingTime();
  const errorMessage = `${timestamp} [ERROR] ${error}\n`;
  await fs.appendFile('error.txt', errorMessage);
}

/* 时间处理函数 */
function getBeijingTime() {
  return new Date().toLocaleString('zh-CN', { 
    timeZone: 'Asia/Shanghai',
    hour12: false 
  });
}

/* 视频推送核心逻辑 */
async function pushVideo(bot, chatId, index) {
  try {
    const [videos] = await pool.query('SELECT url FROM videos ORDER BY id');

    if (index >= videos.length) {
      await bot.sendMessage(chatId, '库存告急，请联系管理员~');
      timeoutMap.delete(chatId);
      await pool.query('UPDATE groups SET now = 0 WHERE chatid = ?', [chatId]);
      return;
    }

    // 发送视频并添加控制按钮
    await bot.sendVideo(chatId, videos[index].url, config.infos || {});

    // 清除旧定时器并设置新定时器
    if (timeoutMap.has(chatId)) {
      clearTimeout(timeoutMap.get(chatId).timer);
    }

    const timer = setTimeout(async () => {
      await pushVideo(bot, chatId, index + 1);
    }, config.pushInterval || 600000);

    // 更新状态
    timeoutMap.set(chatId, { timer, nextIndex: index + 1 });
    await pool.query('UPDATE groups SET now = ? WHERE chatid = ?', [index + 1, chatId]);

  } catch (err) {
    await handleError(err, '视频推送失败', chatId);
    timeoutMap.delete(chatId);
  }
}

/* 启动推送流程 */
async function startPush(bot, chatId, startIndex, username) {
  try {
    await appendLog(`开始推送: ${chatId} (${username})`);
    await pushVideo(bot, chatId, startIndex);
  } catch (err) {
    await handleError(err, '启动推送失败', chatId);
  }
}

/* Telegram机器人逻辑 */
function startBot() {
  const bot = new TelegramBot(config.botToken, { polling: true });
  const adminRegex = new RegExp(config.adminId, 'i');

  // 消息处理
  bot.on('message', async (msg) => {
    try {
      const chatId = msg.chat.id;
      const video = msg.video;

      if (video && adminRegex.test(msg.from.id)) {
        await pool.query('INSERT INTO videos (url) VALUES (?)', [video.file_id]);
        await appendLog(`管理员上传视频: ${video.file_id}`);
        await bot.sendMessage(chatId, `视频已收录，当前库存：${(await pool.query('SELECT COUNT(*) as count FROM videos'))[0][0].count}`);
      }
    } catch (err) {
      await handleError(err, '消息处理失败', msg.chat.id);
    }
  });

  // 开车命令
  bot.onText(/\/kc/, async (msg) => {
    try {
      const chatId = msg.chat.id;
      if (timeoutMap.has(chatId)) {
        await bot.sendMessage(chatId, '芙芙已经在推送视频的路上啦~');
        return;
      }

      const [rows] = await pool.query('SELECT now FROM groups WHERE chatid = ?', [chatId]);
      
      if (rows.length > 0) {
        startPush(bot, chatId, rows[0].now, msg.chat.username);
      } else {
        await pool.query('INSERT INTO groups (chatid) VALUES (?)', [chatId]);
        startPush(bot, chatId, 0, msg.chat.username);
      }
    } catch (err) {
      await handleError(err, '处理/kc命令失败', msg.chat.id);
    }
  });

  // 回调处理
  bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const chatId = msg.chat.id;

    try {
      if (data === '/next') {
        if (!timeoutMap.has(chatId)) {
          await bot.sendMessage(chatId, '请先使用/kc命令启动推送');
          return;
        }
        const entry = timeoutMap.get(chatId);
        await pushVideo(bot, chatId, entry.nextIndex);
      } else if (data === '/zt') {
        if (timeoutMap.has(chatId)) {
          clearTimeout(timeoutMap.get(chatId).timer);
          timeoutMap.delete(chatId);
          await bot.sendMessage(chatId, '芙芙休息一下~');
          await appendLog(`停止推送: ${chatId}`);
        }
      }
    } catch (err) {
      await handleError(err, '处理回调失败', chatId);
    }
  });
}

/* 统一错误处理 */
async function handleError(err, context, chatId) {
  console.error(`${context}:`, err.message);
  
  const errorMessage = `${context}: ${err.message}`;
  await appendError(errorMessage);
  
  if (chatId) {
    try {
      await bot.sendMessage(chatId, '服务暂时不可用，请稍后再试');
      await bot.sendMessage(config.adminId, `故障通知: ${errorMessage}`);
    } catch (botErr) {
      console.error('发送错误消息失败:', botErr.message);
    }
  }
  
  // 重置数据库连接
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    await initializeDatabase();
  }
}

// 启动程序
initialize().catch(async (err) => {
  console.error('初始化失败:', err.message);
  await appendError(`初始化失败: ${err.message}`);
  process.exit(1);
});

// 进程退出处理
process.on('SIGINT', async () => {
  console.log('正在关闭服务...');
  if (pool) await pool.end();
  process.exit();
});
