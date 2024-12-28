const TelegramBot = require('node-telegram-bot-api');
const mysql = require('mysql');
const fs = require('fs');

//目前群组任何人均可操控芙芙开车机器人，例如：/kc@机器人用户名、/zt@机器人用户名
//部署本代码的机器人可以在群组或者个人用户中提供服务，频道暂时不行，被@也收不到消息
//本代码能存储错误信息到error.txt文件中，存储运行日志信息到log.txt文件中
//msg.chat.type可以获取聊天对象类型。private为用户，supergroup为群组
//id为负数的为群组，正数的为用户

// 创建与Telegram Bot API的连接
const bot = new TelegramBot('填写Telegram Bot API', { polling: true });

//开车机器人管理员id
const adminId = 管理员id;

// 创建与MySQL数据库的连接
const connection = mysql.createConnection({
  host: '数据库IP',
  user: '用户名',
  password: '密码',
  database: '数据库名'
});

appendInfoToLog('                                                                     '+'\n',0);
appendInfoToLog('---------------程序单次运行获取输出信息分割线---------------'+'\n',0);

// 连接数据库
connection.connect((err) => {
  if (err) {
    console.error('无法连接到数据库:', err.message);
    return;
  }
  console.log('成功连接到数据库'); 
  appendInfoToLog('成功连接到数据库！',1);
  // 在这里添加周期性ping数据库的代码，每10分钟执行一次
  setInterval(function () {
     connection.query('SELECT 1');
   },10*6*10000);
});

const timeoutMap = {};

// 函数用于追加错误信息到error.txt文件
function appendErrorToFile(error,chatId) {
   //停止推送视频
   if(chatId){
    clearTimeout(timeoutMap[chatId][0]);
    delete timeoutMap[chatId];
   }
  // 获取服务器当前时间代码：new Date().toISOString()
  const timestamp = getBeijingTime();
  // 创建错误信息字符串，包含时间戳和错误信息
  const errorMessage = `${timestamp}  ${error}\n`;
  // 将错误信息追加到error.txt文件中
  fs.appendFileSync('error.txt', errorMessage, 'utf8');
}

// 函数用于追加日志信息到log.txt文件
function appendInfoToLog(info,time) {
     if(!time){
       //time的值为0则不添加时间信息
       fs.appendFileSync('log.txt', info, 'utf8');
       fs.appendFileSync('error.txt', info, 'utf8');
       return;
    }
    // 获取服务器当前时间代码：new Date().toISOString()
  const timestamp = getBeijingTime();
  // 创建日志信息字符串，包含时间戳和日志信息
  const infoMessage = `${timestamp}  ${info}\n`;  
  // 将日志信息追加到log.txt文件中
  fs.appendFileSync('log.txt', infoMessage, 'utf8');
}

//获取北京时间
function getBeijingTime() {  
    // 获取当前UTC时间  
    const now = new Date();  
  
    // 将UTC时间转换为北京时间（东八区）  
    // 注意：getUTCHours()等方法返回的是UTC时间，需要手动加上时区差  
    const hours = now.getUTCHours() + 8;  
    const minutes = now.getUTCMinutes();  
    const seconds = now.getUTCSeconds();  
  
    // 处理小时数超过24的情况  
    let formattedHours = hours % 24;  
    if (formattedHours < 10) {  
        formattedHours = '0' + formattedHours;  
    }  
  
    // 处理分钟和秒数小于10的情况  
    const formattedMinutes = minutes < 10 ? '0' + minutes : minutes;  
    const formattedSeconds = seconds < 10 ? '0' + seconds : seconds;  
  
    // 获取年月日（这些不受时区影响）  
    const year = now.getFullYear();  
    const month = now.getMonth() + 1; // 月份是从0开始的  
    const day = now.getDate();  
  
    // 格式化月份和日期  
    const formattedMonth = month < 10 ? '0' + month : month;  
    const formattedDay = day < 10 ? '0' + day : day;  
  
    // 拼接字符串  
    const beijingTime = `${year}-${formattedMonth}-${formattedDay}  ${formattedHours}:${formattedMinutes}:${formattedSeconds}`;  
  
    return beijingTime;  
}

