const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

const players = {};
const worlds = {
  'obby-1': { name: 'Obby Challenge', type: 'obby', players: 0, blocks: generateObby() },
  'build-1': { name: 'Free Build', type: 'build', players: 0, blocks: [] },
  'racing-1': { name: 'Speed Race', type: 'racing', players: 0, blocks: generateRaceTrack() },
  'survival-1': { name: 'Survival Island', type: 'survival', players: 0, blocks: generateIsland() }
};

function generateObby() {
  const blocks = [];
  for (let i = 0; i < 20; i++) {
    blocks.push({ x: i * 3, y: 0, z: 0, type: 'grass' });
    if (i % 3 === 0) blocks.push({ x: i * 3, y: 1, z: 0, type: 'stone' });
  }
  for (let i = 0; i < 10; i++) {
    blocks.push({ x: 30 + i * 2, y: 2 + Math.sin(i) * 2, z: 0, type: 'wood' });
  }
  for (let i = 0; i < 5; i++) {
    blocks.push({ x: 50 + i * 4, y: 4, z: i * 2, type: 'brick' });
  }
  return blocks;
}

function generateRaceTrack() {
  const blocks = [];
  for (let i = 0; i < 50; i++) {
    blocks.push({ x: i * 2, y: 0, z: 0, type: 'road' });
    blocks.push({ x: i * 2, y: 0, z: 4, type: 'road' });
    for (let j = 1; j < 4; j++) {
      blocks.push({ x: i * 2, y: 0, z: j, type: 'road' });
    }
  }
  return blocks;
}

function generateIsland() {
  const blocks = [];
  for (let x = -5; x <= 5; x++) {
    for (let z = -5; z <= 5; z++) {
      if (Math.sqrt(x*x + z*z) <= 5) {
        blocks.push({ x, y: 0, z, type: 'sand' });
        if (Math.random() > 0.7) blocks.push({ x, y: 1, z, type: 'grass' });
      }
    }
  }
  return blocks;
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('joinGame', (data) => {
    const { username, gameMode, character } = data;
    players[socket.id] = {
      id: socket.id,
      username,
      gameMode,
      character: character || { color: '#4a90d9', hat: 'none' },
      position: { x: 0, y: 5, z: 0 },
      rotation: { x: 0, y: 0 },
      score: 0
    };

    if (worlds[gameMode]) {
      worlds[gameMode].players++;
    }

    socket.join(gameMode);
    socket.emit('gameJoined', {
      player: players[socket.id],
      world: worlds[gameMode],
      players: Object.values(players).filter(p => p.gameMode === gameMode)
    });

    socket.to(gameMode).emit('playerJoined', players[socket.id]);
  });

  socket.on('playerMove', (data) => {
    if (players[socket.id]) {
      players[socket.id].position = data.position;
      players[socket.id].rotation = data.rotation;
      socket.to(players[socket.id].gameMode).emit('playerMoved', {
        id: socket.id,
        position: data.position,
        rotation: data.rotation
      });
    }
  });

  socket.on('placeBlock', (data) => {
    if (players[socket.id]) {
      const gameMode = players[socket.id].gameMode;
      if (worlds[gameMode]) {
        worlds[gameMode].blocks.push(data.block);
        io.to(gameMode).emit('blockPlaced', { block: data.block, playerId: socket.id });
      }
    }
  });

  socket.on('removeBlock', (data) => {
    if (players[socket.id]) {
      const gameMode = players[socket.id].gameMode;
      if (worlds[gameMode]) {
        worlds[gameMode].blocks = worlds[gameMode].blocks.filter(b =>
          !(b.x === data.x && b.y === data.y && b.z === data.z)
        );
        io.to(gameMode).emit('blockRemoved', { x: data.x, y: data.y, z: data.z, playerId: socket.id });
      }
    }
  });

  socket.on('chatMessage', (msg) => {
    if (players[socket.id]) {
      io.to(players[socket.id].gameMode).emit('chatMessage', {
        username: players[socket.id].username,
        message: msg
      });
    }
  });

  socket.on('disconnect', () => {
    if (players[socket.id]) {
      const gameMode = players[socket.id].gameMode;
      if (worlds[gameMode]) {
        worlds[gameMode].players--;
      }
      io.to(gameMode).emit('playerLeft', socket.id);
      delete players[socket.id];
    }
    console.log('Player disconnected:', socket.id);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
