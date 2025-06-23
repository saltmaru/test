require('dotenv').config();
const express = require('express');
const { middleware, Client } = require('@line/bot-sdk');

const app = express();
const port = process.env.PORT || 3000;
const config = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};
const client = new Client(config);

// ユーザーごとのゲーム状態を保持
const sessions = {};

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
  if (event.type !== 'message' || event.message.type !== 'text') return;
  const userId = event.source.userId;
  const text = event.message.text.trim();
  let sess = sessions[userId];

  // ---------- START ----------
  if (text.toLowerCase() === 'start') {
    return startGame(userId, event.replyToken);
  }

  // セッションがない or リスタート待機中でないクリア後以外のテキストは無視
  if (!sess) return;

  // ---------- 終了ワード ----------
  if (['終了','終わり','finish'].some(w=> text.includes(w))) {
    clearSession(userId);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: 'ゲームを終了しました。また遊んでね！'
    });
  }

  // ---------- クリア検知 ----------
  if (text.includes('★ゲームクリア★')) {
    // クリア後リスタート待機状態へ
    sess.waitingRestart = true;
    // タイマーをセット：10秒後に「開始」処理 or 自動終了
    sess.restartTimer = setTimeout(() => {
      // ユーザーが終了ワードを送っていなければリスタート
      if (sessions[userId] && sessions[userId].waitingRestart) {
        startGame(userId);
      }
    }, 10000);
    return;  // クリアメッセージは返信不要
  }

  // ---------- ゲーム進行中 or クリア後待機中の割り込み ----------
  // クリア待機中に別のメッセージが来たらタイマーをクリアして通常処理
  if (sess.waitingRestart) {
    clearTimeout(sess.restartTimer);
    sess.waitingRestart = false;
    // もしクリア後のフォローアップをするならここに書く
    return null;
  }

  // ---------- 通常の Over/Under 処理 ----------
  sess.count++;
  if (text.includes('Over')) {
    sess.max = sess.lastGuess - 1;
  } else if (text.includes('Under')) {
    sess.min = sess.lastGuess + 1;
  } else {
    // 予期しないテキストは無視
    return null;
  }
  return replyGuess(event.replyToken, userId);
}

// ゲーム開始処理
async function startGame(userId, replyToken) {
  // 既存タイマーがあればクリア
  if (sessions[userId]?.restartTimer) {
    clearTimeout(sessions[userId].restartTimer);
  }
  // セッション初期化
  sessions[userId] = {
    min: 1,
    max: 1000,
    lastGuess: null,
    count: 0,
    waitingRestart: false,
    restartTimer: null
  };
  const greeting = `★Over & Under 4★

ヒントをもとに1～1000の数字を当ててください。

答えた数字が、
正解の数字より大きい場合は「Over」
正解の数字より小さい場合は「Under」

とヒントが言われます。
正解の数字を早く導くと高得点となります。
ゲームをやめる場合は「終了」と言ってください。

★それではゲームスタート★`;
  // 説明メッセージ
  if (replyToken) {
    await client.replyMessage(replyToken, { type: 'text', text: greeting });
  } else {
    // リスタート時は push でも OK
    await client.pushMessage(userId, { type: 'text', text: greeting });
  }
  // 最初の一手
  return replyGuess(replyToken || null, userId);
}

// 推測メッセージ送信
async function replyGuess(replyToken, userId) {
  const sess = sessions[userId];
  const next = Math.floor((sess.min + sess.max) / 2);
  sess.lastGuess = next;
  const msg = `${next}`;
  // replyToken が null の場合は push
  if (replyToken) {
    return client.replyMessage(replyToken, { type: 'text', text: msg });
  } else {
    return client.pushMessage(userId, { type: 'text', text: msg });
  }
}

// セッション破棄
function clearSession(userId) {
  const sess = sessions[userId];
  if (sess?.restartTimer) clearTimeout(sess.restartTimer);
  delete sessions[userId];
}

app.listen(port, () => {
  console.log(`Botサーバーがポート${port}で起動しました`);
});
