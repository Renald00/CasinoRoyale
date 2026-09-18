// Socket connection
const socket = io();

// Game state
let currentGame = null;
let roomId = null;
let isHost = false;
let playerName = '';

// DOM Elements
const screens = {
  mainMenu: document.getElementById('mainMenu'),
  lobby: document.getElementById('lobby'),
  blackjackGame: document.getElementById('blackjackGame'),
  pokerGame: document.getElementById('pokerGame'),
  warGame: document.getElementById('warGame'),
  kareraGame: document.getElementById('kareraGame'),
  diceGame: document.getElementById('diceGame'),
  solitaireGame: document.getElementById('solitaireGame')
};

// Create particles background
function createParticles() {
  const container = document.getElementById('particles');
  for (let i = 0; i < 50; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.left = Math.random() * 100 + '%';
    particle.style.animationDelay = Math.random() * 15 + 's';
    particle.style.animationDuration = (Math.random() * 10 + 10) + 's';
    container.appendChild(particle);
  }
}
createParticles();

// Utility functions
function showScreen(screenId) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[screenId].classList.add('active');
}

function createCardElement(card, hidden = false) {
  const div = document.createElement('div');
  div.className = `card ${hidden ? 'hidden' : ''} dealt`;
  
  if (!hidden && card) {
    const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
    div.classList.add(isRed ? 'red' : 'black');
    
    const suitSymbol = {
      'hearts': '♥',
      'diamonds': '♦',
      'clubs': '♣',
      'spades': '♠'
    }[card.suit];
    
    div.innerHTML = `
      <span class="rank">${card.rank}</span>
      <span class="suit">${suitSymbol}</span>
      <span class="rank-bottom">${card.rank}</span>
    `;
  }
  
  return div;
}

function getSuitSymbol(suit) {
  return { 'hearts': '♥', 'diamonds': '♦', 'clubs': '♣', 'spades': '♠' }[suit];
}

// Main Menu
let selectedGame = null;

document.querySelectorAll('.game-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.game-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedGame = card.dataset.game;
  });
});

document.getElementById('createRoomBtn').addEventListener('click', () => {
  playerName = document.getElementById('playerName').value.trim();
  if (!playerName) {
    alert('Please enter your name');
    return;
  }
  if (!selectedGame) {
    alert('Please select a game');
    return;
  }
  
  if (selectedGame === 'solitaire') {
    showScreen('solitaireGame');
    initSolitaire();
    return;
  }
  
  socket.emit('createRoom', { username: playerName, gameType: selectedGame });
});

document.getElementById('joinRoomBtn').addEventListener('click', () => {
  playerName = document.getElementById('playerName').value.trim();
  if (!playerName) {
    alert('Please enter your name');
    return;
  }
  
  const code = document.getElementById('roomCode').value.trim().toUpperCase();
  if (!code) {
    alert('Please enter a room code');
    return;
  }
  
  socket.emit('joinRoom', { username: playerName, roomId: code });
});

// Lobby
document.getElementById('backBtn').addEventListener('click', () => {
  showScreen('mainMenu');
  socket.disconnect();
  socket.connect();
});

document.getElementById('startGameBtn').addEventListener('click', () => {
  socket.emit('startGame');
});

// Socket events
socket.on('roomCreated', (data) => {
  roomId = data.roomId;
  isHost = true;
  document.getElementById('displayRoomCode').textContent = roomId;
  document.getElementById('startGameBtn').style.display = 'block';
  document.getElementById('waitingMsg').style.display = 'none';
  updateLobbyPlayers(data.room.players);
  showScreen('lobby');
});

socket.on('roomJoined', (data) => {
  roomId = data.roomId;
  isHost = false;
  document.getElementById('displayRoomCode').textContent = roomId;
  document.getElementById('startGameBtn').style.display = 'none';
  document.getElementById('waitingMsg').style.display = 'block';
  updateLobbyPlayers(data.room.players);
  showScreen('lobby');
});

socket.on('playerJoined', (data) => {
  updateLobbyPlayers(data.players);
});

socket.on('playerLeft', (data) => {
  updateLobbyPlayers(data.players);
});

socket.on('error', (data) => {
  alert(data.message);
});

