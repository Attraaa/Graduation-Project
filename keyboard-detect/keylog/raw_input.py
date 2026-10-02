"""Opt-in Windows Raw Input observer. No hook, injection, or input suppression.

Only physical codes from an approved, non-elevated foreground process leave this
module. Unknown foreground identity/elevation always fails closed.
"""
from __future__ import annotations

import ctypes as C
from ctypes import wintypes as W
import os
import threading
from pathlib import Path

SCAN_CODES = {
    0x01: 'Escape', 0x0E: 'Backspace', 0x0F: 'Tab', 0x1C: 'Enter',
    0x1D: 'ControlLeft', 0x2A: 'ShiftLeft', 0x36: 'ShiftRight',
    0x38: 'AltLeft', 0x39: 'Space', 0x3A: 'CapsLock',
    0x0C: 'Minus', 0x0D: 'Equal', 0x1A: 'BracketLeft', 0x1B: 'BracketRight',
    0x27: 'Semicolon', 0x28: 'Quote', 0x29: 'Backquote', 0x2B: 'Backslash',
    0x33: 'Comma', 0x34: 'Period', 0x35: 'Slash',
}
for start, letters in [(0x10, 'QWERTYUIOP'), (0x1E, 'ASDFGHJKL'), (0x2C, 'ZXCVBNM')]:
    SCAN_CODES.update({start + i: f'Key{letter}' for i, letter in enumerate(letters)})
SCAN_CODES.update({2 + i: f'Digit{digit}' for i, digit in enumerate('1234567890')})
EXTENDED_CODES = {0x1D: 'ControlRight', 0x38: 'AltRight', 0x47: 'Home', 0x48: 'ArrowUp',
                  0x49: 'PageUp', 0x4F: 'End', 0x51: 'PageDown', 0x52: 'Insert',
                  0x4B: 'ArrowLeft', 0x4D: 'ArrowRight', 0x50: 'ArrowDown', 0x53: 'Delete',
                  0x5B: 'MetaLeft', 0x5C: 'MetaRight'}
KNOWN_GAME_NAMES = {'valorant.exe', 'valorant-win64-shipping.exe', 'league of legends.exe',
                    'cs2.exe', 'overwatch.exe', 'tslgame.exe', 'fortniteclient-win64-shipping.exe',
                    'vgc.exe', 'vgtray.exe'}

def physical_code(scan: int, flags: int) -> str | None:
    if flags & 4:  # E1 sequences (Pause etc.) are not ordinary typing keys.
        return None
    return (EXTENDED_CODES if flags & 2 else SCAN_CODES).get(scan)

def key_label(code: str) -> str:
    if code.startswith('Key'): return code[3:].lower()
    if code.startswith('Digit'): return code[5:]
    return {'Space': 'space', 'Comma': ',', 'Period': '.', 'Slash': '/', 'Semicolon': ';',
            'Quote': "'", 'Backquote': '`', 'Minus': '-', 'Equal': '=', 'BracketLeft': '[',
            'BracketRight': ']', 'Backslash': '\\'}.get(code, code.lower())

def foreground_allowed(path: str | None, elevated: bool | None, approved: set[str]) -> bool:
    return bool(path and elevated is False and Path(path).name.lower() not in KNOWN_GAME_NAMES
                and os.path.normcase(os.path.realpath(path)) in approved)

