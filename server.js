const WebSocket = require("ws");
const server = new WebSocket.Server({ port: process.env.PORT || 8080 });

const rooms = {};

server.on("connection", (ws) => {
    let playerId = null;
    let roomId = null;

    ws.on("message", (message) => {
        const data = JSON.parse(message);

        if (data.type === "create") {
            roomId = Math.random().toString(36).substr(2, 9);
            playerId = "creator";
            rooms[roomId] = {
                players: data.names.map((name, i) => ({ id: `p${i}`, name, online: i === 0 })),
                gameState: { level: 1, scores: data.names.reduce((acc, _, i) => ({ ...acc, [`p${i}`]: 0 }), {}), completedWords: [], timeLeft: 300 },
                creator: ws
            };
            ws.send(JSON.stringify({ type: "roomCreated", roomId, players: rooms[roomId].players }));
            broadcast(roomId, { type: "playerUpdate", players: rooms[roomId].players });
        } else if (data.type === "join") {
            roomId = data.roomId;
            if (rooms[roomId]) {
                const offlinePlayer = rooms[roomId].players.find(p => !p.online);
                if (offlinePlayer) {
                    playerId = offlinePlayer.id;
                    offlinePlayer.online = true;
                    ws.send(JSON.stringify({ type: "playerUpdate", players: rooms[roomId].players }));
                    broadcast(roomId, { type: "playerUpdate", players: rooms[roomId].players });
                } else {
                    ws.close();
                }
            } else {
                ws.close();
            }
        } else if (data.type === "start" && ws === rooms[roomId].creator) {
            broadcast(roomId, { type: "start", gameState: rooms[roomId].gameState });
        } else if (data.type === "answer") {
            const puzzle = [
                { size: 3, words: [{ word: "CAT", clue: "Feline friend", row: 0, col: 0, dir: "H" }, { word: "HAT", clue: "Head cover", row: 0, col: 0, dir: "V" }] },
                { size: 4, words: [{ word: "BOOK", clue: "Reading material", row: 0, col: 0, dir: "H" }, { word: "KITE", clue: "Flying toy", row: 0, col: 0, dir: "V" }] },
                { size: 5, words: [{ word: "HOUSE", clue: "Where you live", row: 0, col: 0, dir: "H" }, { word: "EAGLE", clue: "Bird of prey", row: 0, col: 0, dir: "V" }] }
            ][rooms[roomId].gameState.level - 1];
            if (puzzle.words.some(w => w.word === data.word && !rooms[roomId].gameState.completedWords.includes(w.word))) {
                rooms[roomId].gameState.completedWords.push(data.word);
                rooms[roomId].gameState.scores[playerId] = rooms[roomId].gameState.level;
                broadcast(roomId, { type: "update", gameState: rooms[roomId].gameState });
                if (rooms[roomId].gameState.completedWords.length === puzzle.words.length) {
                    broadcast(roomId, { type: "levelComplete", gameState: rooms[roomId].gameState });
                }
            }
        } else if (data.type === "nextLevel") {
            rooms[roomId].gameState.level++;
            rooms[roomId].gameState.completedWords = [];
            if (rooms[roomId].gameState.level > 3) {
                broadcast(roomId, { type: "gameOver", gameState: rooms[roomId].gameState });
            } else {
                broadcast(roomId, { type: "update", gameState: rooms[roomId].gameState });
            }
        } else if (data.type === "restart") {
            const newRoomId = Math.random().toString(36).substr(2, 9);
            rooms[newRoomId] = {
                players: rooms[roomId].players.map(p => ({ ...p, online: false })),
                gameState: { level: 1, scores: rooms[roomId].players.reduce((acc, p) => ({ ...acc, [p.id]: 0 }), {}), completedWords: [], timeLeft: 300 },
                creator: ws
            };
            delete rooms[roomId];
            roomId = newRoomId;
            broadcast(roomId, { type: "roomCreated", roomId, players: rooms[newRoomId].players });
        }
    });

    ws.on("close", () => {
        if (roomId && rooms[roomId]) {
            const player = rooms[roomId].players.find(p => p.id === playerId);
            if (player) player.online = false;
            broadcast(roomId, { type: "playerUpdate", players: rooms[roomId].players });
        }
    });
});

function broadcast(roomId, message) {
    server.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && rooms[roomId].players.some(p => p.online)) {
            client.send(JSON.stringify(message));
        }
    });
}

console.log("WebSocket server running on port " + (process.env.PORT || 8080));