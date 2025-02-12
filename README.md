# TG开车

使用Nodejs简单实现TG开车的功能，支持群组和个人开车。

主人将TG中的视频（或自行上传的视频）发送给机器人，机器人即可收录该视频ID到数据库中。

/kc是开车命令，默认十分钟一发车。/zt是暂停命令，会停止发车。

## 系统需要安装模块

1、安装node-telegram-bot-api模块

npm install node-telegram-bot-api

2、安装mysql模块（适用于kc.js和kc2.js）

npm install mysql

2、安装mysql2模块（适用于ssPro.js）

npm install mysql2

## 修改配置信息

适用于kc.js和kc2.js：导入datas.sql文件到数据库中，自行修改kc.js或kc2.js中机器人的API TOKEN和数据库信息。

适用于ssPro.js：导入datas.sql文件到数据库中，自行修改config.json配置文件中机器人的API TOKEN、数据库等信息。

## 配置文件说明

| Key          | Value                                                        |
| ------------ | ------------------------------------------------------------ |
| botToken     | 机器人API Token                                              |
| adminId      | 管理员ID，可填写多个，多个管理员ID以“\|”分割。格式如下所示：id1\|id2\|id3 |
| sql          | 填写导入data.sql文件数据库的连接信息                         |
| pushInterval | 视频推送间隔，单位是秒，默认每间隔10分钟推送一次             |
| pingInterval | SQL数据库心跳测试，单位是秒，默认10分钟测试一次              |

## 运行和命令

安装到Nodejs、所需模块和导入sql文件后。在kc.js、kc2.js或ssPro.js所在目录下，输入node kc.js/kc2.js/ssPro.js即可运行。

/kc是开车命令，默认十分钟一发车。/zt是暂停命令，会停止发车。
