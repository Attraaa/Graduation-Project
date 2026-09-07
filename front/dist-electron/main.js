import { BrowserWindow as e, app as t } from "electron";
import n from "node:path";
import { fileURLToPath as r } from "node:url";
//#region electron/main.ts
var i = n.dirname(r(import.meta.url)), a = n.join(i, "../dist");
process.env.DIST = a;
var o = t.isPackaged ? a : n.join(i, "../public");
process.env.VITE_PUBLIC = o, t.setName("Moti");
var s, c;
function l() {
	c = new e({
		width: 350,
		height: 400,
		transparent: !0,
		frame: !1,
		alwaysOnTop: !0,
		icon: n.join(o, "icon.png")
	}), c.loadFile(n.join(o, "splash.html")), s = new e({
		width: 1100,
		height: 800,
		minWidth: 800,
		minHeight: 600,
		autoHideMenuBar: !0,
		show: !1,
		icon: n.join(o, "icon.png"),
		webPreferences: { preload: n.join(i, "preload.cjs") }
	}), s.webContents.on("did-finish-load", () => {
		s?.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
	}), s.once("ready-to-show", () => {
		setTimeout(() => {
			c &&= (c.close(), null), s?.show();
		}, 2800);
	}), process.env.VITE_DEV_SERVER_URL ? s.loadURL(process.env.VITE_DEV_SERVER_URL) : s.loadFile(n.join(a, "index.html"));
}
t.on("window-all-closed", () => {
	process.platform !== "darwin" && (t.quit(), s = null);
}), t.on("activate", () => {
	e.getAllWindows().length === 0 && l();
}), t.whenReady().then(l);
//#endregion
