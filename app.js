const express = require("express");
const app = express();
app.use(express.json());
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const path = require("path");
const dbpath = path.join(__dirname, "twitterClone.db");
let db = null;
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const initilizer = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("server has started");
    });
  } catch (e) {
    console.log(`Db error:${e.message}`);
    process.exit(1);
  }
};

initilizer();

let check_jwt = (req, res, nxt) => {
  let jwtToken = req.headers["authorization"];
  if (jwtToken === undefined) {
    res.status(401);
    res.send("Invalid JWT Token");
  } else {
    jwtToken = jwtToken.split(" ")[1];
    jwt.verify(jwtToken, "secret", async (error, payload) => {
      if (error) {
        res.status(401);
        res.send("Invalid JWT Token");
      } else {
        req.username = payload;
        nxt();
      }
    });
  }
};

app.post("/register/", async (req, res) => {
  const { username, password, name, gender } = req.body;
  let sqlq = `
    select * from user where username='${username}'`;
  const data = await db.get(sqlq);
  if (data !== undefined) {
    res.status(400);
    res.send("User already exists");
  } else if (password.length < 6) {
    res.status(400);
    res.send("Password is too short");
  } else {
    sqlq = `insert into user(username,password,name,gender)
        values('${username}','${await bcrypt.hash(
      password,
      10
    )}','${name}','${gender}')`;
    await db.run(sqlq);
    res.send("User created successfully");
  }
});

app.post("/login/", async (req, res) => {
  const { username, password } = req.body;
  let sqlq = `
    select * from user where username='${username}'`;
  let data = await db.get(sqlq);

  if (data === undefined) {
    res.status("400");
    res.send("Invalid user");
  } else if ((await bcrypt.compare(password, data.password)) === false) {
    res.status(400);
    res.send("Invalid password");
  } else {
    let jwtToken = jwt.sign({ username: data.username }, "secret");
    res.send({ jwtToken });
  }
});

app.get("/user/tweets/feed/", check_jwt, async (req, res) => {
  let { username } = req.username;
  let { user_id } = await db.get(
    `select user_id from user where username='${username}'`
  );
  // user.username,tweet.tweet,tweet.date_time as 'dateTime'
  try {
    let sqlq = `

    select user.username,tweet.tweet,tweet.date_time as 'dateTime'  from tweet join like on like.tweet_id=like.tweet_id
    join reply on reply.tweet_id=tweet.tweet_id 
    join user on user.user_id=tweet.user_id
    group by tweet.tweet_id
    order by dateTime desc
    limit 4;
    
    `;
    console.log(sqlq);
    let data = await db.all(sqlq);
    res.send(data);
  } catch (e) {
    console.log(e.message);
  }
});

app.get("/user/following/", check_jwt, async (req, res) => {
  let { username } = req.username;
  let { user_id } = await db.get(
    `select user_id from user where username='${username}'`
  );
  console.log(user_id);
  let sqlq = `SELECT u.name
FROM User u
INNER JOIN Follower f ON u.user_id = f.following_user_id
WHERE f.follower_user_id = ${user_d}
`;
  let data = await db.all(sqlq);
  res.send(data);
});

app.get("/user/followers/", check_jwt, async (req, res) => {
  let { username } = req.username;
  let { user_id } = await db.get(
    `select user_id from user where username='${username}'`
  );
  let sqlq = `SELECT u.name
FROM User u
INNER JOIN Follower f ON u.user_id = f.follower_user_id
WHERE f.following_user_id = ${user_id}
`;
  let data = await db.all(sqlq);
  res.send(data);
});

