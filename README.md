# YIM Browser

A VS Code extension that provides an integrated browser panel with **automatic download routing** to a persistent custom folder.

## Features

- 🌐 Built-in browser panel inside VS Code
- 📁 Downloads automatically routed to `C:\Users\Sabio\Downloads` (or any folder you choose)
- 💾 Chosen download folder **persists across VS Code sessions** via `globalState`
- 🔁 Change download folder at any time via the toolbar button or command palette
- 🔗 Intercepts `<a download>` links and common file types (`.pdf`, `.zip`, `.exe`, `.docx`, `.xlsx`, `.csv`)

## Commands

| Command | Description |
|---|---|
| `YIM Browser: Open Browser` | Opens the YIM Browser panel |
| `YIM Browser: Set Download Folder` | Opens a folder picker to change the download destination |

## Installation (Local)

```bash
# 1. Clone the repo
git clone https://github.com/YIM-boss/YIM_Browser.git
cd YIM_Browser

# 2. Install dependencies
npm install

# 3. Compile
npm run compile

# 4. Package as .vsix
npm run package

# 5. Install in VS Code
code --install-extension yim-browser-0.1.0.vsix
```

## Notes

- Cross-origin iframes (most external websites) cannot have their download links intercepted at the DOM level — this is a browser security boundary. For those cases, right-clicking a link and using **Save Link As** through the system browser is recommended.
- The default download path is `C:\Users\Sabio\Downloads`. This can be changed at any time without reinstalling.

## Development

Open in VS Code and press `F5` to launch the Extension Development Host for live testing.
