import { BrowserWindow as e, app as t } from "electron";
import n from "node:path";
import { fileURLToPath as r } from "node:url";
//#region electron/main.ts
var i = n.dirname(r(import.meta.url));
process.env.DIST = n.join(i, "../dist"), process.env.VITE_PUBLIC = t.isPackaged ? process.env.DIST : n.join(i, "../public");
var a;
function o() {
	a = new e({
		icon: n.join(process.env.VITE_PUBLIC, "favicon.svg"),
		webPreferences: { preload: n.join(i, "preload.mjs") }
	}), a.webContents.on("did-finish-load", () => {
		a?.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
	}), process.env.VITE_DEV_SERVER_URL ? a.loadURL(process.env.VITE_DEV_SERVER_URL) : a.loadFile(n.join(process.env.DIST, "index.html"));
}
t.on("window-all-closed", () => {
	process.platform !== "darwin" && (t.quit(), a = null);
}), t.on("activate", () => {
	e.getAllWindows().length === 0 && o();
}), t.whenReady().then(o);
//#endregion
