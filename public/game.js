// Game State
const socket = io();
let currentUser = null;
let currentGame = null;
let scene, camera, renderer, player;
let otherPlayers = {};
let blocks = [];
let blockMeshes = {};
let selectedSlot = 0;
let isPlaying = false;
let canJump = true;
let velocity = { x: 0, y: 0, z: 0 };
let moveSpeed = 0.15;
let jumpForce = 0.3;
let gravity = -0.015;
let playerOnGround = false;
let keys = {};
let mouse = { x: 0, y: 0 };
let raycaster = new THREE.Raycaster();
let cameraDistance = 5;
let cameraAngleX = 0;
let cameraAngleY = 0.5;
let isPointerLocked = false;

const blockTypes = [
  { name: 'Wood', color: '#8B4513' },
  { name: 'Stone', color: '#808080' },
  { name: 'Grass', color: '#228B22' },
  { name: 'Brick', color: '#DC143C' },
  { name: 'Gold', color: '#FFD700' },
  { name: 'Diamond', color: '#4169E1' },
  { name: 'Pink', color: '#FF69B4' },
  { name: 'Ice', color: '#87CEEB' }
];

// Avatar Preview
function drawAvatarPreview() {
  const canvas = document.getElementById('avatarCanvas');
  const ctx = canvas.getContext('2d');
  const color = document.querySelector('.color-option.selected')?.dataset.color || '#4a90d9';
  const hat = document.querySelector('.hat-option.selected')?.dataset.hat || 'none';

  ctx.clearRect(0, 0, 200, 200);
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, 200, 200);

  // Body
  ctx.fillStyle = color;
  ctx.fillRect(70, 80, 60, 80);

  // Head
  ctx.fillStyle = '#ffd5b4';
  ctx.beginPath();
  ctx.arc(100, 55, 30, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(88, 50, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(112, 50, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#333';
  ctx.beginPath();
  ctx.arc(90, 50, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(114, 50, 4, 0, Math.PI * 2);
  ctx.fill();

  // Smile
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(100, 60, 10, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();

  // Arms
  ctx.fillStyle = color;
  ctx.fillRect(45, 85, 20, 60);
  ctx.fillRect(135, 85, 20, 60);

  // Legs
  ctx.fillRect(75, 160, 22, 40);
  ctx.fillRect(103, 160, 22, 40);

  // Hat
  if (hat === 'crown') {
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.moveTo(70, 30);
    ctx.lineTo(80, 10);
    ctx.lineTo(90, 25);
    ctx.lineTo(100, 5);
    ctx.lineTo(110, 25);
    ctx.lineTo(120, 10);
    ctx.lineTo(130, 30);
    ctx.closePath();
    ctx.fill();
  } else if (hat === 'cap') {
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(65, 25, 70, 20);
    ctx.fillRect(60, 35, 40, 10);
  } else if (hat === 'tophat') {
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(75, 5, 50, 35);
    ctx.fillRect(65, 35, 70, 8);
  }
}

// Login Screen Logic
document.querySelectorAll('.color-option').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
    drawAvatarPreview();
  });
});

document.querySelectorAll('.hat-option').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('.hat-option').forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
    drawAvatarPreview();
  });
});

document.getElementById('playBtn').addEventListener('click', () => {
  const username = document.getElementById('username').value.trim();
  if (!username) {
    alert('Please enter a username!');
    return;
  }
  currentUser = {
    username,
    character: {
      color: document.querySelector('.color-option.selected')?.dataset.color || '#4a90d9',
      hat: document.querySelector('.hat-option.selected')?.dataset.hat || 'none'
    }
  };
  showScreen('lobbyScreen');
  document.getElementById('lobbyUsername').textContent = username;
  document.getElementById('lobbyAvatar').style.background = currentUser.character.color;
});

// Game Selection
document.querySelectorAll('.game-card').forEach(card => {
  card.addEventListener('click', () => {
    const gameId = card.dataset.game;
    joinGame(gameId);
  });
});