function updateLobbyPlayers(players) {
  const container = document.getElementById('lobbyPlayers');
  container.innerHTML = players.map(p => `
    <div class="player-item">
      <div class="player-avatar">${p.username[0].toUpperCase()}</div>
      <span>${p.username}</span>
    </div>
  `).join('');
}

// Exit game buttons
document.querySelectorAll('.exit-game').forEach(btn => {
  btn.addEventListener('click', () => {
    showScreen('mainMenu');
    socket.disconnect();
    socket.connect();
  });
});

// ==================== BLACKJACK ====================
let blackjackState = {
  hand: [],
  dealerCard: null,
  value: 0
};

socket.on('blackjackStart', (data) => {
  blackjackState.hand = data.hand;
  blackjackState.dealerCard = data.dealerCard;
  showScreen('blackjackGame');
  renderBlackjack();
  document.getElementById('bjActions').style.display = 'flex';
  document.getElementById('bjResults').style.display = 'none';
});

socket.on('blackjackUpdate', (data) => {
  blackjackState.hand = data.hand;
  blackjackState.value = data.value;
  renderBlackjack();
});

socket.on('blackjackBust', (data) => {
  blackjackState.hand = data.hand;
  blackjackState.value = data.value;
  renderBlackjack();
  showBlackjackResult('Bust! You lose.', false);
});

socket.on('blackjackStood', () => {
  document.getElementById('bjActions').style.display = 'none';
});

socket.on('blackjackEnd', (data) => {
  const result = data.results[socket.id];
  const dealerDiv = document.getElementById('dealerHand');
  dealerDiv.innerHTML = '';
  data.dealerHand.forEach(card => {
    dealerDiv.appendChild(createCardElement(card));
  });
  document.getElementById('dealerValue').textContent = `Dealer: ${data.dealerValue}`;
  
  let message = '';
  if (result.result === 'win') {
    message = `You win $${result.amount}!`;
  } else if (result.result === 'lose') {
    message = `You lose $${Math.abs(result.amount)}`;
  } else {
    message = 'Push!';
  }
  showBlackjackResult(message, result.result === 'win');
});

function renderBlackjack() {
  const playerDiv = document.getElementById('playerHand');
  playerDiv.innerHTML = '';
  blackjackState.hand.forEach(card => {
    playerDiv.appendChild(createCardElement(card));
  });
  
  let value = 0;
  let aces = 0;
  blackjackState.hand.forEach(card => {
    value += card.value;
    if (card.rank === 'A') aces++;
  });
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  document.getElementById('playerValue').textContent = `You: ${value}`;
  
  const dealerDiv = document.getElementById('dealerHand');
  dealerDiv.innerHTML = '';
  dealerDiv.appendChild(createCardElement(blackjackState.dealerCard));
  dealerDiv.appendChild(createCardElement(null, true));
  document.getElementById('dealerValue').textContent = 'Dealer: ?';
}

function showBlackjackResult(message, isWin) {
  document.getElementById('bjResultText').textContent = message;
  document.getElementById('bjResultText').className = isWin ? 'win' : 'lose';
  document.getElementById('bjResults').style.display = 'flex';
  document.getElementById('bjActions').style.display = 'none';
}

document.getElementById('hitBtn').addEventListener('click', () => {
  socket.emit('blackjackHit');
});

document.getElementById('standBtn').addEventListener('click', () => {
  socket.emit('blackjackStand');
});

document.getElementById('bjNewRound').addEventListener('click', () => {
  socket.emit('startGame');
});

// ==================== POKER ====================
let pokerState = {
  hand: [],
  selectedCards: new Set(),
  phase: 'betting'
};

socket.on('pokerStart', (data) => {
  pokerState.hand = data.hand;
  pokerState.selectedCards.clear();
  pokerState.phase = 'betting';
  showScreen('pokerGame');
  renderPoker();
  updatePokerOpponents(data.players);
  document.getElementById('pokerActions').style.display = 'flex';
  document.getElementById('pokerBetBtn').style.display = 'block';
  document.getElementById('pokerFoldBtn').style.display = 'block';
  document.getElementById('pokerDrawBtn').style.display = 'none';
});

socket.on('yourTurn', () => {
  document.getElementById('pokerActions').style.opacity = '1';
  document.getElementById('pokerActions').style.pointerEvents = 'auto';
});

socket.on('pokerBetMade', (data) => {
  document.getElementById('pokerPot').textContent = data.pot;
});

