const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// ==================== GAME UTILITIES ====================
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const HORSES = [
  { id: 1, name: 'Thunder', emoji: '🐎', color: '#e74c3c', odds: 5 },
  { id: 2, name: 'Lightning', emoji: '🐴', color: '#3498db', odds: 5 },
  { id: 3, name: 'Storm', emoji: '🏇', color: '#2ecc71', odds: 5 },
  { id: 4, name: 'Blaze', emoji: '🐎', color: '#f39c12', odds: 5 },
  { id: 5, name: 'Shadow', emoji: '🐴', color: '#9b59b6', odds: 5 },
  { id: 6, name: 'Spirit', emoji: '🏇', color: '#1abc9c', odds: 5 }
];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, value: getCardValue(rank) });
    }
  }
  return shuffleDeck(deck);
}

function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getCardValue(rank) {
  const values = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 10, 'Q': 10, 'K': 10, 'A': 11 };
  return values[rank];
}

function getHandValue(hand) {
  let value = 0;
  let aces = 0;
  for (const card of hand) {
    value += card.value;
    if (card.rank === 'A') aces++;
  }
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  return value;
}

function evaluatePokerHand(hand) {
  const ranks = hand.map(c => RANKS.indexOf(c.rank)).sort((a, b) => a - b);
  const suits = hand.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);
  const isStraight = ranks[4] - ranks[0] === 4 && new Set(ranks).size === 5;
  const isRoyal = isFlush && isStraight && ranks[0] === 8;
  
  const counts = {};
  ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
  const countValues = Object.values(counts).sort((a, b) => b - a);
  
  if (isRoyal) return { rank: 10, name: 'Royal Flush' };
  if (isFlush && isStraight) return { rank: 9, name: 'Straight Flush' };
  if (countValues[0] === 4) return { rank: 8, name: 'Four of a Kind' };
  if (countValues[0] === 3 && countValues[1] === 2) return { rank: 7, name: 'Full House' };
  if (isFlush) return { rank: 6, name: 'Flush' };
  if (isStraight) return { rank: 5, name: 'Straight' };
  if (countValues[0] === 3) return { rank: 4, name: 'Three of a Kind' };
  if (countValues[0] === 2 && countValues[1] === 2) return { rank: 3, name: 'Two Pair' };
  if (countValues[0] === 2) return { rank: 2, name: 'One Pair' };
  return { rank: 1, name: 'High Card', highCard: Math.max(...ranks) };
}

function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ==================== GAME STATE ====================
const rooms = new Map();
const players = new Map();
const chatMessages = new Map();

// Room cleanup interval (remove inactive rooms after 30 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms) {
    if (now - room.lastActivity > 30 * 60 * 1000) {
      rooms.delete(roomId);
      chatMessages.delete(roomId);
      console.log(`Cleaned up inactive room: ${roomId}`);
    }
  }
}, 60000);

// ==================== REST API ENDPOINTS ====================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get all available games
app.get('/api/games', (req, res) => {
  res.json({
    games: [
      { id: 'blackjack', name: 'Blackjack', minPlayers: 1, maxPlayers: 8, description: 'Beat the dealer to 21!' },
      { id: 'poker', name: 'Poker', minPlayers: 2, maxPlayers: 8, description: '5-Card Draw' },
      { id: 'war', name: 'War', minPlayers: 2, maxPlayers: 2, description: 'Higher card wins!' },
      { id: 'karera', name: 'Karera', minPlayers: 1, maxPlayers: 8, description: 'Horse Racing Betting' },
      { id: 'dice', name: 'Dice', minPlayers: 1, maxPlayers: 8, description: 'Roll & Win!' },
      { id: 'solitaire', name: 'Solitaire', minPlayers: 1, maxPlayers: 1, description: 'Classic Klondike' }
    ]
  });
});

// Get all active rooms
app.get('/api/rooms', (req, res) => {
  const roomList = [];
  for (const [roomId, room] of rooms) {
    roomList.push({
      id: roomId,
      gameType: room.gameType,
      playerCount: room.players.length,
      maxPlayers: 8,
      status: room.status,
      host: room.players.find(p => p.id === room.host)?.username || 'Unknown'
    });
  }
  res.json({ rooms: roomList });
});