document.getElementById('backToLobby').addEventListener('click', () => {
  leaveGame();
  showScreen('lobbyScreen');
});

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

function joinGame(gameId) {
  currentGame = gameId;
  socket.emit('joinGame', {
    username: currentUser.username,
    gameMode: gameId,
    character: currentUser.character
  });
}

function leaveGame() {
  if (isPlaying) {
    socket.disconnect();
    socket.connect();
    isPlaying = false;
    if (renderer) {
      renderer.dispose();
    }
  }
}

// Socket Events
socket.on('gameJoined', (data) => {
  showScreen('gameScreen');
  initGame(data);
});

socket.on('playerJoined', (player) => {
  addOtherPlayer(player);
  addChatMessage(`${player.username} joined the game`, '#2ecc71');
});

socket.on('playerLeft', (playerId) => {
  if (otherPlayers[playerId]) {
    scene.remove(otherPlayers[playerId].mesh);
    delete otherPlayers[playerId];
  }
});

socket.on('playerMoved', (data) => {
  if (otherPlayers[data.id]) {
    otherPlayers[data.id].targetPosition = data.position;
    otherPlayers[data.id].targetRotation = data.rotation;
  }
});

socket.on('blockPlaced', (data) => {
  placeBlockVisual(data.block);
});

socket.on('blockRemoved', (data) => {
  removeBlockVisual(data.x, data.y, data.z);
});

socket.on('chatMessage', (data) => {
  addChatMessage(`${data.username}: ${data.message}`);
});

// Game Initialization
function initGame(data) {
  isPlaying = true;
  const canvas = document.getElementById('gameCanvas');

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0x87CEEB, 50, 200);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Lighting
  const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(50, 100, 50);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.width = 2048;
  directionalLight.shadow.mapSize.height = 2048;
  directionalLight.shadow.camera.near = 0.5;
  directionalLight.shadow.camera.far = 500;
  directionalLight.shadow.camera.left = -100;
  directionalLight.shadow.camera.right = 100;
  directionalLight.shadow.camera.top = 100;
  directionalLight.shadow.camera.bottom = -100;
  scene.add(directionalLight);

  const hemisphereLight = new THREE.HemisphereLight(0x87CEEB, 0x362907, 0.3);
  scene.add(hemisphereLight);

  // Ground
  const groundGeometry = new THREE.PlaneGeometry(200, 200);
  const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x3a7d44 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Grid helper
  const gridHelper = new THREE.GridHelper(200, 100, 0x2d5a32, 0x2d5a32);
  gridHelper.position.y = 0.01;
  scene.add(gridHelper);

  // Create player
  createPlayer(data.player);

  // Add existing blocks
  if (data.world && data.world.blocks) {
    data.world.blocks.forEach(block => placeBlockVisual(block));
  }

  // Add other players
  if (data.players) {
    data.players.forEach(p => {
      if (p.id !== socket.id) {
        addOtherPlayer(p);
      }
    });
  }

  // Update game title
  const titles = {
    'obby-1': 'Obby Challenge',
    'build-1': 'Free Build',
    'racing-1': 'Speed Race',
    'survival-1': 'Survival Island'
  };
  document.getElementById('currentGameTitle').textContent = titles[currentGame] || 'Game';
  document.getElementById('onlineCount').textContent = data.players.length;

  // Event listeners
  setupControls();

  // Start game loop
  animate();
}