socket.on('pokerFold', (data) => {
  // Handle fold
});

socket.on('pokerNewHand', (data) => {
  pokerState.hand = data.hand;
  pokerState.selectedCards.clear();
  pokerState.phase = 'betting';
  renderPoker();
  document.getElementById('pokerBetBtn').style.display = 'block';
  document.getElementById('pokerFoldBtn').style.display = 'block';
  document.getElementById('pokerDrawBtn').style.display = 'none';
});

socket.on('pokerEnd', (data) => {
  const isWinner = data.winnerId === socket.id;
  const message = isWinner ? `You win $${data.pot}!` : 'You lost this round';
  
  if (data.hands[socket.id]) {
    pokerState.hand = data.hands[socket.id];
    renderPoker();
  }
  
  if (data.handRanks[socket.id]) {
    document.getElementById('pokerHandRank').textContent = data.handRanks[socket.id].name;
  }
  
  setTimeout(() => {
    alert(message);
  }, 500);
});

function renderPoker() {
  const handDiv = document.getElementById('pokerHand');
  handDiv.innerHTML = '';
  
  pokerState.hand.forEach((card, index) => {
    const cardEl = createCardElement(card);
    if (pokerState.selectedCards.has(index)) {
      cardEl.classList.add('selected');
    }
    cardEl.addEventListener('click', () => {
      if (pokerState.phase === 'draw') {
        if (pokerState.selectedCards.has(index)) {
          pokerState.selectedCards.delete(index);
        } else {
          pokerState.selectedCards.add(index);
        }
        renderPoker();
      }
    });
    handDiv.appendChild(cardEl);
  });
}

function updatePokerOpponents(players) {
  const container = document.getElementById('pokerOpponents');
  container.innerHTML = players.filter(p => p.id !== socket.id).map(p => `
    <div class="opponent-info">
      <h4>${p.username}</h4>
      <div class="hand">
        ${Array(5).fill('<div class="card hidden"></div>').join('')}
      </div>
    </div>
  `).join('');
}

document.getElementById('pokerBetBtn').addEventListener('click', () => {
  socket.emit('pokerBet', { amount: 50 });
  pokerState.phase = 'draw';
  document.getElementById('pokerBetBtn').style.display = 'none';
  document.getElementById('pokerFoldBtn').style.display = 'none';
  document.getElementById('pokerDrawBtn').style.display = 'block';
});

document.getElementById('pokerFoldBtn').addEventListener('click', () => {
  socket.emit('pokerFold');
});

document.getElementById('pokerDrawBtn').addEventListener('click', () => {
  socket.emit('pokerDraw', { cards: Array.from(pokerState.selectedCards) });
});

// ==================== WAR ====================
let warState = {
  playerCard: null,
  opponentCard: null
};

socket.on('warStart', (data) => {
  showScreen('warGame');
  const opponent = data.players.find(p => p.id !== socket.id);
  if (opponent) {
    document.getElementById('warOpponentName').textContent = opponent.username;
  }
  document.getElementById('warScore1').textContent = '0';
  document.getElementById('warScore2').textContent = '0';
  document.getElementById('playerPile').textContent = data.cardCounts[socket.id] || 26;
  const opponentId = Object.keys(data.cardCounts).find(id => id !== socket.id);
  document.getElementById('opponentPile').textContent = data.cardCounts[opponentId] || 26;
  document.getElementById('playerCard').innerHTML = '';
  document.getElementById('opponentCard').innerHTML = '';
});

socket.on('warCardPlayed', (data) => {
  const cardEl = createCardElement(data.card);
  if (data.playerId === socket.id) {
    document.getElementById('playerCard').innerHTML = '';
    document.getElementById('playerCard').appendChild(cardEl);
  } else {
    document.getElementById('opponentCard').innerHTML = '';
    document.getElementById('opponentCard').appendChild(cardEl);
  }
});

socket.on('warRoundWinner', (data) => {
  const isWinner = data.winnerId === socket.id;
  document.getElementById('warScore1').textContent = data.scores[socket.id] || 0;
  const opponentId = Object.keys(data.scores).find(id => id !== socket.id);
  document.getElementById('warScore2').textContent = data.scores[opponentId] || 0;
});

socket.on('warTie', (data) => {
  // Handle tie
});