// Get specific room info
app.get('/api/rooms/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId.toUpperCase());
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  res.json({
    id: room.id,
    gameType: room.gameType,
    players: room.players.map(p => ({ id: p.id, username: p.username, chips: p.chips })),
    status: room.status,
    host: room.host
  });
});

// Get server stats
app.get('/api/stats', (req, res) => {
  res.json({
    activeRooms: rooms.size,
    activePlayers: players.size,
    totalChips: Array.from(rooms.values()).reduce((sum, room) => 
      sum + room.players.reduce((s, p) => s + p.chips, 0), 0
    )
  });
});

// ==================== SOCKET.IO EVENTS ====================

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Room Management
  socket.on('createRoom', (data) => {
    try {
      const { username, gameType } = data;
      
      if (!username || !gameType) {
        socket.emit('error', { message: 'Username and game type are required' });
        return;
      }

      const validGames = ['blackjack', 'poker', 'war', 'karera', 'dice'];
      if (!validGames.includes(gameType)) {
        socket.emit('error', { message: 'Invalid game type' });
        return;
      }

      const roomId = generateRoomId();
      const room = {
        id: roomId,
        gameType,
        host: socket.id,
        players: [{ id: socket.id, username, chips: 1000 }],
        gameState: null,
        status: 'waiting',
        createdAt: Date.now(),
        lastActivity: Date.now()
      };

      rooms.set(roomId, room);
      players.set(socket.id, { roomId, username });
      chatMessages.set(roomId, []);
      
      socket.join(roomId);
      socket.emit('roomCreated', { roomId, room: sanitizeRoom(room) });
      
      console.log(`Room ${roomId} created by ${username} for ${gameType}`);
    } catch (error) {
      console.error('Error creating room:', error);
      socket.emit('error', { message: 'Failed to create room' });
    }
  });

  socket.on('joinRoom', (data) => {
    try {
      const { username, roomId } = data;
      
      if (!username || !roomId) {
        socket.emit('error', { message: 'Username and room ID are required' });
        return;
      }

      const room = rooms.get(roomId.toUpperCase());
      
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }
      
      if (room.players.length >= 8) {
        socket.emit('error', { message: 'Room is full (max 8 players)' });
        return;
      }

      if (room.status !== 'waiting') {
        socket.emit('error', { message: 'Game already in progress' });
        return;
      }

      const existingPlayer = room.players.find(p => p.username === username);
      if (existingPlayer) {
        socket.emit('error', { message: 'Username already taken in this room' });
        return;
      }

      room.players.push({ id: socket.id, username, chips: 1000 });
      room.lastActivity = Date.now();
      players.set(socket.id, { roomId: room.id, username });
      
      socket.join(room.id);
      
      io.to(room.id).emit('playerJoined', { 
        player: { id: socket.id, username },
        players: room.players.map(p => ({ id: p.id, username: p.username, chips: p.chips }))
      });
      
      socket.emit('roomJoined', { roomId: room.id, room: sanitizeRoom(room) });
      
      // Send chat history
      const history = chatMessages.get(room.id) || [];
      socket.emit('chatHistory', { messages: history.slice(-50) });
      
      console.log(`${username} joined room ${room.id}`);
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  socket.on('startGame', () => {
    try {
      const player = players.get(socket.id);
      if (!player) return;
      
      const room = rooms.get(player.roomId);
      if (!room || room.host !== socket.id) {
        socket.emit('error', { message: 'Only the host can start the game' });
        return;
      }

      if (room.players.length < 1) {
        socket.emit('error', { message: 'Need at least 1 player to start' });
        return;
      }

      room.status = 'playing';
      room.lastActivity = Date.now();
      
      const gameStarters = {
        blackjack: startBlackjack,
        poker: startPoker,
        war: startWar,
        karera: startKarera,
        dice: startDice
      };

      const starter = gameStarters[room.gameType];
      if (starter) {
        starter(room);
        console.log(`Game started in room ${room.id}: ${room.gameType}`);
      }
    } catch (error) {
      console.error('Error starting game:', error);
      socket.emit('error', { message: 'Failed to start game' });
    }
  });

  // Chat
  socket.on('chatMessage', (message) => {
    try {
      const player = players.get(socket.id);
      if (!player) return;

      const room = rooms.get(player.roomId);
      if (!room) return;

      const chatMsg = {
        id: Date.now().toString(),
        userId: socket.id,
        username: player.username,
        message: message.substring(0, 500), // Limit message length
        timestamp: new Date().toISOString()
      };

      const history = chatMessages.get(room.id) || [];
      history.push(chatMsg);
      if (history.length > 100) history.shift(); // Keep last 100 messages
      chatMessages.set(room.id, history);

      io.to(room.id).emit('chatMessage', chatMsg);
    } catch (error) {
      console.error('Error sending chat message:', error);
    }
  });

  // Blackjack Events
  socket.on('blackjackHit', () => {
    const player = players.get(socket.id);
    if (!player) return;
    const room = rooms.get(player.roomId);
    if (!room || room.gameType !== 'blackjack') return;
    handleBlackjackHit(room, socket.id);
  });

  socket.on('blackjackStand', () => {
    const player = players.get(socket.id);
    if (!player) return;
    const room = rooms.get(player.roomId);
    if (!room || room.gameType !== 'blackjack') return;
    handleBlackjackStand(room, socket.id);
  });

  socket.on('blackjackDouble', () => {
    const player = players.get(socket.id);
    if (!player) return;
    const room = rooms.get(player.roomId);
    if (!room || room.gameType !== 'blackjack') return;
    handleBlackjackDouble(room, socket.id);
  });

  // Poker Events
  socket.on('pokerBet', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    const room = rooms.get(player.roomId);
    if (!room || room.gameType !== 'poker') return;
    handlePokerBet(room, socket.id, data.amount);
  });

  socket.on('pokerCheck', () => {
    const player = players.get(socket.id);
    if (!player) return;
    const room = rooms.get(player.roomId);
    if (!room || room.gameType !== 'poker') return;
    handlePokerCheck(room, socket.id);
  });

  socket.on('pokerFold', () => {
    const player = players.get(socket.id);
    if (!player) return;
    const room = rooms.get(player.roomId);
    if (!room || room.gameType !== 'poker') return;
    handlePokerFold(room, socket.id);
  });

  socket.on('pokerDraw', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    const room = rooms.get(player.roomId);
    if (!room || room.gameType !== 'poker') return;
    handlePokerDraw(room, socket.id, data.cards);
  });

  // War Events
  socket.on('warPlay', () => {
    const player = players.get(socket.id);
    if (!player) return;
    const room = rooms.get(player.roomId);
    if (!room || room.gameType !== 'war') return;
    handleWarPlay(room, socket.id);
  });

  // Karera Events
  socket.on('kareraBet', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    const room = rooms.get(player.roomId);
    if (!room || room.gameType !== 'karera') return;
    handleKareraBet(room, socket.id, data.horse, data.amount);
  });

  socket.on('kareraStartRace', () => {
    const player = players.get(socket.id);
    if (!player) return;
    const room = rooms.get(player.roomId);
    if (!room || room.gameType !== 'karera') return;
    handleKareraStartRace(room);
  });

  // Dice Events
  socket.on('diceBet', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    const room = rooms.get(player.roomId);
    if (!room || room.gameType !== 'dice') return;
    handleDiceBet(room, socket.id, data.betType, data.amount, data.number);
  });

  socket.on('diceRoll', () => {
    const player = players.get(socket.id);
    if (!player) return;
    const room = rooms.get(player.roomId);
    if (!room || room.gameType !== 'dice') return;
    handleDiceRoll(room, socket.id);
  });

  // Leave Room
  socket.on('leaveRoom', () => {
    handlePlayerLeave(socket);
  });

  // Disconnect
  socket.on('disconnect', () => {
    handlePlayerLeave(socket);
    console.log('Player disconnected:', socket.id);
  });
});

