# Comprehensive Guide to Creating a VS Code Extension

Creating a VS Code extension involves setting up a specific project structure, defining configuration files, writing the business logic (usually in TypeScript), and packaging the code into a `.vsix` file for installation.

Below is the step-by-step process of how a VS Code extension (like this Nexus SDLC extension) is built from scratch.

---

## 1. Initializing the Project

The standard way to scaffold a new VS Code extension is using the official Yeoman generator:

```bash
npm install -g yo generator-code
yo code
```
This command walks you through a wizard asking for the extension name, whether you want to use TypeScript (recommended) or JavaScript, and if you want a bundled web tool (like Webpack).

### Essential Files Generated:
* `package.json`: The extension manifest where commands, views, and configurations are declared.
* `src/extension.ts`: The main entry point where the extension is activated and commands are registered.
* `tsconfig.json`: TypeScript configuration.
* `vsc-extension-quickstart.md`: A standard README provided by the generator.

---

## 2. Configuring the Manifest (`package.json`)

The `package.json` file is the heart of the extension. It controls what the extension does and when it activates. Key sections include:

* **`activationEvents`**: Tells VS Code *when* to start the extension. For example, `"onStartupFinished"` means it loads when the editor finishes starting up.
* **`contributes`**: This is where you declare your UI contributions. You can contribute:
  * **`commands`**: Actionable tasks (e.g., `nexus.startServer`).
  * **`viewsContainers`**: Custom sidebar icons (e.g., the Nexus icon in the Activity Bar).
  * **`views`**: The actual webviews or trees that render inside the sidebar (e.g., the Nexus Chat interface).
  * **`menus`**: Where commands should appear in the UI (e.g., `view/title` for the top play/stop buttons).
  * **`configuration`**: Settings users can change in the VS Code Settings UI (e.g., `nexus.serverUrl`).

---

## 3. Developing the Core Logic (TypeScript)

The logic lives in the `src/` directory. For a complex extension like Nexus, this is usually broken down into modular files:

* **`extension.ts`**: Contains the `activate()` and `deactivate()` functions. It wires all the components together when VS Code starts the extension.
* **`commands.ts`**: Registers all the command IDs defined in `package.json` to actual JavaScript functions.
* **`sidebarProvider.ts`**: Manages the custom HTML/CSS/JS (Webview) that is injected into the VS Code sidebar. It handles the two-way message passing between the sidebar UI and the extension backend.
* **`serverManager.ts`**: A background service that spawns, monitors, and kills external processes (like the FastAPI Python server).
* **`statusBar.ts`**: Controls indicators at the very bottom of the VS Code window (e.g., showing if the server is running or offline).

---

## 4. The Webview UI (HTML / CSS / JS)

If your extension requires a complex UI (like a chat interface), you use a Webview.
A Webview is essentially an iframe that runs inside VS Code. 

* **Security**: Webviews run in an isolated environment. They cannot directly access the Node.js filesystem. 
* **Communication**: To communicate with the extension, the Webview sends messages using `vscode.postMessage({ type: 'command', value: 'data' })`. The extension receives these in `sidebarProvider.ts` and can respond back by running `webview.postMessage(...)`.
* **Assets**: In our architecture, the Webview UI code is separated into `src/webview/main.js` and `src/webview/styles.css`.

---

## 5. Compiling the Extension

Because the extension is written in TypeScript, it must be compiled down to JavaScript before VS Code can run it. 

We use **Webpack** to bundle all the TypeScript files into a single, optimized JavaScript file (e.g., `dist/extension.js`). This makes the extension load much faster.

To compile the code, you run:
```bash
npm run compile
```

---

## 6. Packaging into a VSIX File

To distribute the extension or install it locally, it needs to be packaged into a `.vsix` file (Visual Studio Extension).

We use a Microsoft tool called `vsce` (Visual Studio Code Extensions).

```bash
npx @vscode/vsce package
```
*Note: If you have missing git repositories or uncommitted changes, you might need to add flags like `--allow-missing-repository`.*

### What happens during packaging?
1. The `vscode:prepublish` script in `package.json` runs automatically, compiling your TypeScript via Webpack.
2. `vsce` bundles the compiled `dist/extension.js`, `package.json`, any `media/` assets (like SVGs and logos), and the webview files into a compressed `.vsix` zip file.

---

## 7. Installation & Testing

Once you have the `nexus-sdlc-0.1.0.vsix` file:
1. Open VS Code.
2. Go to the Extensions view.
3. Click the `...` menu at the top right.
4. Select **Install from VSIX...**
5. Choose your generated file and reload the window.

If you are actively developing, you can also press **F5** in VS Code to launch an "Extension Development Host"—a separate VS Code window that runs your live code without needing to build a `.vsix` file every time.