socket.on('warEnd', (data) => {
  const isWinner = data.winnerId === socket.id;
  document.getElementById('warScore1').textContent = data.scores[socket.id] || 0;
  const opponentId = Object.keys(data.scores).find(id => id !== socket.id);
  document.getElementById('warScore2').textContent = data.scores[opponentId] || 0;
  
  setTimeout(() => {
    alert(isWinner ? 'You win the war!' : 'You lost the war!');
  }, 500);
});

document.getElementById('warPlayBtn').addEventListener('click', () => {
  socket.emit('warPlay');
});

// ==================== KARERA (Horse Racing) ====================
let kareraState = {
  horses: [],
  positions: {},
  selectedHorse: null,
  betAmount: 0,
  raceStarted: false
};

socket.on('kareraStart', (data) => {
  kareraState.horses = data.horses;
  kareraState.positions = {};
  kareraState.selectedHorse = null;
  kareraState.betAmount = 0;
  kareraState.raceStarted = false;
  
  data.horses.forEach(h => {
    kareraState.positions[h.id] = 0;
  });
  
  showScreen('kareraGame');
  renderKareraTrack();
  renderKareraBetting();
  document.getElementById('kareraActions').style.display = 'flex';
  document.getElementById('kareraResults').style.display = 'none';
  document.getElementById('currentBet').textContent = '0';
  document.getElementById('currentHorse').textContent = '-';
  document.getElementById('kareraPot').textContent = '0';
});

socket.on('kareraBetMade', (data) => {
  document.getElementById('kareraPot').textContent = parseInt(document.getElementById('kareraPot').textContent) + data.amount;
});

socket.on('kareraRaceStarted', () => {
  kareraState.raceStarted = true;
  document.getElementById('kareraStartRaceBtn').disabled = true;
  document.getElementById('kareraStartRaceBtn').textContent = 'Race in progress...';
});

socket.on('kareraUpdate', (data) => {
  kareraState.positions = data.positions;
  updateHorsePositions();
});

socket.on('kareraRaceFinished', (data) => {
  const result = data.results[socket.id];
  let message = '';
  
  if (result.result === 'win') {
    message = `🎉 You win $${result.amount}! 🎉`;
  } else {
    message = `You lost $${Math.abs(result.amount)}`;
  }
  
  document.getElementById('kareraResultText').textContent = message;
  document.getElementById('kareraResultText').className = result.result === 'win' ? 'win' : 'lose';
  document.getElementById('kareraWinnerInfo').innerHTML = `
    <div class="winner-horse">
      <span class="winner-emoji">🏆</span>
      <span>Winner: ${data.winnerName}</span>
    </div>
  `;
  document.getElementById('kareraResults').style.display = 'flex';
});

socket.on('kareraError', (data) => {
  alert(data.message);
});

function renderKareraTrack() {
  const container = document.getElementById('horseLanes');
  container.innerHTML = kareraState.horses.map(horse => `
    <div class="horse-lane" data-horse="${horse.id}">
      <div class="horse-info">
        <span class="horse-num">${horse.id}</span>
        <span class="horse-name">${horse.name}</span>
      </div>
      <div class="horse-track">
        <div class="horse-runner" id="horse-${horse.id}" style="background: ${horse.color}">
          ${horse.emoji}
        </div>
      </div>
    </div>
  `).join('');
}

function renderKareraBetting() {
  const container = document.getElementById('horseOptions');
  container.innerHTML = kareraState.horses.map(horse => `
    <div class="horse-option ${kareraState.selectedHorse === horse.id ? 'selected' : ''}" 
         data-horse="${horse.id}" style="border-color: ${horse.color}">
      <span class="horse-emoji">${horse.emoji}</span>
      <span class="horse-label">${horse.name}</span>
      <span class="horse-odds">5x</span>
    </div>
  `).join('');
  
  // Add click handlers
  document.querySelectorAll('.horse-option').forEach(opt => {
    opt.addEventListener('click', () => {
      kareraState.selectedHorse = parseInt(opt.dataset.horse);
      renderKareraBetting();
      document.getElementById('currentHorse').textContent = 
        kareraState.horses.find(h => h.id === kareraState.selectedHorse).name;
    });
  });
}

