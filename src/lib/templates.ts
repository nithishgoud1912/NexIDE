import { FileSystemTree } from "@webcontainer/api";

export const templates: Record<
  string,
  { name: string; description: string; icon: string; tree: FileSystemTree }
> = {
  static: {
    name: "Static HTML",
    description: "Simple HTML5/CSS3 setup",
    icon: "🌐",
    tree: {
      "index.html": {
        file: {
          contents: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NexIDE Preview</title>
    <style>
        body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #0a0a0a; color: white; }
        h1 { color: #3b82f6; }
    </style>
</head>
<body>
    <h1>Hello from NexIDE!</h1>
    <p>Edit index.html to see changes in real-time.</p>
</body>
</html>`,
        },
      },
      "styles.css": {
        file: {
          contents: `/* Add your styles here */`,
        },
      },
    },
  },
  node: {
    name: "Node.js (Express)",
    description: "Backend server with Express",
    icon: "🟢",
    tree: {
      "index.js": {
        file: {
          contents: `const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send('<h1>NexIDE Node server is running!</h1>');
});

app.listen(port, () => {
  console.log(\`App listening at http://localhost:\${port}\`);
});`,
        },
      },
      "package.json": {
        file: {
          contents: `{
  "name": "nexide-node-project",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "express": "^4.18.2"
  },
  "scripts": {
    "start": "node index.js"
  }
}`,
        },
      },
    },
  },
};