function createPlayer(playerData) {
  const group = new THREE.Group();

  // Body
  const bodyGeometry = new THREE.BoxGeometry(0.6, 0.8, 0.4);
  const bodyMaterial = new THREE.MeshLambertMaterial({ color: playerData.character.color });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 0.9;
  body.castShadow = true;
  group.add(body);

  // Head
  const headGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const headMaterial = new THREE.MeshLambertMaterial({ color: 0xffd5b4 });
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.y = 1.65;
  head.castShadow = true;
  group.add(head);

  // Eyes
  const eyeGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.05);
  const eyeMaterial = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  leftEye.position.set(-0.12, 1.7, 0.25);
  group.add(leftEye);
  const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  rightEye.position.set(0.12, 1.7, 0.25);
  group.add(rightEye);

  // Arms
  const armGeometry = new THREE.BoxGeometry(0.2, 0.7, 0.2);
  const armMaterial = new THREE.MeshLambertMaterial({ color: playerData.character.color });
  const leftArm = new THREE.Mesh(armGeometry, armMaterial);
  leftArm.position.set(-0.45, 0.9, 0);
  leftArm.castShadow = true;
  group.add(leftArm);
  const rightArm = new THREE.Mesh(armGeometry, armMaterial);
  rightArm.position.set(0.45, 0.9, 0);
  rightArm.castShadow = true;
  group.add(rightArm);

  // Legs
  const legGeometry = new THREE.BoxGeometry(0.25, 0.6, 0.3);
  const legMaterial = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
  leftLeg.position.set(-0.15, 0.3, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);
  const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
  rightLeg.position.set(0.15, 0.3, 0);
  rightLeg.castShadow = true;
  group.add(rightLeg);

  // Hat
  if (playerData.character.hat === 'crown') {
    const crownGeometry = new THREE.ConeGeometry(0.3, 0.4, 4);
    const crownMaterial = new THREE.MeshLambertMaterial({ color: 0xFFD700 });
    const crown = new THREE.Mesh(crownGeometry, crownMaterial);
    crown.position.y = 2.1;
    crown.rotation.y = Math.PI / 4;
    group.add(crown);
  } else if (playerData.character.hat === 'cap') {
    const capGeometry = new THREE.BoxGeometry(0.55, 0.15, 0.55);
    const capMaterial = new THREE.MeshLambertMaterial({ color: 0xe74c3c });
    const cap = new THREE.Mesh(capGeometry, capMaterial);
    cap.position.y = 1.95;
    group.add(cap);
  } else if (playerData.character.hat === 'tophat') {
    const hatGeometry = new THREE.CylinderGeometry(0.25, 0.3, 0.5, 8);
    const hatMaterial = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
    const hat = new THREE.Mesh(hatGeometry, hatMaterial);
    hat.position.y = 2.15;
    group.add(hat);
    const brimGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.08, 8);
    const brim = new THREE.Mesh(brimGeometry, hatMaterial);
    brim.position.y = 1.92;
    group.add(brim);
  }

  group.position.set(0, 0, 0);
  scene.add(group);
  player = group;
}

function addOtherPlayer(playerData) {
  const group = new THREE.Group();

  const bodyGeometry = new THREE.BoxGeometry(0.6, 0.8, 0.4);
  const bodyMaterial = new THREE.MeshLambertMaterial({ color: playerData.character.color });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 0.9;
  group.add(body);

  const headGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  const headMaterial = new THREE.MeshLambertMaterial({ color: 0xffd5b4 });
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.y = 1.65;
  group.add(head);

  const nameGeometry = new THREE.PlaneGeometry(1, 0.3);
  const nameCanvas = document.createElement('canvas');
  nameCanvas.width = 256;
  nameCanvas.height = 64;
  const nameCtx = nameCanvas.getContext('2d');
  nameCtx.fillStyle = 'rgba(0,0,0,0.7)';
  nameCtx.fillRect(0, 0, 256, 64);
  nameCtx.fillStyle = 'white';
  nameCtx.font = 'bold 32px Arial';
  nameCtx.textAlign = 'center';
  nameCtx.fillText(playerData.username, 128, 44);
  const nameTexture = new THREE.CanvasTexture(nameCanvas);
  const nameMaterial = new THREE.MeshBasicMaterial({ map: nameTexture, transparent: true });
  const nameTag = new THREE.Mesh(nameGeometry, nameMaterial);
  nameTag.position.y = 2.3;
  group.add(nameTag);

  group.position.set(
    playerData.position.x,
    playerData.position.y,
    playerData.position.z
  );

  scene.add(group);
  otherPlayers[playerData.id] = {
    mesh: group,
    targetPosition: playerData.position,
    targetRotation: playerData.rotation
  };
}