function handlePlayerLeave(socket) {
  const player = players.get(socket.id);
  if (!player) return;

  const room = rooms.get(player.roomId);
  if (room) {
    room.players = room.players.filter(p => p.id !== socket.id);
    room.lastActivity = Date.now();

    if (room.players.length === 0) {
      if (room.gameState?.raceInterval) {
        clearInterval(room.gameState.raceInterval);
      }
      rooms.delete(player.roomId);
      chatMessages.delete(player.roomId);
      console.log(`Room ${player.roomId} deleted (empty)`);
    } else {
      if (room.host === socket.id) {
        room.host = room.players[0].id;
        io.to(room.id).emit('newHost', { hostId: room.host });
      }
      io.to(room.id).emit('playerLeft', { 
        playerId: socket.id,
        players: room.players.map(p => ({ id: p.id, username: p.username, chips: p.chips }))
      });
    }
  }

  players.delete(socket.id);
}

function sanitizeRoom(room) {
  return {
    id: room.id,
    gameType: room.gameType,
    host: room.host,
    players: room.players.map(p => ({ id: p.id, username: p.username, chips: p.chips })),
    status: room.status
  };
}

// ==================== BLACKJACK ====================
function startBlackjack(room) {
  const deck = createDeck();
  room.gameState = {
    deck,
    dealer: { hand: [], hidden: true },
    players: {},
    currentBet: 50
  };

  room.players.forEach(player => {
    room.gameState.players[player.id] = {
      hand: [deck.pop(), deck.pop()],
      stand: false,
      bust: false,
      bet: room.gameState.currentBet,
      doubled: false
    };
  });

  room.gameState.dealer.hand = [deck.pop(), deck.pop()];

  room.players.forEach(player => {
    io.to(player.id).emit('blackjackStart', {
      hand: room.gameState.players[player.id].hand,
      dealerCard: room.gameState.dealer.hand[0],
      players: room.players.map(p => ({ id: p.id, username: p.username }))
    });
  });
}

