const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// Card game utilities
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

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

// Game rooms
const rooms = {};
const players = {};

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('createRoom', (data) => {
    const { username, gameType } = data;
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    rooms[roomId] = {
      id: roomId,
      gameType,
      host: socket.id,
      players: [{ id: socket.id, username, chips: 1000 }],
      gameState: null,
      status: 'waiting'
    };

    players[socket.id] = { roomId, username };
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, room: rooms[roomId] });
  });

  socket.on('joinRoom', (data) => {
    const { username, roomId } = data;
    const room = rooms[roomId];
    
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    
    if (room.players.length >= 6) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }

    room.players.push({ id: socket.id, username, chips: 1000 });
    players[socket.id] = { roomId, username };
    socket.join(roomId);
    
    io.to(roomId).emit('playerJoined', { 
      player: { id: socket.id, username },
      players: room.players 
    });
    socket.emit('roomJoined', { roomId, room: room });
  });

  socket.on('startGame', () => {
    const player = players[socket.id];
    if (!player) return;
    
    const room = rooms[player.roomId];
    if (!room || room.host !== socket.id) return;

    room.status = 'playing';
    
    if (room.gameType === 'blackjack') {
      startBlackjack(room);
    } else if (room.gameType === 'poker') {
      startPoker(room);
    } else if (room.gameType === 'war') {
      startWar(room);
    }
  });

  // Blackjack events
  socket.on('blackjackHit', () => {
    const player = players[socket.id];
    if (!player) return;
    const room = rooms[player.roomId];
    if (!room || room.gameType !== 'blackjack') return;
    
    handleBlackjackHit(room, socket.id);
  });

  socket.on('blackjackStand', () => {
    const player = players[socket.id];
    if (!player) return;
    const room = rooms[player.roomId];
    if (!room || room.gameType !== 'blackjack') return;
    
    handleBlackjackStand(room, socket.id);
  });

  // Poker events
  socket.on('pokerBet', (data) => {
    const player = players[socket.id];
    if (!player) return;
    const room = rooms[player.roomId];
    if (!room || room.gameType !== 'poker') return;
    
    handlePokerBet(room, socket.id, data.amount);
  });

  socket.on('pokerFold', () => {
    const player = players[socket.id];
    if (!player) return;
    const room = rooms[player.roomId];
    if (!room || room.gameType !== 'poker') return;
    
    handlePokerFold(room, socket.id);
  });

  socket.on('pokerDraw', (data) => {
    const player = players[socket.id];
    if (!player) return;
    const room = rooms[player.roomId];
    if (!room || room.gameType !== 'poker') return;
    
    handlePokerDraw(room, socket.id, data.cards);
  });

  // War events
  socket.on('warPlay', () => {
    const player = players[socket.id];
    if (!player) return;
    const room = rooms[player.roomId];
    if (!room || room.gameType !== 'war') return;
    
    handleWarPlay(room, socket.id);
  });

  socket.on('disconnect', () => {
    const player = players[socket.id];
    if (player) {
      const room = rooms[player.roomId];
      if (room) {
        room.players = room.players.filter(p => p.id !== socket.id);
        if (room.players.length === 0) {
          delete rooms[player.roomId];
        } else {
          io.to(player.roomId).emit('playerLeft', { 
            playerId: socket.id,
            players: room.players 
          });
        }
      }
      delete players[socket.id];
    }
    console.log('Player disconnected:', socket.id);
  });
});

// Blackjack logic
function startBlackjack(room) {
  const deck = createDeck();
  room.gameState = {
    deck,
    dealer: { hand: [], hidden: true },
    players: {},
    currentPlayer: 0
  };

  room.players.forEach(player => {
    room.gameState.players[player.id] = {
      hand: [deck.pop(), deck.pop()],
      stand: false,
      bust: false,
      bet: 10
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
  } else {
    io.to(playerId).emit('blackjackUpdate', { hand: playerHand.hand, value });
  }
  
  checkBlackjackRound(room);
}

function handleBlackjackStand(room, playerId) {
  const state = room.gameState;
  state.players[playerId].stand = true;
  io.to(playerId).emit('blackjackStood');
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
      } else if (playerValue > dealerValue) {
        results[player.id] = { result: 'win', amount: playerState.bet };
      } else if (playerValue < dealerValue) {
        results[player.id] = { result: 'lose', amount: -playerState.bet };
      } else {
        results[player.id] = { result: 'push', amount: 0 };
      }
    });

    io.to(room.id).emit('blackjackEnd', {
      dealerHand: state.dealer.hand,
      dealerValue,
      results
    });
  }
}

// Poker logic
function startPoker(room) {
  const deck = createDeck();
  room.gameState = {
    deck,
    hands: {},
    pot: 0,
    currentBet: 0,
    currentPlayer: 0,
    phase: 'betting',
    bets: {}
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
  
  if (!player || amount > player.chips) return;
  
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

function handlePokerFold(room, playerId) {
  const state = room.gameState;
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
  
  if (!hand) return;
  
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
  state.currentPlayer = (state.currentPlayer + 1) % playerIds.length;
  
  const nextPlayerId = playerIds[state.currentPlayer];
  io.to(nextPlayerId).emit('yourTurn');
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
}

// War logic
function startWar(room) {
  const deck = createDeck();
  const half = Math.floor(deck.length / 2);
  
  room.gameState = {
    piles: {},
    scores: {}
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
  
  // Check if all players have played
  const playedCount = room.players.filter(p => {
    const events = room.gameState.lastRound || [];
    return events.some(e => e.playerId === p.id);
  }).length;
  
  if (!room.gameState.lastRound) room.gameState.lastRound = [];
  room.gameState.lastRound.push({ playerId, card });
  
  if (room.gameState.lastRound.length === room.players.length) {
    // Determine winner
    const highest = Math.max(...room.gameState.lastRound.map(e => e.card.value));
    const winners = room.gameState.lastRound.filter(e => e.card.value === highest);
    
    if (winners.length === 1) {
      state.scores[winners[0].playerId]++;
      io.to(room.id).emit('warRoundWinner', { 
        winnerId: winners[0].playerId,
        scores: state.scores
      });
    } else {
      io.to(room.id).emit('warTie', { scores: state.scores });
    }
    
    room.gameState.lastRound = [];
    
    // Check game over
    const gameOver = room.players.some(p => state.piles[p.id].length === 0);
    if (gameOver) {
      const winner = room.players.reduce((a, b) => 
        state.scores[a.id] > state.scores[b.id] ? a : b
      );
      io.to(room.id).emit('warEnd', { 
        winnerId: winner.id,
        scores: state.scores
      });
    }
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Card Games server running on port ${PORT}`);
});