// 处理接收到的消息
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const videoUrl = msg.video ? msg.video.file_id : null;

  // 判断是否为机器人主人发送的消息
  if (msg.from.id === adminId && videoUrl) {
    // 存储视频消息的url到videos数据表中
    connection.query('INSERT INTO videos (url) VALUES (?)', [videoUrl], (error, results) => {
      if (error) {
        console.error('存储视频消息时发生错误:',error.message);
        appendErrorToFile('存储视频消息时发生错误:'+error.message);
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
  const username = msg.chat.username;

   //检测群组或私聊是否已经进行推送
   if(timeoutMap[chatId]){
      bot.sendMessage(chatId, '芙芙已经在尽力推送视频的路上喵~');
      return;
   }

  // 检查群组或私聊是否在groups数据表中
  connection.query('SELECT * FROM groups WHERE chatid = ?', [chatId], (error, results) => {
    if (error) {
      console.error('检查群组时发生错误:', error.message);
      appendErrorToFile('检查群组时发生错误:'+error.message);
      return;
    }

    if (results.length > 0) {
      // 已存在于groups数据表中，开始推送视频消息
      console.log('开始推送视频消息');
      timeoutMap[chatId] = []; // 初始化timeoutMap[chatId]
      appendInfoToLog('开始id为'+chatId+'和用户名为'+username+'的用户推送'+results[0].now+'号视频！',1);
      sendVideoMessages(chatId, results[0].now,username);
      timeoutMap[chatId][1] = results[0].now+1;
      timeoutMap[chatId][2] = username;
    } else {
      // 不存在于groups数据表中，添加到groups数据表并开始推送视频消息
      console.log('开始添加ID：' + chatId);
   connection.query('INSERT INTO groups (chatid) VALUES (?)', [chatId], function (error, results, fields) {
        if (error) throw error;
        console.log('群组/私聊已添加到groups数据表');
    });
      console.log('开始推送视频消息');
      timeoutMap[chatId] = []; // 初始化timeoutMap[chatId]
      appendInfoToLog('开始id为'+chatId+'和用户名为'+username+'的用户初次推送视频！',1);
      sendVideoMessages(chatId, 0,username);
      timeoutMap[chatId][1] = 1;
      timeoutMap[chatId][2] = username;
    }
  });
});

// 处理接收到的停止命令
bot.onText(/\/zt/, (msg) => {
  const chatId = msg.chat.id;
  const username = msg.chat.username;

  // 停止推送视频消息，将当前now赋值给now字段
  connection.query('UPDATE groups SET now = ? WHERE chatid = ?', [timeoutMap[chatId][1], chatId], (error, results) => {

    if (error) {
      console.error('停止推送视频消息时发生错误:', error.message);
      appendErrorToFile('id为'+chatId+'和用户名为'+username+'的用户在停止推送视频消息时发生错误:'+error.message,chatId);
      bot.sendMessage(chatId,'发生错误，芙芙要变奇怪了，帮忙联系@抢救一下！');
      bot.sendMessage(adminId,'亲爱的主人，芙芙要坏掉了，赶紧来补救一下！触发错误的id为'+chatId+'且'+username+'为其用户名！');
      connection.end();//关闭数据库
      process.exit(1); // 退出应用
      return;
    }

    clearTimeout(timeoutMap[chatId][0]);
    delete timeoutMap[chatId];
    console.log('已停止为id为'+chatId+'和用户名为'+username+'的用户推送视频消息');
    appendInfoToLog('已停止为id为'+chatId+'和用户名为'+username+'的用户推送视频！',1);
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
  appendInfoToLog('数据库连接已关闭，应用准备退出！',1);
  process.exit(1); // 退出应用
});

function sendVideoMessages(chatId, now,username) {

  // 获取视频消息列表
  connection.query('SELECT * FROM videos', (error, results) => {
    if (error) {
     console.error('查询视频消息时发生错误:', error.message);
     appendErrorToFile('查询视频消息时发生错误:'+error.message,chatId);
      return;
    }

    if (now >= results.length) {
      // 当 now 的值为最后一个视频消息的索引时，暂停提供视频，将当前 now 赋值给 now 字段
      clearTimeout(timeoutMap[chatId][0]);
      delete  timeoutMap[chatId];
      console.log('已停止为'+chatId+'的用户推送视频');
      appendInfoToLog('已停止为id为'+chatId+'和用户名为'+username+'的用户推送视频！',1);
      connection.query('UPDATE groups SET now = ? WHERE chatid = ?', [timeoutMap[chatId][1] + 1, chatId], (error, results) => {
        if (error) {
          console.log('id为'+chatId+'和用户名为'+username+'的用户更新 now 字段时发生错误:'+error.message);
          appendErrorToFile('id为'+chatId+'和用户名为'+username+'的用户更新 now 字段时发生错误:'+error.message,chatId);
        }
      });
      bot.sendMessage(chatId, "芙芙库存被榨干了喵，已自动暂停，可以联系@补库存喵~\n库存有新增了可以重新输入/kc激活芙芙喵~");
    } else {
      // 发送视频消息
      bot.sendVideo(chatId, results[now].url, { caption: '生活不易，芙芙发车卖艺喵，每隔10分钟发一次车喵~' })
        .then(sentVideo => {
          console.log('视频消息发送成功！', sentVideo);
        })
        .catch(error => {
          console.log('对id为'+chatId+'和用户名为'+username+'的用户发送视频消息失败:'+error.message);
          appendErrorToFile('对id为'+chatId+'和用户名为'+username+'的用户发送视频消息失败:'+error.message,chatId);
        });

      // 延迟10分钟后继续发送下一个视频消息
      timeoutMap[chatId][0] = setTimeout(() => {
        sendVideoMessages(chatId, now +1);
      },10*6*10000);
    }
  });
}
