import { BrowserWindow, app } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
//#region electron/main.ts
var __dirname = path.dirname(fileURLToPath(import.meta.url));
var distDirectory = path.join(__dirname, "../dist");
process.env.DIST = distDirectory;
var publicDirectory = app.isPackaged ? distDirectory : path.join(__dirname, "../public");
process.env.VITE_PUBLIC = publicDirectory;
app.setName("Moti");
var win;
var splash;
function createWindow() {
	splash = new BrowserWindow({
		width: 350,
		height: 400,
		transparent: true,
		frame: false,
		alwaysOnTop: true,
		icon: path.join(publicDirectory, "icon.png")
	});
	splash.loadFile(path.join(publicDirectory, "splash.html"));
	win = new BrowserWindow({
		width: 1100,
		height: 800,
		minWidth: 800,
		minHeight: 600,
		autoHideMenuBar: true,
		show: false,
		icon: path.join(publicDirectory, "icon.png"),
		webPreferences: { preload: path.join(__dirname, "preload.cjs") }
	});
	win.webContents.on("did-finish-load", () => {
		win?.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
	});
	win.once("ready-to-show", () => {
		setTimeout(() => {
			if (splash) {
				splash.close();
				splash = null;
			}
			win?.show();
		}, 2800);
	});
	if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
	else win.loadFile(path.join(distDirectory, "index.html"));
}
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
		win = null;
	}
});
app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.whenReady().then(createWindow);
//#endregion