function handleBlackjackHit(room, playerId) {
  const state = room.gameState;
  const playerHand = state.players[playerId];
  
  if (!playerHand || playerHand.stand || playerHand.bust) return;
  
  playerHand.hand.push(state.deck.pop());
  const value = getHandValue(playerHand.hand);
  
  if (value > 21) {
    playerHand.bust = true;
    io.to(playerId).emit('blackjackBust', { hand: playerHand.hand, value });
  } else if (value === 21) {
    playerHand.stand = true;
    io.to(playerId).emit('blackjack21', { hand: playerHand.hand, value });
  } else {
    io.to(playerId).emit('blackjackUpdate', { hand: playerHand.hand, value });
  }
  
  checkBlackjackRound(room);
}

function handleBlackjackStand(room, playerId) {
  const state = room.gameState;
  if (!state.players[playerId]) return;
  
  state.players[playerId].stand = true;
  io.to(playerId).emit('blackjackStood');
  checkBlackjackRound(room);
}

function handleBlackjackDouble(room, playerId) {
  const state = room.gameState;
  const playerHand = state.players[playerId];
  const player = room.players.find(p => p.id === playerId);
  
  if (!playerHand || playerHand.stand || playerHand.bust || playerHand.hand.length !== 2) return;
  if (!player || player.chips < playerHand.bet) return;
  
  player.chips -= playerHand.bet;
  playerHand.bet *= 2;
  playerHand.doubled = true;
  
  playerHand.hand.push(state.deck.pop());
  const value = getHandValue(playerHand.hand);
  
  if (value > 21) {
    playerHand.bust = true;
    io.to(playerId).emit('blackjackBust', { hand: playerHand.hand, value });
  } else {
    playerHand.stand = true;
    io.to(playerId).emit('blackjackUpdate', { hand: playerHand.hand, value });
  }
  
  checkBlackjackRound(room);
}

function checkBlackjackRound(room) {
  const state = room.gameState;
  const allDone = room.players.every(p => {
    const playerState = state.players[p.id];
    return playerState.stand || playerState.bust;
  });

  if (allDone) {
    // Dealer plays
    while (getHandValue(state.dealer.hand) < 17) {
      state.dealer.hand.push(state.deck.pop());
    }
    
    const dealerValue = getHandValue(state.dealer.hand);
    const results = {};
    
    room.players.forEach(player => {
      const playerState = state.players[player.id];
      const playerValue = getHandValue(playerState.hand);
      
      if (playerState.bust) {
        results[player.id] = { result: 'lose', amount: -playerState.bet };
      } else if (dealerValue > 21) {
        results[player.id] = { result: 'win', amount: playerState.bet };
        player.chips += playerState.bet * 2;
      } else if (playerValue > dealerValue) {
        results[player.id] = { result: 'win', amount: playerState.bet };
        player.chips += playerState.bet * 2;
      } else if (playerValue < dealerValue) {
        results[player.id] = { result: 'lose', amount: -playerState.bet };
      } else {
        results[player.id] = { result: 'push', amount: 0 };
        player.chips += playerState.bet;
      }
    });

    io.to(room.id).emit('blackjackEnd', {
      dealerHand: state.dealer.hand,
      dealerValue,
      results
    });
    
    room.status = 'waiting';
  }
}