app.get("/tweets/:tweetId/", check_jwt, async (req, res) => {
  let { username } = req.username;
  let { tweetId } = req.params;
  let { user_id } = await db.get(
    `select user_id from user where username='${username}'`
  );
  let tweetData = await db.get(`select * from tweet where tweet_id=${tweetId}`);
  console.log("pass");
  let sqlq = `
   SELECT t.tweet, COUNT(l.like_id) AS likes, COUNT(r.reply_id) AS replies, t.date_time AS dateTime
FROM Tweet t
LEFT JOIN Like l ON t.tweet_id = l.tweet_id
LEFT JOIN Reply r ON t.tweet_id = r.tweet_id
INNER JOIN Follower f ON t.user_id = f.following_user_id
WHERE t.user_id = ${user_id} AND f.follower_user_id = ${tweetData.user_id}
GROUP BY t.tweet_id

`;
  let data = await db.get(sqlq);

  if (Object.keys(data).length === 0 || data === undefined) {
    res.status(400);
    console.log("not now");
    res.send("Invalid Request");
  } else {
    res.send(data);
  }
});

app.get("/tweets/:tweetId/likes/", check_jwt, async (req, res) => {
  let { username } = req.username;
  let { tweetId } = req.params;
  let sqlq = `
  select username
  from user
  where user_id in (select like.user_id as 'userId' from like
  join tweet on tweet.tweet_id=like.tweet_id
  join follower on follower.following_user_id=tweet.user_id
  join user on user.user_id=follower.follower_user_id
  where user.username='${username}')`;
  let data = await db.all(sqlq);
  if (data === [] || data === undefined) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    let array = [];
    data.map((k) => {
      array.push(k.username);
    });
    res.send(array);
  }
});

app.get("/tweets/:tweetId/replies/", check_jwt, async (req, res) => {
  let { username } = req.username;
  let { tweetId } = req.params;
  let { user_id } = await db.get(
    `select user_id from user where username='${username}'`
  );
  let tweetData = await db.get(`select * from tweet where tweet_id=${tweetId}`);

  let sqlq = `
            SELECT u.name, r.reply
FROM Reply r
INNER JOIN User u ON r.user_id = u.user_id
INNER JOIN Tweet t ON r.tweet_id = t.tweet_id
INNER JOIN Follower f ON t.user_id = f.following_user_id
WHERE f.follower_user_id = ${user_id} AND t.tweet_id =${tweetId}

            
  `;
  let data = await db.all(sqlq);
  console.log(Object.keys(data).length);
  if (Object.keys(data).length === 0 || data === undefined) {
    res.status(400);
    res.send("Invalid Request");
  } else {
    res.send({ replies: data });
  }
});

app.get("/user/tweets/", check_jwt, async (req, res) => {
  let { username } = req.username;
  let { user_id } = await db.get(
    `select user_id from user where username='${username}'`
  );
  let sqlq = `
    select tweet.tweet as 'tweet',sum(case when like.like_id is null then 0 else 1 end) as 'likes',sum(case when reply.user_id is null then 0 else 1 end) as 'replies',tweet.date_time as 'dateTime' from tweet
    join user on tweet.user_id=user.user_id
    join like on like.tweet_id=tweet.tweet_id
    join reply on reply.tweet_id=tweet.tweet_id
    where user.username='${username}'
    group by tweet.tweet_id`;
  let data = await db.all(sqlq);
  res.send(data);
});
app.post("/user/tweets/", check_jwt, async (req, res) => {
  let { username } = req.username;
  let { tweet } = req.body;
  let date = new Date();
  let userData = await db.get(
    `select * from user where username='${username}'`
  );
  let sqlq = `
    insert into tweet(tweet,user_id,date_time)
    values('${tweet}','${userData.user_id}','${date}')`;
  await db.run(sqlq);
  res.send("Created a Tweet");
});

app.delete("/tweets/:tweetId/", check_jwt, async (req, res) => {
  let { username } = req.username;

  let { tweetId } = req.params;
  let userData = await db.get(`select* from user where username='${username}'`);
  let tweetData = await db.get(`select * from tweet where tweet_id=${tweetId}`);
  console.log(tweetData);

  if (tweetData.user_id !== userData.user_id) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    await db.run(`delete from tweet where tweet_id=${tweetId};`);
    res.send("Tweet Removed");
  }
});

module.exports = app;