class RawInputObserver:
    def __init__(self, approved_paths, on_press, on_status=lambda _status: None):
        self.approved = {os.path.normcase(os.path.realpath(p)) for p in approved_paths}
        self.on_press, self.on_status = on_press, on_status
        self._thread = None
        self._hwnd = None
        self._status = None
        self._down = set()
        self._ready = threading.Event()
        self._failure = None
        self._stop_requested = threading.Event()

    def start(self):
        if self._thread and self._thread.is_alive(): return
        if os.name != 'nt' or not self.approved:
            raise RuntimeError('Approved-app observation requires Windows and an approved app.')
        self._stop_requested.clear(); self._ready.clear(); self._failure = None; self._status = None
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        if not self._ready.wait(5) or self._failure:
            self.stop()
            raise RuntimeError('Raw Input observer could not start.') from self._failure

    def stop(self):
        self._stop_requested.set()
        if self._hwnd and os.name == 'nt':
            user = C.WinDLL('user32', use_last_error=True)
            user.PostMessageW.argtypes = [W.HWND, W.UINT, W.WPARAM, W.LPARAM]
            user.PostMessageW(self._hwnd, 0x0010, 0, 0)
        if self._thread and self._thread is not threading.current_thread():
            self._thread.join(timeout=2)
        self._down.clear()

    def _run(self):
        user = C.WinDLL('user32', use_last_error=True)
        kernel = C.WinDLL('kernel32', use_last_error=True)
        advapi = C.WinDLL('advapi32', use_last_error=True)
        LRESULT = C.c_ssize_t
        PROC = C.WINFUNCTYPE(LRESULT, W.HWND, W.UINT, W.WPARAM, W.LPARAM)
        class WC(C.Structure):
            _fields_ = [('style', W.UINT), ('proc', PROC), ('extra', C.c_int), ('windowextra', C.c_int),
                        ('instance', W.HINSTANCE), ('icon', W.HICON), ('cursor', W.HANDLE),
                        ('background', W.HBRUSH), ('menu', W.LPCWSTR), ('name', W.LPCWSTR)]
        class Device(C.Structure):
            _fields_ = [('page', W.USHORT), ('usage', W.USHORT), ('flags', W.DWORD), ('target', W.HWND)]
        class Header(C.Structure):
            _fields_ = [('type', W.DWORD), ('size', W.DWORD), ('device', W.HANDLE), ('param', W.WPARAM)]
        class Keyboard(C.Structure):
            _fields_ = [('scan', W.USHORT), ('flags', W.USHORT), ('reserved', W.USHORT),
                        ('vkey', W.USHORT), ('message', W.UINT), ('extra', W.ULONG)]
        class Input(C.Structure):
            _fields_ = [('header', Header), ('keyboard', Keyboard)]
        user.DefWindowProcW.argtypes = [W.HWND, W.UINT, W.WPARAM, W.LPARAM]
        user.DefWindowProcW.restype = LRESULT
        user.CreateWindowExW.argtypes = [W.DWORD, W.LPCWSTR, W.LPCWSTR, W.DWORD, C.c_int, C.c_int,
                                        C.c_int, C.c_int, W.HWND, W.HMENU, W.HINSTANCE, W.LPVOID]
        user.CreateWindowExW.restype = W.HWND
        user.RegisterClassW.argtypes = [C.POINTER(WC)]
        user.RegisterRawInputDevices.argtypes = [C.POINTER(Device), W.UINT, W.UINT]
        user.GetRawInputData.argtypes = [W.HANDLE, W.UINT, W.LPVOID, C.POINTER(W.UINT), W.UINT]
        user.GetForegroundWindow.restype = W.HWND
        user.GetWindowThreadProcessId.argtypes = [W.HWND, C.POINTER(W.DWORD)]
        user.SetTimer.argtypes = [W.HWND, C.c_size_t, W.UINT, W.LPVOID]
        user.DestroyWindow.argtypes = [W.HWND]
        user.GetMessageW.argtypes = [C.POINTER(W.MSG), W.HWND, W.UINT, W.UINT]
        user.TranslateMessage.argtypes = [C.POINTER(W.MSG)]
        user.DispatchMessageW.argtypes = [C.POINTER(W.MSG)]
        user.DispatchMessageW.restype = LRESULT
        kernel.GetModuleHandleW.argtypes = [W.LPCWSTR]; kernel.GetModuleHandleW.restype = W.HMODULE
        kernel.GetCurrentProcess.restype = W.HANDLE
        kernel.OpenProcess.argtypes = [W.DWORD, W.BOOL, W.DWORD]; kernel.OpenProcess.restype = W.HANDLE
        kernel.CloseHandle.argtypes = [W.HANDLE]
        kernel.QueryFullProcessImageNameW.argtypes = [W.HANDLE, W.DWORD, W.LPWSTR, C.POINTER(W.DWORD)]
        advapi.OpenProcessToken.argtypes = [W.HANDLE, W.DWORD, C.POINTER(W.HANDLE)]
        advapi.GetTokenInformation.argtypes = [W.HANDLE, C.c_int, W.LPVOID, W.DWORD, C.POINTER(W.DWORD)]
        registered = False
        def allowed():
            process, token = None, W.HANDLE()
            try:
                pid = W.DWORD()
                foreground = user.GetForegroundWindow()
                if not foreground: return False
                user.GetWindowThreadProcessId(foreground, C.byref(pid))
                process = kernel.OpenProcess(0x1000, False, pid.value)
                if not process or not advapi.OpenProcessToken(process, 8, C.byref(token)): return False
                elevation, length = W.DWORD(), W.DWORD()
                if not advapi.GetTokenInformation(token, 20, C.byref(elevation), C.sizeof(elevation), C.byref(length)): return False
                name, size = C.create_unicode_buffer(32768), W.DWORD(32768)
                if not kernel.QueryFullProcessImageNameW(process, 0, name, C.byref(size)): return False
                return foreground_allowed(name.value, bool(elevation.value), self.approved)
            finally:
                if token.value: kernel.CloseHandle(token)
                if process: kernel.CloseHandle(process)
        def update():
            nonlocal registered
            permitted = allowed()
            if permitted != registered:
                device = Device(1, 6, 0x100 if permitted else 1, self._hwnd if permitted else None)
                if not user.RegisterRawInputDevices(C.byref(device), 1, C.sizeof(Device)):
                    permitted = False
                registered = permitted
                self._down.clear()
            status = 'observing' if permitted else 'excluded'
            if status != self._status:
                self._status = status; self.on_status(status)
        @PROC
        def proc(hwnd, message, wp, lp):
            try:
                if message == 0x0113: update()
                elif message == 0x00FF and allowed():
                    # Foreground check precedes reading even the physical scan code.
                    size = W.UINT(C.sizeof(Input)); data = Input()
                    result = user.GetRawInputData(W.HANDLE(lp), 0x10000003, C.byref(data), C.byref(size), C.sizeof(Header))
                    if result != 0xFFFFFFFF and data.header.type == 1:
                        code = physical_code(data.keyboard.scan, data.keyboard.flags)
                        if code:
                            if data.keyboard.flags & 1: self._down.discard(code)
                            elif code not in self._down:
                                self._down.add(code)
                                shortcut = any(user.GetAsyncKeyState(vk) & 0x8000 for vk in [0x11, 0x12, 0x5B, 0x5C])
                                left = bool(user.GetAsyncKeyState(0xA0) & 0x8000)
                                right = bool(user.GetAsyncKeyState(0xA1) & 0x8000)
                                context = 'shortcut' if shortcut else 'shift-both' if left and right else 'shift-left' if left else 'shift-right' if right else 'plain'
                                self.on_press(code, context)
                elif message == 0x0010: user.DestroyWindow(hwnd); return 0
                elif message == 0x0002: user.PostQuitMessage(0); return 0
            except Exception:
                self._down.clear(); self.on_status('error')
            return user.DefWindowProcW(hwnd, message, wp, lp)
        instance = kernel.GetModuleHandleW(None)
        classname = f'MotiApprovedRawInput{os.getpid()}'
        wc = WC(0, proc, 0, 0, instance, None, None, None, None, classname)
        try:
            own_token, elevation, length = W.HANDLE(), W.DWORD(), W.DWORD()
            try:
                if not advapi.OpenProcessToken(kernel.GetCurrentProcess(), 8, C.byref(own_token)):
                    raise RuntimeError('Cannot verify observer privileges.')
                if not advapi.GetTokenInformation(own_token, 20, C.byref(elevation), C.sizeof(elevation), C.byref(length)) or elevation.value:
                    raise RuntimeError('Observation must run without administrator privileges.')
            finally:
                if own_token.value: kernel.CloseHandle(own_token)
            if not user.RegisterClassW(C.byref(wc)): raise C.WinError(C.get_last_error())
            self._hwnd = user.CreateWindowExW(0, classname, '', 0, 0, 0, 0, 0, W.HWND(-3), None, instance, None)
            if not self._hwnd: raise C.WinError(C.get_last_error())
            if self._stop_requested.is_set():
                user.DestroyWindow(self._hwnd); self._ready.set(); return
            user.SetTimer(self._hwnd, 1, 200, None)
            update(); self._ready.set()
            msg = W.MSG()
            while user.GetMessageW(C.byref(msg), None, 0, 0) > 0:
                user.TranslateMessage(C.byref(msg)); user.DispatchMessageW(C.byref(msg))
        except Exception as error:
            self._failure = error; self._ready.set(); self.on_status('error')
        finally:
            if registered:
                device = Device(1, 6, 1, None)
                user.RegisterRawInputDevices(C.byref(device), 1, C.sizeof(Device))
            self._hwnd = None
            user.UnregisterClassW.argtypes = [W.LPCWSTR, W.HINSTANCE]
            user.UnregisterClassW(classname, instance)
