const WebSocket = require("ws");

const wss = new WebSocket.Server({
    port: process.env.PORT || 3000
});

console.log("Multiplayer server started");

wss.on("connection", (ws) => {
    console.log("Player connected");

    ws.on("message", (message) => {
        console.log("Received:", message.toString());
    });

    ws.on("close", () => {
        console.log("Player disconnected");
    });
});
