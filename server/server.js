require('dotenv').config()
const privateKey = fs.readFileSync('../../../etc/letsencrypt/live/gamaycotte.com/privkey.pem').toString();
const certificate = fs.readFileSync('../../../etc/letsencrypt/live/gamaycotte.com/fullchain.pem').toString();
const app = require('express')()
const server = require('http').Server({
  key: privateKey,
  cert: certificate
},app);
const io = require('socket.io')(server)
const getVideoId = require('get-video-id');
const axios = require('axios');

const dev = process.env.NODE_ENV !== 'production';

const REDIS_HOST = process.env.REDIS_HOST;
const REDIS_PORT = process.env.REDIS_PORT;
const REDIS_PASS = process.env.REDIS_PASS;

const redis = require('redis').createClient;
const adapter = require("socket.io-redis");

const pub = redis(REDIS_PORT, REDIS_HOST, { auth_pass: REDIS_PASS });
const sub = redis(REDIS_PORT, REDIS_HOST, { auth_pass: REDIS_PASS });
io.adapter(adapter({ pubClient: pub, subClient: sub }));

let port = process.env.PORT || 8080;

app.get('*', (req, res) => {
  res.send('main feed server');
})

io.on('connection', socket => {
  
  socket.on('new feed', feedData => {

    console.log('feedData 1 :', feedData);

    socket.host = feedData.host;
    socket.path = feedData.path;

    let newFeed = {
      host: feedData.host,
      path: feedData.path,
      videoId: feedData.videoId || null,
      usersInRoom: feedData.usersInRoom,
      service: feedData.service,
    }

    pub.hmset('feeds', newFeed.host, JSON.stringify(newFeed), (err, res) => {
      if (err) console.log('error saving new feed to redis :', err);
    });
  })

  socket.on('join player', () => {
    pub.hgetall('feeds', (err, feeds) => {
      if (err) { console.log('error getting feeds from redis :', err) }
      else {
        io.emit('update feeds', feeds);
      }
    })
  })

  socket.on('user joined room', (room) => {
    pub.hget('feeds', room, (err, feed) => {
      if (err) { console.log('error getting feed from redis :', err) }
      else {
        feed = JSON.parse(feed);
        if (feed) {
          feed.usersInRoom = feed.usersInRoom + 1;
          console.log('feed :', feed);
          pub.hset('feeds', room, JSON.stringify(feed), (err, res) => {
            if (err) { console.log('error updating usersInRoom on redis :', err); }
            else {
              pub.hgetall('feeds', (err, feeds) => {
                io.emit('update feeds', feeds);
              })
            }
          })
        }
      }
    })
  })

  socket.on('user left room', (room) => {
    pub.hget('feeds', room, (err, feed) => {
      if (err) { console.log('error getting feed from redis :', err) }
      else {
        feed = JSON.parse(feed);
        if (feed) {
          feed.usersInRoom = feed.usersInRoom - 1;
          console.log('feed :', feed);
          pub.hset('feeds', room, JSON.stringify(feed), (err, res) => {
            if (err) { console.log('error updating usersInRoom on redis :', err); }
            else {
              pub.hgetall('feeds', (err, feeds) => {
                io.emit('update feeds', feeds);
              })
            }
          })
        }
      }
    })
  })
  
  socket.on('main feed connect', () => {
    pub.hgetall('feeds', (err, feeds) => {
      if (err) { console.log('error getting feeds from redis :', err) }
      else {
        socket.emit('update feeds', feeds);
      }
    });
  });

  socket.on('video data', data => {
    let vidId, host, title;
    if (data.id) {
      host = data.host;
      if (data.id.length === 11) {
        vidId = data.id;
      } else {
        let {id, service} = getVideoId(data.id);
        vidId = id;
      }
    }

    axios.get(`https://www.youtube.com/oembed?format=json&url=https://youtu.be/${vidId}`)
    .then(res => {
      title = res.data.title; 
      pub.hget('feeds', host, (err, feed) => {
        if (err) { console.log('error getting feed from redis :', err); }
        else {
          if (feed) {
            feed = JSON.parse(feed);
            feed.videoId = vidId;
            feed.title = title;
            pub.hset('feeds', feed.host, JSON.stringify(feed));
            pub.hgetall('feeds', (err, feeds) => {
              io.emit('update feeds', feeds);
            })
          }
        }
      });
    })
    .catch(err => {
      console.log('err getting yt data :', err);
    })

  })

  socket.on('disconnect', () => {

    let host = socket.host;

    if (host) {
      pub.hdel('feeds', -99, host, (err, data) => {
        if (err) { console.log('error deleting feed from redis :', err); }
      });
      pub.hgetall('feeds', (err, feeds) => {
        if (err) { console.log('error getting feeds from redis :', err) }
        else {
          io.emit('update deleted feeds', feeds);
        }
      });
    }
  });
});

server.listen(port, (err) => {
  if (err) throw err;
  console.log(`>> Listening on http://localhost:${port}`);
});