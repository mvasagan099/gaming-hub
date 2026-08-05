import { io } from "socket.io-client";

const socket = io("http://localhost:4001", {
  transports: ["websocket", "polling"],
  timeout: 8000,
});

const timer = setTimeout(() => {
  console.error("TIMEOUT: no connect_error or connection within 8s");
  socket.close();
  process.exit(1);
}, 8000);

socket.on("connect_error", (err) => {
  clearTimeout(timer);
  console.log("CONNECT_ERROR:", err.message);
  socket.close();
  process.exit(0);
});

socket.on("connect", () => {
  clearTimeout(timer);
  console.error("UNEXPECTED: connected without a token");
  socket.close();
  process.exit(1);
});