function updateHorsePositions() {
  kareraState.horses.forEach(horse => {
    const el = document.getElementById(`horse-${horse.id}`);
    if (el) {
      el.style.left = kareraState.positions[horse.id] + '%';
    }
  });
}

// Chip buttons for Karera
document.querySelectorAll('.chip-btn:not(.dice-chip)').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!kareraState.selectedHorse) {
      alert('Select a horse first!');
      return;
    }
    
    const amount = parseInt(btn.dataset.amount);
    kareraState.betAmount += amount;
    document.getElementById('currentBet').textContent = kareraState.betAmount;
    
    socket.emit('kareraBet', {
      horse: kareraState.selectedHorse,
      amount: amount
    });
  });
});

document.getElementById('kareraStartRaceBtn').addEventListener('click', () => {
  socket.emit('kareraStartRace');
});

document.getElementById('kareraNewRace').addEventListener('click', () => {
  socket.emit('startGame');
});

// ==================== DICE (Craps) ====================
let diceState = {
  dice: [1, 1],
  currentBet: null,
  betAmount: 0,
  point: null
};

socket.on('diceStart', (data) => {
  diceState = { dice: [1, 1], currentBet: null, betAmount: 0, point: null };
  showScreen('diceGame');
  renderDice();
  updateDicePlayers(data.players);
  document.getElementById('diceActions').style.display = 'flex';
  document.getElementById('diceResults').style.display = 'none';
  document.getElementById('diceCurrentBet').textContent = 'None';
  document.getElementById('dicePoint').style.display = 'none';
});

socket.on('diceBetMade', (data) => {
  document.getElementById('dicePot').textContent = parseInt(document.getElementById('dicePot').textContent) + data.amount;
});

socket.on('diceRolled', (data) => {
  diceState.dice = data.dice;
  renderDiceRoll(data.dice, data.total);
});

socket.on('diceRoundEnd', (data) => {
  const result = data.results[socket.id];
  
  if (data.point !== null) {
    diceState.point = data.point;
    document.getElementById('dicePoint').style.display = 'block';
    document.getElementById('dicePoint span').textContent = data.point;
  } else {
    diceState.point = null;
    document.getElementById('dicePoint').style.display = 'none';
  }
  
  let message = '';
  if (result.result === 'win') {
    message = `You win $${result.amount}!`;
  } else if (result.result === 'lose') {
    message = `You lose $${Math.abs(result.amount)}`;
  }
  
  if (message) {
    document.getElementById('diceResultText').textContent = message;
    document.getElementById('diceResultText').className = result.result === 'win' ? 'win' : 'lose';
    document.getElementById('diceResults').style.display = 'flex';
  }
});

function renderDice() {
  const diceEmojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  document.getElementById('die1').textContent = diceEmojis[diceState.dice[0] - 1];
  document.getElementById('die2').textContent = diceEmojis[diceState.dice[1] - 1];
  document.getElementById('diceTotal').textContent = `Total: ${diceState.dice[0] + diceState.dice[1]}`;
}

function renderDiceRoll(dice, total) {
  const diceEmojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  const die1El = document.getElementById('die1');
  const die2El = document.getElementById('die2');
  
  die1El.classList.add('rolling');
  die2El.classList.add('rolling');
  
  let rollCount = 0;
  const rollInterval = setInterval(() => {
    die1El.textContent = diceEmojis[Math.floor(Math.random() * 6)];
    die2El.textContent = diceEmojis[Math.floor(Math.random() * 6)];
    rollCount++;
    
    if (rollCount > 10) {
      clearInterval(rollInterval);
      die1El.textContent = diceEmojis[dice[0] - 1];
      die2El.textContent = diceEmojis[dice[1] - 1];
      die1El.classList.remove('rolling');
      die2El.classList.remove('rolling');
      document.getElementById('diceTotal').textContent = `Total: ${total}`;
    }
  }, 100);
}

function updateDicePlayers(players) {
  const container = document.getElementById('dicePlayers');
  container.innerHTML = players.map(p => `
    <div class="dice-player ${p.id === socket.id ? 'current' : ''}">
      <span class="player-name">${p.username}</span>
      <span class="player-chips">$${p.chips}</span>
    </div>
  `).join('');
}

// Dice bet buttons
document.querySelectorAll('.dice-bet-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.dice-bet-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    diceState.currentBet = btn.dataset.bet;
    document.getElementById('diceCurrentBet').textContent = btn.textContent;
  });
});