function placeBlockVisual(block) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshLambertMaterial({ color: block.color || getBlockColor(block.type) });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(block.x, block.y + 0.5, block.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { x: block.x, y: block.y, z: block.z, type: block.type };
  scene.add(mesh);
  blockMeshes[`${block.x},${block.y},${block.z}`] = mesh;
  blocks.push(block);
}

function removeBlockVisual(x, y, z) {
  const key = `${x},${y},${z}`;
  if (blockMeshes[key]) {
    scene.remove(blockMeshes[key]);
    delete blockMeshes[key];
  }
  blocks = blocks.filter(b => !(b.x === x && b.y === y && b.z === z));
}

function getBlockColor(type) {
  const colors = {
    'grass': '#228B22',
    'stone': '#808080',
    'wood': '#8B4513',
    'brick': '#DC143C',
    'sand': '#F4A460',
    'road': '#555555'
  };
  return colors[type] || '#808080';
}

// Controls
function setupControls() {
  document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code >= 'Digit1' && e.code <= 'Digit8') {
      selectedSlot = parseInt(e.code.replace('Digit', '')) - 1;
      updateHotbar();
    }
  });

  document.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  document.addEventListener('mousemove', (e) => {
    if (isPointerLocked) {
      cameraAngleX -= e.movementX * 0.002;
      cameraAngleY = Math.max(0.1, Math.min(1.4, cameraAngleY - e.movementY * 0.002));
    }
  });

  document.addEventListener('mousedown', (e) => {
    if (!isPointerLocked) {
      document.getElementById('gameCanvas').requestPointerLock();
      return;
    }

    const chatInput = document.getElementById('chatInput');
    if (document.activeElement === chatInput) return;

    if (e.button === 0) {
      removeBlock();
    } else if (e.button === 2) {
      placeBlock();
    }
  });

  document.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('pointerlockchange', () => {
    isPointerLocked = document.pointerLockElement === document.getElementById('gameCanvas');
  });

  document.querySelectorAll('.hotbar-slot').forEach(slot => {
    slot.addEventListener('click', () => {
      selectedSlot = parseInt(slot.dataset.slot);
      updateHotbar();
    });
  });

  document.getElementById('chatInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const msg = e.target.value.trim();
      if (msg) {
        socket.emit('chatMessage', msg);
        e.target.value = '';
      }
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function updateHotbar() {
  document.querySelectorAll('.hotbar-slot').forEach((slot, i) => {
    slot.classList.toggle('selected', i === selectedSlot);
  });
}

function placeBlock() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const intersects = raycaster.intersectObjects(scene.children, true);

  if (intersects.length > 0) {
    const intersect = intersects[0];
    const normal = intersect.face.normal.clone();
    const pos = intersect.point.clone().sub(normal.multiplyScalar(0.5));

    const blockX = Math.round(pos.x);
    const blockY = Math.round(pos.y - 0.5);
    const blockZ = Math.round(pos.z);

    const existingBlock = blocks.find(b => b.x === blockX && b.y === blockY && b.z === blockZ);
    if (existingBlock) return;

    const block = {
      x: blockX,
      y: blockY,
      z: blockZ,
      type: blockTypes[selectedSlot].name.toLowerCase(),
      color: blockTypes[selectedSlot].color
    };

    socket.emit('placeBlock', { block });
    placeBlockVisual(block);
  }
}

function removeBlock() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const intersects = raycaster.intersectObjects(scene.children, true);

  const blockIntersect = intersects.find(i => i.object.userData && i.object.userData.x !== undefined);

  if (blockIntersect) {
    const { x, y, z } = blockIntersect.object.userData;
    socket.emit('removeBlock', { x, y, z });
    removeBlockVisual(x, y, z);
  }
}

