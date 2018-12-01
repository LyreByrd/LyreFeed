require('dotenv').config()
const app = require('express')()
const server = require('http').Server(app)
const io = require('socket.io')(server)

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
  // console.log('socket connected in lyreFeed')
  
  socket.on('new feed', feedData => {
    console.log('feedData.host :', feedData.host);
    console.log('feedData.path :', feedData.path);

    socket.host = feedData.host;
    socket.path = feedData.path;

    let newFeed = {
      host: feedData.host,
      path: feedData.path,
    }

    pub.hmset('feeds', newFeed.host, JSON.stringify(newFeed), (err, res) => {
      if (err) console.log('error saving new feed to redis :', err);
    });

    pub.hgetall('feeds', (err, feeds) => {
      if (err) { console.log('error getting feeds from redis :', err) }
      else {
        console.log('feeds on lyrefeed server :', feeds);
        socket.emit('update feeds', feeds);
      }
    })
    
  })

  socket.on('join player', () => {
    pub.hgetall('feeds', (err, feeds) => {
      console.log('feeds in join feed :', feeds);
      if (err) { console.log('error getting feeds from redis :', err) }
      else {
        console.log('feeds on lyrefeed server in join feed:', feeds);
        io.emit('update feeds', feeds);
      }
    })
  })

  socket.on('join feed', () => {
    io.emit('forceUpdate')
    pub.hgetall('feeds', (err, feeds) => {
      console.log('feeds in join feed :', feeds);
      if (err) { console.log('error getting feeds from redis :', err) }
      else {
        console.log('feeds on lyrefeed server in join feed:', feeds);
        io.emit('update feeds', feeds);
      }
    })
  })
  
  socket.on('main feed connect', () => {
    pub.hgetall('feeds', (err, feeds) => {
      if (err) { console.log('error getting feeds from redis :', err) }
      else {
        console.log('feeds on lyrefeed in main feed connect :', feeds);
        socket.emit('update feeds', feeds);
      }
    })
  })

  socket.on('disconnect', (reason) => {

    console.log('reason :', reason);

    console.log('socket.host in socket.on disconnect :', socket.host);
    let host = socket.host;

    if (host) {
      pub.hdel('feeds', -99, host, (err, data) => {
        if (err) { console.log('error deleting feed from redis :', err); }
      })
      pub.hgetall('feeds', (err, feeds) => {
        if (err) { console.log('error getting feeds from redis :', err) }
        else {
          console.log('feeds on lyrefeed server :', feeds);
          io.emit('update deleted feeds', feeds);
        }
      })
    }
  })


})

server.listen(port, (err) => {
  if (err) throw err;
  console.log(`>> Listening on http://localhost:${port}`)
})