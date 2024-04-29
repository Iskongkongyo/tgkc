const TelegramBot = require('node-telegram-bot-api');
const mysql = require('mysql');

//目前群组任何人均可操控芙芙开车机器人，后续添加命令只识别群主

// 创建与Telegram Bot API的连接
const bot = new TelegramBot('机器人API TOKEN', { polling: true });

// 创建与MySQL数据库的连接
const connection = mysql.createConnection({
  host: '127.0.0.1',
  user: '数据库用户名',
  password: '数据库密码',
  database: '数据库名'
});

// 连接数据库
connection.connect((err) => {
  if (err) {
    console.error('无法连接到数据库:', err.message);
    return;
  }
  console.log('成功连接到数据库');
  // 在这里添加周期性ping数据库的代码，每10分钟执行一次
  setInterval(function () {
     connection.query('SELECT 1');
   },10*6*10000);
});

const timeoutMap = {};

// 处理接收到的消息
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const videoUrl = msg.video ? msg.video.file_id : null;

  // 判断是否为机器人主人发送的消息
  if (msg.from.id === 5167635352 && videoUrl) {
    // 存储视频消息的url到videos数据表中
    connection.query('INSERT INTO videos (url) VALUES (?)', [videoUrl], (error, results) => {
      if (error) {
        console.error('存储视频消息时发生错误:', error.message);
        bot.sendMessage(chatId, '存储视频消息时发生错误:'+error.message);
        return;
      }
      console.log('视频消息已存储到videos数据表');
    });
  }
});

// 处理接收到的开车命令
bot.onText(/\/kc/, (msg) => {
  const chatId = msg.chat.id;

  // 检查群组或私聊是否在groups数据表中
  connection.query('SELECT * FROM groups WHERE chatid = ?', [chatId], (error, results) => {
    if (error) {
      console.error('检查群组时发生错误:', error.message);
      return;
    }

    if (results.length > 0) {
      // 已存在于groups数据表中，开始推送视频消息
      console.log('开始推送视频消息');
      timeoutMap[chatId] = []; // 初始化timeoutMap[chatId]
      sendVideoMessages(chatId, results[0].now);
      timeoutMap[chatId][1] = results[0].now+1;
    } else {
      // 不存在于groups数据表中，添加到groups数据表并开始推送视频消息
      console.log('开始添加ID：' + chatId);
connection.query('INSERT INTO groups (chatid) VALUES (?)', [chatId], function (error, results, fields) {
  if (error) throw error;
  // 如果没有错误，插入操作成功
        console.log('群组/私聊已添加到groups数据表');
});
      console.log('开始推送视频消息');
      timeoutMap[chatId] = []; // 初始化timeoutMap[chatId]
      sendVideoMessages(chatId, 0);
      timeoutMap[chatId][1] = 1;
    }
  });
});

// 处理接收到的停止命令
bot.onText(/\/zt/, (msg) => {
  const chatId = msg.chat.id;

  // 停止推送视频消息，将当前now赋值给now字段
  connection.query('UPDATE groups SET now = ? WHERE chatid = ?', [timeoutMap[chatId][1], chatId], (error, results) => {

    if (error) {
      console.error('停止推送视频消息时发生错误:', error.message);
      bot.sendMessage(chatId,'停不下来，芙芙要变奇怪了，快联系@IsKongKong抢救一下！');
      return;
    }
    clearTimeout(timeoutMap[chatId][0]);
    console.log('已停止推送视频消息');
    bot.sendMessage(chatId,'芙芙累了，已停止推送视频消息喵~');
  });

});

// 在退出应用时关闭数据库连接
process.on('exit', () => {
  connection.end();
  console.log('数据库连接已关闭');
});

// 在发生未捕获的异常时关闭数据库连接
process.on('uncaughtException', (err) => {
  console.error('未捕获的异常:', err.message);
  connection.end();
  console.log('数据库连接已关闭');
  process.exit(1); // 退出应用
});

// 在发生未处理的 Promise 拒绝时关闭数据库连接
process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的 Promise 拒绝:', reason.message || reason);
  connection.end();
  console.log('数据库连接已关闭');
  process.exit(1); // 退出应用
});

function sendVideoMessages(chatId, now) {

  // 获取视频消息列表
  connection.query('SELECT * FROM videos', (error, results) => {
    if (error) {
      console.error('查询视频消息时发生错误:', error.message);
      return;
    }

    if (now >= results.length) {
      // 当 now 的值为最后一个视频消息的索引时，暂停提供视频，将当前 now 赋值给 now 字段
      clearTimeout(timeoutMap[chatId][0]);
      console.log('已停止推送视频消息');
      connection.query('UPDATE groups SET now = ? WHERE chatid = ?', [timeoutMap[chatId][1] + 1, chatId], (error, results) => {
        if (error) {
          console.error('更新 now 字段时发生错误:', error.message);
        }
      });
      bot.sendMessage(chatId, "芙芙库存被榨干了喵，已自动暂停，可以联系@IsKongKong补库存喵~\n库存有新增了可以重新输入/kc激活芙芙喵~");
    } else {
      // 发送视频消息
      bot.sendVideo(chatId, results[now].url, { caption: '生活不易，芙芙发车卖艺喵，每隔10分钟发一次车喵~' })
        .then(sentVideo => {
          console.log('视频消息发送成功！', sentVideo);
        })
        .catch(error => {
          console.error('视频消息发送失败:', error.message);
        });

      // 延迟10分钟后继续发送下一个视频消息
      timeoutMap[chatId][0] = setTimeout(() => {
        sendVideoMessages(chatId, now +1);
      },10*6*10000);
    }
  });
}
