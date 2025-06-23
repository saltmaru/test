
require('dotenv').config();
if (!process.env.LINE_CHANNEL_SECRET || !process.env.LINE_CHANNEL_ACCESS_TOKEN) {
  console.error('LINE チャネル情報が .env に未設定です');
  process.exit(1);
}

const express = require('express');
const { middleware, Client } = require('@line/bot-sdk');

const app = express();
const port = process.env.PORT || 3000;

const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

const client = new Client({ channelAccessToken: config.channelAccessToken });

app.post('/webhook', middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  if (event.type === 'message' && event.message.type === 'text') {
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: `あなたのメッセージ：${event.message.text}`
    });
  }
  return Promise.resolve(null);
}

app.listen(port, () => {
  console.log(`Botサーバーがポート${port}で起動しました`);
});
