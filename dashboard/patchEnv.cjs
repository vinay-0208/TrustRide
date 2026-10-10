
const fs = require("fs");
let code = fs.readFileSync("dashboard/src/App.jsx", "utf8");

code = code.replace(
  /const API_BASE = "http:\/\/localhost:8000\/api\/trust";/g,
  "const API_BASE = import.meta.env.VITE_API_BASE || \"http://localhost:8000/api/trust\";"
);
code = code.replace(
  /const API_BASE = 'http:\/\/localhost:8000\/api\/trust';/g,
  "const API_BASE = import.meta.env.VITE_API_BASE || \"http://localhost:8000/api/trust\";"
);

code = code.replace(
  /const SOCKET_URL = "http:\/\/localhost:8000";/g,
  "const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || \"http://localhost:8000\";"
);
code = code.replace(
  /const SOCKET_URL = 'http:\/\/localhost:8000';/g,
  "const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || \"http://localhost:8000\";"
);

fs.writeFileSync("dashboard/src/App.jsx", code);