// Dice chip buttons
document.querySelectorAll('.dice-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!diceState.currentBet) {
      alert('Select a bet type first!');
      return;
    }
    
    const amount = parseInt(btn.dataset.amount);
    diceState.betAmount += amount;
    
    socket.emit('diceBet', {
      betType: diceState.currentBet,
      amount: amount,
      number: null
    });
  });
});

document.getElementById('diceRollBtn').addEventListener('click', () => {
  socket.emit('diceRoll');
});

document.getElementById('diceNewRound').addEventListener('click', () => {
  document.getElementById('diceResults').style.display = 'none';
  diceState.betAmount = 0;
  diceState.currentBet = null;
  document.querySelectorAll('.dice-bet-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('diceCurrentBet').textContent = 'None';
});

// ==================== SOLITAIRE ====================
let solitaireState = {
  deck: [],
  waste: [],
  foundations: [[], [], [], []],
  tableau: [[], [], [], [], [], [], []],
  moves: 0,
  startTime: null,
  timer: null,
  selectedPile: null
};

function initSolitaire() {
  const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  
  let deck = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank, faceUp: false });
    }
  }
  
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  
  solitaireState = {
    deck: deck,
    waste: [],
    foundations: [[], [], [], []],
    tableau: [[], [], [], [], [], [], []],
    moves: 0,
    startTime: Date.now(),
    timer: setInterval(updateSolitaireTimer, 1000),
    selectedPile: null
  };
  
  for (let i = 0; i < 7; i++) {
    for (let j = i; j < 7; j++) {
      const card = solitaireState.deck.pop();
      card.faceUp = (j === i);
      solitaireState.tableau[j].push(card);
    }
  }
  
  renderSolitaire();
  document.getElementById('solMoves').textContent = '0';
}