// ==================== POKER ====================
function startPoker(room) {
  const deck = createDeck();
  room.gameState = {
    deck,
    hands: {},
    pot: 0,
    currentBet: 0,
    currentPlayer: 0,
    phase: 'betting',
    bets: {},
    folded: new Set()
  };

  room.players.forEach(player => {
    const hand = [];
    for (let i = 0; i < 5; i++) hand.push(deck.pop());
    room.gameState.hands[player.id] = hand;
    room.gameState.bets[player.id] = 0;
  });

  room.players.forEach(player => {
    io.to(player.id).emit('pokerStart', {
      hand: room.gameState.hands[player.id],
      players: room.players.map(p => ({ id: p.id, username: p.username, chips: p.chips }))
    });
  });

  io.to(room.players[0].id).emit('yourTurn');
}

function handlePokerBet(room, playerId, amount) {
  const state = room.gameState;
  const player = room.players.find(p => p.id === playerId);
  
  if (!player || amount > player.chips || state.folded.has(playerId)) return;
  
  player.chips -= amount;
  state.pot += amount;
  state.bets[playerId] += amount;
  state.currentBet = Math.max(state.currentBet, state.bets[playerId]);
  
  io.to(room.id).emit('pokerBetMade', {
    playerId,
    amount,
    pot: state.pot,
    chips: player.chips
  });
  
  nextPokerTurn(room);
}

function handlePokerCheck(room, playerId) {
  const state = room.gameState;
  if (state.folded.has(playerId)) return;
  
  io.to(room.id).emit('pokerCheck', { playerId });
  nextPokerTurn(room);
}

function handlePokerFold(room, playerId) {
  const state = room.gameState;
  state.folded.add(playerId);
  delete state.hands[playerId];
  
  io.to(room.id).emit('pokerFold', { playerId });
  
  const remaining = Object.keys(state.hands);
  if (remaining.length === 1) {
    endPokerRound(room, remaining[0]);
  } else {
    nextPokerTurn(room);
  }
}

function handlePokerDraw(room, playerId, cardsToReplace) {
  const state = room.gameState;
  const hand = state.hands[playerId];
  
  if (!hand || state.folded.has(playerId)) return;
  
  cardsToReplace.forEach(index => {
    if (index >= 0 && index < 5) {
      hand[index] = state.deck.pop();
    }
  });
  
  io.to(playerId).emit('pokerNewHand', { hand });
  nextPokerTurn(room);
}

function nextPokerTurn(room) {
  const state = room.gameState;
  const playerIds = Object.keys(state.hands);
  
  let nextIdx = (state.currentPlayer + 1) % playerIds.length;
  while (state.folded.has(playerIds[nextIdx])) {
    nextIdx = (nextIdx + 1) % playerIds.length;
  }
  
  state.currentPlayer = nextIdx;
  io.to(playerIds[nextIdx]).emit('yourTurn');
}

function endPokerRound(room, winnerId) {
  const state = room.gameState;
  const winner = room.players.find(p => p.id === winnerId);
  
  if (winner) {
    winner.chips += state.pot;
  }

  const handRanks = {};
  Object.entries(state.hands).forEach(([id, hand]) => {
    handRanks[id] = evaluatePokerHand(hand);
  });

  io.to(room.id).emit('pokerEnd', {
    winnerId,
    pot: state.pot,
    hands: state.hands,
    handRanks
  });
  
  room.status = 'waiting';
}

// ==================== WAR ====================
function startWar(room) {
  const deck = createDeck();
  const half = Math.floor(deck.length / 2);
  
  room.gameState = {
    piles: {},
    scores: {},
    lastRound: []
  };

  room.players.forEach((player, index) => {
    room.gameState.piles[player.id] = index === 0 ? deck.slice(0, half) : deck.slice(half);
    room.gameState.scores[player.id] = 0;
  });

  io.to(room.id).emit('warStart', {
    players: room.players.map(p => ({ id: p.id, username: p.username })),
    cardCounts: Object.fromEntries(room.players.map(p => [p.id, room.gameState.piles[p.id].length]))
  });
}