function addChatMessage(message, color = 'white') {
  const chatMessages = document.getElementById('chatMessages');
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message';
  msgDiv.innerHTML = `<span style="color:${color}">${message}</span>`;
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Game Loop
function animate() {
  if (!isPlaying) return;
  requestAnimationFrame(animate);

  updatePlayer();
  updateCamera();
  updateOtherPlayers();

  renderer.render(scene, camera);
}

function updatePlayer() {
  if (!player) return;

  const chatInput = document.getElementById('chatInput');
  if (document.activeElement === chatInput) return;

  const forward = new THREE.Vector3(
    -Math.sin(cameraAngleX),
    0,
    -Math.cos(cameraAngleX)
  ).normalize();

  const right = new THREE.Vector3(
    Math.cos(cameraAngleX),
    0,
    -Math.sin(cameraAngleX)
  ).normalize();

  let moveX = 0;
  let moveZ = 0;

  if (keys['KeyW'] || keys['ArrowUp']) { moveX += forward.x; moveZ += forward.z; }
  if (keys['KeyS'] || keys['ArrowDown']) { moveX -= forward.x; moveZ -= forward.z; }
  if (keys['KeyA'] || keys['ArrowLeft']) { moveX -= right.x; moveZ -= right.z; }
  if (keys['KeyD'] || keys['ArrowRight']) { moveX += right.x; moveZ += right.z; }

  const moveLength = Math.sqrt(moveX * moveX + moveZ * moveZ);
  if (moveLength > 0) {
    moveX = (moveX / moveLength) * moveSpeed;
    moveZ = (moveZ / moveLength) * moveSpeed;
  }

  velocity.x = moveX;
  velocity.z = moveZ;

  if ((keys['Space']) && playerOnGround) {
    velocity.y = jumpForce;
    playerOnGround = false;
  }

  velocity.y += gravity;

  player.position.x += velocity.x;
  player.position.y += velocity.y;
  player.position.z += velocity.z;

  if (player.position.y <= 0) {
    player.position.y = 0;
    velocity.y = 0;
    playerOnGround = true;
  }

  // Check collision with blocks
  blocks.forEach(block => {
    const blockPos = new THREE.Vector3(block.x, block.y + 0.5, block.z);
    const playerPos = player.position.clone();
    playerPos.y -= 0.5;

    if (Math.abs(playerPos.x - blockPos.x) < 0.8 &&
        Math.abs(playerPos.y - blockPos.y) < 1.2 &&
        Math.abs(playerPos.z - blockPos.z) < 0.8) {
      if (velocity.y < 0 && player.position.y > blockPos.y) {
        player.position.y = blockPos.y + 1;
        velocity.y = 0;
        playerOnGround = true;
      }
    }
  });

  // Rotate player to face camera direction
  player.rotation.y = cameraAngleX;

  // Emit movement
  socket.emit('playerMove', {
    position: {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z
    },
    rotation: { x: cameraAngleX, y: cameraAngleY }
  });
}

function updateCamera() {
  if (!player) return;

  const offsetX = Math.sin(cameraAngleX) * Math.cos(cameraAngleY) * cameraDistance;
  const offsetY = Math.sin(cameraAngleY) * cameraDistance;
  const offsetZ = Math.cos(cameraAngleX) * Math.cos(cameraAngleY) * cameraDistance;

  camera.position.set(
    player.position.x + offsetX,
    player.position.y + 1.5 + offsetY,
    player.position.z + offsetZ
  );

  camera.lookAt(
    player.position.x,
    player.position.y + 1.5,
    player.position.z
  );
}

function updateOtherPlayers() {
  Object.values(otherPlayers).forEach(other => {
    if (other.targetPosition) {
      other.mesh.position.lerp(
        new THREE.Vector3(
          other.targetPosition.x,
          other.targetPosition.y,
          other.targetPosition.z
        ),
        0.2
      );
    }
  });
}

// Initialize
drawAvatarPreview();
