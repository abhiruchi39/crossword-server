const WebSocket = require('ws');

const server = new WebSocket.Server({ port: process.env.PORT || 8080 });
const rooms = {};

server.on('connection', (ws) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'create') {
            const roomId = Math.random().toString(36).substr(2, 9);
            rooms[roomId] = {
                players: data.names.map((name, index) => ({
                    id: `player${index + 1}`,
                    name,
                    online: true
                })),
                gameState: {
                    level: 1,
                    scores: {},
                    completedWords: [],
                    timeLeft: 300,
                    highlights: {}
                }
            };
            ws.roomId = roomId;
            ws.playerId = 'player1';
            ws.send(JSON.stringify({ type: 'roomCreated', roomId, players: rooms[roomId].players }));
            broadcast(roomId, { type: 'playerUpdate', players: rooms[roomId].players });
        } else if (data.type === 'join') {
            if (rooms[data.roomId]) {
                const player = rooms[data.roomId].players.find(p => !p.online) || {
                    id: `player${rooms[data.roomId].players.length + 1}`,
                    name: `Player${rooms[data.roomId].players.length + 1}`,
                    online: true
                };
                player.online = true;
                if (!rooms[data.roomId].players.includes(player)) {
                    rooms[data.roomId].players.push(player);
                }
                ws.roomId = data.roomId;
                ws.playerId = player.id;
                broadcast(data.roomId, { type: 'playerUpdate', players: rooms[data.roomId].players });
            }
        } else if (data.type === 'start') {
            if (rooms[ws.roomId]) {
                broadcast(ws.roomId, { type: 'start', gameState: rooms[ws.roomId].gameState });
            }
        } else if (data.type === 'answer') {
            if (rooms[ws.roomId]) {
                rooms[ws.roomId].gameState.completedWords.push(data.word);
                rooms[ws.roomId].gameState.scores[ws.playerId] = (rooms[ws.roomId].gameState.scores[ws.playerId] || 0) + 1;
                const puzzle = generatePuzzle(rooms[ws.roomId].gameState.level); // Server needs generatePuzzle
                if (rooms[ws.roomId].gameState.completedWords.length === puzzle.words.length) {
                    broadcast(ws.roomId, { type: 'levelComplete', gameState: rooms[ws.roomId].gameState });
                } else {
                    broadcast(ws.roomId, { type: 'update', gameState: rooms[ws.roomId].gameState });
                }
            }
        } else if (data.type === 'nextLevel') {
            if (rooms[ws.roomId]) {
                rooms[ws.roomId].gameState.level++;
                rooms[ws.roomId].gameState.completedWords = [];
                rooms[ws.roomId].gameState.highlights = {};
                if (rooms[ws.roomId].gameState.level > 3) {
                    broadcast(ws.roomId, { type: 'gameOver', gameState: rooms[ws.roomId].gameState });
                } else {
                    broadcast(ws.roomId, { type: 'update', gameState: rooms[ws.roomId].gameState });
                }
            }
        } else if (data.type === 'highlight') {
            if (rooms[ws.roomId]) {
                rooms[ws.roomId].gameState.highlights[data.playerId] = { word: data.word, color: data.color };
                broadcast(ws.roomId, { type: 'highlight', playerId: data.playerId, word: data.word, color: data.color });
            }
        } else if (data.type === 'restart') {
            if (rooms[ws.roomId]) {
                rooms[ws.roomId].gameState = {
                    level: 1,
                    scores: {},
                    completedWords: [],
                    timeLeft: 300,
                    highlights: {}
                };
                broadcast(ws.roomId, { type: 'update', gameState: rooms[ws.roomId].gameState });
            }
        }
    });

    ws.on('close', () => {
        if (ws.roomId && rooms[ws.roomId]) {
            const player = rooms[ws.roomId].players.find(p => p.id === ws.playerId);
            if (player) player.online = false;
            broadcast(ws.roomId, { type: 'playerUpdate', players: rooms[ws.roomId].players });
        }
    });
});

function broadcast(roomId, message) {
    server.clients.forEach(client => {
        if (client.roomId === roomId && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

// Duplicate generatePuzzle for server-side validation
function generatePuzzle(level) {
    const wordBank = [
        { word: "CAT", clue: "Feline friend" },
        { word: "HAT", clue: "Head cover" },
        { word: "DOG", clue: "Loyal pet" },
        { word: "LOG", clue: "Piece of wood" },
        { word: "BOOK", clue: "Reading material" },
        { word: "KITE", clue: "Flying toy" },
        { word: "TREE", clue: "Tall plant" },
        { word: "FREE", clue: "No cost" },
        { word: "HOUSE", clue: "Where you live" },
        { word: "EAGLE", clue: "Bird of prey" },
        { word: "RIVER", clue: "Flowing water" },
        { word: "FLOOR", clue: "Room surface" }
    ];
    const sizes = [3, 4, 5];
    const size = sizes[Math.min(level - 1, sizes.length - 1)];
    const availableWords = wordBank.filter(w => w.word.length <= size).sort(() => Math.random() - 0.5);
    const words = [];
    let row = 0, col = 0;

    if (availableWords.length > 0) {
        words.push({ word: availableWords[0].word, clue: availableWords[0].clue, row, col, dir: "H", number: 1 });
    }
    if (availableWords.length > 1) {
        words.push({ word: availableWords[1].word, clue: availableWords[1].clue, row, col, dir: "V", number: 2 });
    }

    return { size, words };
}