function handleWarPlay(room, playerId) {
  const state = room.gameState;
  const pile = state.piles[playerId];
  
  if (!pile || pile.length === 0) return;
  
  const card = pile.pop();
  io.to(room.id).emit('warCardPlayed', { playerId, card });
  
  state.lastRound.push({ playerId, card });
  
  if (state.lastRound.length === room.players.length) {
    const highest = Math.max(...state.lastRound.map(e => e.card.value));
    const winners = state.lastRound.filter(e => e.card.value === highest);
    
    if (winners.length === 1) {
      state.scores[winners[0].playerId]++;
      io.to(room.id).emit('warRoundWinner', { 
        winnerId: winners[0].playerId,
        scores: state.scores
      });
    } else {
      io.to(room.id).emit('warTie', { scores: state.scores });
    }
    
    state.lastRound = [];
    
    const gameOver = room.players.some(p => state.piles[p.id].length === 0);
    if (gameOver) {
      const winner = room.players.reduce((a, b) => 
        state.scores[a.id] > state.scores[b.id] ? a : b
      );
      io.to(room.id).emit('warEnd', { 
        winnerId: winner.id,
        scores: state.scores
      });
      room.status = 'waiting';
    }
  }
}

// ==================== KARERA ====================
function startKarera(room) {
  room.gameState = {
    horses: HORSES.slice(0, 6),
    positions: {},
    bets: {},
    raceStarted: false,
    raceFinished: false,
    winner: null,
    raceInterval: null
  };

  HORSES.forEach(h => {
    room.gameState.positions[h.id] = 0;
  });

  room.players.forEach(player => {
    room.gameState.bets[player.id] = { horse: null, amount: 0 };
  });

  io.to(room.id).emit('kareraStart', {
    horses: room.gameState.horses,
    players: room.players.map(p => ({ id: p.id, username: p.username, chips: p.chips }))
  });
}

function handleKareraBet(room, playerId, horseId, amount) {
  const state = room.gameState;
  const player = room.players.find(p => p.id === playerId);
  
  if (!player || amount > player.chips || state.raceStarted) return;
  if (!HORSES.find(h => h.id === horseId)) return;
  
  player.chips -= amount;
  state.bets[playerId] = { horse: horseId, amount: (state.bets[playerId]?.amount || 0) + amount };
  
  io.to(room.id).emit('kareraBetMade', {
    playerId,
    horseId,
    amount,
    totalBet: state.bets[playerId].amount,
    chips: player.chips
  });
}

function handleKareraStartRace(room) {
  const state = room.gameState;
  
  if (state.raceStarted) return;
  
  const hasBets = room.players.some(p => state.bets[p.id]?.horse !== null);
  if (!hasBets) {
    io.to(room.id).emit('kareraError', { message: 'Players must place bets first!' });
    return;
  }
  
  state.raceStarted = true;
  io.to(room.id).emit('kareraRaceStarted');
  
  const finishLine = 100;
  
  state.raceInterval = setInterval(() => {
    let finished = false;
    
    state.horses.forEach(horse => {
      if (state.positions[horse.id] < finishLine) {
        const move = Math.random() * 5 + 1;
        state.positions[horse.id] = Math.min(state.positions[horse.id] + move, finishLine);
        
        if (state.positions[horse.id] >= finishLine && !finished) {
          finished = true;
          state.winner = horse.id;
        }
      }
    });
    
    io.to(room.id).emit('kareraUpdate', { positions: { ...state.positions } });
    
    if (finished) {
      clearInterval(state.raceInterval);
      state.raceFinished = true;
      
      const results = {};
      room.players.forEach(player => {
        const bet = state.bets[player.id];
        if (bet.horse === state.winner) {
          const winnings = bet.amount * HORSES.find(h => h.id === state.winner).odds;
          player.chips += winnings;
          results[player.id] = { result: 'win', amount: winnings, horse: bet.horse };
        } else {
          results[player.id] = { result: 'lose', amount: -bet.amount, horse: bet.horse };
        }
      });
      
      const winnerHorse = state.horses.find(h => h.id === state.winner);
      
      io.to(room.id).emit('kareraRaceFinished', {
        winner: state.winner,
        winnerName: winnerHorse.name,
        winnerEmoji: winnerHorse.emoji,
        results
      });
      
      room.status = 'waiting';
    }
  }, 100);
}