function updateSolitaireTimer() {
  const elapsed = Math.floor((Date.now() - solitaireState.startTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  document.getElementById('solTime').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function renderSolitaire() {
  const stockDiv = document.getElementById('stock');
  stockDiv.innerHTML = '';
  if (solitaireState.deck.length > 0) {
    const card = document.createElement('div');
    card.className = 'card hidden';
    card.style.position = 'absolute';
    stockDiv.appendChild(card);
  }
  stockDiv.onclick = () => drawFromStock();
  
  const wasteDiv = document.getElementById('waste');
  wasteDiv.innerHTML = '';
  if (solitaireState.waste.length > 0) {
    const topCard = solitaireState.waste[solitaireState.waste.length - 1];
    const cardEl = createCardElement(topCard);
    cardEl.style.position = 'absolute';
    cardEl.onclick = () => selectPile('waste', solitaireState.waste.length - 1);
    wasteDiv.appendChild(cardEl);
  }
  
  for (let i = 0; i < 4; i++) {
    const foundDiv = document.getElementById(`foundation-${i}`);
    foundDiv.innerHTML = '';
    if (solitaireState.foundations[i].length > 0) {
      const topCard = solitaireState.foundations[i][solitaireState.foundations[i].length - 1];
      const cardEl = createCardElement(topCard);
      cardEl.style.position = 'absolute';
      foundDiv.appendChild(cardEl);
    }
    foundDiv.onclick = () => selectPile(`foundation-${i}`, 0);
  }
  
  for (let i = 0; i < 7; i++) {
    const tabDiv = document.getElementById(`tableau-${i}`);
    tabDiv.innerHTML = '';
    solitaireState.tableau[i].forEach((card, index) => {
      const cardEl = card.faceUp ? createCardElement(card) : createCardElement(null, true);
      cardEl.style.position = 'absolute';
      cardEl.style.top = `${index * 25}px`;
      cardEl.onclick = (e) => {
        e.stopPropagation();
        selectPile(`tableau-${i}`, index);
      };
      tabDiv.appendChild(cardEl);
    });
  }
}

function drawFromStock() {
  if (solitaireState.deck.length === 0) {
    solitaireState.deck = solitaireState.waste.reverse().map(c => ({ ...c, faceUp: false }));
    solitaireState.waste = [];
  } else {
    const card = solitaireState.deck.pop();
    card.faceUp = true;
    solitaireState.waste.push(card);
  }
  solitaireState.moves++;
  document.getElementById('solMoves').textContent = solitaireState.moves;
  renderSolitaire();
}

function selectPile(pileType, cardIndex) {
  if (solitaireState.selectedPile) {
    const source = solitaireState.selectedPile;
    const target = pileType;
    
    if (tryMove(source, target)) {
      solitaireState.moves++;
      document.getElementById('solMoves').textContent = solitaireState.moves;
    }
    solitaireState.selectedPile = null;
  } else {
    solitaireState.selectedPile = { type: pileType, index: cardIndex };
  }
  renderSolitaire();
}

function tryMove(source, target) {
  let sourceCards = [];
  let sourcePile = null;
  
  if (source.type === 'waste') {
    sourceCards = [solitaireState.waste[source.index]];
    sourcePile = solitaireState.waste;
  } else if (source.type.startsWith('tableau')) {
    const tabIdx = parseInt(source.type.split('-')[1]);
    sourceCards = solitaireState.tableau[tabIdx].slice(source.index);
    sourcePile = solitaireState.tableau[tabIdx];
  } else if (source.type.startsWith('foundation')) {
    const foundIdx = parseInt(source.type.split('-')[1]);
    sourceCards = [solitaireState.foundations[foundIdx][solitaireState.foundations[foundIdx].length - 1]];
    sourcePile = solitaireState.foundations[foundIdx];
  }
  
  if (sourceCards.length === 0) return false;
  
  let targetPile = null;
  if (target === 'waste') return false;
  if (target.startsWith('foundation')) {
    const foundIdx = parseInt(target.split('-')[1]);
    targetPile = solitaireState.foundations[foundIdx];
    
    if (sourceCards.length !== 1) return false;
    
    const card = sourceCards[0];
    if (targetPile.length === 0) {
      if (card.rank === 'A') {
        targetPile.push(card);
        sourcePile.splice(source.index, 1);
        checkWin();
        return true;
      }
      return false;
    }
    
    const topCard = targetPile[targetPile.length - 1];
    if (card.suit === topCard.suit && getRankValue(card.rank) === getRankValue(topCard.rank) + 1) {
      targetPile.push(card);
      sourcePile.splice(source.index, 1);
      checkWin();
      return true;
    }
    return false;
  }
  
  if (target.startsWith('tableau')) {
    const tabIdx = parseInt(target.split('-')[1]);
    targetPile = solitaireState.tableau[tabIdx];
    
    if (targetPile.length === 0) {
      if (sourceCards[0].rank === 'K') {
        targetPile.push(...sourceCards);
        sourcePile.splice(source.index);
        flipTopCard(sourcePile);
        return true;
      }
      return false;
    }
    
    const topCard = targetPile[targetPile.length - 1];
    const sourceCard = sourceCards[0];
    
    if (isAlternatingColor(sourceCard, topCard) && getRankValue(sourceCard.rank) === getRankValue(topCard.rank) - 1) {
      targetPile.push(...sourceCards);
      sourcePile.splice(source.index);
      flipTopCard(sourcePile);
      return true;
    }
    return false;
  }
  
  return false;
}

function getRankValue(rank) {
  const values = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
  return values[rank];
}

function isAlternatingColor(card1, card2) {
  const redSuits = ['hearts', 'diamonds'];
  const isRed1 = redSuits.includes(card1.suit);
  const isRed2 = redSuits.includes(card2.suit);
  return isRed1 !== isRed2;
}

function flipTopCard(pile) {
  if (pile.length > 0 && !pile[pile.length - 1].faceUp) {
    pile[pile.length - 1].faceUp = true;
  }
}

function checkWin() {
  const totalFoundation = solitaireState.foundations.reduce((sum, f) => sum + f.length, 0);
  if (totalFoundation === 52) {
    clearInterval(solitaireState.timer);
    document.getElementById('winMessage').textContent = `Completed in ${solitaireState.moves} moves!`;
    document.getElementById('winOverlay').style.display = 'flex';
  }
}

document.getElementById('newGameBtn').addEventListener('click', () => {
  if (solitaireState.timer) clearInterval(solitaireState.timer);
  initSolitaire();
});

document.getElementById('playAgainBtn').addEventListener('click', () => {
  document.getElementById('winOverlay').style.display = 'none';
  initSolitaire();
});

// Initialize
document.getElementById('playerName').focus();