// ==================== DICE ====================
function startDice(room) {
  room.gameState = {
    bets: {},
    phase: 'betting',
    point: null,
    dice: [0, 0],
    roller: room.players[0].id,
    round: 0
  };

  room.players.forEach(player => {
    room.gameState.bets[player.id] = { type: null, amount: 0, number: null };
  });

  io.to(room.id).emit('diceStart', {
    players: room.players.map(p => ({ id: p.id, username: p.username, chips: p.chips }))
  });
}

function handleDiceBet(room, playerId, betType, amount, number) {
  const state = room.gameState;
  const player = room.players.find(p => p.id === playerId);
  
  if (!player || amount > player.chips) return;
  
  const validBets = ['pass', 'dont_pass', 'field', 'any_seven', 'any_craps', 'number'];
  if (!validBets.includes(betType)) return;
  
  player.chips -= amount;
  state.bets[playerId] = { type: betType, amount: (state.bets[playerId]?.amount || 0) + amount, number };
  
  io.to(room.id).emit('diceBetMade', {
    playerId,
    betType,
    amount,
    number,
    totalBet: state.bets[playerId].amount,
    chips: player.chips
  });
}

function handleDiceRoll(room, playerId) {
  const state = room.gameState;
  
  if (playerId !== state.roller) return;
  
  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;
  const total = die1 + die2;
  
  state.dice = [die1, die2];
  state.round++;
  
  io.to(room.id).emit('diceRolled', { dice: state.dice, total, roller: playerId });
  
  const results = {};
  
  room.players.forEach(player => {
    const bet = state.bets[player.id];
    if (!bet.type || bet.amount === 0) {
      results[player.id] = { result: 'no_bet', amount: 0 };
      return;
    }
    
    let won = false;
    let multiplier = 1;
    
    switch (bet.type) {
      case 'pass':
        if (state.point === null) {
          if (total === 7 || total === 11) {
            won = true;
          } else if (total === 2 || total === 3 || total === 12) {
            won = false;
          } else {
            state.point = total;
            won = false;
          }
        } else {
          if (total === state.point) {
            won = true;
            state.point = null;
          } else if (total === 7) {
            won = false;
            state.point = null;
          }
        }
        multiplier = 2;
        break;
      case 'dont_pass':
        if (state.point === null) {
          if (total === 2 || total === 3) {
            won = true;
          } else if (total === 12) {
            won = false;
          } else if (total === 7 || total === 11) {
            won = false;
          } else {
            state.point = total;
          }
        } else {
          if (total === 7) {
            won = true;
            state.point = null;
          } else if (total === state.point) {
            won = false;
            state.point = null;
          }
        }
        multiplier = 2;
        break;
      case 'field':
        won = [2, 3, 4, 9, 10, 11, 12].includes(total);
        multiplier = total === 2 || total === 12 ? 3 : 2;
        break;
      case 'any_seven':
        won = total === 7;
        multiplier = 5;
        break;
      case 'any_craps':
        won = [2, 3, 12].includes(total);
        multiplier = 8;
        break;
      case 'number':
        if (bet.number >= 2 && bet.number <= 12) {
          won = total === bet.number;
          const numberOdds = { 2: 35, 3: 18, 4: 12, 5: 9, 6: 7, 8: 7, 9: 9, 10: 12, 11: 18, 12: 35 };
          multiplier = numberOdds[bet.number] || 7;
        }
        break;
    }
    
    if (won) {
      const winnings = bet.amount * multiplier;
      player.chips += winnings;
      results[player.id] = { result: 'win', amount: winnings, multiplier };
    } else {
      results[player.id] = { result: 'lose', amount: -bet.amount };
    }
  });
  
  // Reset bets for next round
  room.players.forEach(player => {
    state.bets[player.id] = { type: null, amount: 0, number: null };
  });
  
  // Next roller
  const currentIdx = room.players.findIndex(p => p.id === state.roller);
  state.roller = room.players[(currentIdx + 1) % room.players.length].id;
  
  io.to(room.id).emit('diceRoundEnd', {
    results,
    point: state.point,
    nextRoller: state.roller,
    round: state.round
  });
}

// ==================== SERVER START ====================
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Casino Royale server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});
